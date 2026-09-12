"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { FontSize } from "@/lib/tiptap/FontSize";
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
import type { Operation } from "@/lib/types";
import type { PresenceUser } from "@/lib/editor/collab";

export interface EditorProps {
  docId: string;
  initialOps: Operation[];
  initialTitle?: string;
  userId: string;
  userName: string;
  userImageUrl: string;
  onPresenceChange: (users: PresenceUser[]) => void;
  onStatsChange: (stats: {
    words: number;
    chars: number;
    pages: number;
    currentPage: number;
  }) => void;
  zoom: number;
  onEditorReady?: (editor: TiptapEditor | null) => void;
}

// ---------------------------------------------------------------------------
// Diff helper
//
// Computes the minimal edit between oldText and newText using a two-pointer
// approach: find divergence from left, then from right.
//
// Returns both the deleted range AND inserted chars so that replace/paste
// operations (where both deleted > 0 AND inserted > 0) are handled correctly.
// ---------------------------------------------------------------------------
interface DiffResult {
  start: number;
  deleted: number;         // number of characters removed starting at `start`
  insertedChars: string[]; // characters to insert starting at `start` (after deletes)
}

function computeDiff(oldText: string, newText: string): DiffResult | null {
  if (oldText === newText) return null;

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
  const insertedChars = newText.slice(start, newEnd).split("");

  if (deleted === 0 && insertedChars.length === 0) return null;

  return { start, deleted, insertedChars };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Editor({
  docId,
  initialOps,
  userId,
  userName,
  userImageUrl,
  onPresenceChange,
  onStatsChange,
  zoom,
  onEditorReady,
}: EditorProps) {
  // Generate siteId once at component creation time — never regenerate.
  const siteIdRef = useRef<string>(crypto.randomUUID());

  // RGA document — initialised once, then mutated through the ref.
  const docRef = useRef<RGADocument>(createDocument(siteIdRef.current));

  // Replay persisted ops exactly once on mount.
  //
  // Uses the same causal pending-queue approach as the live Realtime handler:
  // parse all ops first, then apply them in a loop that retries ops whose
  // predecessor hasn't been applied yet.  This handles two failure modes:
  //
  //   1. Delete ops stored at targetId.clock+1 might collide in clock order
  //      with concurrent inserts from other sites — the queue resolves this.
  //
  //   2. Historical data from before the delete-clock fix (stored at clock=0)
  //      still gets retried; they'll remain in `pending` after all inserts are
  //      applied, then be drained in one final pass.
  const opsReplayedRef = useRef<boolean>(false);
  if (!opsReplayedRef.current) {
    opsReplayedRef.current = true;

    // Parse every row up front, skipping any that can't be deserialised.
    const parsedOps: RGAOp[] = [];
    for (const row of initialOps) {
      try {
        const op: RGAOp =
          typeof row.payload === "string"
            ? deserializeOp(row.payload)
            : deserializeOp(JSON.stringify(row.payload));
        if (op && op.type) parsedOps.push(op);
      } catch (err) {
        console.error("Error parsing op on mount:", err);
      }
    }

    // Apply with a pending queue: keep looping until no progress is made.
    let doc = docRef.current;
    let pending = parsedOps;
    let progress = true;
    while (progress && pending.length > 0) {
      progress = false;
      const stillPending: RGAOp[] = [];
      for (const op of pending) {
        try {
          doc = applyOp(doc, op);
          progress = true; // at least one op succeeded this pass
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("Predecessor not found")) {
            stillPending.push(op); // retry next pass
          } else {
            console.error("Error replaying op on mount (permanent):", err);
          }
        }
      }
      pending = stillPending;
    }

    if (pending.length > 0) {
      console.warn(
        `[mergo] ${pending.length} op(s) could not be replayed — causal chain broken`
      );
    }

    docRef.current = doc;
  }

  const initialText = getVisibleText(docRef.current);
  const [text, setText] = useState<string>(initialText);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);

  // Keep a ref to the Tiptap editor so the Realtime callback always uses the
  // latest instance without being captured in a stale closure.
  const editorRef = useRef<TiptapEditor | null>(null);

  // ---------------------------------------------------------------------------
  // Causal pending queue
  //
  // Supabase Realtime delivers postgres_changes events in non-deterministic
  // order — a client typing fast sends many concurrent HTTP POSTs, and the
  // broadcast can arrive as clock=170 before clock=169.  When applyOp throws
  // "Predecessor not found", the op is NOT discarded; instead it is buffered
  // here.  After every successful apply we drain the queue, repeatedly
  // retrying buffered ops until no further progress is made.
  //
  // This is correct for RGA: a missing predecessor means op N-1 hasn't
  // arrived yet.  Once it arrives and is applied, drainPending() will unblock
  // op N (and any subsequent ops that depended on N).
  // ---------------------------------------------------------------------------
  const pendingOpsRef = useRef<RGAOp[]>([]);

  // ---------------------------------------------------------------------------
  // Persist a single op to Supabase
  // ---------------------------------------------------------------------------
  const persistOp = async (op: RGAOp): Promise<void> => {
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

  // ---------------------------------------------------------------------------
  // Tiptap editor
  // ---------------------------------------------------------------------------
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: initialText,
    editorProps: {
      attributes: {
        class: "mergo-editor-body outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: tiptapEditor }) => {
      // Guard: don't process remote-triggered updates
      if (isRemoteUpdateRef.current) return;

      const newValue = tiptapEditor.getText();
      const oldValue = getVisibleText(docRef.current);
      const diff = computeDiff(oldValue, newValue);

      if (!diff) return;

      let currentDoc = docRef.current;
      const ops: RGAOp[] = [];

      // Deletions first — always delete at `start`, not start+i, because each
      // deletion shifts subsequent visible indices down by 1.
      for (let i = 0; i < diff.deleted; i++) {
        const [newDoc, op] = localDelete(currentDoc, diff.start);
        currentDoc = newDoc;
        ops.push(op);
      }

      // Then insertions sequentially at start, start+1, start+2, …
      for (let i = 0; i < diff.insertedChars.length; i++) {
        const [newDoc, op] = localInsert(
          currentDoc,
          diff.start + i,
          diff.insertedChars[i]
        );
        currentDoc = newDoc;
        ops.push(op);
      }

      // Update CRDT state FIRST, then sync display text from CRDT truth.
      docRef.current = currentDoc;
      setText(getVisibleText(currentDoc));

      ops.forEach((op) => persistOp(op));
    },
  });

  // ---------------------------------------------------------------------------
  // Keep editorRef in sync with the Tiptap instance
  // ---------------------------------------------------------------------------
  useEffect(() => {
    editorRef.current = editor;
    if (onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime — ops + presence
  //
  // `editor` is intentionally NOT in the dependency array.  We access the
  // current editor instance through `editorRef.current` inside the callback,
  // which always points to the latest value without causing the channel to
  // tear-down and re-subscribe on every Tiptap render.
  // ---------------------------------------------------------------------------
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

    /**
     * Try to apply one op to the CRDT.
     * Returns true on success, false if predecessor is still missing.
     * Any other error is logged and treated as a permanent failure (drop the op).
     */
    function tryApplyOp(op: RGAOp): boolean {
      try {
        docRef.current = applyOp(docRef.current, op);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("Predecessor not found")) {
          return false; // expected — will retry from queue
        }
        console.error("Error applying remote op (permanent):", err);
        return false;
      }
    }

    /**
     * After a successful apply, repeatedly scan pendingOpsRef and retry any
     * op whose predecessor is now present.  Loops until a full pass makes no
     * progress.
     */
    function drainPending(): void {
      let progress = true;
      while (progress) {
        progress = false;
        const stillPending: RGAOp[] = [];
        for (const pendingOp of pendingOpsRef.current) {
          if (tryApplyOp(pendingOp)) {
            progress = true;
          } else {
            stillPending.push(pendingOp);
          }
        }
        pendingOpsRef.current = stillPending;
      }
    }

    /**
     * Push the current CRDT state into Tiptap and React state.
     */
    function flushToEditor(): void {
      const newText = getVisibleText(docRef.current);
      const currentEditor = editorRef.current;
      if (currentEditor && newText !== currentEditor.getText()) {
        isRemoteUpdateRef.current = true;
        currentEditor.commands.setContent(newText, { emitUpdate: false });
        isRemoteUpdateRef.current = false;
      }
      setText(newText);
    }

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
          const newRow = payload.new as {
            payload: RGAOp | string;
            site_id: string;
          };

          if (!newRow || !newRow.payload) return;

          // Skip ops this site already applied locally
          if (newRow.site_id === siteIdRef.current) return;

          const incoming: RGAOp =
            typeof newRow.payload === "string"
              ? deserializeOp(newRow.payload)
              : deserializeOp(JSON.stringify(newRow.payload));

          if (!incoming || !incoming.type) return;

          // Try to apply immediately.  If the predecessor is missing
          // (out-of-order delivery), buffer the op and wait for the gap
          // to be filled by a subsequent delivery.
          const applied = tryApplyOp(incoming);
          if (!applied) {
            pendingOpsRef.current.push(incoming);
            return; // don't flush — nothing changed yet
          }

          // Op applied — drain any buffered ops that are now unblocked.
          drainPending();

          // Flush the final CRDT state to Tiptap and React.
          flushToEditor();
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users = Object.values(state).flat() as PresenceUser[];
        onPresenceChange(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            siteId: siteIdRef.current,
            userId,
            userName,
            userImage: userImageUrl,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      pendingOpsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, userId, userName, userImageUrl, onPresenceChange]);

  // ---------------------------------------------------------------------------
  // Page break calculations + stats — run whenever text changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = pageContainerRef.current;
    const wrapper = scrollWrapperRef.current;
    if (!container) return;

    const totalHeight = container.scrollHeight;
    const pageCount = Math.max(1, Math.ceil(totalHeight / 1056));
    setPageBreaks(
      Array.from({ length: pageCount - 1 }, (_, i) => (i + 1) * 1056)
    );

    const scrollTop = wrapper ? wrapper.scrollTop : 0;
    const curPage = Math.min(
      pageCount,
      Math.max(1, Math.floor(scrollTop / 1056) + 1)
    );

    const visibleText = getVisibleText(docRef.current);
    const words = visibleText.trim()
      ? visibleText.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const chars = visibleText.length;

    onStatsChange({ words, chars, pages: pageCount, currentPage: curPage });
  }, [text, onStatsChange]);

  // ---------------------------------------------------------------------------
  // Scroll listener for real-time current page detection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const wrapper = scrollWrapperRef.current;
    if (!wrapper) return;

    const handleScroll = () => {
      const scrollTop = wrapper.scrollTop;
      const container = pageContainerRef.current;
      const totalHeight = container ? container.scrollHeight : 1056;
      const pageCount = Math.max(1, Math.ceil(totalHeight / 1056));
      const curPage = Math.min(
        pageCount,
        Math.max(1, Math.floor(scrollTop / 1056) + 1)
      );

      const visibleText = getVisibleText(docRef.current);
      const words = visibleText.trim()
        ? visibleText.trim().split(/\s+/).filter(Boolean).length
        : 0;
      const chars = visibleText.length;

      onStatsChange({ words, chars, pages: pageCount, currentPage: curPage });
    };

    wrapper.addEventListener("scroll", handleScroll, { passive: true });
    return () => wrapper.removeEventListener("scroll", handleScroll);
  }, [onStatsChange]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div ref={scrollWrapperRef} className="editor-scroll-wrapper">
      <div
        ref={pageContainerRef}
        className="page-container"
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: "top center",
        }}
      >
        {pageBreaks.map((topPos) => (
          <div
            key={topPos}
            className="page-break-line"
            style={{ top: `${topPos}px` }}
          />
        ))}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
