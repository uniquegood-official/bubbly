import { useState, useRef, useEffect, useCallback } from "react";

type SharePermission = "viewer" | "editor";

interface Props {
  getShareLink: (role: SharePermission, options?: { rotate?: boolean }) => Promise<string>;
  withLabel?: boolean;
}

function drawQR(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = 160;
  canvas.width = size;
  canvas.height = size;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
  };
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=8`;
}

export default function ShareButton({ getShareLink, withLabel = false }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [permission, setPermission] = useState<SharePermission>("viewer");
  const [shareUrl, setShareUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadShareLink = useCallback(
    async (nextPermission: SharePermission, rotate = false) => {
      setLoading(true);
      setError(null);

      try {
        const url = await getShareLink(nextPermission, { rotate });
        setShareUrl(url);
      } catch (err) {
        console.error("Failed to prepare share link:", err);
        setShareUrl("");
        setError("공유 링크를 준비하지 못했어요");
      } finally {
        setLoading(false);
      }
    },
    [getShareLink],
  );

  useEffect(() => {
    if (!open) return;
    void loadShareLink(permission);
  }, [open, permission, loadShareLink]);

  useEffect(() => {
    if (open && canvasRef.current && shareUrl) {
      drawQR(canvasRef.current, shareUrl);
    }
  }, [open, shareUrl]);

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
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSystemShare = async () => {
    if (!shareUrl || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: permission === "viewer" ? "Bubbly 열람 링크" : "Bubbly 공동 작업 링크",
        text: permission === "viewer" ? "버블 보드를 열람할 수 있는 링크예요." : "버블 보드에 함께 참여할 수 있는 링크예요.",
        url: shareUrl,
      });
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("System share failed:", err);
    }
  };

  return (
    <div className="share-wrapper" ref={panelRef}>
      <button className={`share-btn ${withLabel ? "with-label" : ""}`} onClick={() => setOpen((prev) => !prev)} title="공유">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="7" y="7" width="3" height="3" />
          <rect x="14" y="7" width="3" height="3" />
          <rect x="7" y="14" width="3" height="3" />
          <rect x="14" y="14" width="3" height="3" />
        </svg>
        {withLabel && <span>공유</span>}
      </button>

      {open && (
        <div className="share-panel">
          <div className="share-panel-header">
            <h4>공유하기</h4>
            <button
              className="share-refresh-btn"
              type="button"
              onClick={() => void loadShareLink(permission, true)}
              disabled={loading}
              title="링크 재발급"
            >
              새 링크
            </button>
          </div>

          <div className="share-permission">
            <button
              className={`share-perm-btn ${permission === "viewer" ? "active" : ""}`}
              onClick={() => setPermission("viewer")}
            >
              열람만
            </button>
            <button
              className={`share-perm-btn ${permission === "editor" ? "active" : ""}`}
              onClick={() => setPermission("editor")}
            >
              공동 작업
            </button>
          </div>

          <div className="share-status-card">
            <div className="share-status-title">{permission === "viewer" ? "읽기 전용 링크" : "편집 가능한 링크"}</div>
            <p className="share-status-copy">
              {permission === "viewer"
                ? "로그인한 사용자가 버블을 열람할 수 있어요."
                : "로그인한 사용자가 버블을 추가, 수정, 완료할 수 있어요."}
            </p>
          </div>

          {loading ? (
            <div className="share-loading">링크 준비 중...</div>
          ) : error ? (
            <div className="share-error">{error}</div>
          ) : (
            <>
              <div className="share-link-row">
                <input className="share-link-input" value={shareUrl} readOnly />
                <button className="share-copy-btn" onClick={handleCopy} disabled={!shareUrl}>
                  {copied ? "복사됨!" : "복사"}
                </button>
              </div>

              {typeof navigator.share === "function" && (
                <button className="share-native-btn" onClick={handleSystemShare} disabled={!shareUrl}>
                  {shared ? "공유됨!" : "시스템 공유"}
                </button>
              )}

              <div className="share-qr">
                <canvas ref={canvasRef} />
              </div>
            </>
          )}

          <p className="share-hint">
            공유 링크는 로그인 후 역할에 맞게 워크스페이스에 참여시켜요. 새 링크를 만들면 이전 링크는 즉시 비활성화됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
