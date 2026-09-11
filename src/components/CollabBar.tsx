"use client";

import { useState } from "react";
import Image from "next/image";
import { type PresenceUser, getUserInitials } from "@/lib/editor/collab";

interface CollabBarProps {
  presenceUsers: PresenceUser[];
  currentSiteId?: string;
}

export default function CollabBar({
  presenceUsers,
  currentSiteId,
}: CollabBarProps) {
  const [copied, setCopied] = useState(false);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  const MAX_VISIBLE_AVATARS = 5;
  const visibleUsers = presenceUsers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = Math.max(0, presenceUsers.length - MAX_VISIBLE_AVATARS);

  return (
    <div className="flex h-11 items-center justify-between border-b border-[#1a1a1a] bg-[#0d0d0d] px-6">
      {/* Left: Active Collaborator Avatars */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center -space-x-2">
          {visibleUsers.map((user) => {
            const isCurrent = user.siteId === currentSiteId;
            const initials = getUserInitials(user.name, user.email);
            const isHovered = hoveredSiteId === user.siteId;

            return (
              <div
                key={user.siteId}
                className="relative group cursor-pointer"
                onMouseEnter={() => setHoveredSiteId(user.siteId)}
                onMouseLeave={() => setHoveredSiteId(null)}
              >
                {/* Avatar Circle */}
                <div
                  style={{
                    borderColor: user.color || "#1fb622",
                  }}
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[#141414] text-xs font-semibold text-[#eeeeee] transition-all duration-200 ${
                    user.isTyping
                      ? "ring-2 ring-[#1fb622] ring-offset-2 ring-offset-[#0d0d0d] animate-pulse"
                      : "hover:z-30 hover:scale-105"
                  }`}
                >
                  {user.imageUrl ? (
                    <Image
                      src={user.imageUrl}
                      alt={user.name || "User avatar"}
                      width={28}
                      height={28}
                      className="h-full w-full rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="select-none text-[11px] font-medium tracking-tight">
                      {initials}
                    </span>
                  )}

                  {/* Active Typing Indicator Badge */}
                  {user.isTyping && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#1fb622] ring-1 ring-[#0d0d0d]"
                      title="Typing..."
                    />
                  )}
                </div>

                {/* Hover Tooltip (Full Name + Email) */}
                {isHovered && (
                  <div className="absolute left-1/2 top-9 z-50 -translate-x-1/2 rounded-lg border border-[#1a1a1a] bg-[#141414] px-3 py-2 text-left shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in duration-150">
                    <div className="flex items-center space-x-1.5">
                      <p className="text-xs font-semibold text-[#eeeeee]">
                        {user.name || "Anonymous Collaborator"}
                      </p>
                      {isCurrent && (
                        <span className="rounded bg-[#1a1a1a] px-1 py-0.2 text-[9px] font-medium text-[#aaaaaa]">
                          You
                        </span>
                      )}
                    </div>
                    {user.email && (
                      <p className="text-[11px] text-[#aaaaaa] mt-0.5">
                        {user.email}
                      </p>
                    )}
                    {user.isTyping && (
                      <p className="text-[10px] text-[#1fb622] font-medium mt-1">
                        Typing right now...
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Overflow Avatar Badge (+N) */}
          {overflowCount > 0 && (
            <div
              className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1a1a1a] bg-[#1c1c1c] text-[10px] font-medium text-[#aaaaaa]"
              title={`${overflowCount} more collaborators online`}
            >
              +{overflowCount}
            </div>
          )}
        </div>
      </div>

      {/* Right: Copy Share Link Button */}
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
