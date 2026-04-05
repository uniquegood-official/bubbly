import { useState, useEffect, useRef } from "react";
import type { Task } from "../types/task";
import { BUBBLE_COLORS } from "../types/task";

interface Props {
  open: boolean;
  parentTask: Task;
  onClose: () => void;
  onAdd: (title: string, color: string) => void;
}

function getNextBubbleColor(currentColor?: string): string {
  const nonDefault = BUBBLE_COLORS.filter((c) => c.id !== "default");
  if (!currentColor || currentColor === "default") return nonDefault[0].id;
  const idx = nonDefault.findIndex((c) => c.id === currentColor);
  if (idx === -1 || idx === nonDefault.length - 1) return nonDefault[0].id;
  return nonDefault[idx + 1].id;
}

export default function SubTaskDialog({ open, parentTask, onClose, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(() => getNextBubbleColor(parentTask.color));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setColor(getNextBubbleColor(parentTask.color));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, parentTask.color]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), color);
    setTitle("");
  };

  return (
    <div className="spotlight-overlay" onClick={onClose}>
      <div
        className="sub-task-dialog-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sub-task-dialog-parent">↳ {parentTask.title} 에 서브 버블 추가</div>
        <input
          ref={inputRef}
          type="text"
          className="spotlight-input"
          placeholder="서브 버블 이름..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="sub-task-color-grid">
          {BUBBLE_COLORS.map((c) => (
            <button
              key={c.id}
              className={`stc-dot ${color === c.id ? "active" : ""}`}
              style={{
                background: c.id === "default"
                  ? "linear-gradient(135deg, #d0dce5, #b8a4f0, #f0a090)"
                  : c.light,
              }}
              title={c.label}
              onClick={() => setColor(c.id)}
            />
          ))}
        </div>
        <div className="sub-task-form-footer">
          <button className="sub-task-cancel" onClick={onClose}>취소</button>
          <button className="sub-task-submit" onClick={handleSubmit} disabled={!title.trim()}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
