"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { FontSize } from "@/lib/tiptap/FontSize";
import { HorizontalRuler, VerticalRuler, type DocMargins } from "./DocRuler";
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
  initialTiptapContent?: Record<string, unknown> | null;
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
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
  onNotify?: (msg: string) => void;
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
// Diff-reconciliation helpers for CRDT sync without wiping formatting
// ---------------------------------------------------------------------------

function textPosToPmPos(editor: TiptapEditor, textIndex: number): number | null {
  const doc = editor.state.doc;
  const docSize = doc.content.size;

  if (textIndex === 0) return 1; // start of first block content

  let charsSeen = 0;

  for (let i = 0; i < doc.childCount; i++) {
    const block = doc.child(i);
    const blockLen = block.textContent.length;

    if (textIndex <= charsSeen + blockLen) {
      // Target is inside this block
      const offsetInBlock = textIndex - charsSeen;

      // Walk into the block to find exact position
      let blockStart = 0;
      for (let j = 0; j < i; j++) {
        blockStart += doc.child(j).nodeSize;
      }
      // +1 for the opening token of the block node
      const blockContentStart = blockStart + 1;

      // Walk inline nodes within block
      let inlineOffset = 0;
      let pmOffset = blockContentStart;

      for (let k = 0; k < block.childCount; k++) {
        const inline = block.child(k);
        if (inline.isText && inline.text) {
          const inlineLen = inline.text.length;
          if (offsetInBlock <= inlineOffset + inlineLen) {
            return pmOffset + (offsetInBlock - inlineOffset);
          }
          inlineOffset += inlineLen;
          pmOffset += inlineLen;
        } else {
          pmOffset += inline.nodeSize;
        }
      }

      // End of block
      return Math.min(blockContentStart + blockLen, docSize);
    }

    charsSeen += blockLen;
    // +1 for the \n separator between blocks
    if (i < doc.childCount - 1) charsSeen += 1;
  }

  return docSize;
}

