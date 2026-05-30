"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { createTask } from "@/app/actions/tasks";
import type { Task, Profile, Activity } from "@/types/database";
import {
  inputCls, labelCls,
  TaskWithAssignee, TaskFieldsGrid,
} from "@/components/task-panel-shared";

export interface TaskCreatePanelProps {
  componentId: string;
  defaultActivityId?: string;
  parentTaskId?: string;
  defaultReporterId?: string;
  activities?: Activity[];
  members: Profile[];
  eventSlug: string;
  componentSlug: string;
  onClose: () => void;
  onTaskCreated: (task: TaskWithAssignee) => void;
}

export function TaskCreatePanel({
  componentId, defaultActivityId, parentTaskId, defaultReporterId,
  activities, members, eventSlug, componentSlug,
  onClose, onTaskCreated,
}: TaskCreatePanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [reporterId, setReporterId] = useState(defaultReporterId ?? "");
  const [dueDate, setDueDate] = useState("");
  const [activityId, setActivityId] = useState(defaultActivityId ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => titleInputRef.current?.focus(), 50);
  }, []);

  async function handleCreate() {
    if (!title.trim() || creating) return;
    setCreating(true);
    setCreateError(null);

    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("title", title.trim());
    formData.set("description", description.trim());
    formData.set("priority", priority);
    formData.set("assigned_to", assignedTo);
    formData.set("reporter_id", reporterId);
    formData.set("due_date", dueDate);
    if (activityId) formData.set("activity_id", activityId);
    if (parentTaskId) formData.set("parent_task_id", parentTaskId);
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    const result = await createTask(formData);
    setCreating(false);

    if (result?.error) {
      setCreateError(result.error);
    } else if (result?.data) {
      onTaskCreated(result.data as TaskWithAssignee);
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[640px] max-h-[90vh] bg-[#0D0D1C] border border-white/10 rounded-2xl z-50 flex flex-col overflow-hidden shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            {parentTaskId ? "New sub-task" : "New task"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!title.trim() || creating}
              className="h-8 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {creating ? "Creating…" : "Create task"}
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 bg-white/[0.06] border border-white/10 rounded-lg hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">

            {createError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-sm text-red-400">{createError}</p>
              </div>
            )}

            {/* Title */}
            <div>
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                placeholder="Task title *"
                className="w-full text-xl font-bold text-white border-0 border-b border-indigo-500/50 bg-transparent focus:outline-none pb-1 placeholder:text-white/20"
              />
            </div>

            <TaskFieldsGrid
              status={status} priority={priority}
              assignedTo={assignedTo} reporterId={reporterId}
              dueDate={dueDate} activityId={activityId}
              activities={activities} members={members}
              onStatusChange={setStatus} onPriorityChange={setPriority}
              onAssigneeChange={setAssignedTo} onReporterChange={setReporterId}
              onDueDateChange={setDueDate} onActivityChange={setActivityId}
            />

            {/* Description */}
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Add a description…"
                className="w-full rounded-xl border border-indigo-500/40 bg-indigo-500/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-all"
              />
            </div>

            {!parentTaskId && (
              <p className="text-xs text-white/25 text-center border border-dashed border-white/[0.08] rounded-xl py-4">
                Sub-tasks, attachments &amp; comments available after creating
              </p>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
