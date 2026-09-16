"use client";

import { useState, useEffect, useRef } from "react";
import type { VersionRow } from "@/types/mergo";

interface VersionHistoryProps {
  open: boolean;
  onClose: () => void;
  docId: string;
  selectedVersionId: string | null;
  onPreview: (version: VersionRow) => void;
  onRestore: (versionId: string) => Promise<void>;
  currentUserId: string;
  isOwner?: boolean;
}

function formatDateGroup(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VersionHistory({
  open,
  onClose,
  docId,
  selectedVersionId,
  onPreview,
  onRestore,
  currentUserId,
  isOwner = false,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`);
      if (res.ok) {
        const data: VersionRow[] = await res.json();
        setVersions(data);
      }
    } catch (err) {
      console.error("Failed to fetch versions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSaveVersion = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: versionLabel || null }),
      });
      if (res.ok) {
        const newVersion: VersionRow = await res.json();
        setVersions((prev) => [newVersion, ...prev]);
        setVersionLabel("");
        setShowNameInput(false);
      }
    } catch (err) {
      console.error("Failed to save version:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Group versions by date
  const groupedVersions = versions.reduce<Record<string, VersionRow[]>>(
    (acc, version) => {
      const groupKey = formatDateGroup(version.created_at);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(version);
      return acc;
    },
    {}
  );

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={`version-history-panel fixed top-12 right-0 bottom-0 z-40 flex w-80 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] font-sans text-[var(--text-primary)] transition-transform duration-200 ease-in-out ${
          open
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-x-full"
        }`}
      >
      {/* Panel Header */}
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Save Current Version Action */}
        {showNameInput ? (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="Name this version (optional)..."
              autoFocus
              className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[#1fb622]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveVersion();
                if (e.key === "Escape") setShowNameInput(false);
              }}
            />
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={handleSaveVersion}
                disabled={isSaving}
                className="flex-1 rounded bg-[#1fb622] py-1.5 text-xs font-semibold text-[#060606] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowNameInput(false)}
                className="rounded border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNameInput(true)}
            className="flex h-10 w-full items-center justify-center rounded-md bg-[#1fb622] text-xs font-semibold text-[#060606] transition-opacity hover:opacity-90 shadow-sm"
          >
            Save current version
          </button>
        )}
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {loading && versions.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-faint)]">
            Loading versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-faint)]">
            No versions saved yet. Click &quot;Save current version&quot; above to create one.
          </div>
        ) : (
          Object.entries(groupedVersions).map(([groupTitle, groupItems]) => (
            <div key={groupTitle} className="space-y-1">
              <div className="px-2 py-1 text-[11px] font-medium tracking-wider text-[var(--text-faint)] uppercase">
                {groupTitle}
              </div>
              <div className="space-y-1">
                {groupItems.map((v) => {
                  const isSelected = selectedVersionId === v.id;
                  const isCurrentUser = v.created_by === currentUserId;

                  return (
                    <div
                      key={v.id}
                      onClick={() => onPreview(v)}
                      className={`group relative flex cursor-pointer flex-col rounded-md px-3 py-2.5 transition-colors ${
                        isSelected
                          ? "border-l-2 border-[#1fb622] bg-[var(--bg-elevated)]"
                          : "hover:bg-[var(--bg-elevated)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: isCurrentUser
                                ? "#1fb622"
                                : "var(--text-muted)",
                            }}
                          />
                          <span className="text-xs font-medium text-[var(--text-primary)]">
                            {formatTime(v.created_at)}
                          </span>
                        </div>

                        {/* Three Dots Menu Button */}
                        <div
                          className="relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setMenuOpenId((prev) => (prev === v.id ? null : v.id))
                            }
                            className="hidden h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] group-hover:flex"
                            title="More options"
                          >
                            ⋮
                          </button>

                          {menuOpenId === v.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-6 z-50 w-44 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 shadow-lg text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  onRestore(v.id);
                                }}
                                className="flex w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
                              >
                                Restore this version
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  setRenamingId(v.id);
                                  setRenameLabel(v.label || "");
                                }}
                                className="flex w-full px-3 py-1.5 text-left text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
                              >
                                Name this version
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Author */}
                      <div className="mt-1 pl-4 text-[11px] text-[var(--text-muted)]">
                        {v.created_by_name}
                      </div>

                      {/* Optional Label or Rename Input */}
                      {renamingId === v.id ? (
                        <div
                          className="mt-2 pl-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={renameLabel}
                            onChange={(e) => setRenameLabel(e.target.value)}
                            placeholder="Version name..."
                            autoFocus
                            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[#1fb622]"
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                setVersions((prev) =>
                                  prev.map((item) =>
                                    item.id === v.id
                                      ? {
                                          ...item,
                                          label: renameLabel.trim() || null,
                                        }
                                      : item
                                  )
                                );
                                setRenamingId(null);
                              }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                          />
                        </div>
                      ) : (
                        v.label && (
                          <div className="mt-1 pl-4 text-xs font-medium text-[#1fb622] truncate">
                            &quot;{v.label}&quot;
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {isOwner && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-subtle)",
            marginTop: "auto",
          }}
        >
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Reset all edit history and rebuild from current content? This cannot be undone."
                )
              )
                return;
              const res = await fetch(`/api/documents/${docId}/reset-ops`, {
                method: "POST",
              });
              if (res.ok) {
                alert("Document reset. Reloading...");
                window.location.reload();
              } else {
                alert("Failed to reset document ops.");
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              background: "transparent",
              border: "1px solid #333",
              borderRadius: "6px",
              color: "var(--text-faint)",
              fontSize: "11px",
              fontFamily: "var(--font-geist-mono)",
              cursor: "pointer",
            }}
          >
            Reset op history (repair document)
          </button>
        </div>
      )}
    </div>
    </>
  );
}
