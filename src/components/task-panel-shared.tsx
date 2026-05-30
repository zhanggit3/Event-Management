"use client";

import type { Task, Profile, Activity } from "@/types/database";

export const inputCls = "flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
export const labelCls = "text-xs font-semibold text-white/40 uppercase tracking-widest block mb-1.5";

export const STATUS_OPTIONS: { value: Task["status"]; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export const PRIORITY_OPTIONS: { value: Task["priority"]; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export type TaskWithAssignee = Task & { assignee?: Profile | null };
export type SubTask = Task & { assignee?: Profile | null };

export function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function renderBody(body: string) {
  const parts = body.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      const href = match[2].trim();
      if (isSafeUrl(href)) {
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">
            {match[1]}
          </a>
        );
      }
      return <span key={i}>{match[1]}</span>;
    }
    return (
      <span key={i}>
        {part.split(/(@\w+)/g).map((s, j) =>
          s.startsWith("@") ? (
            <span key={j} className="text-indigo-400 font-semibold">{s}</span>
          ) : s
        )}
      </span>
    );
  });
}

// ── Shared form fields grid ───────────────────────────────────────────────────

interface TaskFieldsGridProps {
  status: Task["status"];
  priority: Task["priority"];
  assignedTo: string;
  reporterId: string;
  dueDate: string;
  activityId: string;
  activities?: Activity[];
  members: Profile[];
  onStatusChange: (v: Task["status"]) => void;
  onPriorityChange: (v: Task["priority"]) => void;
  onAssigneeChange: (v: string) => void;
  onReporterChange: (v: string) => void;
  onDueDateChange: (v: string) => void;
  onActivityChange: (v: string) => void;
}

export function TaskFieldsGrid({
  status, priority, assignedTo, reporterId, dueDate, activityId,
  activities, members,
  onStatusChange, onPriorityChange, onAssigneeChange, onReporterChange, onDueDateChange, onActivityChange,
}: TaskFieldsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className={labelCls}>Status</label>
        <select value={status} onChange={(e) => onStatusChange(e.target.value as Task["status"])} className={inputCls}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Priority</label>
        <select value={priority} onChange={(e) => onPriorityChange(e.target.value as Task["priority"])} className={inputCls}>
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Assignee</label>
        <select value={assignedTo} onChange={(e) => onAssigneeChange(e.target.value)} className={inputCls}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Reporter</label>
        <select value={reporterId} onChange={(e) => onReporterChange(e.target.value)} className={inputCls}>
          <option value="">None</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Due date</label>
        <input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} className={inputCls} />
      </div>
      {activities && activities.length > 0 && (
        <div className="col-span-2">
          <label className={labelCls}>Activity</label>
          <select value={activityId} onChange={(e) => onActivityChange(e.target.value)} className={inputCls}>
            <option value="">No activity</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
