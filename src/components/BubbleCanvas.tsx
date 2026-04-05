import { useRef, useEffect, useCallback, useState } from "react";
import type { Task } from "../types/task";
import { BUBBLE_COLORS } from "../types/task";

const PRIORITY_RADIUS: Record<number, number> = {
  1: 30, 2: 40, 3: 52, 4: 66, 5: 82,
};

const PRIORITY_COLORS: Record<number, [string, string, string]> = {
  1: ["#d0dce5", "#9badb8", "#3a4a54"],
  2: ["#8ae0d4", "#3c9e90", "#1a4a44"],
  3: ["#b8a4f0", "#7b5fcf", "#2d1a5e"],
  4: ["#f0a090", "#c0604a", "#5c1a0e"],
  5: ["#e87090", "#b83050", "#4a0a1e"],
};

function getColors(task: Task): [string, string, string] {
  if (task.color && task.color !== "default") {
    const c = BUBBLE_COLORS.find((bc) => bc.id === task.color);
    if (c && c.light) return [c.light, c.dark, c.text];
  }
  return PRIORITY_COLORS[task.priority];
}

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
  allTasks: Task[];
  focusedId: string | null;
  onSelect: (id: string) => void;
  onComplete: (id: string) => void;
  onGroup: (id1: string, id2: string) => void;
  onUngroup: (id: string) => void;
  onCompleteGroup: (groupId: string) => void;
  onEmptyClick?: (x: number, y: number) => void;
  onAddSub?: (id: string) => void;
  onAiGenerate?: (id: string) => void;
  onDeleteMultiple?: (ids: string[]) => void;
  onCompleteMultiple?: (ids: string[]) => void;
  onGroupMultiple?: (ids: string[]) => void;
  onDuplicateMultiple?: (ids: string[]) => void;
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

