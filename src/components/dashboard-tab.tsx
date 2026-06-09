"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { Plus, ChevronRight, ChevronDown, Pencil, Trash2, Circle, Loader2, Check, ReceiptText } from "lucide-react";
import { createActivity, updateActivity, deleteActivity } from "@/app/actions/activities";
import { updateTask } from "@/app/actions/tasks";
import { TaskCreatePanel } from "@/components/task-create-panel";
import { TaskEditPanel } from "@/components/task-edit-panel";
import { useComponentTasks } from "@/components/component-tasks-context";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { Activity, Task, Profile } from "@/types/database";

type TaskWithAssignee = Task & { assignee?: Profile | null };

interface DashboardTabProps {
  activities: Activity[];
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  members: Profile[];
  currentUserId?: string;
  eventCreatorId?: string;
  defaultOpenTaskId?: string | null;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#00CC66",
  "#14b8a6", "#3b82f6", "#64748b", "#000000",
];

const KANBAN_COLS = [
  { key: "todo" as const, label: "To Do", bg: "bg-white/[0.02]", border: "border-white/[0.06]" },
  { key: "in_progress" as const, label: "In Progress", bg: "bg-blue-500/[0.06]", border: "border-blue-500/20" },
  { key: "done" as const, label: "Done", bg: "bg-emerald-500/[0.06]", border: "border-emerald-500/20" },
];

const PRIORITY_COLOR: Record<string, string> = {
  low: "text-white/30",
  medium: "text-blue-400",
  high: "text-orange-400",
  urgent: "text-red-400",
};

