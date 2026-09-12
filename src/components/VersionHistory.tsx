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
    <div
      className={`fixed top-12 right-0 bottom-0 z-40 flex w-80 flex-col border-l border-[#1a1a1a] bg-[#0d0d0d] font-sans text-[#eeeeee] transition-transform duration-200 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ height: "calc(100vh - 48px)" }}
    >
      {/* Panel Header */}
      <div className="border-b border-[#1a1a1a] p-4">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold tracking-wide text-[#eeeeee]">
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-[#aaaaaa] hover:bg-[#1a1a1a] hover:text-white"
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
              className="w-full rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs text-[#eeeeee] outline-none placeholder:text-[#555555] focus:border-[#1fb622]"
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
                className="rounded border border-[#333333] px-3 py-1.5 text-xs text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
          <div className="p-4 text-center text-xs text-[#666666]">
            Loading versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#666666]">
            No versions saved yet. Click &quot;Save current version&quot; above to create one.
          </div>
        ) : (
          Object.entries(groupedVersions).map(([groupTitle, groupItems]) => (
            <div key={groupTitle} className="space-y-1">
              <div className="px-2 py-1 text-[11px] font-medium tracking-wider text-[#666666] uppercase">
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
                          ? "border-l-2 border-[#1fb622] bg-[#1a1a1a]"
                          : "hover:bg-[#141414]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: isCurrentUser ? "#1fb622" : "#aaaaaa",
                            }}
                          />
                          <span className="text-xs font-medium text-[#eeeeee]">
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
                            className="hidden h-6 w-6 items-center justify-center rounded text-[#888888] hover:bg-[#222222] hover:text-white group-hover:flex"
                            title="More options"
                          >
                            ⋮
                          </button>

                          {menuOpenId === v.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-6 z-50 w-44 rounded-md border border-[#222222] bg-[#161616] py-1 shadow-lg text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  onRestore(v.id);
                                }}
                                className="flex w-full px-3 py-1.5 text-left text-[#eeeeee] hover:bg-[#202020]"
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
                                className="flex w-full px-3 py-1.5 text-left text-[#aaaaaa] hover:bg-[#202020]"
                              >
                                Name this version
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Author */}
                      <div className="mt-1 pl-4 text-[11px] text-[#888888]">
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
                            className="w-full rounded border border-[#2a2a2a] bg-[#111111] px-2 py-1 text-xs text-[#eeeeee] outline-none focus:border-[#1fb622]"
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                setVersions((prev) =>
                                  prev.map((item) =>
                                    item.id === v.id
                                      ? { ...item, label: renameLabel.trim() || null }
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
    </div>
  );
}
