"use client";

import { useState } from "react";

interface CollabBarProps {
  docId: string;
}

export default function CollabBar({ docId }: CollabBarProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API fails
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-[#1a1a1a] bg-[#0d0d0d] px-6 py-2.5">
      <div className="flex items-center space-x-3 text-xs text-[#aaaaaa]">
        <span className="font-medium text-[#eeeeee]">Document ID:</span>
        <span className="font-mono text-[#aaaaaa] select-all">{docId}</span>
      </div>
      <button
        onClick={handleCopy}
        className={`inline-flex items-center rounded-lg border border-[#1a1a1a] px-3 py-1.5 text-xs font-medium transition-colors ${
          copied
            ? "border-[#1fb622] bg-[#141414] text-[#cff0c5]"
            : "bg-[#141414] text-[#eeeeee] hover:bg-[#1a1a1a]"
        }`}
      >
        {copied ? "Link Copied!" : "Copy Share Link"}
      </button>
    </div>
  );
}
