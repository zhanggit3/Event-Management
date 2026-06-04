"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LibraryFile, LibraryFolder } from "@/types/database";
import { MAX_LIBRARY_FILE_BYTES, MAX_LIBRARY_FILE_LABEL } from "@/lib/limits";
import { libraryStorageKey } from "@/lib/library-keys";

const BUCKET = "library-files";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function isMember(supabase: SupabaseServer, orgId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * A target folder (if any) must belong to the given org — a multi-org user must not be
 * able to file something into a folder that lives in a different org they also belong to.
 */
async function targetFolderInOrg(
  supabase: SupabaseServer,
  targetFolderId: string | null,
  orgId: string,
): Promise<boolean> {
  if (!targetFolderId) return true;
  const { data } = await supabase
    .from("library_folders").select("organization_id").eq("id", targetFolderId).single();
  return !!data && data.organization_id === orgId;
}

// ── Folders ───────────────────────────────────────────────────────────────

export async function createLibraryFolder(
  organizationId: string,
  name: string,
  parentFolderId: string | null,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!name.trim()) return { error: "Folder name is required" };
  if (!(await isMember(supabase, organizationId, user.id))) return { error: "Not authorized" };

  // A parent folder (if any) must belong to the same org.
  if (parentFolderId) {
    const { data: parent } = await supabase
      .from("library_folders").select("organization_id").eq("id", parentFolderId).single();
    if (!parent || parent.organization_id !== organizationId) return { error: "Invalid parent folder" };
  }

  const { data, error } = await supabase
    .from("library_folders")
    .insert({ organization_id: organizationId, name: name.trim(), parent_folder_id: parentFolderId, created_by: user.id })
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath("/company/my-items");
  return { data: data as LibraryFolder };
}

export async function renameLibraryFolder(folderId: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!name.trim()) return { error: "Folder name is required" };

  const { data: folder } = await supabase
    .from("library_folders").select("organization_id").eq("id", folderId).single();
  if (!folder) return { error: "Folder not found" };
  if (!(await isMember(supabase, folder.organization_id, user.id))) return { error: "Not authorized" };

  const { data, error } = await supabase
    .from("library_folders")
    .update({ name: name.trim() })
    .eq("id", folderId)
    .select()
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: "Folder not found or not permitted" };

  revalidatePath("/company/my-items");
  return { data: data as LibraryFolder };
}

export async function deleteLibraryFolder(folderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: folder } = await supabase
    .from("library_folders")
    .select("organization_id")
    .eq("id", folderId)
    .single();
  if (!folder) return { error: "Folder not found" };
  if (!(await isMember(supabase, folder.organization_id, user.id))) return { error: "Not authorized" };

  // Collect this folder + all descendants (folder_id on files is SET NULL, so we must
  // explicitly delete contained files; subfolders cascade-delete on the folder delete).
  const { data: allFolders } = await supabase
    .from("library_folders")
    .select("id, parent_folder_id")
    .eq("organization_id", folder.organization_id);

  const childrenOf = new Map<string, string[]>();
  for (const f of allFolders ?? []) {
    if (f.parent_folder_id) {
      const arr = childrenOf.get(f.parent_folder_id) ?? [];
      arr.push(f.id);
      childrenOf.set(f.parent_folder_id, arr);
    }
  }
  const toDelete: string[] = [];
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift()!;
    toDelete.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }

  // Remove the storage objects for all files in those folders, then delete the rows.
  const { data: files } = await supabase
    .from("library_files")
    .select("id, storage_key")
    .in("folder_id", toDelete);
  if (files && files.length > 0) {
    await supabase.storage.from(BUCKET).remove(files.map((f) => f.storage_key));
    await supabase.from("library_files").delete().in("id", files.map((f) => f.id));
  }

  const { error } = await supabase.from("library_folders").delete().eq("id", folderId);
  if (error) return { error: error.message };

  revalidatePath("/company/my-items");
  return { success: true };
}

// ── Files ─────────────────────────────────────────────────────────────────

