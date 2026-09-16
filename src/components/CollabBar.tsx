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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 md:px-6">
        {/* Left Section: [Mergo wordmark] [/] [Doc title] [Saved indicator] */}
        <div className="flex items-center min-w-0 pr-2">
          <Link
            href="/dashboard"
            className="hover:opacity-80 transition-opacity select-none flex items-center shrink-0"
          >
            <MergoWordmark size="sm" />
          </Link>
          <span className="mx-2 md:mx-3 text-[var(--text-faint)] select-none shrink-0">/</span>
          <div className="flex items-center min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled"
              aria-label="Document title"
              style={{
                width: `${Math.max((title || "Untitled").length, 1)}ch`,
              }}
              className="bg-transparent text-sm font-sans text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] border-none p-0 focus:ring-0 max-w-[calc(100vw-140px)] md:max-w-[360px] truncate"
            />

            {/* Saved indicator — desktop only */}
            {saveStatus === "saved" && (
              <div
                className="hidden md:flex items-center space-x-1 shrink-0 select-none"
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
            <span className="hidden sm:inline-block ml-3 rounded border border-[var(--accent-border)] bg-[var(--accent-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)] select-none shrink-0">
              shared
            </span>
          )}
        </div>

        {/* Desktop Right Section: [avatars] [|] [history icon] [share icon] [theme toggle] */}
        <div className="hidden md:flex items-center" style={{ gap: "8px" }}>
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

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            aria-label="Open menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Sheet Modal */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[199] bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Bottom Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[200] flex flex-col rounded-t-[16px] border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-6 pt-4 pb-8 font-sans shadow-2xl transition-transform duration-200"
          >
            {/* Drag Handle */}
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--border-default)]" />

            {/* Collaborators Section */}
            <div className="mb-4 space-y-2">
              <div className="text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                People in this document ({presenceUsers.length || 1})
              </div>
              <div className="flex flex-col space-y-2 max-h-36 overflow-y-auto">
                {presenceUsers.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] py-1">
                    Just you right now
                  </div>
                ) : (
                  presenceUsers.map((u, i) => (
                    <div key={u.siteId || `${u.userId}-${i}`} className="flex items-center space-x-3 py-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-elevated)] ring-1 ring-[#1fb622] text-xs font-semibold text-[var(--text-primary)]">
                        {u.userImage || u.imageUrl ? (
                          <Image
                            src={(u.userImage || u.imageUrl)!}
                            alt={u.userName || "User"}
                            width={28}
                            height={28}
                            className="h-full w-full rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          getUserInitials(u.userName || "User")
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {u.userName || "Collaborator"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="my-2 border-t border-[var(--border-subtle)]" />

            {/* Actions Menu Rows */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onHistoryOpen?.();
                }}
                className="flex h-12 items-center space-x-3 text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] px-2 rounded-lg transition-colors text-left"
              >
                <span className="text-lg">🕐</span>
                <span>Version History</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleCopy();
                  setMobileMenuOpen(false);
                }}
                className="flex h-12 items-center space-x-3 text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] px-2 rounded-lg transition-colors text-left"
              >
                <span className="text-lg">🔗</span>
                <span>{copied ? "Link copied!" : "Copy link"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  toggle();
                }}
                className="flex h-12 items-center space-x-3 text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] px-2 rounded-lg transition-colors text-left"
              >
                <span className="text-lg">{theme === "dark" ? "☀️" : "🌙"}</span>
                <span>Switch to {theme === "dark" ? "light" : "dark"} mode</span>
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs font-mono text-[var(--text-faint)]">
              <span>Status:</span>
              <span className="flex items-center space-x-1">
                <span className={`h-2 w-2 rounded-full ${saveStatus === "saved" ? "bg-[#1fb622]" : "bg-yellow-500"}`} />
                <span className="capitalize">{saveStatus}</span>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
