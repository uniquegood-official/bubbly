import { useCallback, useState, useEffect, useRef } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { useAuth } from "./lib/useAuth";
import { useWorkspace } from "./lib/useWorkspace";
import { useStore } from "./store/taskStore";
import BubbleCanvas from "./components/BubbleCanvas";
import SpotlightAdd from "./components/SpotlightAdd";
import SubTaskDialog from "./components/SubTaskDialog";
import SearchBar from "./components/SearchBar";
import ShareButton from "./components/ShareButton";
import type { Priority } from "./types/task";
import { BUBBLE_COLORS } from "./types/task";
import { useI18n, LOCALES } from "./lib/i18n";
import { useNavigate } from "react-router-dom";
import "./App.css";

function App() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const auth = useAuth();
  const online = useWorkspace(auth.user?.id ?? null);
  const local = useStore();
  const useOnline = isSupabaseConfigured && !!auth.user;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false,
  );

  const tasks = useOnline ? online.tasks : local.tasks;
  const addTask = useOnline ? online.addTask : local.addTask;
  const addSubTask = useOnline ? online.addSubTask : local.addSubTask;
  const addSubTaskWithColor = useOnline ? online.addSubTaskWithColor : local.addSubTaskWithColor;
  const updateTask = useOnline ? online.updateTask : local.updateTask;
  const completeTask = useOnline ? online.completeTask : local.completeTask;
  const reactivateTask = useOnline ? online.reactivateTask : local.reactivateTask;
  const removeTask = useOnline ? online.removeTask : local.removeTask;
  const completeGroup = useOnline ? online.completeGroup : local.completeGroup;
  const groupTasks = useOnline ? online.groupTasks : local.groupTasks;
  const ungroupTask = useOnline ? online.ungroupTask : local.ungroupTask;
  const duplicateTasks = useOnline ? online.duplicateTasks : local.duplicateTasks;
  const canEdit = !useOnline || online.canEdit;
  const canShare = !useOnline || online.canShare;

  // Categories (local store only for now)
  const categories = local.categories;
  const addCategory = local.addCategory;
  // removeCategory / renameCategory available via local store when needed
  const selectedCategoryId = local.selectedCategoryId;
  const setSelectedCategory = local.setSelectedCategory;

  // Migrate local tasks to Supabase on login
  const [migrated, setMigrated] = useState(false);
  useEffect(() => {
    if (!useOnline || !online.workspace || online.loading || migrated) return;
    const localTasks = local.tasks;
    if (localTasks.length === 0) { setMigrated(true); return; }

    void online.migrateLocalTasks(localTasks).then(() => {
      // Clear local store after successful migration
      for (const t of localTasks) local.removeTask(t.id);
      setMigrated(true);
    });
  }, [useOnline, online.workspace, online.loading, migrated]);

  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const allActive = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  // Filter active tasks by selected category
  const active = (() => {
    if (!selectedCategoryId) return allActive; // "전체"
    const today = new Date().toDateString();
    if (selectedCategoryId === "today") {
      return allActive.filter((t) => {
        if (t.dueDate && new Date(t.dueDate).toDateString() === today) return true;
        return new Date(t.createdAt).toDateString() === today;
      });
    }
    if (selectedCategoryId === "upcoming") {
      return allActive.filter((t) => t.dueDate && new Date(t.dueDate).getTime() > Date.now());
    }
    return allActive.filter((t) => t.categoryId === selectedCategoryId);
  })();

  const focusedTask = allActive.find((t) => t.id === focusedTaskId);
  const [timelineOpen, setTimelineOpen] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 768px)").matches : true,
  );
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedCompleted, setSelectedCompleted] = useState<string | null>(null);
  const lastCompletedClick = useRef<{ id: string; time: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editMinutes, setEditMinutes] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const syncLayout = (matches: boolean) => {
      setIsMobile(matches);
      setTimelineOpen(!matches);
    };

    syncLayout(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncLayout(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (focusedTask) {
      setEditTitle(focusedTask.title);
      setEditMemo(focusedTask.memo || "");
      setEditMinutes(focusedTask.estimatedMinutes?.toString() || "");
      setCopied(false);
    }
  }, [focusedTaskId]);

  const saveEdits = useCallback(() => {
    if (!focusedTask) return;
    const updates: Parameters<typeof updateTask>[1] = {};
    if (editTitle.trim() && editTitle.trim() !== focusedTask.title) updates.title = editTitle.trim();
    if (editMemo !== (focusedTask.memo || "")) updates.memo = editMemo || undefined;
    const mins = editMinutes ? parseInt(editMinutes) : undefined;
    if (mins !== focusedTask.estimatedMinutes) updates.estimatedMinutes = mins;
    if (Object.keys(updates).length > 0) updateTask(focusedTask.id, updates);
  }, [focusedTask, editTitle, editMemo, editMinutes, updateTask]);

  const handleClosePanel = useCallback(() => {
    saveEdits();
    setFocusedTaskId(null);
  }, [saveEdits]);

  const todayCompleted = completed.filter((t) => {
    if (!t.completedAt) return false;
    return new Date(t.completedAt).toDateString() === new Date().toDateString();
  });

  const handleLocalShare = useCallback(async () => {
    const text = allActive.map((task) => {
      let line = `- ${task.title}`;
      if (task.estimatedMinutes) line += ` (${task.estimatedMinutes}${t("min")})`;
      if (task.memo) line += `\n  ${task.memo}`;
      return line;
    }).join("\n") || t("empty.noBubbles");

    if (isMobile && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Bubbly — ${t("sidebar.title")}`,
          text,
        });
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [allActive, isMobile]);

  const handleSelect = useCallback(
    (id: string) => {
      saveEdits();
      setFocusedTaskId(id || null);
      if (isMobile && id) setTimelineOpen(false);
    },
    [isMobile, saveEdits]
  );

  const handleAdd = useCallback(
    (title: string, priority: Priority, dueDate?: string, estimatedMinutes?: number) => {
      if (!canEdit) return;
      addTask(title, priority, dueDate, estimatedMinutes);
    },
    [addTask, canEdit]
  );

  const handlePriorityChange = useCallback(
    (p: Priority) => { if (focusedTask) updateTask(focusedTask.id, { priority: p }); },
    [focusedTask, updateTask]
  );

  const handleColorChange = useCallback(
    (colorId: string) => { if (focusedTask) updateTask(focusedTask.id, { color: colorId }); },
    [focusedTask, updateTask]
  );

  const handleAddSubTask = useCallback((title: string, color: string) => {
    if (!focusedTask || !canEdit) return;
    addSubTaskWithColor(focusedTask.id, title, color);
    setSubDialogOpen(false);
  }, [addSubTaskWithColor, canEdit, focusedTask]);

  // Canvas floating action: open sub-dialog for a specific bubble
  const handleCanvasAddSub = useCallback((id: string) => {
    if (!canEdit) return;
    setFocusedTaskId(id);
    if (isMobile) setTimelineOpen(false);
    setSubDialogOpen(true);
  }, [canEdit, isMobile]);

  // Canvas floating action: AI generate for a specific bubble
  const handleCanvasAiGenerate = useCallback(async (id: string) => {
    if (!canEdit) return;
    const task = allActive.find((t) => t.id === id);
    if (!task || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/generate-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, context: task.memo }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (data.subtasks && Array.isArray(data.subtasks)) {
        for (const sub of data.subtasks) {
          addSubTask(id, sub.title);
        }
      }
    } catch (err) {
      console.error("AI subtask generation failed:", err);
    } finally {
      setAiLoading(false);
    }
  }, [allActive, aiLoading, addSubTask, canEdit]);

  const handleAiGenerate = useCallback(async () => {
    if (!focusedTask || aiLoading || !canEdit) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/generate-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: focusedTask.title, context: focusedTask.memo }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (data.subtasks && Array.isArray(data.subtasks)) {
        for (const sub of data.subtasks) {
          addSubTask(focusedTask.id, sub.title);
        }
      }
    } catch (err) {
      console.error("AI subtask generation failed:", err);
    } finally {
      setAiLoading(false);
    }
  }, [focusedTask, aiLoading, addSubTask, canEdit]);

  // Group tasks for focused bubble
  const focusedGroupTasks = focusedTask?.groupId
    ? active.filter((t) => t.groupId === focusedTask.groupId)
    : focusedTask ? [focusedTask] : [];

  const handleCopyGroup = useCallback(() => {
    const text = focusedGroupTasks.map((task) => {
      let line = `- ${task.title}`;
      if (task.estimatedMinutes) line += ` (${task.estimatedMinutes}${t("min")})`;
      if (task.memo) line += `\n  ${task.memo}`;
      return line;
    }).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [focusedGroupTasks]);

  // Multi-select handlers for BubbleCanvas
  const handleDeleteMultiple = useCallback((ids: string[]) => {
    if (!canEdit) return;
    ids.forEach((id) => removeTask(id));
  }, [canEdit, removeTask]);

  const handleCompleteMultiple = useCallback((ids: string[]) => {
    if (!canEdit) return;
    ids.forEach((id) => completeTask(id));
  }, [canEdit, completeTask]);

  const handleGroupMultiple = useCallback((ids: string[]) => {
    if (!canEdit) return;
    if (ids.length < 2) return;
    for (let i = 1; i < ids.length; i++) {
      groupTasks(ids[0], ids[i]);
    }
  }, [canEdit, groupTasks]);

  const handleDuplicateMultiple = useCallback((ids: string[]) => {
    if (!canEdit) return;
    duplicateTasks(ids);
  }, [canEdit, duplicateTasks]);

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo/Redo (Cmd+Z / Cmd+Shift+Z)
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) { local.redo(); } else { local.undo(); }
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === "Backspace" || e.key === "Delete") && focusedTaskId && canEdit) {
        e.preventDefault();
        setDeleteConfirmId(focusedTaskId);
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setSpotlightOpen(true);
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (focusedTaskId) {
          setSubDialogOpen(true);
        } else {
          setSpotlightOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedTaskId, local]);

  // Timer auto-pop: check every second if any task's timerEnd has passed
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const task of tasks) {
        if (task.timerEnd && !task.completed && task.timerEnd <= now) {
          completeTask(task.id);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [tasks, completeTask]);

  // Group completed tasks: grouped tasks together, solo tasks standalone
  // Sort groups by latest completedAt within group
  const completedGroups = (() => {
    const groupMap: Record<string, typeof completed> = {};
    const solo: typeof completed = [];
    for (const t of completed) {
      if (t.groupId) {
        if (!groupMap[t.groupId]) groupMap[t.groupId] = [];
        groupMap[t.groupId].push(t);
      } else {
        solo.push(t);
      }
    }
    // Sort tasks within each group by completedAt
    for (const gid of Object.keys(groupMap)) {
      groupMap[gid].sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    }
    // Build entries: { type: 'group', groupId, tasks, latestAt } | { type: 'solo', task, latestAt }
    type Entry =
      | { type: "group"; groupId: string; tasks: typeof completed; latestAt: number }
      | { type: "solo"; task: (typeof completed)[0]; latestAt: number };
    const entries: Entry[] = [];
    for (const gid of Object.keys(groupMap)) {
      const tasks = groupMap[gid];
      const latestAt = Math.max(...tasks.map((t) => t.completedAt ?? 0));
      entries.push({ type: "group", groupId: gid, tasks, latestAt });
    }
    for (const t of solo) {
      entries.push({ type: "solo", task: t, latestAt: t.completedAt ?? 0 });
    }
    entries.sort((a, b) => b.latestAt - a.latestAt);
    return entries;
  })();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [loginBannerDismissed, setLoginBannerDismissed] = useState(false);
  const showLoginBanner = isSupabaseConfigured && !auth.user && !auth.loading && !loginBannerDismissed;

  if ((isSupabaseConfigured && auth.loading) || (useOnline && online.loading)) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <div className="auth-logo">Bubbly</div>
          <p>{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Login banner */}
      {showLoginBanner && (
        <div className="login-banner">
          <span>{t("banner.login")}</span>
          <div className="login-banner-actions">
            <button className="login-banner-btn" onClick={auth.signInWithGoogle}>{t("banner.loginBtn")}</button>
            <button className="login-banner-dismiss" onClick={() => setLoginBannerDismissed(true)}>&times;</button>
          </div>
        </div>
      )}
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="logo">Bubbly</span>
          <div className="undo-redo">
            <button className="ur-btn" onClick={local.undo} disabled={!local.canUndo()} title={t("undo.undo")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            <button className="ur-btn" onClick={local.redo} disabled={!local.canRedo()} title={t("undo.redo")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
              </svg>
            </button>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="stat-dot active" />
              <span>{active.length} {t("topbar.inProgress")}</span>
            </div>
            <div className="stat">
              <span className="stat-dot done" />
              <span>{t("topbar.todayCompleted", { n: todayCompleted.length })}</span>
            </div>
          </div>
        </div>

        <div className="top-bar-right">
          {!isMobile && (
            <>
              <button className="add-trigger" onClick={() => setSpotlightOpen(true)} disabled={!canEdit}>
                {t("topbar.newBubble")} <kbd>N</kbd>
              </button>
              <SearchBar tasks={tasks} onSelect={handleSelect} onReactivate={reactivateTask} />
            </>
          )}
          {useOnline ? (
            !isMobile && canShare ? <ShareButton getShareLink={online.getShareLink} /> : null
          ) : !isMobile ? (
            <button
              className="share-btn"
              title={t("edit.copy")}
              onClick={() => void handleLocalShare()}
            >
              {shareCopied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              )}
            </button>
          ) : null}
          {useOnline ? (
            <div className="settings-wrapper">
              <button className="user-avatar" onClick={() => setSettingsOpen(!settingsOpen)}>
                {auth.profile?.avatar_url
                  ? <img src={auth.profile.avatar_url} alt="" />
                  : <span>{auth.profile?.display_name?.[0] || "?"}</span>
                }
              </button>
              {settingsOpen && (
                <>
                  <div className="settings-backdrop" onClick={() => setSettingsOpen(false)} />
                  <div className="settings-dropdown">
                    {auth.profile?.display_name && (
                      <div className="settings-user">
                        {auth.profile.avatar_url && <img src={auth.profile.avatar_url} alt="" className="settings-avatar" />}
                        <span>{auth.profile.display_name}</span>
                      </div>
                    )}
                    <div className="settings-section">
                      <label className="settings-label">{t("settings.language")}</label>
                      <div className="settings-locale-grid">
                        {LOCALES.map((l) => (
                          <button
                            key={l.code}
                            className={`settings-locale-btn ${locale === l.code ? "active" : ""}`}
                            onClick={() => setLocale(l.code)}
                          >
                            <span className="sl-flag">{l.flag}</span>
                            <span className="sl-label">{l.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="settings-logout" onClick={() => { auth.signOut(); setSettingsOpen(false); navigate("/"); }}>
                      {t("topbar.logout")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <select
                className="locale-select"
                value={locale}
                onChange={(e) => setLocale(e.target.value as any)}
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                ))}
              </select>
              {isSupabaseConfigured && !auth.user ? (
                <button className="login-topbar-btn" onClick={auth.signInWithGoogle} title={t("topbar.login")}>
                  {t("topbar.login")}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Sidebar toggle (floating left) */}
      {!timelineOpen && !isMobile && (
        <button
          className="sidebar-open-btn"
          onClick={() => setTimelineOpen(true)}
          title={t("sidebar.title")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      )}

      {/* Sidebar */}
      {isMobile && timelineOpen && <div className="edit-panel-overlay" onClick={() => setTimelineOpen(false)} />}
      <div className={`timeline-sidebar ${timelineOpen ? "open" : ""}`}>
        {isMobile && <div className="mobile-sheet-handle" />}
        <div className="sidebar-top">
          <div className="timeline-header">
            <h3>{t("sidebar.title")}</h3>
            <div className="timeline-header-actions">
              <button className="sidebar-add-btn" onClick={() => setSpotlightOpen(true)} disabled={!canEdit} title={t("topbar.newBubble")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button className="sidebar-fold-btn" onClick={() => setTimelineOpen(false)} title={t("sidebar.close")}>
                {isMobile ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Category nav */}
          <div className="sidebar-nav">
            <div
              className={`sidebar-nav-item ${!selectedCategoryId ? "active" : ""}`}
              onClick={() => setSelectedCategory(null)}
            >
              <span className="sidebar-nav-icon">●</span>
              <span>{t("sidebar.all")}</span>
              <span className="sidebar-nav-count">{allActive.length}</span>
            </div>
            <div
              className={`sidebar-nav-item ${selectedCategoryId === "today" ? "active" : ""}`}
              onClick={() => setSelectedCategory("today")}
            >
              <span className="sidebar-nav-icon">◐</span>
              <span>{t("sidebar.today")}</span>
              <span className="sidebar-nav-count">
                {allActive.filter((t) => {
                  const today = new Date().toDateString();
                  if (t.dueDate && new Date(t.dueDate).toDateString() === today) return true;
                  return new Date(t.createdAt).toDateString() === today;
                }).length}
              </span>
            </div>
            <div
              className={`sidebar-nav-item ${selectedCategoryId === "upcoming" ? "active" : ""}`}
              onClick={() => setSelectedCategory("upcoming")}
            >
              <span className="sidebar-nav-icon">▸</span>
              <span>{t("sidebar.upcoming")}</span>
              <span className="sidebar-nav-count">
                {allActive.filter((t) => t.dueDate && new Date(t.dueDate).getTime() > Date.now()).length}
              </span>
            </div>

            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`sidebar-nav-item ${selectedCategoryId === cat.id ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className="sidebar-nav-icon">{cat.icon || "◆"}</span>
                <span>{cat.name}</span>
                <span className="sidebar-nav-count">
                  {allActive.filter((t) => t.categoryId === cat.id).length}
                </span>
              </div>
            ))}

            {showCategoryInput ? (
              <div className="sidebar-nav-item input">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCategoryName.trim()) {
                      addCategory(newCategoryName.trim());
                      setNewCategoryName("");
                      setShowCategoryInput(false);
                    }
                    if (e.key === "Escape") setShowCategoryInput(false);
                  }}
                  placeholder={t("sidebar.addCategoryPlaceholder")}
                  autoFocus
                  className="category-input"
                />
              </div>
            ) : (
              <div className="sidebar-nav-item add" onClick={() => setShowCategoryInput(true)}>
                <span className="sidebar-nav-icon">+</span>
                <span>{t("sidebar.addCategoryBtn")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Active tasks by priority */}
        <div className="sidebar-section">
          <div className="sidebar-section-label">
            {selectedCategoryId === "today" ? t("sidebar.today") : selectedCategoryId === "upcoming" ? t("sidebar.upcoming") : selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId)?.name || t("sidebar.all") : t("sidebar.all")} · {active.length}
          </div>
          {active.length > 0 ? (
            <div className="sidebar-task-list">
              {[...active].sort((a, b) => b.priority - a.priority).map((task) => (
                <div
                  key={task.id}
                  className={`sidebar-task-item ${focusedTaskId === task.id ? "active" : ""}`}
                  onClick={() => handleSelect(task.id)}
                >
                  <span className={`sidebar-priority-dot p${task.priority}`} />
                  <span className="sidebar-task-title">{task.title}</span>
                  {task.estimatedMinutes && <span className="sidebar-task-time">{task.estimatedMinutes}{t("min")}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="timeline-empty" style={{ padding: "20px" }}>
              <p>{t("empty.noBubbles")}</p>
            </div>
          )}
        </div>

        {/* Completed history */}
        <div className="sidebar-section completed-section">
          <div className="sidebar-section-label">{t("sidebar.completed")} · {completed.length}</div>
          {completedGroups.length === 0 ? (
            <div className="timeline-empty">
              <div className="te-icon">✦</div>
              <p>{t("empty.popToComplete")}</p>
            </div>
          ) : (
            <div className="timeline-list">
              {completedGroups.map((entry, ei) => {
                if (entry.type === "group") {
                  return (
                    <div key={entry.groupId} className="timeline-group-block">
                      <div className="timeline-group-header">
                        <span className="timeline-group-icon">✦</span>
                        <span className="timeline-group-label">{t("sidebar.groupLabel", { n: entry.tasks.length })}</span>
                        <span className="timeline-group-time">
                          {new Date(entry.latestAt).toLocaleString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      {entry.tasks.map((task) => {
                        const isSelected = selectedCompleted === task.id;
                        const isOwnTask = canEdit;
                        return (
                          <div key={task.id}>
                            <div
                              className={`timeline-item grouped ${isSelected ? "selected" : ""}`}
                              onClick={() => {
                                const now = Date.now();
                                const last = lastCompletedClick.current;
                                if (last && last.id === task.id && now - last.time < 400 && isOwnTask) {
                                  reactivateTask(task.id); setSelectedCompleted(null); lastCompletedClick.current = null; return;
                                }
                                lastCompletedClick.current = { id: task.id, time: now };
                                setSelectedCompleted(isSelected ? null : task.id);
                              }}
                            >
                              <div className="timeline-line">
                                <div className="timeline-dot small" />
                                <div className="timeline-connector" />
                              </div>
                              <div className="timeline-content">
                                <div className="timeline-title">{task.title}</div>
                                <div className="timeline-time">
                                  {task.completedAt ? new Date(task.completedAt).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="timeline-detail">
                                {task.memo && <p className="td-memo">{task.memo}</p>}
                                {task.estimatedMinutes && <p className="td-est">{t("sidebar.estimated", { n: task.estimatedMinutes })}</p>}
                                {isOwnTask && (
                                  <button className="td-reactivate" onClick={(e) => { e.stopPropagation(); reactivateTask(task.id); setSelectedCompleted(null); }}>
                                    {t("sidebar.reactivate")}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                const task = entry.task;
                const isSelected = selectedCompleted === task.id;
                const isOwnTask = canEdit;
                return (
                  <div key={task.id}>
                    <div
                      className={`timeline-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        const now = Date.now();
                        const last = lastCompletedClick.current;
                        if (last && last.id === task.id && now - last.time < 400 && isOwnTask) {
                          reactivateTask(task.id); setSelectedCompleted(null); lastCompletedClick.current = null; return;
                        }
                        lastCompletedClick.current = { id: task.id, time: now };
                        setSelectedCompleted(isSelected ? null : task.id);
                      }}
                    >
                      <div className="timeline-line">
                        <div className="timeline-dot" />
                        {ei < completedGroups.length - 1 && <div className="timeline-connector" />}
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-title">{task.title}</div>
                        <div className="timeline-time">
                          {task.completedAt ? new Date(task.completedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="timeline-detail">
                        {task.memo && <p className="td-memo">{task.memo}</p>}
                        {task.estimatedMinutes && <p className="td-est">{t("sidebar.estimated", { n: task.estimatedMinutes })}</p>}
                        {isOwnTask && (
                          <button className="td-reactivate" onClick={(e) => { e.stopPropagation(); reactivateTask(task.id); setSelectedCompleted(null); }}>
                            {t("sidebar.reactivate")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className={`canvas-area ${timelineOpen ? "with-timeline" : ""}`}>
        <BubbleCanvas
          tasks={active}
          allTasks={allActive}
          focusedId={focusedTaskId}
          canEdit={canEdit}
          onSelect={handleSelect}
          onComplete={completeTask}
          onGroup={groupTasks}
          onUngroup={ungroupTask}
          onCompleteGroup={completeGroup}
          onEmptyClick={() => setSpotlightOpen(true)}
          onAddSub={handleCanvasAddSub}
          onAiGenerate={handleCanvasAiGenerate}
          onDelete={(id) => { removeTask(id); setFocusedTaskId(null); }}
          onDeleteMultiple={handleDeleteMultiple}
          onCompleteMultiple={handleCompleteMultiple}
          onGroupMultiple={handleGroupMultiple}
          onDuplicateMultiple={handleDuplicateMultiple}
        />
      </div>

      {/* Edit Panel */}
      {focusedTask && (
        <>
        {isMobile && <div className="edit-panel-overlay" onClick={handleClosePanel} />}
        <div className="edit-panel">
          {isMobile && <div className="mobile-sheet-handle" />}
          {/* Header with action icons */}
          <div className="edit-panel-header">
            <div className="edit-header-actions">
              {canEdit && (
                <>
                  <button
                    className="edit-icon-btn"
                    title={t("edit.addSub")}
                    onClick={() => setSubDialogOpen(true)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </button>
                  <button
                    className={`edit-icon-btn ai ${aiLoading ? "loading" : ""}`}
                    title={t("edit.aiSub")}
                    onClick={handleAiGenerate}
                    disabled={aiLoading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="1" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2"/>
                      <text x="9" y="15.5" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="bold" fontFamily="system-ui">AI</text>
                      <path d="M18 2l.6 1.4L20 4l-1.4.6L18 6l-.6-1.4L16 4l1.4-.6L18 2z" fill="currentColor"/>
                      <path d="M22 7l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4.4-.9z" fill="currentColor" opacity="0.5"/>
                    </svg>
                  </button>
                  <button
                    className="edit-icon-btn complete"
                    title={t("edit.complete")}
                    onClick={() => { completeTask(focusedTask.id); setFocusedTaskId(null); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    className="edit-icon-btn danger"
                    title={t("edit.delete")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { const id = focusedTask.id; removeTask(id); setFocusedTaskId(null); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                  {focusedTask.groupId && focusedGroupTasks.length > 1 && (
                    <button
                      className="edit-icon-btn"
                      title={t("edit.duplicateGroup")}
                      onClick={() => duplicateTasks(focusedGroupTasks.map((t) => t.id))}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
            <button className="edit-close" onClick={handleClosePanel}>✕</button>
          </div>

          <div className="edit-field">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveEdits}
              onKeyDown={(e) => e.key === "Enter" && saveEdits()}
              className="edit-title-input"
              placeholder={t("edit.title")}
              disabled={!canEdit}
            />
          </div>

          <div className="edit-field">
            <label>{t("edit.size")}</label>
            <div className="edit-priority">
              {([1, 2, 3, 4, 5] as Priority[]).map((p) => (
                <button
                  key={p}
                  className={`ep-btn p${p} ${focusedTask.priority === p ? "active" : ""}`}
                  onClick={() => handlePriorityChange(p)}
                  disabled={!canEdit}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="edit-field">
            <label>{t("edit.color")}</label>
            <div className="edit-colors">
              {BUBBLE_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={`color-dot ${(focusedTask.color || "default") === c.id ? "active" : ""}`}
                  style={{
                    background: c.id === "default"
                      ? "linear-gradient(135deg, #d0dce5, #b8a4f0, #f0a090)"
                      : c.light,
                    borderColor: (focusedTask.color || "default") === c.id
                      ? (c.dark || "var(--primary)")
                      : "transparent",
                  }}
                  title={c.label}
                  onClick={() => handleColorChange(c.id)}
                  disabled={!canEdit}
                />
              ))}
            </div>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div className="edit-field">
              <label>{t("edit.category")}</label>
              <div className="edit-category-pills">
                <button
                  className={`cat-pill ${!focusedTask.categoryId ? "active" : ""}`}
                  onClick={() => canEdit && updateTask(focusedTask.id, { categoryId: undefined })}
                >
                  {t("edit.none")}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    className={`cat-pill ${focusedTask.categoryId === cat.id ? "active" : ""}`}
                    onClick={() => canEdit && updateTask(focusedTask.id, { categoryId: cat.id })}
                  >
                    {cat.icon || "◆"} {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="edit-field">
            <label>{t("edit.time")}</label>
            <div className="edit-due-presets">
              {[
                { label: t("edit.dueToday"), getValue: () => { const d = new Date(); d.setHours(23, 59, 59); return d.toISOString(); } },
                { label: t("edit.dueTomorrow"), getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59); return d.toISOString(); } },
                { label: t("edit.dueNextWeek"), getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 59); return d.toISOString(); } },
              ].map((p) => (
                <button
                  key={p.label}
                  className={`due-preset-btn ${focusedTask.dueDate && new Date(focusedTask.dueDate).toDateString() === new Date(p.getValue()).toDateString() ? "active" : ""}`}
                  disabled={!canEdit}
                  onClick={() => {
                    if (!focusedTask) return;
                    updateTask(focusedTask.id, { dueDate: p.getValue() });
                  }}
                >
                  {p.label}
                </button>
              ))}
              <input
                type="date"
                className="due-date-input"
                value={focusedTask.dueDate ? new Date(focusedTask.dueDate).toISOString().slice(0, 10) : ""}
                onChange={(e) => {
                  if (!focusedTask || !canEdit) return;
                  const val = e.target.value;
                  updateTask(focusedTask.id, { dueDate: val ? new Date(val + "T23:59:59").toISOString() : undefined });
                }}
                disabled={!canEdit}
              />
              {focusedTask.dueDate && canEdit && (
                <button className="due-clear-btn" onClick={() => updateTask(focusedTask.id, { dueDate: undefined })}>✕</button>
              )}
            </div>
            <div className="edit-time-row">
              <input
                type="number"
                value={editMinutes}
                onChange={(e) => setEditMinutes(e.target.value)}
                onBlur={saveEdits}
                placeholder="—"
                min={1}
                className="edit-minutes"
                disabled={!canEdit}
              />
              <span>{t("min")}</span>
            </div>
            <div className="edit-timer-presets">
              {[
                { label: `5${t("min")}`, mins: 5 },
                { label: `15${t("min")}`, mins: 15 },
                { label: `30${t("min")}`, mins: 30 },
                { label: `1h`, mins: 60 },
              ].map((p) => (
                <button
                  key={p.mins}
                  className="timer-preset-btn"
                  disabled={!canEdit}
                  onClick={() => {
                    if (!focusedTask) return;
                    updateTask(focusedTask.id, { estimatedMinutes: p.mins });
                    setEditMinutes(String(p.mins));
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {focusedTask && canEdit && (
              <button
                className={`timer-start-btn ${focusedTask.timerEnd ? "active" : ""}`}
                onClick={() => {
                  if (focusedTask.timerEnd) {
                    updateTask(focusedTask.id, { timerEnd: undefined } as any);
                  } else {
                    const mins = parseInt(editMinutes) || 25;
                    const timerEnd = Date.now() + mins * 60 * 1000;
                    updateTask(focusedTask.id, { timerEnd } as any);
                  }
                }}
              >
                {focusedTask.timerEnd ? `⏹ ${t("edit.timerStop")}` : `⏱ ${t("edit.timerStart")}`}
              </button>
            )}
          </div>

          <div className="edit-field">
            <label>{t("edit.memo")}</label>
            <textarea
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              onBlur={saveEdits}
              placeholder={t("edit.memoPlaceholder")}
              className="edit-memo"
              rows={3}
              disabled={!canEdit}
            />
          </div>

          {focusedTask.groupId && (
            <div className="edit-group-info">
              <span className="edit-group-badge">{t("edit.groupBadge")}</span>
              <button className="edit-ungroup" onClick={() => canEdit && ungroupTask(focusedTask.id)} disabled={!canEdit}>
                {t("edit.ungroupBtn")}
              </button>
            </div>
          )}

          {/* Group text view */}
          {focusedGroupTasks.length > 1 && (
            <div className="edit-field">
              <div className="edit-group-text-header">
                <label>{t("edit.groupContent")}</label>
                <button className="copy-icon-btn" onClick={handleCopyGroup} title={t("edit.copy")}>
                  {copied ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="edit-group-text-list">
                {focusedGroupTasks.map((gt) => (
                  <div
                    key={gt.id}
                    className={`group-text-item ${gt.id === focusedTask.id ? "current" : ""}`}
                    onClick={() => handleSelect(gt.id)}
                  >
                    <span className="group-text-dot" />
                    <span className="group-text-title">{gt.title}</span>
                    {gt.estimatedMinutes && <span className="group-text-time">{gt.estimatedMinutes}{t("min")}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!canEdit && (
            <div className="edit-readonly-notice">{t("edit.readOnly")}</div>
          )}

          <div className="edit-hint">{t("edit.hintComplete")}</div>
        </div>
        </>
      )}

      {isMobile && (
        <div className="mobile-dock">
          <button
            className={`mobile-dock-btn ${timelineOpen ? "active" : ""}`}
            onClick={() => {
              setSpotlightOpen(false);
              setTimelineOpen((prev) => !prev);
            }}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
            <span>{t("mobile.list")}</span>
          </button>

          <SearchBar tasks={tasks} onSelect={handleSelect} onReactivate={reactivateTask} compact />

          <button
            className="mobile-dock-btn primary"
            onClick={() => {
              if (!canEdit) return;
              setTimelineOpen(false);
              setSpotlightOpen(true);
            }}
            disabled={!canEdit}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t("mobile.add")}</span>
          </button>

          {useOnline ? (
            canShare ? <ShareButton getShareLink={online.getShareLink} withLabel /> : null
          ) : (
            <button className="mobile-dock-btn" onClick={() => void handleLocalShare()} type="button">
              {shareCopied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              )}
              <span>{t("mobile.share")}</span>
            </button>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>{t("delete.confirm")}</p>
            <div className="delete-confirm-actions">
              <button className="gc-btn yes danger" onClick={() => { removeTask(deleteConfirmId); setDeleteConfirmId(null); setFocusedTaskId(null); }}>
                {t("delete.yes")}
              </button>
              <button className="gc-btn no" onClick={() => setDeleteConfirmId(null)}>
                {t("delete.no")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotlight Add */}
      <SpotlightAdd
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onAdd={handleAdd}
      />

      {/* Sub-task dialog */}
      {focusedTask && (
        <SubTaskDialog
          open={subDialogOpen}
          parentTask={focusedTask}
          onClose={() => setSubDialogOpen(false)}
          onAdd={handleAddSubTask}
        />
      )}

      {/* Empty state */}
      {active.length === 0 && completed.length === 0 && (
        <div className="empty-hint">
          <p>🫧</p>
          <p>{isMobile ? t("empty.hintMobile") : t("empty.hint")}</p>
        </div>
      )}
    </div>
  );
}

export default App;
