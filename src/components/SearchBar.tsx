import { useState, useRef, useEffect } from "react";
import type { Task } from "../types/task";

interface Props {
  tasks: Task[];
  onSelect: (id: string) => void;
  onReactivate: (id: string) => void;
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    `<mark>${text.slice(idx, idx + query.length)}</mark>` +
    text.slice(idx + query.length)
  );
}

export default function SearchBar({ tasks, onSelect, onReactivate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const results = query.trim()
    ? tasks.filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        (t.memo && t.memo.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  return (
    <div className="search-bar">
      <button className="search-toggle" onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}>
        ⌘K 검색
      </button>

      {open && (
        <div className="search-dropdown">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="태스크 검색..."
            className="search-input"
          />
          {query.trim() ? (
            results.length > 0 ? (
              <div className="search-results">
                {results.map((task) => (
                  <div
                    key={task.id}
                    className="search-result-item"
                    onClick={() => {
                      if (task.completed) {
                        onReactivate(task.id);
                      } else {
                        onSelect(task.id);
                      }
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className={`sr-dot ${task.completed ? "done-dot" : "active-dot"}`} />
                    <span
                      className={`sr-title ${task.completed ? "completed-title" : ""}`}
                      dangerouslySetInnerHTML={{ __html: highlightMatch(task.title, query) }}
                    />
                    <span className="sr-meta">
                      {task.completed ? "완료" : `P${task.priority}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="search-empty">결과 없음</div>
            )
          ) : (
            <div className="search-empty">검색어를 입력하세요</div>
          )}
        </div>
      )}
    </div>
  );
}
