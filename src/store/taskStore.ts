import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task, Priority } from "../types/task";

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface Store {
  tasks: Task[];
  focusedTaskId: string | null;
  addTask: (title: string, priority?: Priority, dueDate?: string, estimatedMinutes?: number) => void;
  removeTask: (id: string) => void;
  completeTask: (id: string) => void;
  completeGroup: (groupId: string) => void;
  reactivateTask: (id: string) => void;
  setFocus: (id: string | null) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, "title" | "memo" | "priority" | "estimatedMinutes" | "dueDate">>) => void;
  groupTasks: (taskId1: string, taskId2: string) => void;
  ungroupTask: (taskId: string) => void;
  getActiveTasks: () => Task[];
  getCompletedTasks: () => Task[];
  getGroupTasks: (groupId: string) => Task[];
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      tasks: [],
      focusedTaskId: null,

      addTask: (title, priority = 3, dueDate, estimatedMinutes) => {
        const task: Task = {
          id: genId(),
          title,
          priority,
          dueDate,
          estimatedMinutes,
          completed: false,
          createdAt: Date.now(),
        };
        set((s) => ({ tasks: [...s.tasks, task] }));
      },

      removeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          focusedTaskId: s.focusedTaskId === id ? null : s.focusedTaskId,
        })),

      completeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: true, completedAt: Date.now() } : t
          ),
          focusedTaskId: s.focusedTaskId === id ? null : s.focusedTaskId,
        })),

      completeGroup: (groupId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.groupId === groupId ? { ...t, completed: true, completedAt: Date.now() } : t
          ),
          focusedTaskId: null,
        })),

      reactivateTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: false, completedAt: undefined } : t
          ),
        })),

      setFocus: (id) => set({ focusedTaskId: id }),

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      groupTasks: (taskId1, taskId2) => {
        const state = get();
        const t1 = state.tasks.find((t) => t.id === taskId1);
        const t2 = state.tasks.find((t) => t.id === taskId2);
        if (!t1 || !t2) return;

        // Determine group id: use existing or create new
        const gid = t1.groupId || t2.groupId || genId();

        // Merge: if both have groups, merge t2's group into t1's
        const oldGroupId = t2.groupId;

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id === taskId1 || t.id === taskId2) return { ...t, groupId: gid };
            if (oldGroupId && t.groupId === oldGroupId) return { ...t, groupId: gid };
            return t;
          }),
        }));
      },

      ungroupTask: (taskId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const { groupId: _, ...rest } = t;
            return rest as Task;
          }),
        })),

      getActiveTasks: () => get().tasks.filter((t) => !t.completed),
      getCompletedTasks: () => get().tasks.filter((t) => t.completed),
      getGroupTasks: (groupId) => get().tasks.filter((t) => t.groupId === groupId && !t.completed),
    }),
    { name: "roullette-bubbles" }
  )
);