const ACTIVITY_STATUSES: { value: Activity["status"]; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

const ACTIVITY_STATUS_STYLE: Record<Activity["status"], string> = {
  planned: "bg-white/[0.06] text-white/50",
  active: "bg-emerald-500/15 text-emerald-400",
  in_progress: "bg-blue-500/15 text-blue-400",
  completed: "bg-indigo-500/15 text-indigo-400",
  on_hold: "bg-amber-500/15 text-amber-400",
  cancelled: "bg-red-500/15 text-red-400",
  archived: "bg-white/[0.06] text-white/30",
};

// ── New Activity Modal ─────────────────────────────────────────────────────────

function ActivityModal({
  componentId, eventSlug, componentSlug, onCreated, members, currentUser,
  mode = "create", activity, open: controlledOpen, onOpenChange, onUpdated,
}: {
  componentId: string; eventSlug: string; componentSlug: string;
  onCreated: (a: Activity) => void;
  members: Profile[];
  currentUser?: Profile | null;
  mode?: "create" | "edit";
  activity?: Activity;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUpdated?: (a: Activity) => void;
}) {
  const isEdit = mode === "edit";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setInternalOpen(v); };

  const [name, setName] = useState(activity?.name ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [color, setColor] = useState(activity?.color ?? PRESET_COLORS[0]);
  const [status, setStatus] = useState<Activity["status"]>(activity?.status ?? "active");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical" | "">(activity?.priority ?? "");
  // <input type="date"> only accepts YYYY-MM-DD; slice guards against any ISO/timestamp value
  // so editing never silently blanks (and then clobbers) an existing date.
  const [startDate, setStartDate] = useState((activity?.start_date ?? "").slice(0, 10));
  const [dueDate, setDueDate] = useState((activity?.due_date ?? "").slice(0, 10));
  const [ownerId, setOwnerId] = useState(activity?.owner_id ?? "");
  const [assigneeId, setAssigneeId] = useState(activity?.assignee_id ?? "");
  const [tags, setTags] = useState<string[]>(activity?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [templateType, setTemplateType] = useState<"" | "estimate">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName(""); setDescription(""); setColor(PRESET_COLORS[0]);
    setStatus("active"); setPriority(""); setStartDate(""); setDueDate("");
    setOwnerId(""); setAssigneeId(""); setTags([]); setTagInput("");
    setTemplateType(""); setError(null);
  }

  // Close the modal; reset fields only in create mode (edit instances are unmounted by the parent).
  function closeModal() {
    setOpen(false);
    if (!isEdit) reset();
  }

  function addTag() {
    const t = tagInput.trim().toUpperCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    // Edit mode: patch every field via updateActivity (which takes a partial object, not FormData).
    if (isEdit && activity) {
      const updates = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        status,
        priority: priority || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        owner_id: ownerId || null,
        assignee_id: assigneeId || null,
        tags,
      };
      startTransition(async () => {
        const result = await updateActivity(activity.id, updates, eventSlug, componentSlug);
        if ("error" in result) setError(result.error ?? "Could not save the activity.");
        else { onUpdated?.({ ...activity, ...updates }); setOpen(false); }
      });
      return;
    }

    const fd = new FormData();
    fd.set("component_id", componentId);
    fd.set("name", name.trim());
    fd.set("description", description.trim());
    fd.set("color", color);
    fd.set("status", status);
    if (priority) fd.set("priority", priority);
    if (startDate) fd.set("start_date", startDate);
    if (dueDate) fd.set("due_date", dueDate);
    if (ownerId) fd.set("owner_id", ownerId);
    if (assigneeId) fd.set("assignee_id", assigneeId);
    fd.set("tags", JSON.stringify(tags));
    fd.set("template_type", templateType);
    fd.set("event_slug", eventSlug);
    fd.set("component_slug", componentSlug);
    startTransition(async () => {
      const result = await createActivity(fd);
      if (result.error) setError(result.error);
      else if (result.data) { onCreated(result.data); setOpen(false); reset(); }
    });
  }

  const reporterName = currentUser?.full_name || currentUser?.email || "You";
  const reporterInitials = reporterName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const fieldClass = "flex-1 h-8 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs text-white focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all appearance-none";

  return (
    <>
      {!isEdit && (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Activity
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={closeModal}>
          <div
            className="bg-[#0D0D1C] border border-white/10 rounded-2xl w-full max-w-[720px] max-h-[90vh] flex flex-col shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between shrink-0 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <span className="text-indigo-400">◈</span>
                <span className="text-sm font-semibold text-white">{isEdit ? "Edit Activity" : "New Activity"}</span>
              </div>
              <button
                onClick={closeModal}
                className="text-white/30 hover:text-white transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Form: body + footer */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col min-h-0">
              {error && (
                <p className="px-5 pt-3 text-xs text-red-400 shrink-0">{error}</p>
              )}

              {/* Two-column body */}
              <div className="flex-1 overflow-y-auto flex min-h-0">
                {/* Left column — 60% */}
                <div className="flex-[3] p-6 space-y-5 border-r border-white/[0.07] overflow-y-auto">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Name *</label>
                    <div className="flex">
                      <div className="w-1 shrink-0 rounded-l-lg" style={{ backgroundColor: color }} />
                      <input
                        autoFocus required value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Activity name…"
                        className="flex-1 h-11 border border-l-0 border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] rounded-r-xl transition-all"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What is this activity about?"
                      rows={4}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] resize-none transition-all"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Tags</label>
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2 min-h-[44px] flex flex-wrap gap-1.5 items-center focus-within:border-indigo-500/50 transition-all">
                      {tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-md px-2 py-0.5">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400 ml-0.5 leading-none">×</button>
                        </span>
                      ))}
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        onBlur={() => { if (tagInput.trim()) addTag(); }}
                        placeholder={tags.length === 0 ? "Add tags… (Enter or comma)" : ""}
                        className="flex-1 min-w-[120px] text-xs text-white bg-transparent focus:outline-none placeholder:text-white/25"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-white/30">Press Enter or comma to add a tag</p>
                  </div>

                  {/* Template (create only) */}
                  {!isEdit && (
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Template</label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = templateType === "estimate" ? "" : "estimate";
                        setTemplateType(next);
                        if (next === "estimate" && !name.trim()) setName("Estimate");
                      }}
                      className={`w-full flex items-center justify-center gap-2 h-10 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        templateType === "estimate"
                          ? "border-indigo-500/60 bg-indigo-500/10 text-white"
                          : "border-white/10 bg-white/[0.04] text-white/50 hover:text-white"
                      }`}
                    >
                      <ReceiptText className="w-4 h-4" />Estimate
                    </button>
                    <p className="mt-1 text-[10px] text-white/30">
                      {templateType === "estimate"
                        ? "An estimate sheet will be generated under this activity."
                        : "Leave off for a standard activity."}
                    </p>
                  </div>
                  )}
                </div>

                {/* Right column — 40% */}
                <div className="flex-[2] p-6 space-y-5 overflow-y-auto">
                  {/* DETAILS */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 pb-1 border-b border-white/[0.06] mb-3">Details</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/50 w-20 shrink-0">Status</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value as Activity["status"])} className={fieldClass}>
                          {ACTIVITY_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/50 w-20 shrink-0">Priority</label>
                        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={fieldClass}>
                          <option value="">None</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/50 w-20 shrink-0">Owner</label>
                        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={fieldClass}>
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/50 w-20 shrink-0">Assignee</label>
                        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={fieldClass}>
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* DATES */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 pb-1 border-b border-white/[0.06] mb-3">Dates</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/50 w-20 shrink-0">Start</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/50 w-20 shrink-0">Due</label>
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
                      </div>
                    </div>
                  </div>

                  {/* COLOR */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 pb-1 border-b border-white/[0.06] mb-3">Color</p>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setColor(c)}
                          className="w-6 h-6 rounded-full border-2 transition-all"
                          style={{
                            backgroundColor: c,
                            borderColor: color === c ? "#ffffff" : "transparent",
                            transform: color === c ? "scale(1.15)" : "scale(1)",
                          }} />
                      ))}
                    </div>
                  </div>

                  {/* REPORTER */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 pb-1 border-b border-white/[0.06] mb-3">Reporter</p>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {reporterInitials}
                      </div>
                      <span className="text-xs text-white/60 truncate flex-1">{reporterName}</span>
                      <span className="shrink-0 text-[10px] bg-emerald-500/15 text-emerald-400 rounded-md px-1.5 py-0.5">AUTO</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.07] px-6 py-4 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={closeModal}
                  className="h-9 px-5 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-xs text-white/70 hover:bg-white/[0.1] hover:text-white transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={!name.trim() || isPending}
                  className="h-9 px-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-xs text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {isPending ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Activity →")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Status icon cycle ──────────────────────────────────────────────────────────

