import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n, LOCALES } from "../lib/i18n";
import { useAuth } from "../lib/useAuth";
import type { Priority } from "../types/task";
import { BUBBLE_COLORS } from "../types/task";
import "./LandingPage.css";

/* ── Demo bubble physics for Hero ── */

const PRIORITY_RADIUS: Record<number, number> = { 1: 30, 2: 40, 3: 52, 4: 66, 5: 82 };
const PRIORITY_COLORS: Record<number, [string, string, string]> = {
  1: ["#d0dce5", "#9badb8", "#3a4a54"],
  2: ["#8ae0d4", "#3c9e90", "#1a4a44"],
  3: ["#b8a4f0", "#7b5fcf", "#2d1a5e"],
  4: ["#f0a090", "#c0604a", "#5c1a0e"],
  5: ["#e87090", "#b83050", "#4a0a1e"],
};

interface DemoBubble {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  title: string;
  colors: [string, string, string];
  popping: boolean;
  popProgress: number;
  respawnTimer: number;
}

const DEMO_TASKS: { title: string; priority: Priority; color?: string }[] = [
  { title: "Launch MVP", priority: 5, color: "rose" },
  { title: "Design review", priority: 3, color: "violet" },
  { title: "Bug fix", priority: 2, color: "sky" },
  { title: "Team sync", priority: 4, color: "emerald" },
  { title: "Write docs", priority: 1, color: "amber" },
  { title: "User research", priority: 3, color: "pink" },
];

function getColor(priority: Priority, colorId?: string): [string, string, string] {
  if (colorId && colorId !== "default") {
    const c = BUBBLE_COLORS.find((bc) => bc.id === colorId);
    if (c && c.light) return [c.light, c.dark, c.text];
  }
  return PRIORITY_COLORS[priority];
}

function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<DemoBubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const initBubbles = useCallback((w: number, h: number) => {
    bubblesRef.current = DEMO_TASKS.map((t, i) => ({
      id: `demo-${i}`,
      x: Math.random() * w * 0.6 + w * 0.2,
      y: Math.random() * h * 0.6 + h * 0.2,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: PRIORITY_RADIUS[t.priority],
      title: t.title,
      colors: getColor(t.priority, t.color),
      popping: false,
      popProgress: 0,
      respawnTimer: 0,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (bubblesRef.current.length === 0) initBubbles(rect.width, rect.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouseRef.current = null; };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const b of bubblesRef.current) {
        const dx = b.x - mx, dy = b.y - my;
        if (dx * dx + dy * dy < b.r * b.r && !b.popping) {
          b.popping = true;
          b.popProgress = 0;
          break;
        }
      }
    };
    canvas.addEventListener("mousemove", onMouse);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);

    // Touch support
    const onTouch = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch) mouseRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const onTouchEnd = (e: TouchEvent) => {
      mouseRef.current = null;
      // trigger pop on tap
      if (e.changedTouches[0]) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.changedTouches[0].clientX - rect.left;
        const my = e.changedTouches[0].clientY - rect.top;
        for (const b of bubblesRef.current) {
          const dx = b.x - mx, dy = b.y - my;
          if (dx * dx + dy * dy < b.r * b.r && !b.popping) {
            b.popping = true;
            b.popProgress = 0;
            break;
          }
        }
      }
    };
    canvas.addEventListener("touchmove", onTouch, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    const loop = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      const bubbles = bubblesRef.current;

      for (const b of bubbles) {
        // Pop animation
        if (b.popping) {
          b.popProgress += 0.03;
          if (b.popProgress >= 1) {
            b.popping = false;
            b.popProgress = 0;
            b.respawnTimer = 120; // respawn after ~2s
            b.x = -200;
            b.y = -200;
          }
          continue;
        }

        // Respawn
        if (b.respawnTimer > 0) {
          b.respawnTimer--;
          if (b.respawnTimer === 0) {
            b.x = Math.random() * w * 0.6 + w * 0.2;
            b.y = Math.random() * h * 0.6 + h * 0.2;
            b.vx = (Math.random() - 0.5) * 0.5;
            b.vy = (Math.random() - 0.5) * 0.5;
          }
          continue;
        }

        // Mouse repel
        if (mouseRef.current) {
          const dx = b.x - mouseRef.current.x;
          const dy = b.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < b.r + 80 && dist > 0) {
            const force = (b.r + 80 - dist) * 0.003;
            b.vx += (dx / dist) * force;
            b.vy += (dy / dist) * force;
          }
        }

        // Bubble-bubble collision
        for (const o of bubbles) {
          if (o.id === b.id || o.popping || o.respawnTimer > 0) continue;
          const dx = b.x - o.x, dy = b.y - o.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = b.r + o.r + 4;
          if (dist < minDist && dist > 0) {
            const force = (minDist - dist) * 0.01;
            b.vx += (dx / dist) * force;
            b.vy += (dy / dist) * force;
          }
        }

        // Drift
        b.vx *= 0.98;
        b.vy *= 0.98;
        b.x += b.vx;
        b.y += b.vy;

        // Bounds
        if (b.x - b.r < 0) { b.x = b.r; b.vx *= -0.5; }
        if (b.x + b.r > w) { b.x = w - b.r; b.vx *= -0.5; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy *= -0.5; }
        if (b.y + b.r > h) { b.y = h - b.r; b.vy *= -0.5; }
      }

      // Draw
      for (const b of bubbles) {
        if (b.respawnTimer > 0) continue;

        if (b.popping) {
          // Pop effect — expanding ring + particles
          const p = b.popProgress;
          const expandR = b.r * (1 + p * 2);
          ctx.globalAlpha = 1 - p;
          ctx.beginPath();
          ctx.arc(b.x, b.y, expandR, 0, Math.PI * 2);
          ctx.fillStyle = b.colors[0];
          ctx.fill();
          // Particles
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const pr = b.r + p * 60;
            const px = b.x + Math.cos(angle) * pr;
            const py = b.y + Math.sin(angle) * pr;
            ctx.beginPath();
            ctx.arc(px, py, 3 * (1 - p), 0, Math.PI * 2);
            ctx.fillStyle = b.colors[1];
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          continue;
        }

        // Shadow
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.08)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;

        // Body
        const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
        grad.addColorStop(0, b.colors[0]);
        grad.addColorStop(1, b.colors[1]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Highlight
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();

        // Label
        const fontSize = Math.max(10, b.r * 0.28);
        ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = b.colors[2];
        // Truncate
        let label = b.title;
        const maxW = b.r * 1.5;
        if (ctx.measureText(label).width > maxW) {
          while (label.length > 0 && ctx.measureText(label + "...").width > maxW) label = label.slice(0, -1);
          label += "...";
        }
        ctx.fillText(label, b.x, b.y);
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [dpr, initBubbles]);

  return <canvas ref={canvasRef} className="hero-canvas" />;
}

