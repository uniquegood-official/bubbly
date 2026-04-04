import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task, Priority, Category } from "../types/task";

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface Store {
  tasks: Task[];
  categories: Category[];
  focusedTaskId: string | null;
  selectedCategoryId: string | null; // null = "전체", "today", "upcoming", or category id
  addTask: (title: string, priority?: Priority, dueDate?: string, estimatedMinutes?: number, categoryId?: string) => void;
  addSubTask: (parentId: string, title: string) => string;
  removeTask: (id: string) => void;
  completeTask: (id: string) => void;
  completeGroup: (groupId: string) => void;
  reactivateTask: (id: string) => void;
  setFocus: (id: string | null) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, "title" | "memo" | "priority" | "estimatedMinutes" | "dueDate" | "color" | "categoryId">>) => void;
  groupTasks: (taskId1: string, taskId2: string) => void;
  ungroupTask: (taskId: string) => void;
  addCategory: (name: string, icon?: string) => string;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  setSelectedCategory: (id: string | null) => void;
  getActiveTasks: () => Task[];
  getCompletedTasks: () => Task[];
  getGroupTasks: (groupId: string) => Task[];
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      tasks: [],
      categories: [],
      focusedTaskId: null,
      selectedCategoryId: null,

      addTask: (title, priority = 3, dueDate, estimatedMinutes, categoryId) => {
        const state = get();
        const cat = categoryId ?? (state.selectedCategoryId && state.selectedCategoryId !== "today" && state.selectedCategoryId !== "upcoming" ? state.selectedCategoryId : undefined);
        const task: Task = {
          id: genId(),
          title,
          priority,
          dueDate,
          estimatedMinutes,
          completed: false,
          createdAt: Date.now(),
          categoryId: cat,
        };
        set((s) => ({ tasks: [...s.tasks, task] }));
      },

      addSubTask: (parentId, title) => {
        const state = get();
        const parent = state.tasks.find((t) => t.id === parentId);
        if (!parent) return "";
        const gid = parent.groupId || genId();
        const subTask: Task = {
          id: genId(),
          title,
          priority: parent.priority,
          completed: false,
          createdAt: Date.now(),
          groupId: gid,
          color: parent.color,
          categoryId: parent.categoryId,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === parentId ? { ...t, groupId: gid } : t
          ).concat(subTask),
        }));
        return subTask.id;
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
        const gid = t1.groupId || t2.groupId || genId();
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

      addCategory: (name, icon) => {
        const id = genId();
        set((s) => ({ categories: [...s.categories, { id, name, icon }] }));
        return id;
      },

      removeCategory: (id) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          tasks: s.tasks.map((t) => t.categoryId === id ? { ...t, categoryId: undefined } : t),
          selectedCategoryId: s.selectedCategoryId === id ? null : s.selectedCategoryId,
        })),

      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) => c.id === id ? { ...c, name } : c),
        })),

      setSelectedCategory: (id) => set({ selectedCategoryId: id }),

      getActiveTasks: () => get().tasks.filter((t) => !t.completed),
      getCompletedTasks: () => get().tasks.filter((t) => t.completed),
      getGroupTasks: (groupId) => get().tasks.filter((t) => t.groupId === groupId && !t.completed),
    }),
    { name: "roullette-bubbles" }
  )
);