function reconcileTiptapWithRGA(editor: TiptapEditor, rgaText: string): void {
  const pmText = editor.getText({ blockSeparator: "\n" });

  if (pmText === rgaText) return; // already in sync — nothing to do

  // Find the first position where they diverge (from left)
  let start = 0;
  while (start < pmText.length && start < rgaText.length && pmText[start] === rgaText[start]) {
    start++;
  }

  // Find the last position where they diverge (from right)
  let pmEnd = pmText.length;
  let rgaEnd = rgaText.length;
  while (pmEnd > start && rgaEnd > start && pmText[pmEnd - 1] === rgaText[rgaEnd - 1]) {
    pmEnd--;
    rgaEnd--;
  }

  // pmText[start..pmEnd] needs to become rgaText[start..rgaEnd]
  const toDelete = pmEnd - start; // chars to remove from ProseMirror
  const toInsert = rgaText.slice(start, rgaEnd); // chars to insert

  // Convert text index to ProseMirror position using resolve
  const pmStartPos = textPosToPmPos(editor, start);
  const pmEndPos = textPosToPmPos(editor, start + toDelete);

  if (pmStartPos === null || pmEndPos === null) return;
  if (pmStartPos < 0 || pmEndPos > editor.state.doc.content.size) return;
  if (pmStartPos > pmEndPos) return;

  try {
    // Build a single transaction: delete the diverged range, then insert correct content
    const tr = editor.state.tr;

    if (toDelete > 0) {
      tr.delete(pmStartPos, pmEndPos);
    }

    if (toInsert.length > 0) {
      // Split by newlines — each \n becomes a paragraph break
      const segments = toInsert.split("\n");
      let insertPos = pmStartPos;

      for (let i = 0; i < segments.length; i++) {
        if (segments[i].length > 0) {
          tr.insertText(segments[i], insertPos);
          insertPos += segments[i].length;
        }
        if (i < segments.length - 1) {
          // Insert paragraph break
          const $pos = tr.doc.resolve(insertPos);
          tr.split($pos.pos);
          insertPos += 2; // ProseMirror split adds 2 positions (close + open node)
        }
      }
    }

    tr.setMeta("isRemoteOp", true); // tag so onUpdate can ignore it
    editor.view.dispatch(tr);
  } catch (e) {
    console.error("reconcileTiptapWithRGA failed:", e, { pmText, rgaText, start, toDelete, toInsert });
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Editor({
  docId,
  initialOps,
  initialTiptapContent,
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
  onSaveStatusChange,
  onNotify,
}: EditorProps) {
  // Generate siteId once at component creation time — never regenerate.
  const siteIdRef = useRef<string>(crypto.randomUUID());

  // RGA document — initialised once, then mutated through the ref.
  const docRef = useRef<RGADocument>(createDocument(siteIdRef.current));

  const previewModeRef = useRef<boolean>(previewMode);
  previewModeRef.current = previewMode;

  const opCountRef = useRef<number>(0);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef<boolean>(false);

  const [text, setText] = useState<string>("");
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Interactive Document Margins state
  const [margins, setMargins] = useState<DocMargins>({
    top: 96,
    bottom: 96,
    left: 96,
    right: 96,
  });

  const [guideline, setGuideline] = useState<{
    type: "vertical" | "horizontal";
    pos: number;
    label?: string;
  } | null>(null);

  const handleMarginChange = useCallback((newMargins: Partial<DocMargins>) => {
    setMargins((prev) => ({ ...prev, ...newMargins }));
  }, []);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);

  // Keep a ref to the Tiptap editor so the Realtime callback always uses the
  // latest instance without being captured in a stale closure.
  const editorRef = useRef<TiptapEditor | null>(null);

  // Keep onPresenceChange in a ref so the Realtime useEffect can use it without
  // being re-added to the dependency array (which would tear down and recreate
  // the channel on every parent re-render).
  const onPresenceChangeRef = useRef(onPresenceChange);
  useEffect(() => {
    onPresenceChangeRef.current = onPresenceChange;
  }, [onPresenceChange]);

  // ---------------------------------------------------------------------------
  // Causal pending queue for remote Realtime ops
  // ---------------------------------------------------------------------------
  const pendingOpsRef = useRef<RGAOp[]>([]);

  // ---------------------------------------------------------------------------
  // Persist operations to Supabase in batches (with auto-versioning every 50 ops)
  // ---------------------------------------------------------------------------
  const persistOps = async (ops: RGAOp[]): Promise<void> => {
    if (previewModeRef.current || !ops || ops.length === 0) return;
    try {
      const res = await fetch(`/api/documents/${docId}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, siteId: siteIdRef.current }),
      });

      if (!res.ok) return;

      opCountRef.current += ops.length;
      if (opCountRef.current >= 50) {
        opCountRef.current = 0;
        fetch(`/api/documents/${docId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: null }),
        }).catch(() => {});
      }
    } catch {
      // Ignored if cancelled during navigation or reload
    }
  };

  // ---------------------------------------------------------------------------
  // Immediate Save Function (used by Ctrl+S, Autosave timer, and debounced save)
  // ---------------------------------------------------------------------------
  const saveImmediately = useCallback(
    async (showFeedback = false) => {
      if (previewModeRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const currentEditor = editorRef.current;
      if (!currentEditor) return;

      onSaveStatusChange?.("saving");
      const json = currentEditor.getJSON();

      try {
        const res = await fetch(`/api/documents/${docId}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tiptap_content: json }),
        });

        if (res.ok) {
          isDirtyRef.current = false;
          onSaveStatusChange?.("saved");
          if (showFeedback) {
            onNotify?.("All changes saved");
          }
        } else {
          onSaveStatusChange?.("unsaved");
        }
      } catch (err) {
        console.error("Failed to persist tiptap content:", err);
        onSaveStatusChange?.("unsaved");
      }
    },
    [docId, onNotify, onSaveStatusChange]
  );

  // ---------------------------------------------------------------------------
  // Persist Tiptap JSON content on every edit (debounced 1500ms)
  // ---------------------------------------------------------------------------
  const saveTiptapContent = useCallback(() => {
    if (previewModeRef.current) return;
    isDirtyRef.current = true;
    onSaveStatusChange?.("unsaved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      const currentEditor = editorRef.current;
      if (!currentEditor) {
        console.warn("saveTiptapContent: editor not ready");
        return;
      }
      const json = currentEditor.getJSON();
      console.log("Saving Tiptap JSON:", JSON.stringify(json).slice(0, 200));
      onSaveStatusChange?.("saving");
      try {
        const res = await fetch(`/api/documents/${docId}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tiptap_content: json }),
        });
        const body = await res.json();
        console.log("Tiptap save response:", res.status, body);
        if (res.ok) {
          isDirtyRef.current = false;
          onSaveStatusChange?.("saved");
        } else {
          onSaveStatusChange?.("unsaved");
        }
      } catch (err) {
        console.error("Tiptap save fetch error:", err);
        onSaveStatusChange?.("unsaved");
      }
    }, 1500);
  }, [docId, onSaveStatusChange]);

  // ---------------------------------------------------------------------------
  // 10-Second Recurring Autosave
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      if (previewModeRef.current) return;
      if (isDirtyRef.current) {
        saveImmediately(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [saveImmediately]);

  // ---------------------------------------------------------------------------
  // Ctrl+S / Cmd+S Keyboard Shortcut
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        saveImmediately(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [saveImmediately]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Tiptap editor
  // ---------------------------------------------------------------------------
  const editor = useEditor({
    immediatelyRender: false,
    editable: !previewMode,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: initialTiptapContent || undefined,
    editorProps: {
      attributes: {
        class: "mergo-editor-body outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: tiptapEditor, transaction }) => {
      // PRIMARY GATE — check transaction meta first
      // This is synchronous and cannot race
      if (transaction.getMeta("isRemoteOp")) return;

      // SECONDARY GATE — belt and suspenders
      if (isRemoteUpdateRef.current || previewModeRef.current) return;

      editorRef.current = tiptapEditor;

      // Always save Tiptap JSON — formatting may have changed even if text didn't
      saveTiptapContent();

      const newText = tiptapEditor.getText({ blockSeparator: "\n" });
      const oldText = getVisibleText(docRef.current);

      // Only generate RGA ops if plain text changed
      if (newText === oldText) return;

      const diff = computeDiff(oldText, newText);
      if (!diff) return;

      const { start, deleted, insertedChars } = diff;

      // Sanity check: the diff should be small (1-5 chars for normal typing)
      // If it's huge, we're in a feedback loop — bail out
      if (deleted + insertedChars.length > 50) {
        console.warn("onUpdate diff too large — skipping RGA op generation", {
          deleted,
          inserted: insertedChars.length,
          oldLen: oldText.length,
          newLen: newText.length,
        });
        return;
      }

      if (insertedChars.includes("\n")) {
        console.log("Enter key detected — inserting newline at RGA index", start);
      }
      if (deleted > 0 && oldText[start] === "\n") {
        console.log("Backspace at paragraph boundary — deleting newline at RGA index", start);
      }

      let currentDoc = docRef.current;
      const ops: RGAOp[] = [];

      // Deletions first — always delete at `start`, not start+i, because each
      // deletion shifts subsequent visible indices down by 1.
      for (let i = 0; i < deleted; i++) {
        const [newDoc, op] = localDelete(currentDoc, start);
        currentDoc = newDoc;
        ops.push(op);
      }

      // Then insertions sequentially at start, start+1, start+2, …
      for (let i = 0; i < insertedChars.length; i++) {
        const [newDoc, op] = localInsert(
          currentDoc,
          start + i,
          insertedChars[i]
        );
        currentDoc = newDoc;
        ops.push(op);
      }

      // Update CRDT state
      docRef.current = currentDoc;
      setText(getVisibleText(currentDoc));

      if (ops.length > 0) {
        persistOps(ops);
      }
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
  // Load initial content into Tiptap on mount (JSON first, plaintext fallback)
  // ---------------------------------------------------------------------------
  const initialMountLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    // 1. Replay ops into RGA (for CRDT state)
    let doc = docRef.current;
    const sorted = [...initialOps].sort((a, b) => a.clock - b.clock);
    for (const row of sorted) {
      if (row.op_type === "snapshot") continue;
      try {
        const op: RGAOp =
          typeof row.payload === "string"
            ? deserializeOp(row.payload)
            : deserializeOp(JSON.stringify(row.payload));
        if (op && (op.type === "insert" || op.type === "delete")) {
          doc = applyOp(doc, op);
        }
      } catch (e) {
        console.error("Op replay error:", e);
      }
    }
    docRef.current = doc;
    setText(getVisibleText(doc));

    console.log("Loading Tiptap content on mount:", {
      hasJson: !!initialTiptapContent,
      jsonKeys: initialTiptapContent ? Object.keys(initialTiptapContent) : [],
      jsonPreview: JSON.stringify(initialTiptapContent)?.slice(0, 200),
    });

    // 2. Load Tiptap content with a tick delay to ensure editor is mounted
    if (!editor) return;

    if (!initialMountLoadedRef.current) {
      initialMountLoadedRef.current = true;
      setTimeout(() => {
        if (!editorRef.current) return;
        isRemoteUpdateRef.current = true;
        if (initialTiptapContent && Object.keys(initialTiptapContent).length > 0) {
          console.log("Setting Tiptap content from JSON");
          editorRef.current.commands.setContent(initialTiptapContent, { emitUpdate: false });
        } else {
          const plainText = getVisibleText(doc);
          if (plainText) {
            console.log("Setting Tiptap content from plain text fallback");
            editorRef.current.commands.setContent(plainText, { emitUpdate: false });
          }
        }
        setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 0);
      }, 0);
    }
  }, [editor, initialOps, initialTiptapContent]);

  // ---------------------------------------------------------------------------
  // Handle preview mode transitions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    if (previewMode && previewVersion) {
      currentEditor.setEditable(false);
      isRemoteUpdateRef.current = true;
      if (previewVersion.tiptap_content) {
        currentEditor.commands.setContent(previewVersion.tiptap_content, {
          emitUpdate: false,
        });
      } else {
        currentEditor.commands.setContent(previewVersion.snapshot_text, {
          emitUpdate: false,
        });
      }
      setTimeout(() => { isRemoteUpdateRef.current = false; }, 0);
      setText(previewVersion.snapshot_text);
    } else {
      currentEditor.setEditable(true);
      const currentDocText = getVisibleText(docRef.current);
      isRemoteUpdateRef.current = true;
      if (initialTiptapContent) {
        currentEditor.commands.setContent(initialTiptapContent, {
          emitUpdate: false,
        });
      } else {
        currentEditor.commands.setContent(
          currentDocText.length > 0 ? currentDocText : "",
          { emitUpdate: false }
        );
      }
      setTimeout(() => { isRemoteUpdateRef.current = false; }, 0);
      setText(currentDocText);
    }
  }, [previewMode, previewVersion, initialTiptapContent]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime — ops + presence + tiptap_content formatting
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
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

          console.log("Remote op received:", incoming.type);

          try {
            // Try to apply immediately.  If the predecessor is missing
            // (out-of-order delivery), buffer the op and wait for the gap
            // to be filled by a subsequent delivery.
            const applied = tryApplyOp(incoming);
            if (!applied) {
              pendingOpsRef.current.push(incoming);
              return;
            }

            // Op applied — drain any buffered ops that are now unblocked.
            drainPending();

            const newRgaText = getVisibleText(docRef.current);
            setText(newRgaText);

            if (editorRef.current) {
              isRemoteUpdateRef.current = true;
              reconcileTiptapWithRGA(editorRef.current, newRgaText);
              setTimeout(() => {
                isRemoteUpdateRef.current = false;
              }, 0);
            }
          } catch (e) {
            console.error("Remote op error:", e);
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users = Object.values(state).flat() as PresenceUser[];
        // Read from ref — never close over the prop directly so this effect
        // stays stable with dep array [docId, userId, userName, userImageUrl].
        onPresenceChangeRef.current(users);
      })
      .subscribe(async (status) => {
        console.log("Realtime status:", status);
        if (status === "SUBSCRIBED") {
          await channel.track({
            siteId: siteIdRef.current,
            userId,
            userName,
            userImage: userImageUrl,
          });
        }
      });

    // Content channel — sync rich formatting updates from remote clients
    // Note: ensure `ALTER PUBLICATION supabase_realtime ADD TABLE documents;` is executed in Supabase SQL editor
    const contentChannel = supabase
      .channel(`doc-content-${docId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "documents",
          filter: `id=eq.${docId}`,
        },
        (payload) => {
          const newDoc = payload.new as {
            tiptap_content?: Record<string, unknown>;
            updated_at?: string;
          };
          const newContent = newDoc?.tiptap_content;
          if (!newContent || !editorRef.current) return;

          const currentJson = JSON.stringify(editorRef.current.getJSON());
          const incomingJson = JSON.stringify(newContent);
          if (currentJson === incomingJson) return;

          console.log("Remote formatting update received — applying");
          isRemoteUpdateRef.current = true;
          editorRef.current.commands.setContent(newContent, { emitUpdate: false });
          setTimeout(() => {
            isRemoteUpdateRef.current = false;
          }, 0);
        }
      )
      .subscribe((status) => {
        console.log("Content channel status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(contentChannel);
      channelRef.current = null;
      pendingOpsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, userId, userName, userImageUrl]);

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
        <div className="fixed top-[92px] left-0 right-0 z-30 flex h-11 items-center justify-between border-b border-[#1fb622] bg-[var(--bg-elevated)] px-6 text-[13px] font-sans text-[var(--text-primary)]">
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
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
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
          top: previewMode ? "136px" : undefined,
          right: historyOpen && !isMobile ? "320px" : "0",
          transition: "right 200ms ease, top 150ms ease",
        }}
      >
        {/* Document Workspace with Margin Rulers */}
        <div
          className="mx-auto flex flex-col items-center"
          style={{
            transform: isMobile ? "none" : `scale(${zoom / 100})`,
            transformOrigin: "top center",
            width: isMobile ? "100%" : "fit-content",
            marginTop: isMobile ? "0" : "12px",
            paddingBottom: isMobile ? "24px" : "48px",
          }}
        >
          {/* Top Ruler Row (corner piece + horizontal ruler) */}
          {!isMobile && (
            <div className="flex items-end mb-1 select-none">
              <div
                className="w-[22px] h-[22px] border border-r-0 border-b-0 border-[var(--border-subtle)] bg-[var(--bg-elevated)] mr-1 rounded-tl-sm opacity-80"
                title="Ruler (inches)"
              />
              <HorizontalRuler
                margins={margins}
                onMarginChange={handleMarginChange}
                zoom={zoom}
                onDragStateChange={(dragging, pos, label) => {
                  if (dragging && pos !== null && pos !== undefined) {
                    setGuideline({ type: "vertical", pos, label });
                  } else {
                    setGuideline(null);
                  }
                }}
              />
            </div>
          )}

          {/* Body Row (Left Vertical Ruler + Document Page Container) */}
          <div className={`flex items-start ${isMobile ? "w-full" : ""}`}>
            {/* Left Vertical Ruler */}
            {!isMobile && (
              <div className="mr-1 select-none">
                <VerticalRuler
                  margins={margins}
                  onMarginChange={handleMarginChange}
                  pageHeight={pageContainerRef.current?.scrollHeight || 1056}
                  zoom={zoom}
                  onDragStateChange={(dragging, pos, label) => {
                    if (dragging && pos !== null && pos !== undefined) {
                      setGuideline({ type: "horizontal", pos, label });
                    } else {
                      setGuideline(null);
                    }
                  }}
                />
              </div>
            )}

            {/* Document Page Container */}
            <div
              ref={pageContainerRef}
              className="page-container !my-0 !mx-0 relative"
              style={{
                width: isMobile ? "100%" : "816px",
                minHeight: isMobile ? "calc(100vh - 128px - 36px)" : "1056px",
                background: "var(--page-bg)",
                padding: isMobile
                  ? "16px"
                  : `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
                boxSizing: "border-box",
                position: "relative",
                boxShadow: isMobile ? "none" : "0 2px 8px rgba(0,0,0,0.4)",
                borderRadius: isMobile ? "0" : "2px",
                margin: isMobile ? "0" : "0",
              }}
            >
              {/* Active Margin Drag Guideline */}
              {!isMobile && guideline && guideline.type === "vertical" && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-30 border-l border-dashed border-[#1fb622]/80 shadow-[0_0_8px_rgba(31,182,34,0.4)]"
                  style={{ left: `${guideline.pos}px` }}
                />
              )}
              {!isMobile && guideline && guideline.type === "horizontal" && (
                <div
                  className="absolute left-0 right-0 pointer-events-none z-30 border-t border-dashed border-[#1fb622]/80 shadow-[0_0_8px_rgba(31,182,34,0.4)]"
                  style={{ top: `${guideline.pos}px` }}
                />
              )}

              {!isMobile &&
                pageBreaks.map((topPos) => (
                  <div
                    key={topPos}
                    className="page-break-line"
                    style={{ top: `${topPos}px` }}
                  />
                ))}
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
