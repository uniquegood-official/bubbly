import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import type { Task, Priority } from "../types/task";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type WorkspaceRole = "owner" | "editor" | "viewer";
export type ShareRole = Extract<WorkspaceRole, "editor" | "viewer">;

function genId(): string {
  return crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
}

interface MembershipRow {
  workspace_id: string;
  role: WorkspaceRole;
}

function isEditableRole(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "editor";
}

function getNextBubbleColor(currentColor?: string): string | null {
  const colors = ["rose", "orange", "amber", "emerald", "sky", "violet", "pink"];
  if (!currentColor || !colors.includes(currentColor)) return colors[0];
  const idx = colors.indexOf(currentColor);
  return colors[(idx + 1) % colors.length];
}

// Map DB row to Task
function rowToTask(row: Record<string, any>): Task {
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
    ownerId: row.owner_id || undefined,
    color: row.color || undefined,
  };
}

export function useWorkspace(userId: string | null) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [membershipRole, setMembershipRole] = useState<WorkspaceRole | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Load workspace
  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }
    const client = supabase;

    async function init() {
      const params = new URLSearchParams(window.location.search);
      const shareToken = params.get("share");
      const inviteCode = params.get("invite");
      let targetWorkspaceId: string | null = null;

      if (shareToken) {
        targetWorkspaceId = await redeemShareLink(shareToken);
        window.history.replaceState({}, "", window.location.pathname);
      } else if (inviteCode) {
        targetWorkspaceId = await joinByInvite(inviteCode);
        window.history.replaceState({}, "", window.location.pathname);
      }

      let membership: MembershipRow | undefined;

      if (targetWorkspaceId) {
        const { data: joinedMembership } = await client
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", userId)
          .eq("workspace_id", targetWorkspaceId)
          .maybeSingle();

        membership = joinedMembership as MembershipRow | undefined;
      }

      if (!membership) {
        const { data: memberships } = await client
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", userId)
          .order("joined_at", { ascending: false })
          .limit(1);

        membership = memberships?.[0] as MembershipRow | undefined;
      }

      if (membership) {
        const { data: ws } = await client
          .from("workspaces")
          .select("*")
          .eq("id", membership.workspace_id)
          .single();

        if (ws) {
          setWorkspace(ws);
          setMembershipRole(membership.role);
        }
      } else {
        // No workspace found — create one automatically
        const wsId = genId();
        const { error: wsErr } = await client
          .from("workspaces")
          .insert({ id: wsId, name: "My Board", owner_id: userId });

        if (!wsErr) {
          await client
            .from("workspace_members")
            .insert({ workspace_id: wsId, user_id: userId, role: "owner" });

          const { data: ws } = await client
            .from("workspaces")
            .select("*")
            .eq("id", wsId)
            .single();

          if (ws) {
            setWorkspace(ws);
            setMembershipRole("owner");
          }
        } else {
          console.error("Failed to create default workspace:", wsErr);
          setWorkspace(null);
          setMembershipRole(null);
        }
      }

      setLoading(false);
    }

    void init();
  }, [userId]);

  // Load tasks & subscribe to realtime
  useEffect(() => {
    if (!supabase || !workspace) return;
    const client = supabase;
    const activeWorkspace = workspace;
    let channel: RealtimeChannel;

    async function loadTasks() {
      const { data } = await client
        .from("tasks")
        .select("*")
        .eq("workspace_id", activeWorkspace.id)
        .order("created_at", { ascending: true });

      if (data) setTasks(data.map(rowToTask));
    }

    void loadTasks();

    channel = client
      .channel(`tasks:${activeWorkspace.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${activeWorkspace.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTasks((prev) => [...prev, rowToTask(payload.new)]);
          } else if (payload.eventType === "UPDATE") {
            setTasks((prev) => prev.map((task) => (task.id === payload.new.id ? rowToTask(payload.new) : task)));
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((task) => task.id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => {
      channel?.unsubscribe();
    };
  }, [workspace?.id]);

  const addTask = useCallback(
    async (title: string, priority: Priority = 3, dueDate?: string, estimatedMinutes?: number) => {
      if (!supabase || !workspace || !userId) {
        console.error("addTask: missing context", { supabase: !!supabase, workspace: !!workspace, userId });
        return;
      }
      const { error } = await supabase.from("tasks").insert({
        id: genId(),
        workspace_id: workspace.id,
        owner_id: userId,
        title,
        priority,
        due_date: dueDate || null,
        estimated_minutes: estimatedMinutes || null,
      });
      if (error) console.error("addTask failed:", error);
    },
    [workspace, userId],
  );

  const addSubTaskWithColor = useCallback(
    async (parentId: string, title: string, color?: string) => {
      if (!supabase || !workspace || !userId) return "";
      const parent = tasks.find((task) => task.id === parentId);
      if (!parent) return "";

      const groupId = parent.groupId || genId();
      const newId = genId();
      const nextColor = color ?? getNextBubbleColor(parent.color);

      if (!parent.groupId) {
        await supabase.from("tasks").update({ group_id: groupId }).eq("id", parentId);
      }

      await supabase.from("tasks").insert({
        id: newId,
        workspace_id: workspace.id,
        owner_id: userId,
        title,
        priority: parent.priority,
        group_id: groupId,
        color: nextColor,
      });

      return newId;
    },
    [workspace, userId, tasks],
  );

  const addSubTask = useCallback(
    async (parentId: string, title: string) => addSubTaskWithColor(parentId, title),
    [addSubTaskWithColor],
  );

  const duplicateTasks = useCallback(
    async (ids: string[]) => {
      if (!supabase || !workspace || !userId) return;

      const sourceTasks = ids.map((id) => tasks.find((task) => task.id === id)).filter(Boolean) as Task[];
      if (sourceTasks.length === 0) return;

      const groupIds = new Set(sourceTasks.map((task) => task.groupId).filter(Boolean));
      const sharedGroupId = groupIds.size === 1 ? [...groupIds][0] : undefined;
      const replacementGroupIds = new Map<string, string>();

      const rows = sourceTasks.map((task) => {
        let nextGroupId: string | null = null;

        if (sharedGroupId) {
          nextGroupId = replacementGroupIds.get(sharedGroupId) ?? genId();
          replacementGroupIds.set(sharedGroupId, nextGroupId);
        } else if (task.groupId) {
          const siblingCount = sourceTasks.filter((candidate) => candidate.groupId === task.groupId).length;
          if (siblingCount > 1) {
            nextGroupId = replacementGroupIds.get(task.groupId) ?? genId();
            replacementGroupIds.set(task.groupId, nextGroupId);
          }
        }

        return {
          id: genId(),
          workspace_id: workspace.id,
          owner_id: userId,
          title: task.title,
          priority: task.priority,
          memo: task.memo || null,
          estimated_minutes: task.estimatedMinutes || null,
          due_date: task.dueDate || null,
          completed: false,
          completed_at: null,
          group_id: nextGroupId,
          color: task.color || null,
        };
      });

      await supabase.from("tasks").insert(rows);
    },
    [workspace, userId, tasks],
  );

  const updateTask = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Task, "title" | "memo" | "priority" | "estimatedMinutes" | "dueDate" | "color">>,
    ) => {
      if (!supabase) return;
      const dbUpdates: Record<string, string | number | null> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.memo !== undefined) dbUpdates.memo = updates.memo || null;
      if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
      if (updates.estimatedMinutes !== undefined) dbUpdates.estimated_minutes = updates.estimatedMinutes || null;
      if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null;
      if (updates.color !== undefined) dbUpdates.color = updates.color || null;
      await supabase.from("tasks").update(dbUpdates).eq("id", id);
    },
    [],
  );

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

  const completeGroup = useCallback(
    async (groupId: string) => {
      if (!supabase) return;
      const groupTasks = tasks.filter((task) => task.groupId === groupId);

      for (const task of groupTasks) {
        await supabase
          .from("tasks")
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq("id", task.id);
      }
    },
    [tasks],
  );

  const groupTasks = useCallback(
    async (id1: string, id2: string) => {
      if (!supabase) return;
      const first = tasks.find((task) => task.id === id1);
      const second = tasks.find((task) => task.id === id2);
      if (!first || !second) return;

      const groupId = first.groupId || second.groupId || genId();
      const oldGroupId = second.groupId;

      await supabase.from("tasks").update({ group_id: groupId }).eq("id", id1);
      await supabase.from("tasks").update({ group_id: groupId }).eq("id", id2);

      if (oldGroupId && oldGroupId !== groupId) {
        await supabase.from("tasks").update({ group_id: groupId }).eq("group_id", oldGroupId);
      }
    },
    [tasks],
  );

  const ungroupTask = useCallback(async (id: string) => {
    if (!supabase) return;
    await supabase.from("tasks").update({ group_id: null }).eq("id", id);
  }, []);

  const getShareLink = useCallback(
    async (role: ShareRole, options?: { rotate?: boolean }) => {
      if (!supabase || !workspace) return "";

      const { data, error } = await supabase.rpc("ensure_workspace_share_link", {
        workspace_id_input: workspace.id,
        link_role_input: role,
        rotate_input: options?.rotate ?? false,
      });

      if (error) throw error;
      return `${window.location.origin}?share=${data as string}`;
    },
    [workspace],
  );

  const migrateLocalTasks = useCallback(
    async (localTasks: Task[]) => {
      if (!supabase || !workspace || !userId || localTasks.length === 0) return;

      const rows = localTasks.map((t) => ({
        id: genId(),
        workspace_id: workspace.id,
        owner_id: userId,
        title: t.title,
        priority: t.priority,
        memo: t.memo || null,
        estimated_minutes: t.estimatedMinutes || null,
        due_date: t.dueDate || null,
        completed: t.completed,
        completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
        group_id: t.groupId || null,
        color: t.color || null,
      }));

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) {
        console.error("Failed to migrate local tasks:", error);
      }
    },
    [workspace, userId],
  );

  return {
    workspace,
    tasks,
    loading,
    membershipRole,
    canEdit: isEditableRole(membershipRole),
    canShare: membershipRole === "owner",
    addTask,
    addSubTask,
    addSubTaskWithColor,
    duplicateTasks,
    updateTask,
    completeTask,
    reactivateTask,
    removeTask,
    completeGroup,
    groupTasks,
    ungroupTask,
    getShareLink,
    migrateLocalTasks,
  };
}

async function redeemShareLink(token: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("redeem_workspace_share_link", {
    token_input: token,
  });

  if (error) {
    console.error("Failed to redeem share link", error);
    return null;
  }

  return Array.isArray(data) && data.length > 0 ? (data[0].workspace_id as string) : null;
}

async function joinByInvite(inviteCode: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("join_workspace_by_invite", {
    invite_code_input: inviteCode,
  });

  if (error) {
    console.error("Failed to join workspace by invite", error);
    return null;
  }

  return (data as string) ?? null;
}
