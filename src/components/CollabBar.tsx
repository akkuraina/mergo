"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

interface CollabBarProps {
  docId: string;
  siteId?: string;
}

export default function CollabBar({ docId, siteId: propSiteId }: CollabBarProps) {
  const [copied, setCopied] = useState(false);
  const [presenceCount, setPresenceCount] = useState(1);
  const localSiteIdRef = useRef<string>(propSiteId || "");

  useEffect(() => {
    if (!localSiteIdRef.current) {
      localSiteIdRef.current = crypto.randomUUID();
    }
    const currentSiteId = localSiteIdRef.current;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const channel = supabase.channel(`presence:${docId}`, {
      config: {
        presence: {
          key: currentSiteId,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const activeUsersCount = Object.keys(state).length;
        setPresenceCount(Math.max(1, activeUsersCount));
      })
      .on("presence", { event: "join" }, () => {
        const state = channel.presenceState();
        const activeUsersCount = Object.keys(state).length;
        setPresenceCount(Math.max(1, activeUsersCount));
      })
      .on("presence", { event: "leave" }, () => {
        const state = channel.presenceState();
        const activeUsersCount = Object.keys(state).length;
        setPresenceCount(Math.max(1, activeUsersCount));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            siteId: currentSiteId,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [docId]);

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
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2 text-xs text-[#aaaaaa]">
          <span className="font-medium text-[#eeeeee]">Doc:</span>
          <span className="font-mono text-[#aaaaaa] select-all">{docId}</span>
        </div>

        {/* Presence Indicator */}
        <div className="flex items-center space-x-2 border-l border-[#1a1a1a] pl-6 text-xs text-[#aaaaaa]">
          <div className="flex items-center space-x-1.5">
            {Array.from({ length: presenceCount }).map((_, i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 rounded-full bg-[#1fb622]"
                title={`Participant ${i + 1}`}
              />
            ))}
          </div>
          <span>
            {presenceCount} {presenceCount === 1 ? "editor" : "editors"} online
          </span>
        </div>
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
