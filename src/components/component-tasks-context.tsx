"use client";

import { createContext, useContext, useState } from "react";
import type { Task, Profile } from "@/types/database";

export type TaskWithAssignee = Task & { assignee?: Profile | null };

interface TasksCtx {
  tasks: TaskWithAssignee[];
  setTasks: React.Dispatch<React.SetStateAction<TaskWithAssignee[]>>;
}

const TasksContext = createContext<TasksCtx>({ tasks: [], setTasks: () => {} });

export function ComponentTasksProvider({
  initialTasks,
  children,
}: {
  initialTasks: TaskWithAssignee[];
  children: React.ReactNode;
}) {
  const [tasks, setTasks] = useState<TaskWithAssignee[]>(initialTasks);
  return <TasksContext.Provider value={{ tasks, setTasks }}>{children}</TasksContext.Provider>;
}

export function useComponentTasks() {
  return useContext(TasksContext);
}
