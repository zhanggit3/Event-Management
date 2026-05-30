"use client";

import type { Task, Profile } from "@/types/database";

interface TaskCardProps {
  task: Task & { assignee?: Profile | null };
  subTasks?: (Task & { assignee?: Profile | null })[];
  onSelect: (task: Task & { assignee?: Profile | null }) => void;
}

export function TaskCard({ task, onSelect }: TaskCardProps) {
  const isDone = task.status === "done";

  return (
    <button
      onClick={() => onSelect(task)}
      className="w-full text-left bg-white/[0.04] border border-white/[0.08] rounded-xl hover:bg-white/[0.07] transition-all p-3 cursor-pointer"
    >
      <p className={`text-sm font-semibold leading-snug ${isDone ? "line-through text-white/30" : "text-white"}`}>
        {task.title}
      </p>
    </button>
  );
}
