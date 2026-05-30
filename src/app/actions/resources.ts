"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ResourceLink } from "@/types/database";

export async function createResourceLink(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const componentId = formData.get("component_id") as string;
  const title = formData.get("title") as string;
  const url = formData.get("url") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!title?.trim()) return { error: "Title is required" };
  if (!url?.trim()) return { error: "URL is required" };

  const { data, error } = await supabase
    .from("resource_links")
    .insert({
      component_id: componentId,
      title: title.trim(),
      url: url.trim(),
      category: category || "other",
      description: description || null,
      added_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as ResourceLink };
}

export async function updateResourceLink(id: string, formData: FormData) {
  const supabase = await createClient();

  const title = formData.get("title") as string;
  const url = formData.get("url") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!title?.trim()) return { error: "Title is required" };
  if (!url?.trim()) return { error: "URL is required" };

  const { data, error } = await supabase
    .from("resource_links")
    .update({
      title: title.trim(),
      url: url.trim(),
      category: category || "other",
      description: description || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as ResourceLink };
}

export async function deleteResourceLink(
  id: string,
  eventSlug: string,
  componentSlug: string
) {
  const supabase = await createClient();

  const { error } = await supabase.from("resource_links").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}
