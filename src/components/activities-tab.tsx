"use client";

import { useState, useTransition, useRef } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Check, Circle, Loader2, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createActivity, deleteActivity, updateActivity, createActivityTask } from "@/app/actions/activities";
import { updateTask, deleteTask } from "@/app/actions/tasks";
import type { Activity, Task, Profile } from "@/types/database";

type ActivityTask = Task & { assignee?: Profile | null };

interface ActivitiesTabProps {
  activities: Activity[];
  tasks: ActivityTask[];
  componentId: string;
  eventSlug: string;
  componentSlug: string;
}

const STATUS_COLORS: Record<Activity["status"], string> = {
  planned: "bg-gray-300",
  active: "bg-[#00CC66]",
  in_progress: "bg-blue-400",
  completed: "bg-blue-500",
  on_hold: "bg-yellow-400",
  cancelled: "bg-red-400",
  archived: "bg-gray-400",
};

const STATUS_LABELS: Record<Activity["status"], string> = {
  planned: "Planned",
  active: "Active",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  archived: "Archived",
};

const TASK_STATUS_ICON: Record<Task["status"], React.ReactNode> = {
  todo: <Circle className="w-3.5 h-3.5 text-[#999999]" />,
  in_progress: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  done: <Check className="w-3.5 h-3.5 text-[#00CC66]" />,
};

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#00CC66",
  "#14b8a6", "#3b82f6", "#64748b", "#000000",
];

// ── New Activity Modal ────────────────────────────────────────────────────────

