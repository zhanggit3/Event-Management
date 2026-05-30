"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/types/database";

export async function createCalendarEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const componentId = formData.get("component_id") as string;
  const eventId = formData.get("event_id") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const isAllDay = formData.get("is_all_day") === "true";
  const location = formData.get("location") as string;
  const color = formData.get("color") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!title?.trim()) return { error: "Title is required" };
  if (!startTime) return { error: "Start time is required" };

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      component_id: componentId,
      event_id: eventId,
      title: title.trim(),
      description: description || null,
      start_time: startTime,
      end_time: endTime || null,
      is_all_day: isAllDay,
      location: location || null,
      color: color || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  revalidatePath(`/events/${eventSlug}`);
  return { data: data as CalendarEvent };
}

export async function updateCalendarEvent(id: string, formData: FormData) {
  const supabase = await createClient();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const isAllDay = formData.get("is_all_day") === "true";
  const location = formData.get("location") as string;
  const color = formData.get("color") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!title?.trim()) return { error: "Title is required" };
  if (!startTime) return { error: "Start time is required" };

  const { data, error } = await supabase
    .from("calendar_events")
    .update({
      title: title.trim(),
      description: description || null,
      start_time: startTime,
      end_time: endTime || null,
      is_all_day: isAllDay,
      location: location || null,
      color: color || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  revalidatePath(`/events/${eventSlug}`);
  return { data: data as CalendarEvent };
}

export async function deleteCalendarEvent(
  id: string,
  eventSlug: string,
  componentSlug: string
) {
  const supabase = await createClient();

  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  revalidatePath(`/events/${eventSlug}`);
  return { success: true };
}
