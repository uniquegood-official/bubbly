export type Priority = 1 | 2 | 3 | 4 | 5;

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  dueDate?: string;
  memo?: string;
  estimatedMinutes?: number;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
  groupId?: string;
  ownerId?: string;
  color?: string;
  categoryId?: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

export const BUBBLE_COLORS = [
  { id: "default", label: "기본", light: "", dark: "", text: "" },
  { id: "rose", label: "로즈", light: "#fecdd3", dark: "#e11d48", text: "#881337" },
  { id: "orange", label: "오렌지", light: "#fed7aa", dark: "#ea580c", text: "#7c2d12" },
  { id: "amber", label: "앰버", light: "#fde68a", dark: "#d97706", text: "#78350f" },
  { id: "emerald", label: "에메랄드", light: "#a7f3d0", dark: "#059669", text: "#064e3b" },
  { id: "sky", label: "스카이", light: "#bae6fd", dark: "#0284c7", text: "#0c4a6e" },
  { id: "violet", label: "바이올렛", light: "#ddd6fe", dark: "#7c3aed", text: "#4c1d95" },
  { id: "pink", label: "핑크", light: "#fbcfe8", dark: "#db2777", text: "#831843" },
] as const;
