"use client";

import { useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import CollabBar from "@/components/CollabBar";
import EditorToolbar from "@/components/EditorToolbar";
import Editor from "@/components/Editor";
import EditorFooter from "@/components/EditorFooter";
import VersionHistory from "@/components/VersionHistory";
import type { Operation } from "@/lib/types";
import type { PresenceUser } from "@/lib/editor/collab";
import type { VersionRow } from "@/types/mergo";

interface DocClientProps {
  docId: string;
  initialTitle: string;
  initialOps: Operation[];
  initialTiptapContent?: Record<string, unknown> | null;
  userId: string;
  userName: string;
  userImageUrl: string;
  role: "owner" | "collaborator";
}

export default function DocClient({
  docId,
  initialTitle,
  initialOps,
  initialTiptapContent,
  userId,
  userName,
  userImageUrl,
  role,
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
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<VersionRow | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRestore = async (versionId: string) => {
    try {
      const res = await fetch(
        `/api/documents/${docId}/versions/${versionId}/restore`,
        {
          method: "POST",
        }
      );
      if (res.ok) {
        setPreviewMode(false);
        setPreviewVersion(null);
        setHistoryOpen(false);
        const labelOrDate =
          previewVersion?.label ||
          (previewVersion
            ? new Date(previewVersion.created_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "selected version");
        showToast(`Document restored to ${labelOrDate}`);
        // Reload to fetch fresh tiptap_content from database
        setTimeout(() => {
          window.location.reload();
        }, 600);
      } else {
        showToast("Failed to restore document");
      }
    } catch (err) {
      console.error("Error restoring version:", err);
      showToast("Failed to restore document");
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1fb622] px-4 py-2 text-xs font-semibold text-[#060606] shadow-lg animate-fade-in flex items-center space-x-2">
          <svg
            className="w-4 h-4 text-[#060606]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Fixed CollabBar (48px) */}
      <CollabBar
        docId={docId}
        initialTitle={initialTitle}
        presenceUsers={presenceUsers}
        onHistoryOpen={() => setHistoryOpen(true)}
        role={role}
        saveStatus={saveStatus}
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
        initialTiptapContent={initialTiptapContent}
        userId={userId}
        userName={userName}
        userImageUrl={userImageUrl}
        onPresenceChange={setPresenceUsers}
        onStatsChange={setStats}
        zoom={zoom}
        onEditorReady={setEditor}
        previewMode={previewMode}
        previewVersion={previewVersion}
        onExitPreview={() => {
          setPreviewMode(false);
          setPreviewVersion(null);
        }}
        onRestoreVersion={handleRestore}
        historyOpen={historyOpen}
        onSaveStatusChange={setSaveStatus}
        onNotify={showToast}
      />

      {/* Right Sidebar Version History Panel */}
      <VersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        docId={docId}
        selectedVersionId={previewVersion?.id || null}
        onPreview={(v) => {
          setPreviewVersion(v);
          setPreviewMode(true);
        }}
        onRestore={handleRestore}
        currentUserId={userId}
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

