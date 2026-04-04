import { useState, useRef, useEffect } from "react";

interface Props {
  getShareLink: () => string;
}

// Simple QR code generator using canvas (no external dependency)
function drawQR(canvas: HTMLCanvasElement, text: string) {
  // Use a minimal QR encoding via the Google Charts API as image
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size);
  };
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=8`;
}

export default function ShareButton({ getShareLink }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const link = getShareLink();
  const shareUrl = permission === "edit" ? link : link ? link + "&mode=view" : "";

  useEffect(() => {
    if (open && canvasRef.current && shareUrl) {
      drawQR(canvasRef.current, shareUrl);
    }
  }, [open, shareUrl]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-wrapper" ref={panelRef}>
      <button className="share-btn" onClick={() => setOpen(!open)} title="공유">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="7" y="7" width="3" height="3" />
          <rect x="14" y="7" width="3" height="3" />
          <rect x="7" y="14" width="3" height="3" />
          <rect x="14" y="14" width="3" height="3" />
        </svg>
      </button>

      {open && (
        <div className="share-panel">
          <div className="share-panel-header">
            <h4>공유하기</h4>
          </div>

          {/* Permission toggle */}
          <div className="share-permission">
            <button
              className={`share-perm-btn ${permission === "view" ? "active" : ""}`}
              onClick={() => setPermission("view")}
            >
              열람만
            </button>
            <button
              className={`share-perm-btn ${permission === "edit" ? "active" : ""}`}
              onClick={() => setPermission("edit")}
            >
              공동 작업
            </button>
          </div>

          {/* QR Code */}
          <div className="share-qr">
            <canvas ref={canvasRef} />
          </div>

          {/* Link + copy */}
          <div className="share-link-row">
            <input className="share-link-input" value={shareUrl} readOnly />
            <button className="share-copy-btn" onClick={handleCopy}>
              {copied ? "복사됨!" : "복사"}
            </button>
          </div>

          <p className="share-hint">
            {permission === "view"
              ? "링크를 받은 사람은 태스크를 볼 수만 있어요"
              : "링크를 받은 사람도 태스크를 추가/수정할 수 있어요"}
          </p>
        </div>
      )}
    </div>
  );
}
