"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import {
  createDocument,
  localInsert,
  localDelete,
  applyOp,
  getVisibleText,
  deserializeOp,
  type RGADocument,
  type RGAOp,
} from "@/lib/crdt/rga";
import type { Document, Operation } from "@/lib/types";
import {
  type PresenceUser,
  getUserColor,
} from "@/lib/editor/collab";
import CollabBar from "@/components/CollabBar";
import RemoteCursors from "@/components/RemoteCursors";

interface EditorProps {
  document: Document;
  initialOps: Operation[];
  initialTitle?: string;
}

function computeDiff(
  oldText: string,
  newText: string
):
  | { type: "insert"; index: number; chars: string[] }
  | { type: "delete"; index: number; count: number }
  | null {
  let start = 0;
  while (
    start < oldText.length &&
    start < newText.length &&
    oldText[start] === newText[start]
  ) {
    start++;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  const deleted = oldEnd - start;
  const inserted = newEnd - start;

  if (inserted > 0 && deleted === 0) {
    return {
      type: "insert",
      index: start,
      chars: newText.slice(start, newEnd).split(""),
    };
  }
  if (deleted > 0 && inserted === 0) {
    return { type: "delete", index: start, count: deleted };
  }
  if (deleted > 0 && inserted > 0) {
    return { type: "delete", index: start, count: deleted };
  }
  return null;
}

export default function Editor({
  document: docEntity,
  initialOps,
  initialTitle,
}: EditorProps) {
  const docId = docEntity.id;
  const { user } = useUser();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const siteIdRef = useRef<string>("");
  if (!siteIdRef.current) {
    siteIdRef.current = crypto.randomUUID();
  }

  const docRef = useRef<RGADocument | null>(null);
  if (!docRef.current) {
    let rgaDoc = createDocument(siteIdRef.current);
    for (const rawOp of initialOps) {
      const op: RGAOp =
        typeof rawOp.payload === "string"
          ? deserializeOp(rawOp.payload)
          : deserializeOp(JSON.stringify(rawOp.payload));

      if (op && op.type) {
        rgaDoc = applyOp(rgaDoc, op);
      }
    }
    docRef.current = rgaDoc;
  }

  const currentTitleRef = useRef<string>(
    initialTitle ?? docEntity.title ?? "Untitled"
  );
  const [text, setText] = useState<string>(() =>
    getVisibleText(docRef.current!)
  );

  // Live presence users list
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const isTypingRef = useRef<boolean>(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cursorThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCursorRef = useRef<{
    index: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null>(null);

  const userColor = getUserColor(user?.id || siteIdRef.current);
  const userName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    "Collaborator";
  const userEmail = user?.primaryEmailAddress?.emailAddress || "";
  const userAvatar = user?.imageUrl || "";

  // Helper to broadcast presence state
  const broadcastPresence = useCallback(
    async (
      customCursor?: {
        index: number;
        selectionStart?: number;
        selectionEnd?: number;
      } | null,
      customTyping?: boolean
    ) => {
      if (!channelRef.current) return;

      const activeCursor =
        customCursor !== undefined ? customCursor : lastCursorRef.current;
      const activeTyping =
        customTyping !== undefined ? customTyping : isTypingRef.current;

      const payload: PresenceUser = {
        siteId: siteIdRef.current,
        userId: user?.id || siteIdRef.current,
        name: userName,
        email: userEmail,
        imageUrl: userAvatar,
        color: userColor,
        isTyping: activeTyping,
        cursor: activeCursor,
        lastActive: Date.now(),
      };

      try {
        await channelRef.current.track(payload);
      } catch {
        // Ignore tracking error
      }
    },
    [user?.id, userName, userEmail, userAvatar, userColor]
  );

  // Sync cursor with throttle
  const syncCursor = useCallback(
    (textarea: HTMLTextAreaElement) => {
      const cursorData = {
        index: textarea.selectionStart,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      };
      lastCursorRef.current = cursorData;

      if (cursorThrottleTimerRef.current) return;
      cursorThrottleTimerRef.current = setTimeout(() => {
        cursorThrottleTimerRef.current = null;
        broadcastPresence(lastCursorRef.current);
      }, 50);
    },
    [broadcastPresence]
  );

  // Realtime channel setup for operations and presence
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const channel = supabase.channel(`doc-${docId}`, {
      config: {
        presence: {
          key: siteIdRef.current,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "operations",
          filter: `doc_id=eq.${docId}`,
        },
        (payload) => {
          try {
            const newRow = payload.new as {
              payload: RGAOp | string;
              site_id: string;
            };

            if (!newRow || !newRow.payload) return;
            if (newRow.site_id === siteIdRef.current) return;

            const incoming: RGAOp =
              typeof newRow.payload === "string"
                ? deserializeOp(newRow.payload)
                : deserializeOp(JSON.stringify(newRow.payload));

            if (docRef.current && incoming && incoming.type) {
              docRef.current = applyOp(docRef.current, incoming);
              setText(getVisibleText(docRef.current));
            }
          } catch (err) {
            console.error("Error applying remote op:", err);
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const allUsers: PresenceUser[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key];
          if (presences && presences.length > 0) {
            allUsers.push(presences[0]);
          }
        }
        setPresenceUsers(allUsers);
      })
      .on("presence", { event: "join" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const allUsers: PresenceUser[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key];
          if (presences && presences.length > 0) {
            allUsers.push(presences[0]);
          }
        }
        setPresenceUsers(allUsers);
      })
      .on("presence", { event: "leave" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const allUsers: PresenceUser[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key];
          if (presences && presences.length > 0) {
            allUsers.push(presences[0]);
          }
        }
        setPresenceUsers(allUsers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await broadcastPresence(null, false);
        }
      });

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (cursorThrottleTimerRef.current)
        clearTimeout(cursorThrottleTimerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [docId, broadcastPresence]);

  const persistOp = async (op: RGAOp) => {
    try {
      await fetch(`/api/documents/${docId}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, siteId: siteIdRef.current }),
      });
    } catch (err) {
      console.error("Failed to persist operation:", err);
    }
  };

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

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!docRef.current) return;
    const newValue = e.target.value;
    const oldValue = getVisibleText(docRef.current);
    const diff = computeDiff(oldValue, newValue);

    // Track active typing
    isTypingRef.current = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      broadcastPresence(lastCursorRef.current, false);
    }, 1500);

    syncCursor(e.target);

    if (!diff) return;

    if (diff.type === "insert") {
      let currentDoc = docRef.current;
      const ops: RGAOp[] = [];
      for (let i = 0; i < diff.chars.length; i++) {
        const [newDoc, op] = localInsert(
          currentDoc,
          diff.index + i,
          diff.chars[i]
        );
        currentDoc = newDoc;
        ops.push(op);
      }
      docRef.current = currentDoc;
      setText(getVisibleText(currentDoc));
      ops.forEach((op) => persistOp(op));
    }

    if (diff.type === "delete") {
      let currentDoc = docRef.current;
      const ops: RGAOp[] = [];
      for (let i = 0; i < diff.count; i++) {
        const [newDoc, op] = localDelete(currentDoc, diff.index);
        currentDoc = newDoc;
        ops.push(op);
      }
      docRef.current = currentDoc;
      setText(getVisibleText(currentDoc));
      ops.forEach((op) => persistOp(op));
    }
  };

  const handleSelectionOrCursorChange = (
    e: React.SyntheticEvent<HTMLTextAreaElement>
  ) => {
    syncCursor(e.currentTarget);
  };

  const handleBlur = () => {
    lastCursorRef.current = null;
    broadcastPresence(null, false);
  };

  const remoteUsers = presenceUsers.filter(
    (u) => u.siteId !== siteIdRef.current
  );

  return (
    <div className="flex flex-1 flex-col w-full">
      {/* Collaboration Bar */}
      <CollabBar
        presenceUsers={presenceUsers}
        currentSiteId={siteIdRef.current}
      />

      {/* Document Workspace */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-8 py-8 space-y-6">
        <input
          type="text"
          defaultValue={currentTitleRef.current}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          aria-label="Document title"
          className="w-full border-none bg-transparent text-3xl font-bold tracking-tight text-[#eeeeee] outline-none placeholder:text-[#444444]"
        />

        <div className="relative flex-1 flex flex-col min-h-[500px]">
          {/* Remote Cursors and Collaborative Selection Overlay */}
          <RemoteCursors
            textareaRef={textareaRef}
            remoteUsers={remoteUsers}
            text={text}
          />

          {/* Main Editing Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onClick={handleSelectionOrCursorChange}
            onKeyUp={handleSelectionOrCursorChange}
            onKeyDown={handleSelectionOrCursorChange}
            onSelect={handleSelectionOrCursorChange}
            onFocus={handleSelectionOrCursorChange}
            onBlur={handleBlur}
            placeholder="Start writing..."
            spellCheck={false}
            autoFocus
            className="w-full flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-[#eeeeee] outline-none placeholder:text-[#444444] min-h-[500px] border-none p-0 selection:bg-[#222222] relative z-10"
          />
        </div>
      </main>
    </div>
  );
}
