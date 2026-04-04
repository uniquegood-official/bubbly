import { useState, useRef, useEffect } from "react";
import type { Priority } from "../types/task";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, priority: Priority, dueDate?: string, estimatedMinutes?: number) => void;
}

const PRIORITY_OPTIONS: { value: Priority; label: string; desc: string }[] = [
  { value: 1, label: "1", desc: "작은 일" },
  { value: 2, label: "2", desc: "가벼운" },
  { value: 3, label: "3", desc: "보통" },
  { value: 4, label: "4", desc: "중요" },
  { value: 5, label: "5", desc: "긴급!" },
];

export default function SpotlightAdd({ open, onClose, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>(3);
  const [minutes, setMinutes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, priority, undefined, minutes ? parseInt(minutes) : undefined);
    setTitle("");
    setMinutes("");
    setPriority(3);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    // Cmd+1~5 for priority
    if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      setPriority(parseInt(e.key) as Priority);
    }
  };

  if (!open) return null;

  return (
    <div className="spotlight-overlay" onClick={onClose}>
      <div className="spotlight-card" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="무엇을 해야 하나요?"
            className="spotlight-input"
          />

          <div className="spotlight-options">
            <div className="spotlight-opt">
              <span className="spotlight-label">크기</span>
              <div className="spotlight-pills">
                {PRIORITY_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`sp-pill p${p.value} ${priority === p.value ? "active" : ""}`}
                    onClick={() => setPriority(p.value)}
                    title={p.desc}
                  >
                    {p.desc}
                  </button>
                ))}
              </div>
            </div>

            <div className="spotlight-opt">
              <span className="spotlight-label">시간</span>
              <input
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="분"
                min={1}
                className="spotlight-minutes"
              />
            </div>
          </div>

          <div className="spotlight-footer">
            <span className="spotlight-hint">⌘1~5 크기 · Enter 추가 · Esc 닫기</span>
            <button type="submit" className="spotlight-submit" disabled={!title.trim()}>
              버블 추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
