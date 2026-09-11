"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
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

interface EditorProps {
  document: Document;
  initialOps: Operation[];
  initialTitle?: string;
}

export default function Editor({
  document,
  initialOps,
  initialTitle,
}: EditorProps) {
  const siteIdRef = useRef<string>("");
  if (!siteIdRef.current) {
    siteIdRef.current = crypto.randomUUID();
  }

  const docRef = useRef<RGADocument | null>(null);
  if (!docRef.current) {
    let rgaDoc = createDocument(siteIdRef.current);

    // Replay initial operations
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
    initialTitle ?? document.title ?? "Untitled"
  );
  const [text, setText] = useState<string>(() =>
    getVisibleText(docRef.current!)
  );

  // Supabase Realtime subscription for incoming operations
  useEffect(() => {
    const docId = document.id;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }

    // Requires: Supabase Dashboard → Database → Replication → supabase_realtime → operations table enabled
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const channel = supabase
      .channel(`doc-${docId}`)
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

          // skip ops that originated from this site — already applied locally
          if (newRow.site_id === siteIdRef.current) return;

          const incoming: RGAOp =
            typeof newRow.payload === "string"
              ? deserializeOp(newRow.payload)
              : deserializeOp(JSON.stringify(newRow.payload));

          console.log("Remote op received:", incoming);

          if (docRef.current) {
            docRef.current = applyOp(docRef.current, incoming);
            setText(getVisibleText(docRef.current));
          }
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [document.id]);

  async function handleTitleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const newTitle = e.target.value.trim() || "Untitled";
    if (newTitle === currentTitleRef.current) return;

    currentTitleRef.current = newTitle;
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
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

  async function sendOp(op: RGAOp) {
    try {
      const res = await fetch(`/api/documents/${document.id}/ops`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          op,
          siteId: siteIdRef.current,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to persist operation:", errorData);
      }
    } catch (err) {
      console.error("Error sending operation to server:", err);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!docRef.current) return;

    const oldText = getVisibleText(docRef.current);
    const newText = e.target.value;

    if (oldText === newText) return;

    // Compute common prefix
    let start = 0;
    while (
      start < oldText.length &&
      start < newText.length &&
      oldText[start] === newText[start]
    ) {
      start++;
    }

    // Compute common suffix
    let endOld = oldText.length - 1;
    let endNew = newText.length - 1;
    while (
      endOld >= start &&
      endNew >= start &&
      oldText[endOld] === newText[endNew]
    ) {
      endOld--;
      endNew--;
    }

    const deletedCount = endOld - start + 1;
    const insertedChars = newText.slice(start, endNew + 1);

    let currentDoc = docRef.current;
    const opsToSend: RGAOp[] = [];

    // 1. Handle Deletions (if any)
    for (let i = 0; i < deletedCount; i++) {
      const [nextDoc, delOp] = localDelete(currentDoc, start);
      currentDoc = nextDoc;
      opsToSend.push(delOp);
    }

    // 2. Handle Insertions (sequential inserts for single char or pasted text)
    for (let i = 0; i < insertedChars.length; i++) {
      const char = insertedChars[i];
      const [nextDoc, insOp] = localInsert(currentDoc, start + i, char);
      currentDoc = nextDoc;
      opsToSend.push(insOp);
    }

    // Update local state and doc reference
    docRef.current = currentDoc;
    setText(getVisibleText(currentDoc));

    // Send all generated operations to the server
    for (const op of opsToSend) {
      sendOp(op);
    }
  }

  return (
    <div className="flex flex-1 w-full flex-col space-y-6">
      <input
        type="text"
        defaultValue={currentTitleRef.current}
        onBlur={handleTitleBlur}
        placeholder="Untitled"
        aria-label="Document title"
        className="w-full border-none bg-transparent text-3xl font-bold tracking-tight text-[#eeeeee] outline-none placeholder:text-[#444444]"
      />

      <div className="flex-1 flex flex-col min-h-[500px]">
        <textarea
          value={text}
          onChange={handleChange}
          placeholder="Start writing..."
          spellCheck={false}
          autoFocus
          className="w-full flex-1 resize-none bg-[#060606] font-mono text-sm leading-relaxed text-[#eeeeee] outline-none placeholder:text-[#444444] min-h-[500px] border-none p-0 selection:bg-[#1a1a1a]"
        />
      </div>
    </div>
  );
}