/**
 * Record a library file row AFTER the client has uploaded the object directly to the
 * `library-files` bucket. Only metadata crosses the Server Action boundary (tiny body).
 *
 * The client uploads to Storage FIRST, so every rejection path below must remove the
 * now-orphaned object — otherwise a rejected record leaves a dangling file in the bucket.
 */
export async function recordLibraryFile(
  organizationId: string,
  folderId: string | null,
  name: string,
  storageKeyValue: string,
  fileSize: number | null,
  mimeType: string | null,
) {
  const supabase = await createClient();
  // Drop the already-uploaded object, then return the error.
  const reject = async (message: string) => {
    await supabase.storage.from(BUCKET).remove([storageKeyValue]);
    return { error: message };
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await isMember(supabase, organizationId, user.id))) return reject("Not authorized");
  if (fileSize !== null && fileSize > MAX_LIBRARY_FILE_BYTES) {
    return reject(`"${name}" is too large. The maximum upload size is ${MAX_LIBRARY_FILE_LABEL}.`);
  }
  // The object key must live under this org (first path segment) — matches storage RLS.
  if (storageKeyValue.split("/")[0] !== organizationId) return reject("Invalid storage key");
  // A target folder (if any) must belong to this org.
  if (!(await targetFolderInOrg(supabase, folderId, organizationId))) return reject("Invalid target folder");

  const { data, error } = await supabase
    .from("library_files")
    .insert({
      organization_id: organizationId,
      folder_id: folderId,
      name,
      storage_key: storageKeyValue,
      file_size: fileSize,
      mime_type: mimeType,
      source_type: "upload",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return reject(error.message);

  revalidatePath("/company/my-items");
  return { data: data as LibraryFile };
}

export async function moveLibraryFile(fileId: string, targetFolderId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: file } = await supabase
    .from("library_files").select("organization_id").eq("id", fileId).single();
  if (!file) return { error: "File not found" };
  if (!(await isMember(supabase, file.organization_id, user.id))) return { error: "Not authorized" };

  if (!(await targetFolderInOrg(supabase, targetFolderId, file.organization_id))) {
    return { error: "Invalid target folder" };
  }

  const { data, error } = await supabase
    .from("library_files")
    .update({ folder_id: targetFolderId })
    .eq("id", fileId)
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath("/company/my-items");
  return { data: data as LibraryFile };
}

export async function deleteLibraryFile(fileId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch the row's OWN storage key + org — never trust a client-supplied key.
  const { data: file } = await supabase
    .from("library_files").select("storage_key, organization_id").eq("id", fileId).single();
  if (!file) return { error: "File not found" };
  if (!(await isMember(supabase, file.organization_id, user.id))) return { error: "Not authorized" };

  await supabase.storage.from(BUCKET).remove([file.storage_key]);
  const { error } = await supabase.from("library_files").delete().eq("id", fileId);
  if (error) return { error: error.message };

  revalidatePath("/company/my-items");
  return { success: true };
}

export async function getLibrarySignedUrl(storageKeyValue: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storageKeyValue, 3600);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

// ── From Tasks ──────────────────────────────────────────────────────────────

export type OrgTaskAttachment = {
  id: string;
  file_name: string;
  storage_key: string;
  file_size: number | null;
  mime_type: string | null;
  task_id: string;
  task_title: string;
  component_name: string;
  event_name: string;
};

