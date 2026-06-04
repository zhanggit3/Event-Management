import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyWorkTable } from "@/components/my-work-table";
import type { MyWorkRow } from "@/types/database";

type ProfileLite = { id: string; full_name: string | null; email: string | null; avatar_url: string | null };

export default async function MyWorkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const me = user.id;

  // (a) the user's tasks — assignee OR reporter OR creator; component+event via safe nested select
  const { data: rawTasks } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, assigned_to, reporter_id, created_by, due_date, created_at, updated_at, " +
        "component:component_id(name, slug, event:event_id(id, name, slug))",
    )
    .or(`assigned_to.eq.${me},reporter_id.eq.${me},created_by.eq.${me}`);

  type RawTask = {
    id: string;
    title: string;
    status: "todo" | "in_progress" | "done";
    priority: "low" | "medium" | "high" | "urgent";
    assigned_to: string | null;
    reporter_id: string | null;
    created_by: string;
    due_date: string | null;
    created_at: string;
    updated_at: string;
    component:
      | { name: string; slug: string; event: { id: string; name: string; slug: string } | null }
      | null;
  };

  const tasks = ((rawTasks ?? []) as unknown as RawTask[]);
  const taskIds = tasks.map((t) => t.id);

  // (b) profiles for assignee + reporter (separate query — 3 FKs make joins ambiguous)
  const profileIds = [
    ...new Set(
      tasks.flatMap((t) => [t.assigned_to, t.reporter_id ?? t.created_by]).filter(Boolean),
    ),
  ] as string[];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", profileIds)
    : { data: [] as ProfileLite[] };
  const profileMap = new Map(((profiles ?? []) as ProfileLite[]).map((p) => [p.id, p]));

  // (c) direct subtasks of these tasks (for comment rollup + last-modified)
  const { data: subtasks } = taskIds.length
    ? await supabase.from("tasks").select("id, parent_task_id, updated_at").in("parent_task_id", taskIds)
    : { data: [] as { id: string; parent_task_id: string | null; updated_at: string }[] };
  const subtaskList = (subtasks ?? []) as { id: string; parent_task_id: string | null; updated_at: string }[];
  const childIdsByParent = new Map<string, string[]>();
  const childUpdatedById = new Map<string, string>();
  for (const s of subtaskList) {
    if (s.parent_task_id) {
      const arr = childIdsByParent.get(s.parent_task_id) ?? [];
      arr.push(s.id);
      childIdsByParent.set(s.parent_task_id, arr);
    }
    childUpdatedById.set(s.id, s.updated_at);
  }
  const allIds = [...taskIds, ...subtaskList.map((s) => s.id)];

  // (d) comments + attachments across tasks AND their subtasks
  const { data: comments } = allIds.length
    ? await supabase.from("task_comments").select("task_id, created_at, updated_at").in("task_id", allIds)
    : { data: [] as { task_id: string; created_at: string; updated_at: string | null }[] };
  const { data: attachments } = allIds.length
    ? await supabase.from("task_attachments").select("task_id, created_at").in("task_id", allIds)
    : { data: [] as { task_id: string; created_at: string }[] };

  const commentList = (comments ?? []) as { task_id: string; created_at: string; updated_at: string | null }[];
  const attachmentList = (attachments ?? []) as { task_id: string; created_at: string }[];

  // Index comments/attachments by task_id for rollup.
  const commentsByTask = new Map<string, { created_at: string; updated_at: string | null }[]>();
  for (const c of commentList) {
    const arr = commentsByTask.get(c.task_id) ?? [];
    arr.push(c);
    commentsByTask.set(c.task_id, arr);
  }
  const attachmentsByTask = new Map<string, { created_at: string }[]>();
  for (const a of attachmentList) {
    const arr = attachmentsByTask.get(a.task_id) ?? [];
    arr.push(a);
    attachmentsByTask.set(a.task_id, arr);
  }

  function toRow(p: ProfileLite | undefined): MyWorkRow["assignee"] {
    if (!p) return null;
    return { full_name: p.full_name ?? p.email ?? "", email: p.email ?? "", avatar_url: p.avatar_url };
  }

  const rows: MyWorkRow[] = tasks.map((t) => {
    const relevantIds = [t.id, ...(childIdsByParent.get(t.id) ?? [])];

    let commentCount = 0;
    let lastModified = t.updated_at;
    for (const id of relevantIds) {
      if (id !== t.id) {
        const childUpdated = childUpdatedById.get(id);
        if (childUpdated && childUpdated > lastModified) lastModified = childUpdated;
      }
      for (const c of commentsByTask.get(id) ?? []) {
        commentCount += 1;
        if (c.created_at > lastModified) lastModified = c.created_at;
        if (c.updated_at && c.updated_at > lastModified) lastModified = c.updated_at;
      }
      for (const a of attachmentsByTask.get(id) ?? []) {
        if (a.created_at > lastModified) lastModified = a.created_at;
      }
    }

    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.created_at,
      dueDate: t.due_date,
      lastModified,
      commentCount,
      assignee: toRow(t.assigned_to ? profileMap.get(t.assigned_to) : undefined),
      reporter: toRow(profileMap.get(t.reporter_id ?? t.created_by)),
      event: t.component?.event ? { name: t.component.event.name, slug: t.component.event.slug } : null,
      // Deep link opens this exact task/subtask's edit panel on the component page.
      // The resolver in dashboard-tab searches the full task list (incl. subtasks),
      // so `?task={id}` works for both top-level tasks and subtasks.
      href:
        t.component?.event && t.component.slug
          ? `/events/${t.component.event.slug}/${t.component.slug}?task=${t.id}`
          : null,
    };
  });

  return (
    <div className="min-h-full">
      <div className="px-8 py-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">My Work</h1>
        <p className="text-sm text-white/40 mb-6">Tasks assigned to or reported by you.</p>
        <MyWorkTable rows={rows} />
      </div>
    </div>
  );
}
