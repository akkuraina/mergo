"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { type PresenceUser, getUserInitials } from "@/lib/editor/collab";
import { ThemeToggle } from "./ThemeToggle";
import { MergoWordmark } from "./MergoWordmark";

interface CollabBarProps {
  docId: string;
  initialTitle: string;
  presenceUsers: PresenceUser[];
  onHistoryOpen?: () => void;
  role?: "owner" | "collaborator";
  saveStatus?: "saved" | "saving" | "unsaved";
}

export default function CollabBar({
  docId,
  initialTitle,
  presenceUsers,
  onHistoryOpen,
  role = "owner",
  saveStatus = "saved",
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
    <header className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6">
      {/* Left Section: Wordmark + Divider + Inline Editable Title + Save Status + Shared Badge */}
      <div className="flex items-center space-x-3 flex-1 max-w-xl">
        <Link
          href="/dashboard"
          className="hover:opacity-80 transition-opacity select-none flex items-center"
        >
          <MergoWordmark size="sm" />
        </Link>
        <span className="text-[var(--text-faint)] select-none">/</span>
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <input
            type="text"
            defaultValue={initialTitle || "Untitled"}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            aria-label="Document title"
            className="w-full bg-transparent text-sm font-sans text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] border-none p-0 focus:ring-0"
          />

          {/* Cloud Save Status Indicator */}
          {saveStatus === "saving" ? (
            <div
              className="flex items-center space-x-1 text-xs text-[var(--text-muted)] animate-pulse shrink-0"
              title="Saving changes..."
            >
              <svg
                className="w-3.5 h-3.5 animate-spin text-[#1fb622]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span className="hidden sm:inline text-[10px]">Saving...</span>
            </div>
          ) : saveStatus === "unsaved" ? (
            <div
              className="flex items-center space-x-1 text-xs text-[var(--text-faint)] shrink-0"
              title="Unsaved changes — autosaves every 10s or press Ctrl+S"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500/80 animate-pulse" />
              <span className="hidden sm:inline text-[10px]">Unsaved</span>
            </div>
          ) : (
            <div
              className="flex items-center space-x-1 text-xs text-[var(--text-muted)] shrink-0"
              title="All changes saved to cloud (Autosave active & Ctrl+S ready)"
            >
              <svg
                className="w-3.5 h-3.5 text-[#1fb622]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                <path d="m9 13 2 2 4-4" />
              </svg>
              <span className="hidden md:inline text-[10px] text-[var(--text-faint)]">
                Saved
              </span>
            </div>
          )}
        </div>
        {role === "collaborator" && (
          <span className="ml-2 rounded border border-[var(--accent-border)] bg-[var(--accent-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)] select-none shrink-0">
            shared
          </span>
        )}
      </div>

      {/* Right Section: Avatars + Divider + History Button + ThemeToggle + Share Button */}
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
                className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-elevated)] ring-2 ring-[#1fb622] text-xs font-semibold text-[var(--text-primary)] transition-transform hover:z-20 hover:scale-105 select-none"
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
                  <span className="text-[10px] font-medium text-[var(--text-primary)]">
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
              className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-elevated)] ring-2 ring-[#1fb622] text-[10px] font-medium text-[var(--text-muted)] select-none"
              title={`${overflowCount} more collaborators`}
            >
              +{overflowCount}
            </div>
          )}
        </div>

        {/* Divider */}
        <span className="text-[var(--text-faint)] select-none">|</span>

        {/* History Button */}
        <button
          type="button"
          onClick={onHistoryOpen}
          className="inline-flex items-center space-x-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--border-subtle)]"
          title="Version history"
        >
          <svg
            className="h-3.5 w-3.5 text-[var(--text-muted)]"
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

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Share Button */}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center space-x-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--border-subtle)]"
        >
          <span>{copied ? "Copied!" : "Share"}</span>
        </button>
      </div>
    </header>
  );
}