/** Walk org → events → components → tasks → task_attachments. */
export async function getOrgTaskAttachments(organizationId: string): Promise<OrgTaskAttachment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await isMember(supabase, organizationId, user.id))) return [];

  const { data: events } = await supabase.from("events").select("id, name").eq("organization_id", organizationId);
  const eventById = new Map((events ?? []).map((e) => [e.id, e.name as string]));
  if (eventById.size === 0) return [];

  const { data: comps } = await supabase
    .from("components").select("id, name, event_id").in("event_id", [...eventById.keys()]);
  const compById = new Map((comps ?? []).map((c) => [c.id, { name: c.name as string, eventId: c.event_id as string }]));
  if (compById.size === 0) return [];

  const { data: tasks } = await supabase
    .from("tasks").select("id, title, component_id").in("component_id", [...compById.keys()]);
  const taskById = new Map((tasks ?? []).map((t) => [t.id, { title: t.title as string, componentId: t.component_id as string }]));
  if (taskById.size === 0) return [];

  const { data: atts } = await supabase
    .from("task_attachments").select("*").in("task_id", [...taskById.keys()])
    .order("created_at", { ascending: false });

  return (atts ?? []).map((a) => {
    const task = taskById.get(a.task_id as string);
    const comp = task ? compById.get(task.componentId) : undefined;
    return {
      id: a.id as string,
      file_name: a.file_name as string,
      storage_key: a.storage_key as string,
      file_size: a.file_size as number | null,
      mime_type: a.mime_type as string | null,
      task_id: a.task_id as string,
      task_title: task?.title ?? "Unknown task",
      component_name: comp?.name ?? "Unknown component",
      event_name: comp ? (eventById.get(comp.eventId) ?? "Unknown event") : "Unknown event",
    };
  });
}

export async function getTaskAttachmentDownloadUrl(storageKeyValue: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(storageKeyValue, 3600);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function saveTaskAttachmentToLibrary(
  attachmentId: string,
  targetFolderId: string | null,
  organizationId: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await isMember(supabase, organizationId, user.id))) return { error: "Not authorized" };
  if (!(await targetFolderInOrg(supabase, targetFolderId, organizationId))) {
    return { error: "Invalid target folder" };
  }

  // Re-verify the attachment belongs to a task within THIS org by walking just this
  // one attachment's chain (attachment → task → component → event), not the whole org.
  const { data: att } = await supabase
    .from("task_attachments").select("file_name, storage_key, file_size, mime_type, task_id").eq("id", attachmentId).single();
  if (!att) return { error: "Attachment not found" };
  const { data: task } = await supabase.from("tasks").select("component_id").eq("id", att.task_id).single();
  const { data: comp } = task
    ? await supabase.from("components").select("event_id").eq("id", task.component_id).single()
    : { data: null };
  const { data: ev } = comp
    ? await supabase.from("events").select("organization_id").eq("id", comp.event_id).single()
    : { data: null };
  if (!ev || ev.organization_id !== organizationId) return { error: "Attachment not found in this organization" };

  // Cross-bucket copy: download from task-attachments → upload to library-files.
  const { data: blob, error: dlError } = await supabase.storage.from("task-attachments").download(att.storage_key);
  if (dlError || !blob) return { error: dlError?.message ?? "Could not read the source file" };

  const key = libraryStorageKey(organizationId, targetFolderId, att.file_name);
  const { error: upError } = await supabase.storage
    .from(BUCKET).upload(key, blob, { contentType: att.mime_type ?? undefined });
  if (upError) return { error: upError.message };

  const { data, error: dbError } = await supabase
    .from("library_files")
    .insert({
      organization_id: organizationId,
      folder_id: targetFolderId,
      name: att.file_name,
      storage_key: key,
      file_size: att.file_size,
      mime_type: att.mime_type,
      source_type: "task_attachment",
      source_ref: attachmentId,
      created_by: user.id,
    })
    .select()
    .single();
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([key]);
    return { error: dbError.message };
  }

  revalidatePath("/company/my-items");
  return { data: data as LibraryFile };
}

// ── Approved estimates → CSV snapshot ───────────────────────────────────────

export type ApprovedEstimate = { id: string; proposal_number: string; label: string };