function NewActivityModal({
  componentId,
  eventSlug,
  componentSlug,
  onCreated,
}: {
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  onCreated: (a: Activity) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName(""); setDescription(""); setColor(PRESET_COLORS[0]); setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("component_id", componentId);
    fd.set("name", name.trim());
    fd.set("description", description.trim());
    fd.set("color", color);
    fd.set("event_slug", eventSlug);
    fd.set("component_slug", componentSlug);

    startTransition(async () => {
      const result = await createActivity(fd);
      if (result.error) { setError(result.error); }
      else if (result.data) { onCreated(result.data); setOpen(false); reset(); }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 bg-[#00CC66] border-2 border-black shadow-[4px_4px_0px_0px_#000000] font-bold uppercase tracking-wide text-black text-xs hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
      >
        <Plus className="w-4 h-4" />
        New Activity
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#FFF8F0] border-2 border-black shadow-[8px_8px_0px_0px_#000000] w-full max-w-sm mx-4">
            <div className="bg-black px-4 py-2.5 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-white">New Activity</span>
              <button onClick={() => { setOpen(false); reset(); }} className="text-white font-mono text-xs hover:text-[#00CC66]">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <p className="font-mono text-xs text-[#FF0000] uppercase">{error}</p>}
              <div className="space-y-1">
                <label className="block font-mono text-xs uppercase tracking-widest text-[#555555]">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                  placeholder="e.g. Sponsorship"
                  className="flex h-11 w-full border-2 border-black rounded-none bg-white px-3 text-sm focus:outline-none focus:border-[#00CC66] focus:bg-[#E8FFF5]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-mono text-xs uppercase tracking-widest text-[#555555]">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional"
                  className="flex w-full border-2 border-black rounded-none bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#00CC66] focus:bg-[#E8FFF5]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-mono text-xs uppercase tracking-widest text-[#555555]">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform"
                      style={{ backgroundColor: c, borderColor: color === c ? "#000" : "transparent", transform: color === c ? "scale(1.2)" : "scale(1)" }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => { setOpen(false); reset(); }} className="h-10 px-4 border-2 border-black bg-white font-mono text-xs uppercase">Cancel</button>
                <button
                  type="submit"
                  disabled={isPending || !name.trim()}
                  className="h-10 px-4 border-2 border-black bg-[#00CC66] shadow-[4px_4px_0px_0px_#000000] font-bold uppercase text-xs hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
                >
                  {isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Activity Card ─────────────────────────────────────────────────────────────

function ActivityCard({
  activity,
  tasks,
  componentId,
  eventSlug,
  componentSlug,
  onDelete,
}: {
  activity: Activity;
  tasks: ActivityTask[];
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [localTasks, setLocalTasks] = useState<ActivityTask[]>(tasks);
  const [addingTask, setAddingTask] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(activity.name);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAddTask() {
    setExpanded(true);
    setAddingTask(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleTaskSubmit() {
    const title = taskInput.trim();
    if (!title) { setAddingTask(false); return; }

    const optimistic: ActivityTask = {
      id: `opt-${Date.now()}`,
      component_id: componentId,
      activity_id: activity.id,
      parent_task_id: null,
      title,
      status: "todo",
      priority: "medium",
      description: null,
      assigned_to: null,
      reporter_id: null,
      due_date: null,
      created_by: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setLocalTasks((prev) => [...prev, optimistic]);
    setTaskInput("");
    setAddingTask(false);

    const fd = new FormData();
    fd.set("component_id", componentId);
    fd.set("activity_id", activity.id);
    fd.set("title", title);
    fd.set("event_slug", eventSlug);
    fd.set("component_slug", componentSlug);

    startTransition(async () => {
      const result = await createActivityTask(fd);
      if (result.data) {
        setLocalTasks((prev) => prev.map((t) => t.id === optimistic.id ? result.data as ActivityTask : t));
      } else {
        setLocalTasks((prev) => prev.filter((t) => t.id !== optimistic.id));
      }
    });
  }

  function handleTaskStatusToggle(task: ActivityTask) {
    const next = task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    setLocalTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next as Task["status"] } : t));
    updateTask(task.id, { status: next }, eventSlug, componentSlug);
  }

  function handleTaskDelete(taskId: string) {
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    deleteTask(taskId, eventSlug, componentSlug);
  }

  function handleRename() {
    if (!nameInput.trim() || nameInput === activity.name) { setEditingName(false); return; }
    updateActivity(activity.id, { name: nameInput.trim() }, eventSlug, componentSlug);
    setEditingName(false);
  }

  const doneCount = localTasks.filter((t) => t.status === "done").length;
  const activityColor = activity.color ?? "#6366f1";

  return (
    <div className="border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000000]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b-2 border-black bg-[#FAFAFA]">
        {/* Color bar */}
        <div className="w-1.5 h-10 shrink-0 border border-black" style={{ backgroundColor: activityColor }} />

        {/* Expand toggle */}
        <button onClick={() => setExpanded((v) => !v)} className="shrink-0 text-[#555555] hover:text-black transition-colors">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Name */}
        {editingName ? (
          <input
            type="text"
            value={nameInput}
            autoFocus
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingName(false); }}
            className="flex-1 font-bold uppercase text-sm border-0 border-b-2 border-black bg-transparent focus:outline-none focus:border-[#00CC66]"
          />
        ) : (
          <p className="flex-1 font-black uppercase text-sm tracking-tight leading-tight">{activity.name}</p>
        )}

        {/* Meta */}
        <span className="font-mono text-xs text-[#555555] shrink-0">{doneCount}/{localTasks.length}</span>
        <span className={`shrink-0 font-mono text-[10px] uppercase tracking-widest text-white px-2 py-0.5 ${STATUS_COLORS[activity.status]}`}>
          {STATUS_LABELS[activity.status]}
        </span>

        {/* Actions */}
        <button
          onClick={() => { setEditingName(true); setNameInput(activity.name); }}
          className="opacity-60 hover:opacity-100 transition-opacity"
          title="Rename"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleAddTask}
          className="opacity-60 hover:opacity-100 hover:text-[#00CC66] transition-all"
          title="Add task"
        >
          <Plus className="w-4 h-4" />
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="opacity-60 hover:opacity-100 hover:text-[#FF0000] transition-all" title="Delete activity">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{activity.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                The activity will be deleted. Its {localTasks.length} task{localTasks.length !== 1 ? "s" : ""} will become unattached and remain in the kanban board.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(activity.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Task list */}
      {expanded && (
        <div>
          {localTasks.length === 0 && !addingTask ? (
            <p className="px-4 py-3 text-xs font-mono text-[#555555] uppercase">No tasks yet — add one below.</p>
          ) : (
            localTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-black/10 group/task hover:bg-[#F9F9F9]">
                <button
                  onClick={() => handleTaskStatusToggle(task)}
                  title="Cycle status"
                  className="shrink-0"
                >
                  {TASK_STATUS_ICON[task.status]}
                </button>
                <span className={`flex-1 text-sm font-medium ${task.status === "done" ? "line-through text-[#999999]" : "text-black"}`}>
                  {task.title}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#999999] shrink-0">
                  {task.status === "in_progress" ? "in progress" : task.status}
                </span>
                <button
                  onClick={() => handleTaskDelete(task.id)}
                  className="opacity-0 group-hover/task:opacity-100 transition-opacity text-[#555555] hover:text-[#FF0000] shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}

          {/* Inline add task */}
          {addingTask ? (
            <div className="flex items-center gap-3 px-4 py-2.5 border-t-2 border-black bg-[#E8FFF5]">
              <Circle className="w-3.5 h-3.5 text-[#999999] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTaskSubmit();
                  if (e.key === "Escape") { setAddingTask(false); setTaskInput(""); }
                }}
                onBlur={handleTaskSubmit}
                placeholder="Task name…"
                disabled={isPending}
                className="flex-1 text-sm bg-transparent border-0 focus:outline-none placeholder:text-[#999999]"
              />
              <span className="font-mono text-[10px] text-[#555555] uppercase shrink-0">Enter to save</span>
            </div>
          ) : (
            <button
              onClick={handleAddTask}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-mono text-[#555555] hover:text-[#00CC66] hover:bg-[#E8FFF5] transition-colors border-t border-black/10"
            >
              <Plus className="w-3 h-3" />
              Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ActivitiesTab ────────────────────────────────────────────────────────

export function ActivitiesTab({
  activities: initialActivities,
  tasks,
  componentId,
  eventSlug,
  componentSlug,
}: ActivitiesTabProps) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [, startTransition] = useTransition();

  // Group tasks by activity_id
  const tasksByActivity = tasks.reduce<Record<string, ActivityTask[]>>((acc, t) => {
    if (t.activity_id) {
      (acc[t.activity_id] ??= []).push(t);
    }
    return acc;
  }, {});

  function handleDelete(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id));
    startTransition(async () => { await deleteActivity(id, eventSlug, componentSlug); });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#555555]">
          {activities.length} {activities.length === 1 ? "activity" : "activities"}
        </h2>
        <NewActivityModal
          componentId={componentId}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onCreated={(a) => setActivities((prev) => [...prev, a])}
        />
      </div>

      {activities.length === 0 ? (
        <div className="border-2 border-dashed border-black p-16 text-center">
          <p className="font-black uppercase text-lg mb-2">No activities yet</p>
          <p className="font-mono text-xs text-[#555555] uppercase mb-6">
            Activities group related tasks — like Sponsorship, Venue, or Catering.
          </p>
          <NewActivityModal
            componentId={componentId}
            eventSlug={eventSlug}
            componentSlug={componentSlug}
            onCreated={(a) => setActivities((prev) => [...prev, a])}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              tasks={tasksByActivity[activity.id] ?? []}
              componentId={componentId}
              eventSlug={eventSlug}
              componentSlug={componentSlug}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