export default function BubbleCanvas({
  tasks, allTasks, focusedId, onSelect, onComplete, onGroup, onUngroup, onCompleteGroup,
  onEmptyClick, onAddSub, onAiGenerate,
  onDeleteMultiple, onCompleteMultiple, onGroupMultiple, onDuplicateMultiple,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ bubbleId: string; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const rectSelectRef = useRef<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [confirmGroup, setConfirmGroup] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const [confirmPop, setConfirmPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [confirmUngroup, setConfirmUngroup] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [floatingActions, setFloatingActions] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedBubbleIds, setSelectedBubbleIds] = useState<string[]>([]);
  const [multiActionPos, setMultiActionPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    selectedIdsRef.current = new Set(selectedBubbleIds);
  }, [selectedBubbleIds]);

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
        const sorted = [...groups[gid]].sort((a, b) => a.createdAt - b.createdAt);
        centers.add(sorted[0].id);
      }
    }
    groupCenters.current = centers;
  }, [tasks]);

  const visibleIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    visibleIds.current = new Set(tasks.map((t) => t.id));
  }, [tasks]);

  // Sync bubbles with ALL tasks - DPR-scaled radius
  useEffect(() => {
    const existing = bubblesRef.current;
    const dpr = window.devicePixelRatio || 1;
    const newBubbles: Bubble[] = allTasks.map((task) => {
      const found = existing.find((b) => b.id === task.id);

      const isCenter = groupCenters.current.has(task.id);
      const baseR = PRIORITY_RADIUS[task.priority] * dpr;
      const targetR = isCenter ? Math.max(baseR, 90 * dpr) : baseR;

      if (found) {
        found.task = task;
        found.r += (targetR - found.r) * 0.08;
        return found;
      }

      let startX = targetR + Math.random() * Math.max(100, size.w * dpr - targetR * 3);
      let startY = targetR + Math.random() * Math.max(100, size.h * dpr - targetR * 3);

      if (task.groupId) {
        const parent = existing.find((b) => b.task.groupId === task.groupId);
        if (parent) {
          const angle = Math.random() * Math.PI * 2;
          startX = parent.x + Math.cos(angle) * (parent.r + targetR + 10);
          startY = parent.y + Math.sin(angle) * (parent.r + targetR + 10);
        }
      }

      return {
        id: task.id,
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: baseR,
        task,
        popping: false,
        popProgress: 0,
      };
    });
    bubblesRef.current = newBubbles;
  }, [allTasks, size.w, size.h]);

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

  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Mouse/touch/drag handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    };

    const findBubble = (mx: number, my: number) => {
      const visible = visibleIds.current;
      for (const b of bubblesRef.current) {
        if (b.popping || !visible.has(b.id)) continue;
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
        setSelectedBubbleIds([]);
        setMultiActionPos(null);
        dragRef.current = { bubbleId: hit.id, offsetX: x - hit.x, offsetY: y - hit.y, startX: hit.x, startY: hit.y };
        canvas.style.cursor = "grabbing";
      } else {
        // Start rect selection on empty canvas
        rectSelectRef.current = { sx: x, sy: y, ex: x, ey: y };
      }
    };

    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      mouseRef.current = { x, y };

      // Rect selection mode
      if (rectSelectRef.current) {
        rectSelectRef.current.ex = x;
        rectSelectRef.current.ey = y;
        canvas.style.cursor = "crosshair";
        setTooltip(null);
        hoveredRef.current = null;
        return;
      }

      if (dragRef.current) {
        const b = bubblesRef.current.find((b) => b.id === dragRef.current!.bubbleId);
        if (b) {
          b.x = x - dragRef.current.offsetX;
          b.y = y - dragRef.current.offsetY;
          b.vx = 0;
          b.vy = 0;
        }
        canvas.style.cursor = "grabbing";
        setTooltip(null);
        hoveredRef.current = null;
        return;
      }

      const hovering = findBubble(x, y);
      canvas.style.cursor = hovering ? "grab" : "default";

      if (hovering) {
        if (hoveredRef.current !== hovering.id) {
          hoveredRef.current = hovering.id;
          setTooltip(null);
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            const b = bubblesRef.current.find((b) => b.id === hovering.id);
            if (b) {
              const rect = canvas.getBoundingClientRect();
              setTooltip({
                text: b.task.title,
                x: b.x / dpr + rect.left,
                y: (b.y - b.r) / dpr + rect.top - 8,
              });
            }
          }, 400);
        }
      } else {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoveredRef.current = null;
        setTooltip(null);
      }
    };

    const handleMouseUp = (_e: MouseEvent) => {
      // Rect selection end
      if (rectSelectRef.current) {
        const rs = rectSelectRef.current;
        const minX = Math.min(rs.sx, rs.ex);
        const maxX = Math.max(rs.sx, rs.ex);
        const minY = Math.min(rs.sy, rs.ey);
        const maxY = Math.max(rs.sy, rs.ey);
        rectSelectRef.current = null;
        canvas.style.cursor = "default";
        if (maxX - minX > 10 || maxY - minY > 10) {
          const visible = visibleIds.current;
          const inRect = bubblesRef.current.filter(
            (b) => !b.popping && visible.has(b.id) &&
              b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY
          );
          if (inRect.length > 0) {
            setSelectedBubbleIds(inRect.map((b) => b.id));
            const rect2 = canvas.getBoundingClientRect();
            const avgX = inRect.reduce((s, b) => s + b.x, 0) / inRect.length;
            const topY = Math.min(...inRect.map((b) => b.y - b.r));
            setMultiActionPos({ x: avgX / dpr + rect2.left, y: topY / dpr + rect2.top - 12 });
            return;
          }
        }
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      canvas.style.cursor = "default";

      const b = bubblesRef.current.find((b) => b.id === drag.bubbleId);
      if (!b) return;

      const totalMoved = Math.sqrt(
        (b.x - drag.startX) ** 2 + (b.y - drag.startY) ** 2
      );

      if (totalMoved < 8) {
        const now = Date.now();
        const lastClick = lastClickRef.current;
        const isDoubleClick = lastClick && lastClick.id === b.id && now - lastClick.time < 400;
        lastClickRef.current = { id: b.id, time: now };

        if (isDoubleClick) {
          lastClickRef.current = null;
          const rect = canvasRef.current!.getBoundingClientRect();
          const screenX = b.x / dpr + rect.left;
          const screenY = b.y / dpr + rect.top;
          if (b.task.groupId && groupCenters.current.has(b.id)) {
            setConfirmGroup({ groupId: b.task.groupId!, x: screenX, y: screenY });
          } else {
            setConfirmPop({ id: b.id, x: screenX, y: screenY });
          }
          return;
        }

        // Single click -> select + floating actions
        onSelect(b.id);
        const rect = canvasRef.current!.getBoundingClientRect();
        setFloatingActions({
          id: b.id,
          x: b.x / dpr + rect.left,
          y: (b.y - b.r) / dpr + rect.top - 12,
        });
        return;
      }

      // Check snap to another bubble -> group
      for (const other of bubblesRef.current) {
        if (other.id === b.id || other.popping) continue;
        const dx = b.x - other.x;
        const dy = b.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.r + other.r + 15) {
          onGroup(b.id, other.id);
          return;
        }
      }

      // Check ungroup - dragged far from group -> show confirmation
      if (b.task.groupId) {
        const groupBubbles = bubblesRef.current.filter(
          (ob) => ob.task.groupId === b.task.groupId && ob.id !== b.id && !ob.popping
        );
        if (groupBubbles.length > 0) {
          const cx = groupBubbles.reduce((s, ob) => s + ob.x, 0) / groupBubbles.length;
          const cy = groupBubbles.reduce((s, ob) => s + ob.y, 0) / groupBubbles.length;
          const distFromGroup = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2);
          if (distFromGroup > 300) {
            const rect2 = canvasRef.current!.getBoundingClientRect();
            setConfirmUngroup({ id: b.id, x: b.x / dpr + rect2.left, y: b.y / dpr + rect2.top });
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
        setConfirmPop(null);
        setConfirmUngroup(null);
        setFloatingActions(null);
        setSelectedBubbleIds([]);
        setMultiActionPos(null);
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      const hit = findBubble(x, y);
      if (!hit && onEmptyClick) {
        const rect = canvas.getBoundingClientRect();
        onEmptyClick(
          (e.clientX - rect.left) / rect.width,
          (e.clientY - rect.top) / rect.height
        );
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current = null;
      dragRef.current = null;
      rectSelectRef.current = null;
      hoveredRef.current = null;
      setTooltip(null);
      if (hoverTimer) clearTimeout(hoverTimer);
    };

    const handleWheel = (e: WheelEvent) => {
      const { x, y } = getPos(e);
      const hit = findBubble(x, y);
      if (hit) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -4 : 4;
        hit.r = Math.max(20, Math.min(120 * dpr, hit.r + delta));
      }
    };

    // Touch support
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      mouseRef.current = pos;
      const hit = findBubble(pos.x, pos.y);
      if (hit) {
        dragRef.current = { bubbleId: hit.id, offsetX: pos.x - hit.x, offsetY: pos.y - hit.y, startX: hit.x, startY: hit.y };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      mouseRef.current = pos;
      if (dragRef.current) {
        const b = bubblesRef.current.find((b) => b.id === dragRef.current!.bubbleId);
        if (b) { b.x = pos.x - dragRef.current.offsetX; b.y = pos.y - dragRef.current.offsetY; b.vx = 0; b.vy = 0; }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const b = bubblesRef.current.find((b) => b.id === drag.bubbleId);
      if (!b) { mouseRef.current = null; return; }
      const totalMoved = Math.sqrt((b.x - drag.startX) ** 2 + (b.y - drag.startY) ** 2);
      if (totalMoved < 12) {
        const now = Date.now();
        const lastClick = lastClickRef.current;
        const isDoubleClick = lastClick && lastClick.id === b.id && now - lastClick.time < 500;
        lastClickRef.current = { id: b.id, time: now };
        if (isDoubleClick) {
          lastClickRef.current = null;
          const rect2 = canvas.getBoundingClientRect();
          const screenX = b.x / dpr + rect2.left;
          const screenY = b.y / dpr + rect2.top;
          if (b.task.groupId && groupCenters.current.has(b.id)) {
            setConfirmGroup({ groupId: b.task.groupId!, x: screenX, y: screenY });
          } else {
            setConfirmPop({ id: b.id, x: screenX, y: screenY });
          }
          mouseRef.current = null;
          return;
        }
        onSelect(b.id);
        const rect2 = canvas.getBoundingClientRect();
        setFloatingActions({ id: b.id, x: b.x / dpr + rect2.left, y: (b.y - b.r) / dpr + rect2.top - 12 });
      } else {
        // Check snap to group on touch drag
        for (const other of bubblesRef.current) {
          if (other.id === b.id || other.popping) continue;
          const dx = b.x - other.x;
          const dy = b.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < b.r + other.r + 15) {
            onGroup(b.id, other.id);
            mouseRef.current = null;
            return;
          }
        }
      }
      mouseRef.current = null;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("dblclick", handleDblClick);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("dblclick", handleDblClick);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      if (hoverTimer) clearTimeout(hoverTimer);
    };
  }, [focusedId, onSelect, onGroup, onUngroup, popBubble, onEmptyClick]);

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
    const MAX_SPEED = 3;

    const draw = () => {
      time++;
      ctx.clearRect(0, 0, W, H);
      const allBubbles = bubblesRef.current;
      const visible = visibleIds.current;
      const bubbles = allBubbles.filter((b) => visible.has(b.id));
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

        const inGroup = b.task.groupId && groups[b.task.groupId] && groups[b.task.groupId].length > 1;

        if (mouseRef.current) {
          const dx = b.x - mouseRef.current.x;
          const dy = b.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < b.r) {
            b.vx *= 0.3;
            b.vy *= 0.3;
          }
        }

        if (inGroup) {
          const group = groups[b.task.groupId!];
          const cx = group.reduce((s, ob) => s + ob.x, 0) / group.length;
          const cy = group.reduce((s, ob) => s + ob.y, 0) / group.length;
          const dx = cx - b.x;
          const dy = cy - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const targetDist = b.r + 10;
          if (dist > targetDist) {
            const spring = 0.008;
            b.vx += (dx / dist) * (dist - targetDist) * spring;
            b.vy += (dy / dist) * (dist - targetDist) * spring;
          }
        }

        for (const other of bubbles) {
          if (other.id === b.id || other.popping) continue;
          const isDraggedOther = isDragging && dragRef.current!.bubbleId === other.id;
          if (isDraggedOther) continue;

          const dx = b.x - other.x;
          const dy = b.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const sameGroup = b.task.groupId && b.task.groupId === other.task.groupId;
          const minDist = sameGroup ? b.r + other.r - 8 : b.r + other.r + 4;

          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            const pushForce = sameGroup ? 0.3 : 0.5;
            b.x += nx * overlap * pushForce;
            b.y += ny * overlap * pushForce;
            other.x -= nx * overlap * pushForce;
            other.y -= ny * overlap * pushForce;
            const bounce = sameGroup ? 0.02 : 0.08;
            b.vx += nx * bounce;
            b.vy += ny * bounce;
            other.vx -= nx * bounce;
            other.vy -= ny * bounce;
          }
        }

        const pad = 4;
        if (b.x - b.r < pad) { b.x = b.r + pad; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x + b.r > W - pad) { b.x = W - b.r - pad; b.vx = -Math.abs(b.vx) * 0.3; }
        if (b.y - b.r < pad) { b.y = b.r + pad; b.vy = Math.abs(b.vy) * 0.3; }
        if (b.y + b.r > H - pad) { b.y = H - b.r - pad; b.vy = -Math.abs(b.vy) * 0.3; }

        if (!inGroup) {
          b.vx += (Math.random() - 0.5) * 0.04;
          b.vy += (Math.random() - 0.5) * 0.04;
        }

        const damp = inGroup ? 0.9 : 0.985;
        b.vx *= damp;
        b.vy *= damp;

        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > MAX_SPEED) {
          b.vx = (b.vx / speed) * MAX_SPEED;
          b.vy = (b.vy / speed) * MAX_SPEED;
        }

        b.x += b.vx;
        b.y += b.vy;
      }

      // Draw group connections
      for (const gid of Object.keys(groups)) {
        const group = groups[gid];
        if (group.length < 2) continue;

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

        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const bb = group[j];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(bb.x, bb.y);
            ctx.strokeStyle = "rgba(100, 90, 122, 0.12)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      // Drag snap preview
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
        const [colorLight, colorDark, colorText] = getColors(b.task);
        const isSelected = selectedIdsRef.current.has(b.id);

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

        // Selected highlight (multi-select)
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(b.x, b.y + wobble, b.r + 6 * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(100, 90, 200, 0.7)";
          ctx.lineWidth = 2.5 * dpr;
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

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

        // Shadow
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

        // Border
        ctx.beginPath();
        ctx.arc(b.x, b.y + wobble, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = isFocused ? "rgba(129, 81, 99, 0.3)" : isGroupCenter ? "rgba(100, 90, 122, 0.2)" : "rgba(169, 179, 186, 0.15)";
        ctx.lineWidth = isFocused ? 2 : isGroupCenter ? 1.5 : 0.5;
        ctx.stroke();

        // Inner glow
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
        const maxChars = Math.floor(b.r / 6.5);
        const label = b.task.title.length > maxChars
          ? b.task.title.slice(0, maxChars - 1) + "\u2026"
          : b.task.title;
        ctx.fillStyle = colorText;
        ctx.fillText(label, b.x, b.y + wobble - 4);

        // Subtitle
        if (b.task.estimatedMinutes) {
          ctx.font = `500 ${Math.max(9, b.r * 0.18)}px "Plus Jakarta Sans", -apple-system, sans-serif`;
          ctx.fillStyle = colorText + "99";
          ctx.fillText(`${b.task.estimatedMinutes}\uBD84`, b.x, b.y + wobble + b.r * 0.32);
        }

        // Group center icon
        if (isGroupCenter) {
          ctx.font = `${Math.max(12, b.r * 0.22)}px -apple-system, sans-serif`;
          ctx.fillText("\u2726", b.x, b.y + wobble - b.r * 0.55);
        }

        ctx.globalAlpha = 1;
      }

      // Draw rect selection overlay
      if (rectSelectRef.current) {
        const { sx, sy, ex, ey } = rectSelectRef.current;
        const rx = Math.min(sx, ex), ry = Math.min(sy, ey);
        const rw = Math.abs(ex - sx), rh = Math.abs(ey - sy);
        ctx.fillStyle = "rgba(100, 90, 200, 0.06)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = "rgba(100, 90, 200, 0.5)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([5 * dpr, 4 * dpr]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, focusedId]);

  // Keyboard handler for confirm popups
  useEffect(() => {
    if (!confirmPop && !confirmGroup && !confirmUngroup) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (confirmPop) { popBubble(confirmPop.id); setConfirmPop(null); }
        else if (confirmGroup) { popGroup(confirmGroup.groupId); setConfirmGroup(null); }
        else if (confirmUngroup) { onUngroup(confirmUngroup.id); setConfirmUngroup(null); }
      } else if (e.key === "Escape") {
        setConfirmPop(null);
        setConfirmGroup(null);
        setConfirmUngroup(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmPop, confirmGroup, confirmUngroup, popBubble, popGroup, onUngroup]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: "block", cursor: "default", touchAction: "none" }}
      />

      {/* Floating action icons on selected bubble */}
      {floatingActions && focusedId && (
        <div
          className="bubble-floating-actions"
          style={{ left: floatingActions.x, top: floatingActions.y }}
        >
          {onAddSub && (
            <button
              className="bfa-btn"
              title="서브 버블 추가"
              onClick={() => { onAddSub(floatingActions.id); setFloatingActions(null); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          {onAiGenerate && (
            <button
              className="bfa-btn ai"
              title="AI 서브태스크 생성"
              onClick={() => { onAiGenerate(floatingActions.id); setFloatingActions(null); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div className="bubble-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}

      {/* Single bubble complete confirm */}
      {confirmPop && (
        <div className="group-confirm" style={{ left: confirmPop.x, top: confirmPop.y }}>
          <p>버블을 터뜨릴까요?</p>
          <div className="group-confirm-actions">
            <button className="gc-btn yes" autoFocus onClick={() => { popBubble(confirmPop.id); setConfirmPop(null); }}>
              네!
            </button>
            <button className="gc-btn no" onClick={() => setConfirmPop(null)}>
              아니요
            </button>
          </div>
        </div>
      )}

      {/* Group complete confirm popup */}
      {confirmGroup && (
        <div className="group-confirm" style={{ left: confirmGroup.x, top: confirmGroup.y }}>
          <p>프로젝트 전체를 완료할까요?</p>
          <div className="group-confirm-actions">
            <button className="gc-btn yes" autoFocus onClick={() => { popGroup(confirmGroup.groupId); setConfirmGroup(null); }}>
              전체 완료!
            </button>
            <button className="gc-btn no" onClick={() => setConfirmGroup(null)}>
              아니요
            </button>
          </div>
        </div>
      )}

      {/* Ungroup confirm popup */}
      {confirmUngroup && (
        <div className="group-confirm" style={{ left: confirmUngroup.x, top: confirmUngroup.y }}>
          <p>그룹에서 분리할까요?</p>
          <div className="group-confirm-actions">
            <button className="gc-btn yes" autoFocus onClick={() => { onUngroup(confirmUngroup.id); setConfirmUngroup(null); }}>
              분리하기
            </button>
            <button className="gc-btn no" onClick={() => setConfirmUngroup(null)}>
              아니요
            </button>
          </div>
        </div>
      )}

      {/* Multi-select action bar */}
      {selectedBubbleIds.length > 0 && multiActionPos && (
        <div className="multi-select-bar" style={{ left: multiActionPos.x, top: multiActionPos.y }}>
          <span className="msb-count">{selectedBubbleIds.length}개 선택</span>
          {onCompleteMultiple && (
            <button className="msb-btn" onClick={() => { onCompleteMultiple(selectedBubbleIds); setSelectedBubbleIds([]); setMultiActionPos(null); }}>
              완료
            </button>
          )}
          {onGroupMultiple && selectedBubbleIds.length > 1 && (
            <button className="msb-btn" onClick={() => { onGroupMultiple(selectedBubbleIds); setSelectedBubbleIds([]); setMultiActionPos(null); }}>
              그룹화
            </button>
          )}
          {onDuplicateMultiple && (
            <button className="msb-btn" onClick={() => { onDuplicateMultiple(selectedBubbleIds); setSelectedBubbleIds([]); setMultiActionPos(null); }}>
              복제
            </button>
          )}
          {onDeleteMultiple && (
            <button className="msb-btn danger" onClick={() => { onDeleteMultiple(selectedBubbleIds); setSelectedBubbleIds([]); setMultiActionPos(null); }}>
              삭제
            </button>
          )}
          <button className="msb-btn cancel" onClick={() => { setSelectedBubbleIds([]); setMultiActionPos(null); }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
