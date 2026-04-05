import { useState, useRef, useEffect } from "react";
import type { Task } from "../types/task";
import { useI18n } from "../lib/i18n";

interface Props {
  tasks: Task[];
  onSelect: (id: string) => void;
  onReactivate: (id: string) => void;
  compact?: boolean;
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

export default function SearchBar({ tasks, onSelect, onReactivate, compact = false }: Props) {
  const { t } = useI18n();
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

  const handleOpen = () => {
    setOpen(!open);
    if (!open) {
      // Close detail panel when search opens
      onSelect("");
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="search-bar">
      <button
        className={`search-toggle ${compact ? "compact" : ""}`}
        onClick={handleOpen}
        title={t("topbar.search")}
      >
        {compact ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        ) : (
          `⌘K ${t("topbar.search")}`
        )}
      </button>

      {open && (
        <div className="search-dropdown">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
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
                      {task.completed ? t("sidebar.completed") : `P${task.priority}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="search-empty">{t("search.noResults")}</div>
            )
          ) : (
            <div className="search-empty">{t("search.hint")}</div>
          )}
        </div>
      )}
    </div>
  );
}
