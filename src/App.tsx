import { useCallback, useState, useEffect, useRef } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { useAuth } from "./lib/useAuth";
import { useWorkspace } from "./lib/useWorkspace";
import { useStore } from "./store/taskStore";
import BubbleCanvas from "./components/BubbleCanvas";
import SpotlightAdd from "./components/SpotlightAdd";
import SearchBar from "./components/SearchBar";
import AuthScreen from "./components/AuthScreen";
import ShareButton from "./components/ShareButton";
import type { Priority } from "./types/task";
import { BUBBLE_COLORS } from "./types/task";
import "./App.css";

function App() {
  const auth = useAuth();
  const online = useWorkspace(auth.user?.id ?? null);
  const local = useStore();
  const useOnline = isSupabaseConfigured && !!auth.user;

  const tasks = useOnline ? online.tasks : local.tasks;
  const addTask = useOnline ? online.addTask : local.addTask;
  const addSubTask = useOnline ? online.addSubTask : local.addSubTask;
  const updateTask = useOnline ? online.updateTask : local.updateTask;
  const completeTask = useOnline ? online.completeTask : local.completeTask;
  const reactivateTask = useOnline ? online.reactivateTask : local.reactivateTask;
  const removeTask = useOnline ? online.removeTask : local.removeTask;
  const completeGroup = useOnline ? online.completeGroup : local.completeGroup;
  const groupTasks = useOnline ? online.groupTasks : local.groupTasks;
  const ungroupTask = useOnline ? online.ungroupTask : local.ungroupTask;

  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const active = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const focusedTask = active.find((t) => t.id === focusedTaskId);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [selectedCompleted, setSelectedCompleted] = useState<string | null>(null);
  const lastCompletedClick = useRef<{ id: string; time: number } | null>(null);
  const [subBubbleInput, setSubBubbleInput] = useState("");
  const [showSubInput, setShowSubInput] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editMinutes, setEditMinutes] = useState("");

  useEffect(() => {
    if (focusedTask) {
      setEditTitle(focusedTask.title);
      setEditMemo(focusedTask.memo || "");
      setEditMinutes(focusedTask.estimatedMinutes?.toString() || "");
      setShowSubInput(false);
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

  const handleSelect = useCallback(
    (id: string) => { saveEdits(); setFocusedTaskId(id || null); },
    [saveEdits]
  );

  const handleAdd = useCallback(
    (title: string, priority: Priority, dueDate?: string, estimatedMinutes?: number) => {
      addTask(title, priority, dueDate, estimatedMinutes);
    },
    [addTask]
  );

  const handlePriorityChange = useCallback(
    (p: Priority) => { if (focusedTask) updateTask(focusedTask.id, { priority: p }); },
    [focusedTask, updateTask]
  );

  const handleColorChange = useCallback(
    (colorId: string) => { if (focusedTask) updateTask(focusedTask.id, { color: colorId }); },
    [focusedTask, updateTask]
  );

  const handleAddSubBubble = useCallback(() => {
    if (!focusedTask || !subBubbleInput.trim()) return;
    addSubTask(focusedTask.id, subBubbleInput.trim());
    setSubBubbleInput("");
    setShowSubInput(false);
  }, [focusedTask, subBubbleInput, addSubTask]);

  // Group tasks for focused bubble
  const focusedGroupTasks = focusedTask?.groupId
    ? active.filter((t) => t.groupId === focusedTask.groupId)
    : focusedTask ? [focusedTask] : [];

  const handleCopyGroup = useCallback(() => {
    const text = focusedGroupTasks.map((t) => {
      let line = `- ${t.title}`;
      if (t.estimatedMinutes) line += ` (${t.estimatedMinutes}분)`;
      if (t.memo) line += `\n  ${t.memo}`;
      return line;
    }).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [focusedGroupTasks]);

  // Global shortcut: N to open spotlight
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setSpotlightOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  if (isSupabaseConfigured && !auth.user && !auth.loading) {
    return <AuthScreen onGoogle={auth.signInWithGoogle} onGithub={auth.signInWithGithub} loading={auth.loading} />;
  }

  if ((isSupabaseConfigured && auth.loading) || (useOnline && online.loading)) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <div className="auth-logo">Popdo</div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  const isOwner = !useOnline || focusedTask?.ownerId === auth.user?.id;

  return (
    <div className="app">
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="logo">Popdo</span>
          <div className="stats">
            <div className="stat">
              <span className="stat-dot active" />
              <span>{active.length} 진행 중</span>
            </div>
            <div className="stat">
              <span className="stat-dot done" />
              <span>오늘 {todayCompleted.length}개 완료</span>
            </div>
          </div>
        </div>

        <div className="top-bar-right">
          <button className="add-trigger" onClick={() => setSpotlightOpen(true)}>
            + 새 버블 <kbd>N</kbd>
          </button>
          <SearchBar tasks={tasks} onSelect={handleSelect} onReactivate={reactivateTask} />
          {useOnline && <ShareButton getShareLink={online.getShareLink} />}
          <button
            className="timeline-toggle"
            onClick={() => setTimelineOpen(!timelineOpen)}
          >
            {timelineOpen ? "기록 접기" : `기록 (${completed.length})`}
          </button>
          {useOnline && (
            <button className="user-avatar" onClick={auth.signOut} title="로그아웃">
              {auth.profile?.avatar_url
                ? <img src={auth.profile.avatar_url} alt="" />
                : <span>{auth.profile?.display_name?.[0] || "?"}</span>
              }
            </button>
          )}
        </div>
      </div>

      {/* Timeline sidebar */}
      <div className={`timeline-sidebar ${timelineOpen ? "open" : ""}`}>
        <div className="timeline-header">
          <h3>완료 기록</h3>
          <p>총 {completed.length}개 · 오늘 {todayCompleted.length}개</p>
        </div>
        {completedGroups.length === 0 ? (
          <div className="timeline-empty">
            <div className="te-icon">✦</div>
            <p>버블을 터뜨려서 완료하세요</p>
          </div>
        ) : (
          <div className="timeline-list">
            {completedGroups.map((entry, ei) => {
              if (entry.type === "group") {
                return (
                  <div key={entry.groupId} className="timeline-group-block">
                    <div className="timeline-group-header">
                      <span className="timeline-group-icon">✦</span>
                      <span className="timeline-group-label">그룹 · {entry.tasks.length}개</span>
                      <span className="timeline-group-time">
                        {new Date(entry.latestAt).toLocaleString("ko-KR", {
                          month: "short", day: "numeric",
                        })}
                      </span>
                    </div>
                    {entry.tasks.map((task) => {
                      const isSelected = selectedCompleted === task.id;
                      const isOwnTask = !useOnline || task.ownerId === auth.user?.id;
                      return (
                        <div key={task.id}>
                          <div
                            className={`timeline-item grouped ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              const now = Date.now();
                              const last = lastCompletedClick.current;
                              if (last && last.id === task.id && now - last.time < 400 && isOwnTask) {
                                reactivateTask(task.id);
                                setSelectedCompleted(null);
                                lastCompletedClick.current = null;
                                return;
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
                                {task.completedAt
                                  ? new Date(task.completedAt).toLocaleString("ko-KR", {
                                      hour: "2-digit", minute: "2-digit",
                                    })
                                  : ""}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="timeline-detail">
                              {task.memo && <p className="td-memo">{task.memo}</p>}
                              {task.estimatedMinutes && <p className="td-est">예상 {task.estimatedMinutes}분</p>}
                              {isOwnTask && (
                                <button
                                  className="td-reactivate"
                                  onClick={(e) => { e.stopPropagation(); reactivateTask(task.id); setSelectedCompleted(null); }}
                                >
                                  ↩ 다시 활성화
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
              // Solo task
              const task = entry.task;
              const isSelected = selectedCompleted === task.id;
              const isOwnTask = !useOnline || task.ownerId === auth.user?.id;
              return (
                <div key={task.id}>
                  <div
                    className={`timeline-item ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      const now = Date.now();
                      const last = lastCompletedClick.current;
                      if (last && last.id === task.id && now - last.time < 400 && isOwnTask) {
                        reactivateTask(task.id);
                        setSelectedCompleted(null);
                        lastCompletedClick.current = null;
                        return;
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
                        {task.completedAt
                          ? new Date(task.completedAt).toLocaleString("ko-KR", {
                              month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })
                          : ""}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="timeline-detail">
                      {task.memo && <p className="td-memo">{task.memo}</p>}
                      {task.estimatedMinutes && <p className="td-est">예상 {task.estimatedMinutes}분</p>}
                      {isOwnTask && (
                        <button
                          className="td-reactivate"
                          onClick={(e) => { e.stopPropagation(); reactivateTask(task.id); setSelectedCompleted(null); }}
                        >
                          ↩ 다시 활성화
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

      {/* Canvas */}
      <div className={`canvas-area ${timelineOpen ? "with-timeline" : ""}`}>
        <BubbleCanvas
          tasks={active}
          focusedId={focusedTaskId}
          onSelect={handleSelect}
          onComplete={completeTask}
          onGroup={groupTasks}
          onUngroup={ungroupTask}
          onCompleteGroup={completeGroup}
          onEmptyClick={() => setSpotlightOpen(true)}
        />
      </div>

      {/* Edit Panel */}
      {focusedTask && (
        <div className="edit-panel">
          {/* Header with action icons */}
          <div className="edit-panel-header">
            <div className="edit-header-actions">
              {isOwner && (
                <>
                  <button
                    className="edit-icon-btn"
                    title="서브 버블 추가"
                    onClick={() => setShowSubInput(!showSubInput)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </button>
                  <button
                    className="edit-icon-btn complete"
                    title="완료하기"
                    onClick={() => { completeTask(focusedTask.id); setFocusedTaskId(null); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    className="edit-icon-btn danger"
                    title="삭제"
                    onClick={() => { removeTask(focusedTask.id); setFocusedTaskId(null); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <button className="edit-close" onClick={handleClosePanel}>✕</button>
          </div>

          {/* Sub-bubble add input */}
          {showSubInput && (
            <div className="sub-bubble-input-row">
              <input
                type="text"
                value={subBubbleInput}
                onChange={(e) => setSubBubbleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddSubBubble(); if (e.key === "Escape") setShowSubInput(false); }}
                placeholder="서브 버블 이름..."
                className="sub-bubble-input"
                autoFocus
              />
              <button className="sub-bubble-add-btn" onClick={handleAddSubBubble} disabled={!subBubbleInput.trim()}>
                추가
              </button>
            </div>
          )}

          <div className="edit-field">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveEdits}
              onKeyDown={(e) => e.key === "Enter" && saveEdits()}
              className="edit-title-input"
              placeholder="제목"
              disabled={!isOwner}
            />
          </div>

          <div className="edit-field">
            <label>크기 (중요도)</label>
            <div className="edit-priority">
              {([1, 2, 3, 4, 5] as Priority[]).map((p) => (
                <button
                  key={p}
                  className={`ep-btn p${p} ${focusedTask.priority === p ? "active" : ""}`}
                  onClick={() => handlePriorityChange(p)}
                  disabled={!isOwner}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="edit-field">
            <label>컬러</label>
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
                  disabled={!isOwner}
                />
              ))}
            </div>
          </div>

          <div className="edit-field">
            <label>예상 시간</label>
            <div className="edit-time-row">
              <input
                type="number"
                value={editMinutes}
                onChange={(e) => setEditMinutes(e.target.value)}
                onBlur={saveEdits}
                placeholder="—"
                min={1}
                className="edit-minutes"
                disabled={!isOwner}
              />
              <span>분</span>
            </div>
          </div>

          <div className="edit-field">
            <label>메모</label>
            <textarea
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              onBlur={saveEdits}
              placeholder="메모를 남겨보세요..."
              className="edit-memo"
              rows={3}
              disabled={!isOwner}
            />
          </div>

          {focusedTask.groupId && (
            <div className="edit-group-info">
              <span className="edit-group-badge">그룹에 속해있음</span>
              <button className="edit-ungroup" onClick={() => ungroupTask(focusedTask.id)}>
                분리하기
              </button>
            </div>
          )}

          {/* Group text view */}
          {focusedGroupTasks.length > 1 && (
            <div className="edit-field">
              <div className="edit-group-text-header">
                <label>그룹 내용</label>
                <button className="copy-icon-btn" onClick={handleCopyGroup} title="복사">
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
                {focusedGroupTasks.map((t) => (
                  <div
                    key={t.id}
                    className={`group-text-item ${t.id === focusedTask.id ? "current" : ""}`}
                    onClick={() => handleSelect(t.id)}
                  >
                    <span className="group-text-dot" />
                    <span className="group-text-title">{t.title}</span>
                    {t.estimatedMinutes && <span className="group-text-time">{t.estimatedMinutes}분</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isOwner && (
            <div className="edit-readonly-notice">다른 사람의 태스크는 수정할 수 없어요</div>
          )}

          <div className="edit-hint">더블클릭으로 바로 완료</div>
        </div>
      )}

      {/* Spotlight Add */}
      <SpotlightAdd
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onAdd={handleAdd}
      />

      {/* Empty state */}
      {active.length === 0 && completed.length === 0 && (
        <div className="empty-hint">
          <p>🫧</p>
          <p>N키를 눌러 첫 번째 버블을 만들어보세요</p>
        </div>
      )}
    </div>
  );
}

export default App;
