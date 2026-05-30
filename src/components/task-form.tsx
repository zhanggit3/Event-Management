"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createTask } from "@/app/actions/tasks";
import type { Task, Profile } from "@/types/database";

interface TaskFormProps {
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  members: Profile[];
  defaultStatus?: string;
  onTaskCreated?: (task: Task & { assignee?: Profile | null }) => void;
}

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";
const selectClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] appearance-none transition-all";

export function TaskForm({ componentId, eventSlug, componentSlug, members, defaultStatus = "todo", onTaskCreated }: TaskFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("component_id", componentId);
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);
    const result = await createTask(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      if (result?.data && onTaskCreated) {
        onTaskCreated(result.data as Task & { assignee?: Profile | null });
      }
      setOpen(false);
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 h-9 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-xs transition-all">
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
          <DialogDescription>Create a new task for this component.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <div>
            <label htmlFor="title" className={labelClass}>Title *</label>
            <input id="title" name="title" placeholder="Task title" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>Description</label>
            <textarea
              id="description"
              name="description"
              placeholder="Optional details..."
              rows={2}
              className="flex w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="priority" className={labelClass}>Priority</label>
              <select id="priority" name="priority" defaultValue="medium" className={selectClass}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="due_date" className={labelClass}>Due date</label>
              <input id="due_date" name="due_date" type="date" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="assigned_to" className={labelClass}>Assign to</label>
            <select id="assigned_to" name="assigned_to" className={selectClass}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? "Adding..." : "Add task"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
