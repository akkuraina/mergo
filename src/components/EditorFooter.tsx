"use client";

interface EditorFooterProps {
  words: number;
  chars: number;
  pages: number;
  currentPage: number;
  zoom: number;
  setZoom: (z: number | ((prev: number) => number)) => void;
}

export default function EditorFooter({
  words,
  chars,
  pages,
  currentPage,
  zoom,
  setZoom,
}: EditorFooterProps) {
  function handleZoomIn() {
    setZoom((z) => Math.min(200, z + 10));
  }

  function handleZoomOut() {
    setZoom((z) => Math.max(50, z - 10));
  }

  function handleZoomReset() {
    setZoom(100);
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex h-9 items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 font-mono text-[11px] text-[var(--text-muted)] select-none">
      {/* Left Section: Document Statistics */}
      <div className="flex items-center space-x-3">
        <span>
          Page {currentPage} of {pages}
        </span>
        <span className="text-[var(--text-faint)]">|</span>
        <span>{words} words</span>
        <span className="text-[var(--text-faint)]">|</span>
        <span>{chars} characters</span>
      </div>

      {/* Right Section: Zoom Controls */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= 50}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
          title="Zoom out"
        >
          -
        </button>

        <button
          type="button"
          onClick={handleZoomReset}
          className="px-1.5 py-0.5 rounded hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Click to reset zoom to 100%"
        >
          {zoom}%
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= 200}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
          title="Zoom in"
        >
          +
        </button>
      </div>
    </footer>
  );
}
