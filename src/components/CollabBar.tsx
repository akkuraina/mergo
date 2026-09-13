"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { type PresenceUser, getUserInitials } from "@/lib/editor/collab";

interface CollabBarProps {
  docId: string;
  initialTitle: string;
  presenceUsers: PresenceUser[];
  onHistoryOpen?: () => void;
  role?: "owner" | "collaborator";
}

export default function CollabBar({
  docId,
  initialTitle,
  presenceUsers,
  onHistoryOpen,
  role = "owner",
}: CollabBarProps) {
  const [copied, setCopied] = useState(false);
  const currentTitleRef = useRef<string>(initialTitle || "Untitled");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback if clipboard API fails
    }
  }

  async function handleTitleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const newTitle = e.target.value.trim() || "Untitled";
    if (newTitle === currentTitleRef.current) return;

    currentTitleRef.current = newTitle;
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to update document title:", errorData);
      }
    } catch (err) {
      console.error("Error updating document title:", err);
    }
  }

  const MAX_VISIBLE_AVATARS = 5;
  const visibleUsers = presenceUsers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = Math.max(0, presenceUsers.length - MAX_VISIBLE_AVATARS);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-between border-b border-[#1a1a1a] bg-[#0d0d0d] px-6">
      {/* Left Section: Wordmark + Divider + Inline Editable Title + Shared Badge */}
      <div className="flex items-center space-x-3 flex-1 max-w-md">
        <Link
          href="/dashboard"
          className="text-base font-bold tracking-tight text-[#1fb622] hover:opacity-80 transition-opacity select-none"
        >
          Mergo
        </Link>
        <span className="text-[#333333] select-none">/</span>
        <input
          type="text"
          defaultValue={initialTitle || "Untitled"}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          aria-label="Document title"
          className="w-full bg-transparent text-sm font-sans text-[#eeeeee] outline-none placeholder:text-[#555555] border-none p-0 focus:ring-0"
        />
        {role === "collaborator" && (
          <span className="ml-2 rounded border border-[#1a2e1a] bg-[#0d1a0d] px-2 py-0.5 font-mono text-[11px] text-[#1fb622] select-none">
            shared
          </span>
        )}
      </div>

      {/* Right Section: Avatars + Divider + History Button + Share Button */}
      <div className="flex items-center space-x-3">
        {/* Presence Avatars Stack */}
        <div className="flex items-center">
          {visibleUsers.map((user, idx) => {
            const avatarSrc = user.userImage || user.imageUrl;
            const displayName = user.userName || user.name || "Collaborator";
            const initials = getUserInitials(displayName);

            return (
              <div
                key={user.siteId || `${user.userId}-${idx}`}
                style={{ marginLeft: idx === 0 ? 0 : "-8px" }}
                className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#141414] ring-2 ring-[#1fb622] text-xs font-semibold text-[#eeeeee] transition-transform hover:z-20 hover:scale-105 select-none"
                title={displayName}
              >
                {avatarSrc ? (
                  <Image
                    src={avatarSrc}
                    alt={displayName}
                    width={28}
                    height={28}
                    className="h-full w-full rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="text-[10px] font-medium text-[#eeeeee]">
                    {initials}
                  </span>
                )}
              </div>
            );
          })}

          {/* Overflow Avatar (+N) */}
          {overflowCount > 0 && (
            <div
              style={{ marginLeft: "-8px" }}
              className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#1c1c1c] ring-2 ring-[#1fb622] text-[10px] font-medium text-[#aaaaaa] select-none"
              title={`${overflowCount} more collaborators`}
            >
              +{overflowCount}
            </div>
          )}
        </div>

        {/* Divider */}
        <span className="text-[#333333] select-none">|</span>

        {/* History Button */}
        <button
          type="button"
          onClick={onHistoryOpen}
          className="inline-flex items-center space-x-1.5 rounded-md border border-[#333333] bg-transparent px-3 py-1.5 text-xs font-medium text-[#eeeeee] transition-colors hover:bg-[#1a1a1a]"
          title="Version history"
        >
          <svg
            className="h-3.5 w-3.5 text-[#aaaaaa]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>History</span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center space-x-1.5 rounded-md border border-[#333333] bg-transparent px-3 py-1.5 text-xs font-medium text-[#eeeeee] transition-colors hover:bg-[#1a1a1a]"
        >
          <span>{copied ? "Copied!" : "Share"}</span>
        </button>
      </div>
    </header>
  );
}
