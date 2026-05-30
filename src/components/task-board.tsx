"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { TaskCard } from "@/components/task-card";
import { TaskCreatePanel } from "@/components/task-create-panel";
import { TaskEditPanel } from "@/components/task-edit-panel";
import type { Task, Profile } from "@/types/database";

type TaskWithAssignee = Task & { assignee?: Profile | null };

interface TaskBoardProps {
  initialTasks: TaskWithAssignee[];
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  members: Profile[];
}

const STATUS_COLUMNS = [
  { key: "todo" as const, label: "To Do", bg: "bg-gray-50 border-2 border-black" },
  { key: "in_progress" as const, label: "In Progress", bg: "bg-blue-50 border-2 border-black" },
  { key: "done" as const, label: "Done", bg: "bg-[#E8FFF5] border-2 border-black" },
];

type PanelState =
  | { mode: "create" }
  | { mode: "edit"; task: TaskWithAssignee }
  | null;

export function TaskBoard({ initialTasks, componentId, eventSlug, componentSlug, members }: TaskBoardProps) {
  const [tasks, setTasks] = useState<TaskWithAssignee[]>(initialTasks);
  const [panel, setPanel] = useState<PanelState>(null);

  const topLevel = tasks.filter((t) => !t.parent_task_id);

  function handleTaskCreated(task: TaskWithAssignee) {
    setTasks((prev) => [task, ...prev]);
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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono uppercase tracking-widest text-[#555555]">
          {topLevel.length} task{topLevel.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={() => setPanel({ mode: "create" })}
          className="inline-flex items-center justify-center gap-2 h-9 px-3 bg-[#00CC66] border-2 border-black shadow-[4px_4px_0px_0px_#000000] rounded-none font-bold uppercase tracking-wide text-black hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-xs"
        >
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLUMNS.map(({ key, label, bg }) => {
          const colTasks = topLevel.filter((t) => t.status === key);
          return (
            <div key={key} className={`p-4 ${bg}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest">{label}</h3>
                <span className="text-xs font-mono text-[#555555] border-2 border-black bg-white px-2 py-0.5">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onSelect={(t) => setPanel({ mode: "edit", task: t })}
                  />
                ))}
                {colTasks.length === 0 && (
                  <p className="text-xs text-[#555555] font-mono text-center py-4">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {panel?.mode === "create" && (
        <TaskCreatePanel
          componentId={componentId}
          members={members}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onClose={() => setPanel(null)}
          onTaskCreated={(task) => { handleTaskCreated(task); }}
        />
      )}

      {panel?.mode === "edit" && (
        <TaskEditPanel
          task={panel.task}
          members={members}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onClose={() => setPanel(null)}
          onTaskUpdate={(updates) => handleTaskUpdate(panel.task.id, updates)}
          onTaskDelete={handleTaskDelete}
        />
      )}
    </>
  );
}
