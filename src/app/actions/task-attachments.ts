"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskAttachmentWithUploader } from "@/types/database";
import { createNotificationInternal } from "@/app/actions/notifications";

export async function getTaskAttachments(taskId: string): Promise<TaskAttachmentWithUploader[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_attachments")
    .select("*, uploader:uploaded_by(full_name, email)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as TaskAttachmentWithUploader[];
}

export async function createTaskAttachment(
  taskId: string,
  fileName: string,
  storageKey: string,
  fileSize: number | null,
  mimeType: string | null,
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({ task_id: taskId, uploaded_by: user.id, file_name: fileName, storage_key: storageKey, file_size: fileSize, mime_type: mimeType })
    .select("*, uploader:uploaded_by(full_name, email)")
    .single();

  if (error) return { error: error.message };

  const { data: task } = await supabase
    .from("tasks")
    .select("reporter_id, assigned_to, title")
    .eq("id", taskId)
    .single();

  if (task) {
    const link = `/events/${eventSlug}/${componentSlug}?task=${taskId}`;
    const attachmentTargets = new Set<string>();
    if (task.reporter_id) attachmentTargets.add(task.reporter_id);
    if (task.assigned_to) attachmentTargets.add(task.assigned_to);
    for (const userId of attachmentTargets) {
      await createNotificationInternal({
        recipientId: userId,
        actorId: user.id,
        type: "task_attachment_added",
        title: `New attachment on "${task.title}"`,
        body: fileName,
        link,
        relatedTable: "task_attachments",
        relatedId: (data as { id: string }).id,
      });
    }
  }

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as unknown as TaskAttachmentWithUploader };
}

export async function deleteTaskAttachment(
  attachmentId: string,
  storageKey: string,
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();
  await supabase.storage.from("task-attachments").remove([storageKey]);
  const { error } = await supabase.from("task_attachments").delete().eq("id", attachmentId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function getTaskAttachmentSignedUrl(storageKey: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(storageKey, 3600);
  return data?.signedUrl ?? null;
}
