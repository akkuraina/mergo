"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { type PresenceUser, getUserInitials } from "@/lib/editor/collab";
import { useTheme } from "./ThemeProvider";
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
  const [title, setTitle] = useState(initialTitle || "Untitled");
  const currentTitleRef = useRef<string>(initialTitle || "Untitled");
  const { theme, toggle } = useTheme();

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
    setTitle(newTitle);
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

  const actionButtonStyles: React.CSSProperties = {
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 150ms ease",
  };

  const tooltipStyles: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    fontSize: "11px",
    fontFamily: "var(--font-geist-mono), monospace",
    padding: "4px 8px",
    borderRadius: "4px",
    zIndex: 100,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6">
      {/* Left Section: [Mergo wordmark] [/] [Doc title] [Saved indicator] */}
      <div className="flex items-center">
        <Link
          href="/dashboard"
          className="hover:opacity-80 transition-opacity select-none flex items-center"
        >
          <MergoWordmark size="sm" />
        </Link>
        <span className="mx-3 text-[var(--text-faint)] select-none">/</span>
        <div className="flex items-center">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            aria-label="Document title"
            style={{
              width: `${Math.max((title || "Untitled").length, 1)}ch`,
              maxWidth: "360px",
            }}
            className="bg-transparent text-sm font-sans text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] border-none p-0 focus:ring-0"
          />

          {/* Saved indicator — immediately after title input, only visible when saved state is true */}
          {saveStatus === "saved" && (
            <div
              className="flex items-center space-x-1 shrink-0 select-none"
              style={{
                marginLeft: "4px",
                color: "var(--text-faint)",
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "11px",
              }}
              title="All changes saved"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-[var(--text-faint)]"
              >
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                <path d="m9 13 2 2 4-4" />
              </svg>
              <span>Saved</span>
            </div>
          )}
        </div>
        {role === "collaborator" && (
          <span className="ml-3 rounded border border-[var(--accent-border)] bg-[var(--accent-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)] select-none shrink-0">
            shared
          </span>
        )}
      </div>

      {/* Right Section: [avatars] [|] [history icon] [share icon] [theme toggle] */}
      <div className="flex items-center" style={{ gap: "8px" }}>
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

        {/* Divider between avatars and action buttons */}
        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border-default)",
            alignSelf: "center",
          }}
        />

        {/* 1. History button */}
        <div className="group relative inline-flex">
          <button
            type="button"
            onClick={onHistoryOpen}
            style={actionButtonStyles}
            className="hover:bg-[var(--bg-elevated)]"
            aria-label="History"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          <span
            style={tooltipStyles}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-sm"
          >
            History
          </span>
        </div>

        {/* 2. Share button */}
        <div className="group relative inline-flex">
          <button
            type="button"
            onClick={handleCopy}
            style={actionButtonStyles}
            className="hover:bg-[var(--bg-elevated)]"
            aria-label="Copy link"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={copied ? "#1fb622" : "currentColor"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          <span
            style={tooltipStyles}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-sm"
          >
            Copy link
          </span>
        </div>

        {/* 3. Theme toggle */}
        <div className="group relative inline-flex">
          <button
            type="button"
            onClick={toggle}
            style={actionButtonStyles}
            className="hover:bg-[var(--bg-elevated)]"
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f5c518"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <span
            style={tooltipStyles}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-sm"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </div>
      </div>
    </header>
  );
}
