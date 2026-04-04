import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import type { Task, Priority } from "../types/task";
import type { RealtimeChannel } from "@supabase/supabase-js";

function genId(): string {
  return crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
}

// Map DB row to Task
function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority as Priority,
    memo: row.memo || undefined,
    estimatedMinutes: row.estimated_minutes || undefined,
    dueDate: row.due_date || undefined,
    completed: row.completed,
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined,
    createdAt: new Date(row.created_at).getTime(),
    groupId: row.group_id || undefined,
    ownerId: row.owner_id,
    color: row.color || undefined,
  };
}

export function useWorkspace(userId: string | null) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Load workspace
  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return; }

    async function init() {
      // Check URL for invite code
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get("invite");

      if (inviteCode) {
        await joinByInvite(inviteCode, userId!);
        window.history.replaceState({}, "", window.location.pathname);
      }

      // Get user's workspace (first one)
      const { data: memberships } = await supabase!
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1);

      if (memberships && memberships.length > 0) {
        const { data: ws } = await supabase!
          .from("workspaces")
          .select("*")
          .eq("id", memberships[0].workspace_id)
          .single();
        if (ws) setWorkspace(ws);
      }
      setLoading(false);
    }
    init();
  }, [userId]);

  // Load tasks & subscribe to realtime
  useEffect(() => {
    if (!supabase || !workspace) return;
    let channel: RealtimeChannel;

    async function loadTasks() {
      const { data } = await supabase!
        .from("tasks")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: true });

      if (data) setTasks(data.map(rowToTask));
    }

    loadTasks();

    // Realtime subscription
    channel = supabase
      .channel(`tasks:${workspace.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspace.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTasks((prev) => [...prev, rowToTask(payload.new)]);
          } else if (payload.eventType === "UPDATE") {
            setTasks((prev) => prev.map((t) => t.id === payload.new.id ? rowToTask(payload.new) : t));
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { channel?.unsubscribe(); };
  }, [workspace?.id]);

  // CRUD operations
  const addTask = useCallback(async (title: string, priority: Priority = 3, dueDate?: string, estimatedMinutes?: number) => {
    if (!supabase || !workspace || !userId) return;
    await supabase.from("tasks").insert({
      id: genId(),
      workspace_id: workspace.id,
      owner_id: userId,
      title,
      priority,
      due_date: dueDate || null,
      estimated_minutes: estimatedMinutes || null,
    });
  }, [workspace, userId]);

  const addSubTask = useCallback(async (parentId: string, title: string) => {
    if (!supabase || !workspace || !userId) return "";
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent) return "";
    const gid = parent.groupId || genId();
    const newId = genId();
    // Ensure parent has group
    if (!parent.groupId) {
      await supabase.from("tasks").update({ group_id: gid }).eq("id", parentId);
    }
    await supabase.from("tasks").insert({
      id: newId,
      workspace_id: workspace.id,
      owner_id: userId,
      title,
      priority: parent.priority,
      group_id: gid,
      color: parent.color || null,
    });
    return newId;
  }, [workspace, userId, tasks]);

  const updateTask = useCallback(async (id: string, updates: Partial<Pick<Task, "title" | "memo" | "priority" | "estimatedMinutes" | "dueDate" | "color">>) => {
    if (!supabase) return;
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.memo !== undefined) dbUpdates.memo = updates.memo || null;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.estimatedMinutes !== undefined) dbUpdates.estimated_minutes = updates.estimatedMinutes || null;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null;
    if (updates.color !== undefined) dbUpdates.color = updates.color || null;
    await supabase.from("tasks").update(dbUpdates).eq("id", id);
  }, []);

  const completeTask = useCallback(async (id: string) => {
    if (!supabase) return;
    await supabase.from("tasks").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const reactivateTask = useCallback(async (id: string) => {
    if (!supabase) return;
    await supabase.from("tasks").update({ completed: false, completed_at: null }).eq("id", id);
  }, []);

  const removeTask = useCallback(async (id: string) => {
    if (!supabase) return;
    await supabase.from("tasks").delete().eq("id", id);
  }, []);

  const completeGroup = useCallback(async (groupId: string) => {
    if (!supabase || !workspace) return;
    // Only complete own tasks in the group
    const groupTasks = tasks.filter((t) => t.groupId === groupId && t.ownerId === userId);
    for (const t of groupTasks) {
      await supabase.from("tasks").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", t.id);
    }
  }, [tasks, workspace, userId]);

  const groupTasks = useCallback(async (id1: string, id2: string) => {
    if (!supabase) return;
    const t1 = tasks.find((t) => t.id === id1);
    const t2 = tasks.find((t) => t.id === id2);
    if (!t1 || !t2) return;
    const gid = t1.groupId || t2.groupId || genId();
    const oldGroupId = t2.groupId;

    // Update both tasks
    await supabase.from("tasks").update({ group_id: gid }).eq("id", id1);
    await supabase.from("tasks").update({ group_id: gid }).eq("id", id2);
    // If t2 had a group, merge all of that group
    if (oldGroupId && oldGroupId !== gid) {
      await supabase.from("tasks").update({ group_id: gid }).eq("group_id", oldGroupId);
    }
  }, [tasks]);

  const ungroupTask = useCallback(async (id: string) => {
    if (!supabase) return;
    await supabase.from("tasks").update({ group_id: null }).eq("id", id);
  }, []);

  const getShareLink = useCallback(() => {
    if (!workspace) return "";
    return `${window.location.origin}?invite=${workspace.invite_code}`;
  }, [workspace]);

  return {
    workspace, tasks, loading,
    addTask, addSubTask, updateTask, completeTask, reactivateTask, removeTask,
    completeGroup, groupTasks, ungroupTask,
    getShareLink,
  };
}

async function joinByInvite(inviteCode: string, userId: string) {
  if (!supabase) return;
  // Find workspace by invite code
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("invite_code", inviteCode)
    .single();

  if (!ws) return;

  // Check if already a member
  const { data: existing } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ws.id)
    .eq("user_id", userId)
    .single();

  if (!existing) {
    await supabase.from("workspace_members").insert({
      workspace_id: ws.id,
      user_id: userId,
      role: "member",
    });
  }
}
