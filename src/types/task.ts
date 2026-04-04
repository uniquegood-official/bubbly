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
}
