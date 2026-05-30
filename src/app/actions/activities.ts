"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Activity, Task } from "@/types/database";

export async function createActivity(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const componentId = formData.get("component_id") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const color = formData.get("color") as string;
  const status = (formData.get("status") as string) || "active";
  const priority = formData.get("priority") as string | null;
  const startDate = formData.get("start_date") as string | null;
  const dueDate = formData.get("due_date") as string | null;
  const ownerId = formData.get("owner_id") as string | null;
  const assigneeId = formData.get("assignee_id") as string | null;
  const tagsRaw = formData.get("tags") as string | null;
  const tags = tagsRaw ? (JSON.parse(tagsRaw) as string[]) : [];
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!name?.trim()) return { error: "Activity name is required" };

  const { data: last } = await supabase
    .from("activities")
    .select("sort_order")
    .eq("component_id", componentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("activities")
    .insert({
      component_id: componentId,
      name: name.trim(),
      description: description?.trim() || null,
      color: color || "#6366f1",
      status,
      priority: priority || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      owner_id: ownerId || null,
      assignee_id: assigneeId || null,
      tags,
      reporter_id: user.id,
      sort_order: last ? last.sort_order + 1 : 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as Activity };
}

export async function updateActivity(
  activityId: string,
  updates: Partial<Pick<Activity, "name" | "description" | "color" | "status" | "priority" | "start_date" | "due_date" | "owner_id" | "assignee_id" | "tags">>,
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("activities")
    .update(updates)
    .eq("id", activityId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function deleteActivity(
  activityId: string,
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();

  const { error } = await supabase.from("activities").delete().eq("id", activityId);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function createActivityTask(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const componentId = formData.get("component_id") as string;
  const activityId = formData.get("activity_id") as string;
  const title = formData.get("title") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!title?.trim()) return { error: "Title is required" };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      component_id: componentId,
      activity_id: activityId,
      title: title.trim(),
      priority: "medium",
      status: "todo",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as Task };
}
