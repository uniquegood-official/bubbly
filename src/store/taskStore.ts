import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task, Priority, Category } from "../types/task";
import { BUBBLE_COLORS } from "../types/task";

function getNextBubbleColor(currentColor?: string): string {
  const nonDefault = BUBBLE_COLORS.filter((c) => c.id !== "default");
  if (!currentColor || currentColor === "default") return nonDefault[0].id;
  const idx = nonDefault.findIndex((c) => c.id === currentColor);
  if (idx === -1 || idx === nonDefault.length - 1) return nonDefault[0].id;
  return nonDefault[idx + 1].id;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const MAX_HISTORY = 50;

interface Store {
  tasks: Task[];
  categories: Category[];
  focusedTaskId: string | null;
  selectedCategoryId: string | null;
  _history: Task[][];
  _future: Task[][];
  _pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  addTask: (title: string, priority?: Priority, dueDate?: string, estimatedMinutes?: number, categoryId?: string) => void;
  addSubTask: (parentId: string, title: string) => string;
  addSubTaskWithColor: (parentId: string, title: string, color: string) => string;
  duplicateTasks: (ids: string[]) => void;
  removeTask: (id: string) => void;
  completeTask: (id: string) => void;
  completeGroup: (groupId: string) => void;
  reactivateTask: (id: string) => void;
  setFocus: (id: string | null) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, "title" | "memo" | "priority" | "estimatedMinutes" | "dueDate" | "color" | "categoryId" | "timerEnd">>) => void;
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
      _history: [],
      _future: [],

      _pushHistory: () => {
        const { tasks, _history } = get();
        const newHistory = [..._history, tasks.map((t) => ({ ...t }))];
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        set({ _history: newHistory, _future: [] });
      },

      undo: () => {
        const { tasks, _history, _future } = get();
        if (_history.length === 0) return;
        const prev = _history[_history.length - 1];
        set({
          tasks: prev,
          _history: _history.slice(0, -1),
          _future: [..._future, tasks.map((t) => ({ ...t }))],
        });
      },

      redo: () => {
        const { tasks, _history, _future } = get();
        if (_future.length === 0) return;
        const next = _future[_future.length - 1];
        set({
          tasks: next,
          _history: [..._history, tasks.map((t) => ({ ...t }))],
          _future: _future.slice(0, -1),
        });
      },

      canUndo: () => get()._history.length > 0,
      canRedo: () => get()._future.length > 0,

      addTask: (title, priority = 3, dueDate, estimatedMinutes, categoryId) => {
        get()._pushHistory();
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
        get()._pushHistory();
        const state = get();
        const parent = state.tasks.find((t) => t.id === parentId);
        if (!parent) return "";
        const gid = parent.groupId || genId();
        const nextColor = getNextBubbleColor(parent.color);
        const subTask: Task = {
          id: genId(),
          title,
          priority: parent.priority,
          completed: false,
          createdAt: Date.now(),
          groupId: gid,
          color: nextColor,
          categoryId: parent.categoryId,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === parentId ? { ...t, groupId: gid } : t
          ).concat(subTask),
        }));
        return subTask.id;
      },

      addSubTaskWithColor: (parentId, title, color) => {
        get()._pushHistory();
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
          color,
          categoryId: parent.categoryId,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === parentId ? { ...t, groupId: gid } : t
          ).concat(subTask),
        }));
        return subTask.id;
      },

      duplicateTasks: (ids) => {
        get()._pushHistory();
        const state = get();
        const sourceTasks = ids.map((id) => state.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
        if (sourceTasks.length === 0) return;
        // Determine if all share same groupId
        const groupIds = new Set(sourceTasks.map((t) => t.groupId).filter(Boolean));
        const sharedGroupId = groupIds.size === 1 ? [...groupIds][0] : undefined;
        const newGroupId = sharedGroupId ? genId() : undefined;
        const newTasks: Task[] = sourceTasks.map((t) => ({
          ...t,
          id: genId(),
          createdAt: Date.now(),
          completed: false,
          completedAt: undefined,
          groupId: newGroupId ?? (t.groupId ? genId() : undefined),
        }));
        // If they didn't share a group, each duplicate gets its own new groupId (or none)
        // Actually: only create group if source tasks shared a groupId
        const finalTasks: Task[] = sharedGroupId
          ? newTasks.map((t) => ({ ...t, groupId: newGroupId }))
          : newTasks.map((t, i) => {
              const src = sourceTasks[i];
              if (src.groupId) {
                // find if another duplicate shares this groupId
                const siblings = sourceTasks.filter((s) => s.groupId === src.groupId);
                if (siblings.length > 1) {
                  // they form their own sub-group within this duplication
                  return t;
                }
              }
              return { ...t, groupId: undefined };
            });
        set((s) => ({ tasks: [...s.tasks, ...finalTasks] }));
      },

      removeTask: (id) => {
        get()._pushHistory();
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          focusedTaskId: s.focusedTaskId === id ? null : s.focusedTaskId,
        }));
      },

      completeTask: (id) => {
        get()._pushHistory();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: true, completedAt: Date.now() } : t
          ),
          focusedTaskId: s.focusedTaskId === id ? null : s.focusedTaskId,
        }));
      },

      completeGroup: (groupId) => {
        get()._pushHistory();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.groupId === groupId ? { ...t, completed: true, completedAt: Date.now() } : t
          ),
          focusedTaskId: null,
        }));
      },

      reactivateTask: (id) => {
        get()._pushHistory();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: false, completedAt: undefined } : t
          ),
        }));
      },

      setFocus: (id) => set({ focusedTaskId: id }),

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      groupTasks: (taskId1, taskId2) => {
        get()._pushHistory();
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

      ungroupTask: (taskId) => {
        get()._pushHistory();
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const { groupId: _, ...rest } = t;
            return rest as Task;
          }),
        }));
      },

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
    {
      name: "roullette-bubbles",
      partialize: (state) => {
        const { _history, _future, ...rest } = state;
        return rest;
      },
    }
  )
);
