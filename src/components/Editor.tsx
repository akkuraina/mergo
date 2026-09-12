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
import type { VersionRow } from "@/types/mergo";

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
  previewMode?: boolean;
  previewVersion?: VersionRow | null;
  onExitPreview?: () => void;
  onRestoreVersion?: (versionId: string) => Promise<void>;
  historyOpen?: boolean;
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
  previewMode = false,
  previewVersion = null,
  onExitPreview,
  onRestoreVersion,
  historyOpen = false,
}: EditorProps) {
  // Generate siteId once at component creation time — never regenerate.
  const siteIdRef = useRef<string>(crypto.randomUUID());

  // RGA document — initialised once, then mutated through the ref.
  const docRef = useRef<RGADocument>(createDocument(siteIdRef.current));

  const previewModeRef = useRef<boolean>(previewMode);
  previewModeRef.current = previewMode;

  const opCountRef = useRef<number>(0);

  // Replay persisted ops exactly once on mount.
  //
  // Uses the same causal pending-queue approach as the live Realtime handler:
  // parse all ops first, then apply them in a loop that retries ops whose
  // predecessor hasn't been applied yet.
  const opsReplayedRef = useRef<boolean>(false);
  const initialRichContentRef = useRef<Record<string, unknown> | null>(null);

  if (!opsReplayedRef.current) {
    opsReplayedRef.current = true;

    // Check for any persisted snapshots (take the latest snapshot if available)
    for (let i = initialOps.length - 1; i >= 0; i--) {
      const row = initialOps[i];
      try {
        const payload =
          typeof row.payload === "string"
            ? JSON.parse(row.payload)
            : row.payload;
        if (row.op_type === "snapshot" || payload?.type === "snapshot") {
          if (payload?.content) {
            initialRichContentRef.current = payload.content as Record<string, unknown>;
            break;
          }
        }
      } catch {
        // ignore parse error for snapshot detection
      }
    }

    // Parse every row up front, skipping any that can't be deserialised.
    const parsedOps: RGAOp[] = [];
    for (const row of initialOps) {
      if (row.op_type === "snapshot") continue;
      try {
        const op: RGAOp =
          typeof row.payload === "string"
            ? deserializeOp(row.payload)
            : deserializeOp(JSON.stringify(row.payload));
        if (op && (op.type === "insert" || op.type === "delete")) {
          parsedOps.push(op);
        }
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
  const snapshotTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  // ---------------------------------------------------------------------------
  const pendingOpsRef = useRef<RGAOp[]>([]);

  // ---------------------------------------------------------------------------
  // Persist a single op to Supabase (with auto-versioning every 50 ops)
  // ---------------------------------------------------------------------------
  const persistOp = async (op: RGAOp): Promise<void> => {
    if (previewModeRef.current) return;
    try {
      await fetch(`/api/documents/${docId}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, siteId: siteIdRef.current }),
      });

      opCountRef.current++;
      if (opCountRef.current % 50 === 0) {
        fetch(`/api/documents/${docId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: null }),
        }).catch((err) => console.error("Auto-version save failed:", err));
      }
    } catch (err) {
      console.error("Failed to persist operation:", err);
    }
  };

  const debouncedSaveSnapshot = (json: Record<string, unknown>) => {
    if (previewModeRef.current) return;
    if (snapshotTimeoutRef.current) {
      clearTimeout(snapshotTimeoutRef.current);
    }
    snapshotTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/documents/${docId}/ops`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: {
              type: "snapshot",
              content: json,
            },
            siteId: siteIdRef.current,
          }),
        });
      } catch (err) {
        console.error("Failed to persist snapshot:", err);
      }
    }, 1500);
  };

  // ---------------------------------------------------------------------------
  // Tiptap editor
  // ---------------------------------------------------------------------------
  const editor = useEditor({
    immediatelyRender: false,
    editable: !previewMode,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: initialRichContentRef.current || (initialText.length > 0 ? initialText : undefined),
    editorProps: {
      attributes: {
        class: "mergo-editor-body outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: tiptapEditor }) => {
      // Guard: don't process remote-triggered updates or preview edits
      if (isRemoteUpdateRef.current || previewModeRef.current) return;

      const json = tiptapEditor.getJSON() as Record<string, unknown>;

      // 1. Broadcast rich JSON document immediately over Supabase Realtime channel
      if (channelRef.current) {
        channelRef.current
          .send({
            type: "broadcast",
            event: "doc_rich_update",
            payload: {
              siteId: siteIdRef.current,
              json,
            },
          })
          .catch((err) => {
            console.error("Failed to broadcast rich update:", err);
          });
      }

      // 2. Debounce persist snapshot
      debouncedSaveSnapshot(json);

      // 3. Diff text and generate RGA CRDT ops
      const newValue = tiptapEditor.getText();
      const oldValue = getVisibleText(docRef.current);
      const diff = computeDiff(oldValue, newValue);

      setText(newValue);

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

      // Update CRDT state
      docRef.current = currentDoc;

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
  // Handle preview mode transitions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    if (previewMode && previewVersion) {
      currentEditor.setEditable(false);
      isRemoteUpdateRef.current = true;
      currentEditor.commands.setContent(previewVersion.snapshot_text, {
        emitUpdate: false,
      });
      isRemoteUpdateRef.current = false;
      setText(previewVersion.snapshot_text);
    } else {
      currentEditor.setEditable(true);
      const currentDocText = getVisibleText(docRef.current);
      isRemoteUpdateRef.current = true;
      currentEditor.commands.setContent(
        initialRichContentRef.current || (currentDocText.length > 0 ? currentDocText : ""),
        { emitUpdate: false }
      );
      isRemoteUpdateRef.current = false;
      setText(currentDocText);
    }
  }, [previewMode, previewVersion]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime — ops + presence + broadcast
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
     * Push the current CRDT state into Tiptap and React state if needed.
     */
    function flushToEditor(): void {
      if (previewModeRef.current) return;
      const newText = getVisibleText(docRef.current);
      const currentEditor = editorRef.current;
      if (currentEditor) {
        const curText = currentEditor.getText();
        if (curText.length === 0 && newText.length > 0) {
          isRemoteUpdateRef.current = true;
          currentEditor.commands.setContent(newText, { emitUpdate: false });
          isRemoteUpdateRef.current = false;
        }
      }
      setText(newText);
    }

    channel
      .on(
        "broadcast",
        { event: "doc_rich_update" },
        ({ payload }) => {
          if (previewModeRef.current) return;
          if (!payload || payload.siteId === siteIdRef.current || !payload.json) return;
          const currentEditor = editorRef.current;
          if (!currentEditor) return;

          isRemoteUpdateRef.current = true;
          currentEditor.commands.setContent(payload.json, { emitUpdate: false });
          isRemoteUpdateRef.current = false;

          const visible = currentEditor.getText();
          setText(visible);
        }
      )
      .on(
        "broadcast",
        { event: "request_sync" },
        ({ payload }) => {
          if (!payload || payload.siteId === siteIdRef.current) return;
          const currentEditor = editorRef.current;
          if (!currentEditor) return;
          const json = currentEditor.getJSON() as Record<string, unknown>;
          channel
            .send({
              type: "broadcast",
              event: "doc_rich_update",
              payload: {
                siteId: siteIdRef.current,
                json,
              },
            })
            .catch(console.error);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "operations",
          filter: `doc_id=eq.${docId}`,
        },
        (payload) => {
          if (previewModeRef.current) return;

          const newRow = payload.new as {
            payload: RGAOp | Record<string, unknown> | string;
            site_id: string;
            op_type?: string;
          };

          if (!newRow || !newRow.payload) return;

          // Skip ops this site already applied locally
          if (newRow.site_id === siteIdRef.current) return;

          if (newRow.op_type === "snapshot") return;

          const incoming: RGAOp =
            typeof newRow.payload === "string"
              ? deserializeOp(newRow.payload)
              : deserializeOp(JSON.stringify(newRow.payload));

          if (!incoming || !incoming.type || (incoming as unknown as { type: string }).type === "snapshot") return;

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

          // Flush CRDT state.
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
          // Request latest rich document from any online peer
          channel
            .send({
              type: "broadcast",
              event: "request_sync",
              payload: { siteId: siteIdRef.current },
            })
            .catch(() => {});
        }
      });

    return () => {
      if (snapshotTimeoutRef.current) {
        clearTimeout(snapshotTimeoutRef.current);
      }
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

    const visibleText = previewMode && previewVersion ? previewVersion.snapshot_text : getVisibleText(docRef.current);
    const words = visibleText.trim()
      ? visibleText.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const chars = visibleText.length;

    onStatsChange({ words, chars, pages: pageCount, currentPage: curPage });
  }, [text, onStatsChange, previewMode, previewVersion]);

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

      const visibleText = previewMode && previewVersion ? previewVersion.snapshot_text : getVisibleText(docRef.current);
      const words = visibleText.trim()
        ? visibleText.trim().split(/\s+/).filter(Boolean).length
        : 0;
      const chars = visibleText.length;

      onStatsChange({ words, chars, pages: pageCount, currentPage: curPage });
    };

    wrapper.addEventListener("scroll", handleScroll, { passive: true });
    return () => wrapper.removeEventListener("scroll", handleScroll);
  }, [onStatsChange, previewMode, previewVersion]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Preview Mode Banner */}
      {previewMode && previewVersion && (
        <div className="fixed top-[92px] left-0 right-0 z-30 flex h-11 items-center justify-between border-b border-[#1fb622] bg-[#1a1a1a] px-6 text-[13px] font-sans text-[#eeeeee]">
          <div>
            Viewing version from{" "}
            <span className="font-medium">
              {new Date(previewVersion.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>{" "}
            by <span className="font-medium">{previewVersion.created_by_name}</span>
            {previewVersion.label ? ` ("${previewVersion.label}")` : ""}
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={() => onRestoreVersion?.(previewVersion.id)}
              className="text-[#1fb622] hover:underline font-medium cursor-pointer"
            >
              Restore this version
            </button>
            <button
              type="button"
              onClick={onExitPreview}
              className="text-[#aaaaaa] hover:text-white cursor-pointer"
            >
              Back to current version
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollWrapperRef}
        className="editor-scroll-wrapper"
        style={{
          top: previewMode ? "136px" : "92px",
          right: historyOpen ? "320px" : "0",
          transition: "right 200ms ease, top 150ms ease",
        }}
      >
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
    </>
  );
}