export async function getApprovedEstimates(organizationId: string): Promise<ApprovedEstimate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await isMember(supabase, organizationId, user.id))) return [];

  const { data: events } = await supabase.from("events").select("id, name").eq("organization_id", organizationId);
  const eventById = new Map((events ?? []).map((e) => [e.id, e.name as string]));
  if (eventById.size === 0) return [];

  const { data: comps } = await supabase.from("components").select("id, name, event_id").in("event_id", [...eventById.keys()]);
  const compById = new Map((comps ?? []).map((c) => [c.id, { name: c.name as string, eventId: c.event_id as string }]));
  if (compById.size === 0) return [];

  const { data: estimates } = await supabase
    .from("estimates")
    .select("id, proposal_number, component_id, activity_id, status")
    .in("component_id", [...compById.keys()])
    .eq("status", "approved");

  const activityIds = [...new Set((estimates ?? []).map((e) => e.activity_id).filter(Boolean))] as string[];
  const activityNameById = new Map<string, string>();
  if (activityIds.length > 0) {
    const { data: acts } = await supabase.from("activities").select("id, name").in("id", activityIds);
    for (const a of acts ?? []) activityNameById.set(a.id as string, a.name as string);
  }

  return (estimates ?? []).map((e) => {
    const comp = compById.get(e.component_id as string);
    const eventName = comp ? (eventById.get(comp.eventId) ?? "") : "";
    const activityName = e.activity_id ? activityNameById.get(e.activity_id as string) : undefined;
    const parts = [eventName, comp?.name, activityName].filter(Boolean);
    return {
      id: e.id as string,
      proposal_number: e.proposal_number as string,
      label: parts.join(" / ") || (e.proposal_number as string),
    };
  });
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function saveApprovedEstimateToLibrary(
  estimateId: string,
  targetFolderId: string | null,
  organizationId: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await isMember(supabase, organizationId, user.id))) return { error: "Not authorized" };
  if (!(await targetFolderInOrg(supabase, targetFolderId, organizationId))) {
    return { error: "Invalid target folder" };
  }

  const { data: estimate } = await supabase
    .from("estimates").select("id, proposal_number, status, component_id").eq("id", estimateId).single();
  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "approved") return { error: "Estimate must be approved" };

  // Confirm the estimate's component is in this org.
  const { data: comp } = await supabase.from("components").select("event_id").eq("id", estimate.component_id).single();
  const { data: ev } = comp
    ? await supabase.from("events").select("organization_id").eq("id", comp.event_id).single()
    : { data: null };
  if (!ev || ev.organization_id !== organizationId) return { error: "Estimate not in this organization" };

  const [{ data: columns }, { data: sections }, { data: lineItems }] = await Promise.all([
    supabase.from("estimate_columns").select("id, name, sort_order").eq("estimate_id", estimateId).order("sort_order"),
    supabase.from("estimate_sections").select("id, name, sort_order").eq("estimate_id", estimateId).order("sort_order"),
    supabase.from("estimate_line_items").select("section_id, cells, sort_order").eq("estimate_id", estimateId).order("sort_order"),
  ]);

  const cols = columns ?? [];
  const lines: string[] = [cols.map((c) => csvCell(c.name as string)).join(",")];
  for (const section of sections ?? []) {
    lines.push(csvCell(section.name as string));
    for (const li of (lineItems ?? []).filter((l) => l.section_id === section.id)) {
      const cells = (li.cells ?? {}) as Record<string, string>;
      lines.push(cols.map((c) => csvCell(String(cells[c.id as string] ?? ""))).join(","));
    }
  }
  const csv = lines.join("\n");
  const fileName = `${estimate.proposal_number}.csv`;
  const blob = new Blob([csv], { type: "text/csv" });

  const key = libraryStorageKey(organizationId, targetFolderId, fileName);
  const { error: upError } = await supabase.storage.from(BUCKET).upload(key, blob, { contentType: "text/csv" });
  if (upError) return { error: upError.message };

  const { data, error: dbError } = await supabase
    .from("library_files")
    .insert({
      organization_id: organizationId,
      folder_id: targetFolderId,
      name: fileName,
      storage_key: key,
      file_size: blob.size,
      mime_type: "text/csv",
      source_type: "estimate_snapshot",
      source_ref: estimateId,
      created_by: user.id,
    })
    .select()
    .single();
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([key]);
    return { error: dbError.message };
  }

  revalidatePath("/company/my-items");
  return { data: data as LibraryFile };
}
