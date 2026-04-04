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
import "./App.css";

function App() {
  // Auth (only when Supabase is configured)
  const auth = useAuth();
  const online = useWorkspace(auth.user?.id ?? null);

  // Local store (fallback when no Supabase)
  const local = useStore();

  // Use online if Supabase is configured and user is logged in
  const useOnline = isSupabaseConfigured && !!auth.user;

  const tasks = useOnline ? online.tasks : local.tasks;
  const addTask = useOnline ? online.addTask : local.addTask;
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

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editMinutes, setEditMinutes] = useState("");

  useEffect(() => {
    if (focusedTask) {
      setEditTitle(focusedTask.title);
      setEditMemo(focusedTask.memo || "");
      setEditMinutes(focusedTask.estimatedMinutes?.toString() || "");
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

  const sortedCompleted = [...completed].sort(
    (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
  );

  // Show auth screen if Supabase is configured but not logged in
  if (isSupabaseConfigured && !auth.user && !auth.loading) {
    return <AuthScreen onGoogle={auth.signInWithGoogle} onGithub={auth.signInWithGithub} loading={auth.loading} />;
  }

  // Loading state
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
        {sortedCompleted.length === 0 ? (
          <div className="timeline-empty">
            <div className="te-icon">✦</div>
            <p>버블을 터뜨려서 완료하세요</p>
          </div>
        ) : (
          <div className="timeline-list">
            {sortedCompleted.map((task, i) => {
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
                      {i < sortedCompleted.length - 1 && <div className="timeline-connector" />}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-title">{task.title}</div>
                      <div className="timeline-time">
                        {task.completedAt
                          ? new Date(task.completedAt).toLocaleString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
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
                          onClick={(e) => {
                            e.stopPropagation();
                            reactivateTask(task.id);
                            setSelectedCompleted(null);
                          }}
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
        />
      </div>

      {/* Edit Panel */}
      {focusedTask && (
        <div className="edit-panel">
          <div className="edit-panel-header">
            <span className="edit-panel-title-label">태스크 편집</span>
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
              placeholder="제목"
              disabled={useOnline && focusedTask.ownerId !== auth.user?.id}
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
                  disabled={useOnline && focusedTask.ownerId !== auth.user?.id}
                >
                  {p}
                </button>
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
                disabled={useOnline && focusedTask.ownerId !== auth.user?.id}
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
              disabled={useOnline && focusedTask.ownerId !== auth.user?.id}
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

          {(!useOnline || focusedTask.ownerId === auth.user?.id) && (
            <div className="edit-bottom-actions">
              <button className="edit-complete-btn" onClick={() => { completeTask(focusedTask.id); setFocusedTaskId(null); }}>
                완료하기
              </button>
              <button
                className="edit-delete-btn"
                onClick={() => { removeTask(focusedTask.id); setFocusedTaskId(null); }}
              >
                삭제
              </button>
            </div>
          )}

          {useOnline && focusedTask.ownerId !== auth.user?.id && (
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
