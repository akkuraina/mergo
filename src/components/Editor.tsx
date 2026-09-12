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

  const initialText = getVisibleText(docRef.current);
  const [text, setText] = useState<string>(initialText);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);

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
      if (isRemoteUpdateRef.current) return;
      if (!docRef.current) return;

      const newValue = tiptapEditor.getText();
      const oldValue = getVisibleText(docRef.current);
      const diff = computeDiff(oldValue, newValue);

      setText(newValue);

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
        ops.forEach((op) => persistOp(op));
      }
    },
  });

  // Notify parent component when editor instance changes
  useEffect(() => {
    if (onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Page break calculations and stats update on content change
  useEffect(() => {
    const container = pageContainerRef.current;
    const wrapper = scrollWrapperRef.current;
    if (!container || !docRef.current) return;

    const totalHeight = container.scrollHeight;
    const pageCount = Math.max(1, Math.ceil(totalHeight / 1056));
    setPageBreaks(Array.from({ length: pageCount - 1 }, (_, i) => (i + 1) * 1056));

    const scrollTop = wrapper ? wrapper.scrollTop : 0;
    const curPage = Math.min(pageCount, Math.max(1, Math.floor(scrollTop / 1056) + 1));

    const visibleText = getVisibleText(docRef.current);
    const words = visibleText.trim() ? visibleText.trim().split(/\s+/).filter(Boolean).length : 0;
    const chars = visibleText.length;

    onStatsChange({
      words,
      chars,
      pages: pageCount,
      currentPage: curPage,
    });
  }, [text, onStatsChange]);

  // Scroll listener for real-time current page detection
  useEffect(() => {
    const wrapper = scrollWrapperRef.current;
    if (!wrapper) return;

    const handleScroll = () => {
      const scrollTop = wrapper.scrollTop;
      const container = pageContainerRef.current;
      const totalHeight = container ? container.scrollHeight : 1056;
      const pageCount = Math.max(1, Math.ceil(totalHeight / 1056));
      const curPage = Math.min(pageCount, Math.max(1, Math.floor(scrollTop / 1056) + 1));

      if (docRef.current) {
        const visibleText = getVisibleText(docRef.current);
        const words = visibleText.trim() ? visibleText.trim().split(/\s+/).filter(Boolean).length : 0;
        const chars = visibleText.length;
        onStatsChange({
          words,
          chars,
          pages: pageCount,
          currentPage: curPage,
        });
      }
    };

    wrapper.addEventListener("scroll", handleScroll, { passive: true });
    return () => wrapper.removeEventListener("scroll", handleScroll);
  }, [onStatsChange]);

  // Supabase Realtime channel setup for operations and presence
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
              const newText = getVisibleText(docRef.current);
              if (editor && newText !== editor.getText()) {
                isRemoteUpdateRef.current = true;
                editor.commands.setContent(newText, { emitUpdate: false });
                isRemoteUpdateRef.current = false;
                setText(newText);
              }
            }
          } catch (err) {
            console.error("Error applying remote op:", err);
          }
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
    };
  }, [docId, userId, userName, userImageUrl, onPresenceChange, editor]);

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
