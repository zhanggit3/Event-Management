"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotificationInternal } from "@/app/actions/notifications";

export async function createTask(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const componentId = formData.get("component_id") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const priority = (formData.get("priority") as string) || "medium";
  const assignedTo = formData.get("assigned_to") as string;
  const reporterIdRaw = formData.get("reporter_id") as string | null;
  const dueDate = formData.get("due_date") as string;
  const activityId = formData.get("activity_id") as string | null;
  const parentTaskId = formData.get("parent_task_id") as string | null;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!title?.trim()) return { error: "Title is required" };
  if (!activityId && !parentTaskId) return { error: "Task must belong to an activity" };

  const { data, error } = await supabase.from("tasks").insert({
    component_id: componentId,
    parent_task_id: parentTaskId || null,
    title: title.trim(),
    description: description || null,
    priority,
    assigned_to: assignedTo || null,
    reporter_id: reporterIdRaw || user.id,
    due_date: dueDate || null,
    activity_id: activityId || null,
    created_by: user.id,
    status: "todo",
  }).select().single();

  if (error) return { error: error.message };

  if (assignedTo && assignedTo !== user.id) {
    const taskId = (data as { id: string }).id;
    await createNotificationInternal({
      recipientId: assignedTo,
      actorId: user.id,
      type: "task_assigned",
      title: `You were assigned to "${title.trim()}"`,
      link: `/events/${eventSlug}/${componentSlug}?task=${taskId}`,
      relatedTable: "tasks",
      relatedId: taskId,
    });
  }

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data };
}

export async function updateTask(taskId: string, updates: {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigned_to?: string | null;
  reporter_id?: string | null;
  due_date?: string | null;
  activity_id?: string | null;
}, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: currentTask } = await supabase
    .from("tasks")
    .select("reporter_id, assigned_to, title, created_by")
    .eq("id", taskId)
    .single();

  const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
  if (error) return { error: error.message };

  if (currentTask) {
    const link = `/events/${eventSlug}/${componentSlug}?task=${taskId}`;

    // New assignee notification
    if (updates.assigned_to && updates.assigned_to !== currentTask.assigned_to) {
      await createNotificationInternal({
        recipientId: updates.assigned_to,
        actorId: user.id,
        type: "task_assigned",
        title: `You were assigned to "${currentTask.title}"`,
        link,
        relatedTable: "tasks",
        relatedId: taskId,
      });
    }

    // Task content changed — notify reporter, creator, and current assignee (per AC criterion 13)
    const hasContentChange =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.status !== undefined ||
      updates.priority !== undefined ||
      updates.due_date !== undefined;

    if (hasContentChange) {
      const updateTargets = new Set<string>();
      if (currentTask.reporter_id) updateTargets.add(currentTask.reporter_id);
      if (currentTask.created_by) updateTargets.add(currentTask.created_by);
      if (currentTask.assigned_to) updateTargets.add(currentTask.assigned_to);
      for (const userId of updateTargets) {
        await createNotificationInternal({
          recipientId: userId,
          actorId: user.id,
          type: "task_updated",
          title: `"${currentTask.title}" was updated`,
          link,
          relatedTable: "tasks",
          relatedId: taskId,
        });
      }
    }
  }

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function deleteTask(taskId: string, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function createSubTask(
  parentTaskId: string,
  componentId: string,
  title: string,
  eventSlug: string,
  componentSlug: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!title.trim()) return { error: "Title is required" };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      component_id: componentId,
      parent_task_id: parentTaskId,
      title: title.trim(),
      priority: "medium",
      status: "todo",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data };
}

export async function createNote(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const componentId = formData.get("component_id") as string;
  const content = formData.get("content") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!content?.trim()) return { error: "Content is required" };

  const { data: note, error } = await supabase
    .from("notes")
    .insert({ component_id: componentId, content: content.trim(), created_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };

  // Fetch author profile separately (avoids FK join ambiguity)
  const { data: author } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, created_at")
    .eq("id", user.id)
    .single();

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: { ...note, author: author ?? { id: user.id, full_name: "", email: user.email ?? "", avatar_url: null, created_at: note.created_at } } };
}

export async function deleteNote(noteId: string, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("notes").delete().eq("id", noteId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}