function StatusIcon({ status, onClick }: { status: Task["status"]; onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 w-5 h-5 flex items-center justify-center hover:opacity-70 transition-opacity" title="Cycle status">
      {status === "todo" && <Circle className="w-4 h-4 text-white/20" />}
      {status === "in_progress" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
      {status === "done" && <Check className="w-4 h-4 text-emerald-400" />}
    </button>
  );
}

// ── Activity Row (Jira-style flat list) ────────────────────────────────────────

function ActivityRow({
  activity, tasks, isExpanded, onToggle, onTaskSelect, onAddTask, onDelete, onEdit, eventSlug, componentSlug, onTaskStatusChange,
}: {
  activity: Activity;
  tasks: TaskWithAssignee[];
  isExpanded: boolean;
  onToggle: () => void;
  onTaskSelect: (task: TaskWithAssignee) => void;
  onAddTask: () => void;
  onDelete: () => void;
  onEdit: () => void;
  eventSlug: string;
  componentSlug: string;
  onTaskStatusChange: (taskId: string, status: Task["status"]) => void;
}) {
  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const doneCount = topLevel.filter((t) => t.status === "done").length;

  function cycleStatus(task: TaskWithAssignee) {
    const next: Task["status"] = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
    onTaskStatusChange(task.id, next);
    updateTask(task.id, { status: next }, eventSlug, componentSlug);
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl mb-2 overflow-hidden">
      {/* Activity header */}
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-white/[0.03] transition-colors group/row">
        <div className="w-3 h-3 shrink-0 rounded-full" style={{ backgroundColor: activity.color ?? "#6366f1" }} />

        <button onClick={onToggle} className="shrink-0 text-white/30 hover:text-white transition-colors">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {activity.template_type === "estimate" ? (
          <Link
            href={`/events/${eventSlug}/${componentSlug}/estimate/${activity.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-300 hover:text-indigo-200 hover:underline text-left"
          >
            <ReceiptText className="w-3.5 h-3.5 shrink-0" />{activity.name}
          </Link>
        ) : (
          <button onClick={onToggle} className="flex-1 text-sm font-semibold text-white text-left">{activity.name}</button>
        )}

        <span className="text-xs text-white/30 shrink-0">{doneCount}/{topLevel.length} tasks</span>

        <span className={`text-xs font-semibold rounded-md px-2 py-0.5 shrink-0 ${ACTIVITY_STATUS_STYLE[activity.status]}`}>
          {activity.status.replace("_", " ")}
        </span>

        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
          <IconTooltip label="Edit" side="top">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.07] hover:text-white transition-all">
              <Pencil className="w-3 h-3" />
            </button>
          </IconTooltip>
          <IconTooltip label="Delete" side="top">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400 transition-all">
              <Trash2 className="w-3 h-3" />
            </button>
          </IconTooltip>
        </div>
      </div>

      {/* Expanded: flat Jira-style task list */}
      {isExpanded && (
        <div className="border-t border-white/[0.06]">
          {/* Column headers */}
          {topLevel.length > 0 && (
            <div className="flex items-center gap-3 px-10 py-1.5 border-b border-white/[0.04] bg-white/[0.02]">
              <span className="flex-1 text-xs text-white/30">Task</span>
              <span className="w-20 text-xs text-white/30 text-center">Status</span>
              <span className="w-16 text-xs text-white/30 text-center">Priority</span>
              <span className="w-24 text-xs text-white/30">Assignee</span>
            </div>
          )}

          {/* Task rows */}
          {topLevel.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] group/task"
            >
              <StatusIcon status={task.status} onClick={() => cycleStatus(task)} />

              <button
                onClick={() => onTaskSelect(task)}
                className={`flex-1 text-sm text-left font-medium hover:underline ${task.status === "done" ? "line-through text-white/30" : "text-white/80"}`}
              >
                {task.title}
              </button>

              <span className="w-20 text-xs text-center text-white/40">
                {task.status === "in_progress" ? "In Prog." : task.status}
              </span>

              <span className={`w-16 text-xs text-center font-semibold ${PRIORITY_COLOR[task.priority]}`}>
                {task.priority}
              </span>

              <span className="w-24 text-xs text-white/30 truncate">
                {task.assignee?.full_name || task.assignee?.email || "—"}
              </span>
            </div>
          ))}

          {topLevel.length === 0 && (
            <div className="px-10 py-4 text-xs text-white/30">No tasks yet</div>
          )}

          {/* Add task row */}
          <button
            onClick={onAddTask}
            className="w-full flex items-center gap-2 px-10 py-2.5 text-xs text-white/30 hover:text-indigo-400 hover:bg-indigo-500/[0.04] transition-colors border-t border-white/[0.04]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add task
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main DashboardTab ──────────────────────────────────────────────────────────

type PanelState =
  | { mode: "create"; activityId: string }
  | { mode: "edit"; task: TaskWithAssignee }
  | null;

export function DashboardTab({
  activities: initialActivities,
  componentId,
  eventSlug,
  componentSlug,
  members,
  currentUserId,
  eventCreatorId,
  defaultOpenTaskId,
}: DashboardTabProps) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const { tasks, setTasks } = useComponentTasks();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [, startTransition] = useTransition();
  const deepLinkFiredRef = useRef(false);

  useEffect(() => {
    if (!defaultOpenTaskId || deepLinkFiredRef.current) return;
    const target = tasks.find((t) => t.id === defaultOpenTaskId) ?? null;
    if (target) {
      deepLinkFiredRef.current = true;
      setPanel({ mode: "edit", task: target as TaskWithAssignee });
    }
  }, [defaultOpenTaskId, tasks]);

  const currentUser = currentUserId ? (members.find((m) => m.id === currentUserId) ?? null) : null;

  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const activityById = activities.reduce<Record<string, Activity>>((acc, a) => ({ ...acc, [a.id]: a }), {});

  function getActivityTasks(activityId: string) {
    return tasks.filter((t) => t.activity_id === activityId);
  }

  function handleActivityCreated(activity: Activity) {
    setActivities((prev) => [...prev, activity]);
  }

  function handleTaskCreated(task: TaskWithAssignee) {
    setTasks((prev) => [task, ...prev]);
    setPanel(null);
  }

  function handleTaskUpdate(taskId: string, updates: Partial<Task>) {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...updates } : t));
    if (panel?.mode === "edit" && panel.task.id === taskId) {
      setPanel({ mode: "edit", task: { ...panel.task, ...updates } });
    }
  }

  function handleTaskDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parent_task_id !== taskId));
    setPanel(null);
  }

  function handleTaskStatusChange(taskId: string, status: Task["status"]) {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t));
  }

  function handleActivityDelete(activityId: string) {
    const count = getActivityTasks(activityId).filter((t) => !t.parent_task_id).length;
    if (count > 0) {
      alert(`Cannot delete: this activity has ${count} task${count !== 1 ? "s" : ""}. Remove all tasks first.`);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== activityId));
    if (expandedId === activityId) setExpandedId(null);
    startTransition(async () => { await deleteActivity(activityId, eventSlug, componentSlug); });
  }

  function handleActivityUpdated(updated: Activity) {
    setActivities((prev) => prev.map((a) => a.id === updated.id ? updated : a));
  }

  return (
    <div className="space-y-8">

      {/* ── Master Kanban ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">All Tasks</h2>
          <span className="text-xs text-white/30 bg-white/[0.06] rounded-md px-2 py-0.5">{topLevel.length}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLS.map(({ key, label, bg, border }) => {
            const colTasks = topLevel.filter((t) => t.status === key);
            return (
              <div key={key} className={`${bg} border ${border} rounded-xl p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-white/60 uppercase tracking-widest">{label}</h3>
                  <span className="text-xs text-white/30 bg-white/[0.06] rounded-md px-2 py-0.5">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => {
                    const activity = task.activity_id ? activityById[task.activity_id] : null;
                    return (
                      <button
                        key={task.id}
                        onClick={() => setPanel({ mode: "edit", task })}
                        className="w-full text-left bg-white/[0.04] border border-white/[0.07] rounded-xl hover:bg-white/[0.07] transition-all p-3"
                      >
                        {activity && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: activity.color ?? "#6366f1" }} />
                            <span className="text-xs text-white/40 truncate">{activity.name}</span>
                          </div>
                        )}
                        <p className={`text-sm font-semibold leading-snug ${key === "done" ? "line-through text-white/30" : "text-white"}`}>
                          {task.title}
                        </p>
                      </button>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-white/20 text-center py-4">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Activities (Jira-style) ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Activities</h2>
            <span className="text-xs text-white/30 bg-white/[0.06] rounded-md px-2 py-0.5">{activities.length}</span>
          </div>
          <ActivityModal componentId={componentId} eventSlug={eventSlug} componentSlug={componentSlug} onCreated={handleActivityCreated} members={members} currentUser={currentUser} />
        </div>

        {activities.length === 0 ? (
          <div className="border border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center gap-4">
            <p className="text-xs text-white/40">No activities yet — create one to start adding tasks</p>
            <ActivityModal componentId={componentId} eventSlug={eventSlug} componentSlug={componentSlug} onCreated={handleActivityCreated} members={members} currentUser={currentUser} />
          </div>
        ) : (
          <div>
            {activities.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                tasks={getActivityTasks(activity.id)}
                isExpanded={expandedId === activity.id}
                onToggle={() => setExpandedId(expandedId === activity.id ? null : activity.id)}
                onTaskSelect={(task) => setPanel({ mode: "edit", task })}
                onAddTask={() => { setExpandedId(activity.id); setPanel({ mode: "create", activityId: activity.id }); }}
                onDelete={() => handleActivityDelete(activity.id)}
                onEdit={() => setEditActivity(activity)}
                eventSlug={eventSlug}
                componentSlug={componentSlug}
                onTaskStatusChange={handleTaskStatusChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Edit Activity modal (full editor) ─────────────────────────────── */}
      {editActivity && (
        <ActivityModal
          key={editActivity.id}
          mode="edit"
          activity={editActivity}
          open
          onOpenChange={(o) => { if (!o) setEditActivity(null); }}
          onUpdated={(a) => { handleActivityUpdated(a); setEditActivity(null); }}
          componentId={componentId}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          members={members}
          currentUser={currentUser}
          onCreated={() => {}}
        />
      )}

      {/* ── Task detail panel ─────────────────────────────────────────────── */}
      {panel?.mode === "edit" && (
        <TaskEditPanel
          task={panel.task}
          activities={activities}
          members={members}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onClose={() => setPanel(null)}
          onTaskUpdate={(updates) => handleTaskUpdate(panel.task.id, updates)}
          onTaskDelete={handleTaskDelete}
        />
      )}
      {panel?.mode === "create" && (
        <TaskCreatePanel
          componentId={componentId}
          defaultActivityId={panel.activityId}
          defaultReporterId={eventCreatorId}
          activities={activities}
          members={members}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onClose={() => setPanel(null)}
          onTaskCreated={handleTaskCreated}
        />
      )}
    </div>
  );
}
