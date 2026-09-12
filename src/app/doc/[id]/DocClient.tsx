"use client";

import { useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import CollabBar from "@/components/CollabBar";
import EditorToolbar from "@/components/EditorToolbar";
import Editor from "@/components/Editor";
import EditorFooter from "@/components/EditorFooter";
import type { Operation } from "@/lib/types";
import type { PresenceUser } from "@/lib/editor/collab";

interface DocClientProps {
  docId: string;
  initialTitle: string;
  initialOps: Operation[];
  userId: string;
  userName: string;
  userImageUrl: string;
}

export default function DocClient({
  docId,
  initialTitle,
  initialOps,
  userId,
  userName,
  userImageUrl,
}: DocClientProps) {
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [zoom, setZoom] = useState<number>(100);
  const [stats, setStats] = useState({
    words: 0,
    chars: 0,
    pages: 1,
    currentPage: 1,
  });
  const [editor, setEditor] = useState<TiptapEditor | null>(null);

  return (
    <div className="relative min-h-screen bg-[#060606] text-[#eeeeee]">
      {/* Top Fixed CollabBar (48px) */}
      <CollabBar
        docId={docId}
        initialTitle={initialTitle}
        presenceUsers={presenceUsers}
      />

      {/* Fixed Editor Toolbar (44px, positioned directly below CollabBar) */}
      <div className="fixed top-12 left-0 right-0 z-40">
        <EditorToolbar editor={editor} />
      </div>

      {/* Multi-page Editor Canvas */}
      <Editor
        docId={docId}
        initialOps={initialOps}
        initialTitle={initialTitle}
        userId={userId}
        userName={userName}
        userImageUrl={userImageUrl}
        onPresenceChange={setPresenceUsers}
        onStatsChange={setStats}
        zoom={zoom}
        onEditorReady={setEditor}
      />

      {/* Bottom Fixed Sticky Footer (36px) */}
      <EditorFooter
        words={stats.words}
        chars={stats.chars}
        pages={stats.pages}
        currentPage={stats.currentPage}
        zoom={zoom}
        setZoom={setZoom}
      />
    </div>
  );
}
