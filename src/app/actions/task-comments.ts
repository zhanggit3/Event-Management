"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskCommentWithAuthor } from "@/types/database";
import { createNotificationInternal } from "@/app/actions/notifications";

export async function getTaskComments(taskId: string): Promise<TaskCommentWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_comments")
    .select("*, author:author_id(id, full_name, email, avatar_url)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as TaskCommentWithAuthor[];
}

export async function createTaskComment(
  taskId: string,
  body: string,
  mentions: string[],
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!body.trim()) return { error: "Comment cannot be empty" };

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: user.id, body: body.trim(), mentions })
    .select("*, author:author_id(id, full_name, email, avatar_url)")
    .single();

  if (error) return { error: error.message };

  // Fetch task context for notifications
  const { data: task } = await supabase
    .from("tasks")
    .select("reporter_id, assigned_to, title")
    .eq("id", taskId)
    .single();

  if (task) {
    const link = `/events/${eventSlug}/${componentSlug}?task=${taskId}`;
    const bodyPreview = body.trim().slice(0, 100);

    // Notify reporter and assignee about the new comment,
    // but skip those who are also mentioned (they'll get the higher-priority mention notification instead)
    const mentionSet = new Set(mentions);
    const commentTargets = new Set<string>();
    if (task.reporter_id) commentTargets.add(task.reporter_id);
    if (task.assigned_to) commentTargets.add(task.assigned_to);
    for (const userId of commentTargets) {
      if (!mentionSet.has(userId)) {
        await createNotificationInternal({
          recipientId: userId,
          actorId: user.id,
          type: "task_comment_added",
          title: `New comment on "${task.title}"`,
          body: bodyPreview,
          link,
          relatedTable: "task_comments",
          relatedId: (data as { id: string }).id,
        });
      }
    }

    // Notify each mentioned user
    for (const mentionedUserId of mentions) {
      await createNotificationInternal({
        recipientId: mentionedUserId,
        actorId: user.id,
        type: "mention_in_comment",
        title: `You were mentioned in a comment on "${task.title}"`,
        body: bodyPreview,
        link,
        relatedTable: "task_comments",
        relatedId: (data as { id: string }).id,
      });
    }
  }

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as unknown as TaskCommentWithAuthor };
}

export async function deleteTaskComment(
  commentId: string,
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}
