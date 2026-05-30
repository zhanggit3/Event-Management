"use server";

import { createClient } from "@/lib/supabase/server";
import type { NotificationWithActor, NotificationType } from "@/types/database";

export async function getNotifications(limit = 20): Promise<{
  data?: NotificationWithActor[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("notifications")
    .select("*, actor:actor_id(id, full_name, email)")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  return { data: data as unknown as NotificationWithActor[] };
}

export async function markNotificationRead(notificationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("recipient_id", user.id);
  if (error) return { error: error.message };
  return {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", user.id)
    .eq("is_read", false);
  if (error) return { error: error.message };
  return {};
}

// Internal helper: called from other server actions. Never call from a browser component.
// Silently no-ops when recipientId === actorId (unless allowSelfNotify is true).
export async function createNotificationInternal(params: {
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  relatedTable?: string;
  relatedId?: string;
  allowSelfNotify?: boolean;
}): Promise<void> {
  if (!params.allowSelfNotify && params.actorId && params.recipientId === params.actorId) return;
  const supabase = await createClient();
  await supabase.from("notifications").insert({
    recipient_id: params.recipientId,
    actor_id: params.actorId ?? null,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    related_table: params.relatedTable ?? null,
    related_id: params.relatedId ?? null,
  });
}
