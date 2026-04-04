import { useState } from "react";

interface Props {
  getShareLink: () => string;
}

export default function ShareButton({ getShareLink }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const link = getShareLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button className="share-btn" onClick={handleCopy}>
      {copied ? "복사됨!" : "공유 링크"}
    </button>
  );
}
