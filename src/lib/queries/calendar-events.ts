import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/types/database";

export async function getCalendarEventsByComponent(
  componentId: string
): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("component_id", componentId)
    .order("start_time", { ascending: true });
  return (data ?? []) as CalendarEvent[];
}

export async function getCalendarEventsByEvent(
  eventId: string
): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_events")
    .select("*, component:component_id(name, color)")
    .eq("event_id", eventId)
    .order("start_time", { ascending: true });
  return (data ?? []) as unknown as CalendarEvent[];
}
