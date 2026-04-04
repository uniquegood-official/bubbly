import { useRef, useEffect, useCallback, useState } from "react";
import type { Task } from "../types/task";

const PRIORITY_RADIUS: Record<number, number> = {
  1: 30, 2: 40, 3: 52, 4: 66, 5: 82,
};

// [bubble fill light, bubble fill dark, text color]
const PRIORITY_COLORS: Record<number, [string, string, string]> = {
  1: ["#d0dce5", "#9badb8", "#3a4a54"],
  2: ["#8ae0d4", "#3c9e90", "#1a4a44"],
  3: ["#b8a4f0", "#7b5fcf", "#2d1a5e"],
  4: ["#f0a090", "#c0604a", "#5c1a0e"],
  5: ["#e87090", "#b83050", "#4a0a1e"],
};

interface Bubble {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  task: Task;
  popping: boolean;
  popProgress: number;
}

interface Props {
  tasks: Task[];
  focusedId: string | null;
  onSelect: (id: string) => void;
  onComplete: (id: string) => void;
  onGroup: (id1: string, id2: string) => void;
  onUngroup: (id: string) => void;
  onCompleteGroup: (groupId: string) => void;
}

function isUrgent(task: Task): boolean {
  if (!task.dueDate) return false;
  const diff = new Date(task.dueDate).getTime() - Date.now();
  return diff < 2 * 24 * 60 * 60 * 1000 && diff > 0;
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export default function BubbleCanvas({ tasks, focusedId, onSelect, onComplete, onGroup, onUngroup, onCompleteGroup }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ bubbleId: string; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [confirmGroup, setConfirmGroup] = useState<{ groupId: string; x: number; y: number } | null>(null);

  // Build group info for center detection
  const groupCenters = useRef<Set<string>>(new Set());
  useEffect(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (t.groupId) {
        if (!groups[t.groupId]) groups[t.groupId] = [];
        groups[t.groupId].push(t);
      }
    }
    const centers = new Set<string>();
    for (const gid of Object.keys(groups)) {
      if (groups[gid].length > 1) {
        // Center = first added to group (earliest createdAt)
        const sorted = [...groups[gid]].sort((a, b) => a.createdAt - b.createdAt);
        centers.add(sorted[0].id);
      }
    }
    groupCenters.current = centers;
  }, [tasks]);

  // Sync bubbles with tasks
  useEffect(() => {
    const existing = bubblesRef.current;
    const newBubbles: Bubble[] = tasks.map((task) => {
      const found = existing.find((b) => b.id === task.id);

      // Auto-size: group center gets bigger
      const isCenter = groupCenters.current.has(task.id);
      const baseR = PRIORITY_RADIUS[task.priority];
      const targetR = isCenter ? Math.max(baseR, 90) : baseR;

      if (found) {
        found.task = task;
        // Smoothly transition radius
        found.r += (targetR - found.r) * 0.15;
        return found;
      }
      return {
        id: task.id,
        x: targetR + Math.random() * Math.max(100, size.w * (window.devicePixelRatio || 1) - targetR * 3),
        y: targetR + Math.random() * Math.max(100, size.h * (window.devicePixelRatio || 1) - targetR * 3),
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        r: PRIORITY_RADIUS[task.priority],
        task,
        popping: false,
        popProgress: 0,
      };
    });
    bubblesRef.current = newBubbles;
  }, [tasks, size.w, size.h]);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      setSize({ w: parent.clientWidth, h: parent.clientHeight });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const popBubble = useCallback(
    (id: string) => {
      const bubble = bubblesRef.current.find((b) => b.id === id);
      if (bubble && !bubble.popping) {
        bubble.popping = true;
        bubble.popProgress = 0;
        setTimeout(() => onComplete(id), 500);
      }
    },
    [onComplete]
  );

  const popGroup = useCallback(
    (groupId: string) => {
      const groupBubbles = bubblesRef.current.filter((b) => b.task.groupId === groupId);
      groupBubbles.forEach((b, i) => {
        setTimeout(() => {
          b.popping = true;
          b.popProgress = 0;
        }, i * 80);
      });
      setTimeout(() => onCompleteGroup(groupId), groupBubbles.length * 80 + 500);
    },
    [onCompleteGroup]
  );

  // Double-click detection
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Mouse/drag/scroll handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    };

    const findBubble = (mx: number, my: number) => {
      for (const b of bubblesRef.current) {
        if (b.popping) continue;
        const dx = mx - b.x;
        const dy = my - b.y;
        if (dx * dx + dy * dy < b.r * b.r) return b;
      }
      return null;
    };

    const handleMouseDown = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      const hit = findBubble(x, y);
      if (hit) {
        dragRef.current = { bubbleId: hit.id, offsetX: x - hit.x, offsetY: y - hit.y, startX: hit.x, startY: hit.y };
        canvas.style.cursor = "grabbing";
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      mouseRef.current = { x, y };

      if (dragRef.current) {
        const b = bubblesRef.current.find((b) => b.id === dragRef.current!.bubbleId);
        if (b) {
          b.x = x - dragRef.current.offsetX;
          b.y = y - dragRef.current.offsetY;
          b.vx = 0;
          b.vy = 0;
        }
        canvas.style.cursor = "grabbing";
        return;
      }

      const hovering = findBubble(x, y);
      canvas.style.cursor = hovering ? "grab" : "default";
    };

    const handleMouseUp = (_e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      canvas.style.cursor = "default";

      const b = bubblesRef.current.find((b) => b.id === drag.bubbleId);
      if (!b) return;

      const totalMoved = Math.sqrt(
        (b.x - drag.startX) ** 2 + (b.y - drag.startY) ** 2
      );

      // Check if it was a click (barely moved)
      if (totalMoved < 8) {
        const now = Date.now();
        const lastClick = lastClickRef.current;
        const isDoubleClick = lastClick && lastClick.id === b.id && now - lastClick.time < 400;
        lastClickRef.current = { id: b.id, time: now };

        if (isDoubleClick) {
          // Double click → complete (or group complete for center)
          lastClickRef.current = null;
          if (b.task.groupId && groupCenters.current.has(b.id)) {
            const rect = canvasRef.current!.getBoundingClientRect();
            setConfirmGroup({
              groupId: b.task.groupId!,
              x: b.x / (window.devicePixelRatio || 1) + rect.left,
              y: b.y / (window.devicePixelRatio || 1) + rect.top,
            });
          } else {
            popBubble(b.id);
          }
          return;
        }

        // Single click → select/focus (opens edit panel)
        onSelect(b.id);
        return;
      }

      // It was a drag — check for snap (group) or ungroup
      // Check if dragged onto another bubble → group
      for (const other of bubblesRef.current) {
        if (other.id === b.id || other.popping) continue;
        const dx = b.x - other.x;
        const dy = b.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.r + other.r + 15) {
          // Snap together
          onGroup(b.id, other.id);
          return;
        }
      }

      // Check if pulled away from group → ungroup
      if (b.task.groupId) {
        const groupBubbles = bubblesRef.current.filter(
          (ob) => ob.task.groupId === b.task.groupId && ob.id !== b.id && !ob.popping
        );
        if (groupBubbles.length > 0) {
          const cx = groupBubbles.reduce((s, ob) => s + ob.x, 0) / groupBubbles.length;
          const cy = groupBubbles.reduce((s, ob) => s + ob.y, 0) / groupBubbles.length;
          const distFromGroup = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2);
          if (distFromGroup > 300) {
            // Fling away
            const angle = Math.atan2(b.y - cy, b.x - cx);
            b.vx = Math.cos(angle) * 8;
            b.vy = Math.sin(angle) * 8;
            onUngroup(b.id);
            return;
          }
        }
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (dragRef.current) return;
      const { x, y } = getPos(e);
      const hit = findBubble(x, y);
      if (!hit) {
        onSelect("");
        setConfirmGroup(null);
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current = null;
      dragRef.current = null;
    };

    const handleWheel = (e: WheelEvent) => {
      const { x, y } = getPos(e);
      const hit = findBubble(x, y);
      if (hit) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -4 : 4;
        hit.r = Math.max(20, Math.min(120, hit.r + delta));
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [focusedId, onSelect, onGroup, onUngroup, popBubble]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;

    const W = canvas.width;
    const H = canvas.height;

    let time = 0;

    const draw = () => {
      time++;
      ctx.clearRect(0, 0, W, H);
      const bubbles = bubblesRef.current;
      const isDragging = dragRef.current !== null;

      // Build group map
      const groups: Record<string, Bubble[]> = {};
      for (const b of bubbles) {
        if (b.task.groupId && !b.popping) {
          if (!groups[b.task.groupId]) groups[b.task.groupId] = [];
          groups[b.task.groupId].push(b);
        }
      }

      // Physics
      for (const b of bubbles) {
        if (b.popping) {
          b.popProgress += 0.04;
          continue;
        }

        const beingDragged = isDragging && dragRef.current!.bubbleId === b.id;
        if (beingDragged) continue;

        // Mouse hover → slow down
        if (mouseRef.current) {
          const dx = b.x - mouseRef.current.x;
          const dy = b.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < b.r) {
            b.vx *= 0.3;
            b.vy *= 0.3;
          }
        }

        // Spring force toward group center (for grouped bubbles)
        if (b.task.groupId && groups[b.task.groupId] && groups[b.task.groupId].length > 1) {
          const group = groups[b.task.groupId];
          const cx = group.reduce((s, ob) => s + ob.x, 0) / group.length;
          const cy = group.reduce((s, ob) => s + ob.y, 0) / group.length;
          const dx = cx - b.x;
          const dy = cy - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const targetDist = b.r + 10;
          if (dist > targetDist) {
            const spring = 0.012;
            b.vx += dx * spring;
            b.vy += dy * spring;
          }
        }

        // Bubble-bubble collision
        for (const other of bubbles) {
          if (other.id === b.id || other.popping) continue;
          const isDraggedOther = isDragging && dragRef.current!.bubbleId === other.id;
          if (isDraggedOther) continue;

          const dx = b.x - other.x;
          const dy = b.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Grouped bubbles: softer collision, closer spacing
          const sameGroup = b.task.groupId && b.task.groupId === other.task.groupId;
          const minDist = sameGroup ? b.r + other.r - 8 : b.r + other.r + 4;

          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            const pushForce = sameGroup ? 0.2 : 0.5;
            b.x += nx * overlap * pushForce;
            b.y += ny * overlap * pushForce;
            other.x -= nx * overlap * pushForce;
            other.y -= ny * overlap * pushForce;
            const bounce = sameGroup ? 0.1 : 0.3;
            b.vx += nx * bounce;
            b.vy += ny * bounce;
            other.vx -= nx * bounce;
            other.vy -= ny * bounce;
          }
        }

        // Wall bounce (with padding to keep fully visible)
        const pad = 4;
        if (b.x - b.r < pad) { b.x = b.r + pad; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x + b.r > W - pad) { b.x = W - b.r - pad; b.vx = -Math.abs(b.vx) * 0.5; }
        if (b.y - b.r < pad) { b.y = b.r + pad; b.vy = Math.abs(b.vy) * 0.5; }
        if (b.y + b.r > H - pad) { b.y = H - b.r - pad; b.vy = -Math.abs(b.vy) * 0.5; }

        // Float drift (skip for grouped bubbles to keep them calm)
        const inGroup = b.task.groupId && groups[b.task.groupId] && groups[b.task.groupId].length > 1;
        if (!inGroup) {
          b.vx += (Math.random() - 0.5) * 0.06;
          b.vy += (Math.random() - 0.5) * 0.06;
        }

        // Damping (stronger for grouped bubbles to prevent orbiting)
        const damp = inGroup ? 0.92 : 0.985;
        b.vx *= damp;
        b.vy *= damp;

        b.x += b.vx;
        b.y += b.vy;
      }

      // Draw group connections (behind bubbles)
      for (const gid of Object.keys(groups)) {
        const group = groups[gid];
        if (group.length < 2) continue;

        // Group blob background
        const cx = group.reduce((s, b) => s + b.x, 0) / group.length;
        const cy = group.reduce((s, b) => s + b.y, 0) / group.length;
        const maxR = Math.max(...group.map((b) => {
          const dx = b.x - cx;
          const dy = b.y - cy;
          return Math.sqrt(dx * dx + dy * dy) + b.r;
        }));

        const blobGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR + 20);
        blobGrad.addColorStop(0, "rgba(100, 90, 122, 0.06)");
        blobGrad.addColorStop(1, "rgba(100, 90, 122, 0)");
        ctx.beginPath();
        ctx.arc(cx, cy, maxR + 20, 0, Math.PI * 2);
        ctx.fillStyle = blobGrad;
        ctx.fill();

        // Connection lines
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const b = group[j];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = "rgba(100, 90, 122, 0.12)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      // Drag snap preview: show line to nearest bubble
      if (isDragging) {
        const draggedB = bubbles.find((b) => b.id === dragRef.current!.bubbleId);
        if (draggedB) {
          let nearest: Bubble | null = null;
          let nearestDist = Infinity;
          for (const other of bubbles) {
            if (other.id === draggedB.id || other.popping) continue;
            const dx = draggedB.x - other.x;
            const dy = draggedB.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < draggedB.r + other.r + 40 && dist < nearestDist) {
              nearest = other;
              nearestDist = dist;
            }
          }
          if (nearest) {
            ctx.beginPath();
            ctx.moveTo(draggedB.x, draggedB.y);
            ctx.lineTo(nearest.x, nearest.y);
            ctx.strokeStyle = "rgba(100, 90, 122, 0.3)";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // Draw bubbles
      for (const b of bubbles) {
        const isFocused = focusedId === b.id;
        const dimmed = focusedId && !isFocused && !(b.task.groupId && b.task.groupId === bubbles.find((ob) => ob.id === focusedId)?.task.groupId);
        const urgent = isUrgent(b.task);
        const overdue = isOverdue(b.task);
        const [colorLight, colorDark, colorText] = PRIORITY_COLORS[b.task.priority];

        // Is this the center (largest) of its group?
        let isGroupCenter = false;
        if (b.task.groupId && groups[b.task.groupId] && groups[b.task.groupId].length > 1) {
          const center = groups[b.task.groupId].reduce((a, c) => (c.r >= a.r ? c : a));
          isGroupCenter = center.id === b.id;
        }

        if (b.popping) {
          const p = b.popProgress;
          const scale = 1 + p * 1.2;
          const alpha = 1 - p;
          if (alpha <= 0) continue;

          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * scale, 0, Math.PI * 2);
          ctx.strokeStyle = colorLight;
          ctx.lineWidth = 3 * (1 - p);
          ctx.globalAlpha = alpha * 0.6;
          ctx.stroke();

          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + p * 0.5;
            const dist = p * b.r * 2.5;
            const px = b.x + Math.cos(angle) * dist;
            const py = b.y + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.arc(px, py, (1 - p) * 5, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? colorLight : "#fbbf24";
            ctx.globalAlpha = alpha;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          continue;
        }

        ctx.globalAlpha = dimmed ? 0.2 : 1;
        const wobble = Math.sin(time * 0.025 + b.x * 0.008) * 2.5;

        // Glow
        if (isFocused || urgent || overdue || isGroupCenter) {
          const glowColor = overdue ? "#f87171" : urgent ? "#fbbf24" : isGroupCenter ? "#a78bfa" : colorLight;
          const pulseR = b.r + 10 + Math.sin(time * 0.05) * 5;
          const glowGrad = ctx.createRadialGradient(b.x, b.y + wobble, b.r, b.x, b.y + wobble, pulseR);
          glowGrad.addColorStop(0, glowColor + "40");
          glowGrad.addColorStop(1, glowColor + "00");
          ctx.beginPath();
          ctx.arc(b.x, b.y + wobble, pulseR, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.globalAlpha = dimmed ? 0.08 : 0.6;
          ctx.fill();
          ctx.globalAlpha = dimmed ? 0.2 : 1;
        }

        // Ambient shadow (primary-tinted)
        ctx.beginPath();
        ctx.arc(b.x, b.y + wobble + 6, b.r + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(129, 81, 99, 0.08)";
        ctx.fill();

        // Body gradient
        const grad = ctx.createRadialGradient(
          b.x - b.r * 0.3, b.y - b.r * 0.35 + wobble, b.r * 0.05,
          b.x, b.y + wobble, b.r
        );
        grad.addColorStop(0, colorLight + "dd");
        grad.addColorStop(0.7, colorDark + "cc");
        grad.addColorStop(1, colorDark + "99");
        ctx.beginPath();
        ctx.arc(b.x, b.y + wobble, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Ghost border (catch-light)
        ctx.beginPath();
        ctx.arc(b.x, b.y + wobble, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = isFocused ? "rgba(129, 81, 99, 0.3)" : isGroupCenter ? "rgba(100, 90, 122, 0.2)" : "rgba(169, 179, 186, 0.15)";
        ctx.lineWidth = isFocused ? 2 : isGroupCenter ? 1.5 : 0.5;
        ctx.stroke();

        // White inner glow (top shine)
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(b.x - b.r * 0.15, b.y - b.r * 0.38 + wobble, b.r * 0.4, b.r * 0.2, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();
        ctx.restore();

        // Title
        ctx.font = `600 ${Math.max(11, b.r * 0.26)}px "Plus Jakarta Sans", -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "-0.02em";
        const maxChars = Math.floor(b.r / 6.5);
        const label = b.task.title.length > maxChars
          ? b.task.title.slice(0, maxChars - 1) + "…"
          : b.task.title;
        ctx.fillStyle = colorText;
        ctx.fillText(label, b.x, b.y + wobble - 4);

        // Subtitle
        if (b.task.estimatedMinutes) {
          ctx.font = `500 ${Math.max(9, b.r * 0.18)}px "Plus Jakarta Sans", -apple-system, sans-serif`;
          ctx.fillStyle = colorText + "99";
          ctx.fillText(`${b.task.estimatedMinutes}분`, b.x, b.y + wobble + b.r * 0.32);
        }

        // Group center icon
        if (isGroupCenter) {
          ctx.font = `${Math.max(12, b.r * 0.22)}px -apple-system, sans-serif`;
          ctx.fillText("✦", b.x, b.y + wobble - b.r * 0.55);
        }

        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, focusedId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: "block", cursor: "default" }}
      />
      {/* Group complete confirm popup */}
      {confirmGroup && (
        <div
          className="group-confirm"
          style={{ left: confirmGroup.x, top: confirmGroup.y }}
        >
          <p>프로젝트 전체를 완료할까요?</p>
          <div className="group-confirm-actions">
            <button
              className="gc-btn yes"
              onClick={() => {
                popGroup(confirmGroup.groupId);
                setConfirmGroup(null);
              }}
            >
              전체 완료!
            </button>
            <button
              className="gc-btn no"
              onClick={() => setConfirmGroup(null)}
            >
              아니요
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