/* ── Scroll fade-in hook ── */

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeSection({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useFadeIn();
  return (
    <div ref={ref} className={`fade-section ${className ?? ""}`}>
      {children}
    </div>
  );
}

/* ── Floating flags animation ── */

function FloatingFlags() {
  return (
    <div className="floating-flags">
      {LOCALES.map((l, i) => (
        <span key={l.code} className="flag-bubble" style={{ animationDelay: `${i * 0.3}s` }}>
          {l.flag}
        </span>
      ))}
    </div>
  );
}

/* ── Comparison data ── */

const COMPETITORS = [
  {
    name: "Bubbly",
    highlight: true,
    visual: "Bubble Canvas",
    grouping: "Drag & Collide",
    completion: "Pop!",
    ai: "Sub-task breakdown",
    timer: "Glow Ring",
    noLogin: true,
    price: "Free",
  },
  { name: "Todoist", visual: "List", grouping: "Folders", completion: "Check", ai: "-", timer: "-", noLogin: false, price: "$4/mo" },
  { name: "Things 3", visual: "List", grouping: "Areas", completion: "Check", ai: "-", timer: "-", noLogin: true, price: "$50" },
  { name: "TickTick", visual: "List", grouping: "Folders", completion: "Check", ai: "-", timer: "Pomodoro", noLogin: false, price: "$3/mo" },
  { name: "Any.do", visual: "List", grouping: "Boards", completion: "Check", ai: "Assistant", timer: "-", noLogin: false, price: "Freemium" },
  { name: "Superlist", visual: "List", grouping: "Nesting", completion: "Check", ai: "Voice", timer: "-", noLogin: false, price: "Freemium" },
];

/* ── Main Landing Page ── */

export default function LandingPage() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Redirect logged-in users to app
  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [loading, user, navigate]);

  const goApp = () => navigate("/app");

  return (
    <div className="landing">
      {/* Language Selector */}
      <div className="landing-lang">
        <select value={locale} onChange={(e) => setLocale(e.target.value as any)}>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
          ))}
        </select>
      </div>

      {/* ─── Section 1: Hero ─── */}
      <section className="hero-section">
        <div className="hero-canvas-wrap">
          <HeroCanvas />
        </div>
        <div className="hero-content">
          <h1 className="hero-title">{t("landing.hero.title")}</h1>
          <p className="hero-sub">{t("landing.hero.sub")}</p>
          <div className="hero-actions">
            <button className="cta-primary" onClick={goApp}>{t("landing.hero.cta")}</button>
            <a href="#features" className="cta-secondary">{t("landing.hero.demo")}</a>
          </div>
        </div>
      </section>

      {/* ─── Section 2: Social Proof Bar ─── */}
      <FadeSection className="proof-bar">
        <span>{t("landing.proof")}</span>
      </FadeSection>

      {/* ─── Section 3: Why Bubbly? ─── */}
      <FadeSection className="why-section" >
        <h2 className="section-title" id="features">{t("landing.why.title")}</h2>
        <div className="why-grid">
          <div className="why-card">
            <div className="why-icon">
              <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="20" r="14" fill="var(--primary-container)" /><circle cx="14" cy="32" r="8" fill="var(--secondary-container)" /><circle cx="36" cy="34" r="6" fill="var(--tertiary-container)" /></svg>
            </div>
            <h3>{t("landing.why.visual.title")}</h3>
            <p>{t("landing.why.visual.desc")}</p>
          </div>
          <div className="why-card">
            <div className="why-icon">
              <svg viewBox="0 0 48 48" fill="none"><circle cx="18" cy="24" r="10" fill="var(--secondary-container)" stroke="var(--secondary)" strokeWidth="2" /><circle cx="30" cy="24" r="10" fill="var(--primary-container)" stroke="var(--primary)" strokeWidth="2" /><path d="M24 17v14" stroke="var(--on-surface)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
            </div>
            <h3>{t("landing.why.group.title")}</h3>
            <p>{t("landing.why.group.desc")}</p>
          </div>
          <div className="why-card">
            <div className="why-icon">
              <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="14" fill="var(--primary-container)" /><path d="M18 18l12 12M30 18l-12 12" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" /><circle cx="12" cy="12" r="3" fill="var(--danger)" /><circle cx="36" cy="12" r="2" fill="var(--secondary)" /><circle cx="36" cy="36" r="2.5" fill="var(--tertiary-dim)" /><circle cx="12" cy="36" r="2" fill="var(--primary-dim)" /></svg>
            </div>
            <h3>{t("landing.why.pop.title")}</h3>
            <p>{t("landing.why.pop.desc")}</p>
          </div>
        </div>
      </FadeSection>

      {/* ─── Section 4: Feature Showcase ─── */}
      <div className="showcase-section">
        <FadeSection className="showcase-row">
          <div className="showcase-visual">
            <div className="showcase-placeholder">
              <svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="50" r="30" fill="var(--primary-container)" /><circle cx="40" cy="80" r="14" fill="var(--secondary-container)" /><circle cx="75" cy="85" r="11" fill="var(--tertiary-container)" /><circle cx="85" cy="65" r="8" fill="var(--primary-dim)" opacity="0.6" /><path d="M60 38v24M48 50h24" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
          </div>
          <div className="showcase-text">
            <h3>{t("landing.feat.ai.title")}</h3>
            <p>{t("landing.feat.ai.desc")}</p>
          </div>
        </FadeSection>

        <FadeSection className="showcase-row reverse">
          <div className="showcase-visual">
            <div className="showcase-placeholder">
              <svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="40" fill="none" stroke="var(--primary-container)" strokeWidth="6" /><circle cx="60" cy="60" r="40" fill="none" stroke="var(--primary)" strokeWidth="4" strokeDasharray="180 72" strokeLinecap="round" /><circle cx="60" cy="60" r="6" fill="var(--primary)" /><text x="60" y="62" textAnchor="middle" fontSize="12" fill="var(--on-surface)" fontWeight="600">25:00</text></svg>
            </div>
          </div>
          <div className="showcase-text">
            <h3>{t("landing.feat.timer.title")}</h3>
            <p>{t("landing.feat.timer.desc")}</p>
          </div>
        </FadeSection>

        <FadeSection className="showcase-row">
          <div className="showcase-visual">
            <div className="showcase-placeholder dual">
              <div className="device-mock desktop">
                <svg viewBox="0 0 60 40" fill="none"><rect x="2" y="2" width="56" height="32" rx="3" fill="var(--surface-low)" stroke="var(--primary-dim)" strokeWidth="1" /><circle cx="20" cy="16" r="6" fill="var(--primary-container)" /><circle cx="38" cy="14" r="4" fill="var(--secondary-container)" /><circle cx="30" cy="24" r="5" fill="var(--tertiary-container)" /><rect x="22" y="36" width="16" height="2" rx="1" fill="var(--primary-dim)" /></svg>
              </div>
              <div className="device-mock mobile">
                <svg viewBox="0 0 28 48" fill="none"><rect x="2" y="2" width="24" height="44" rx="4" fill="var(--surface-low)" stroke="var(--primary-dim)" strokeWidth="1" /><circle cx="14" cy="20" r="5" fill="var(--primary-container)" /><circle cx="10" cy="30" r="3" fill="var(--secondary-container)" /><circle cx="18" cy="32" r="3.5" fill="var(--tertiary-container)" /></svg>
              </div>
            </div>
          </div>
          <div className="showcase-text">
            <h3>{t("landing.feat.sync.title")}</h3>
            <p>{t("landing.feat.sync.desc")}</p>
          </div>
        </FadeSection>

        <FadeSection className="showcase-row reverse">
          <div className="showcase-visual">
            <div className="showcase-placeholder">
              <svg viewBox="0 0 120 120" fill="none"><rect x="20" y="40" width="80" height="40" rx="12" fill="var(--surface-low)" /><path d="M40 60l-12 0" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" /><path d="M55 60l10 0" stroke="var(--secondary)" strokeWidth="2.5" strokeLinecap="round" /><path d="M80 60l12 0" stroke="var(--tertiary-dim)" strokeWidth="2.5" strokeLinecap="round" /><text x="60" y="90" textAnchor="middle" fontSize="10" fill="var(--on-surface-variant)" fontWeight="500">Cmd+Z</text></svg>
            </div>
          </div>
          <div className="showcase-text">
            <h3>{t("landing.feat.undo.title")}</h3>
            <p>{t("landing.feat.undo.desc")}</p>
          </div>
        </FadeSection>
      </div>

      {/* ─── Section 5: Comparison ─── */}
      <FadeSection className="compare-section">
        <h2 className="section-title">{t("landing.compare.title")}</h2>

        {/* Desktop table */}
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th></th>
                {COMPETITORS.map((c) => (
                  <th key={c.name} className={c.highlight ? "highlight" : ""}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("landing.compare.visual")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.visual}</td>
                ))}
              </tr>
              <tr>
                <td>{t("landing.compare.grouping")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.grouping}</td>
                ))}
              </tr>
              <tr>
                <td>{t("landing.compare.completion")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.completion}</td>
                ))}
              </tr>
              <tr>
                <td>{t("landing.compare.ai")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.ai}</td>
                ))}
              </tr>
              <tr>
                <td>{t("landing.compare.timer")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.timer}</td>
                ))}
              </tr>
              <tr>
                <td>{t("landing.compare.noLogin")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.noLogin ? "O" : "X"}</td>
                ))}
              </tr>
              <tr>
                <td>{t("landing.compare.price")}</td>
                {COMPETITORS.map((c) => (
                  <td key={c.name} className={c.highlight ? "highlight" : ""}>{c.price}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="compare-cards">
          {COMPETITORS.map((c) => (
            <div key={c.name} className={`compare-card ${c.highlight ? "highlight" : ""}`}>
              <h4>{c.name}</h4>
              <ul>
                <li><span>{t("landing.compare.visual")}</span><span>{c.visual}</span></li>
                <li><span>{t("landing.compare.grouping")}</span><span>{c.grouping}</span></li>
                <li><span>{t("landing.compare.completion")}</span><span>{c.completion}</span></li>
                <li><span>{t("landing.compare.ai")}</span><span>{c.ai}</span></li>
                <li><span>{t("landing.compare.timer")}</span><span>{c.timer}</span></li>
                <li><span>{t("landing.compare.noLogin")}</span><span>{c.noLogin ? "O" : "X"}</span></li>
                <li><span>{t("landing.compare.price")}</span><span>{c.price}</span></li>
              </ul>
            </div>
          ))}
        </div>
      </FadeSection>

      {/* ─── Section 6: Languages ─── */}
      <FadeSection className="lang-section">
        <h2 className="section-title">{t("landing.lang.title")}</h2>
        <FloatingFlags />
      </FadeSection>

      {/* ─── Section 7: Final CTA ─── */}
      <section className="final-cta">
        <h2>{t("landing.cta.title")}</h2>
        <p className="cta-sub">{t("landing.cta.sub")}</p>
        <button className="cta-primary" onClick={goApp}>{t("landing.cta.btn")}</button>
        <p className="cta-hint">{t("landing.cta.hint")}</p>
      </section>
    </div>
  );
}
