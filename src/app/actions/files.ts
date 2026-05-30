"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFolder(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const componentId = formData.get("component_id") as string;
  const name = formData.get("name") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!name?.trim()) return { error: "Folder name is required" };

  const { data, error } = await supabase
    .from("component_folders")
    .insert({ component_id: componentId, name: name.trim(), created_by: user?.id ?? null })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: { ...data, files: [] } };
}

export async function deleteFolder(folderId: string, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();

  const { data: files } = await supabase
    .from("component_files")
    .select("storage_key")
    .eq("folder_id", folderId);

  if (files && files.length > 0) {
    await supabase.storage.from("component-files").remove(files.map((f) => f.storage_key));
  }

  const { error } = await supabase.from("component_folders").delete().eq("id", folderId);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function uploadFile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const folderId = formData.get("folder_id") as string;
  const componentId = formData.get("component_id") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;
  const file = formData.get("file") as File;

  if (!file || file.size === 0) return { error: "No file selected" };

  const storageKey = `${componentId}/${folderId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("component-files")
    .upload(storageKey, file, { contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data: fileRecord, error: dbError } = await supabase.from("component_files").insert({
    folder_id: folderId,
    component_id: componentId,
    name: file.name,
    storage_key: storageKey,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: user?.id ?? null,
  }).select().single();

  if (dbError) {
    await supabase.storage.from("component-files").remove([storageKey]);
    return { error: dbError.message };
  }

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: fileRecord };
}

export async function deleteFile(fileId: string, storageKey: string, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();

  await supabase.storage.from("component-files").remove([storageKey]);

  const { error } = await supabase.from("component_files").delete().eq("id", fileId);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function getSignedUrl(storageKey: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("component-files")
    .createSignedUrl(storageKey, 3600);

  if (error) return { error: error.message };
  return { url: data.signedUrl };
}
