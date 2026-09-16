"use client";

import type { Editor } from "@tiptap/react";
import { useState, useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";

interface EditorToolbarProps {
  editor: Editor | null;
  docId?: string;
}

export default function EditorToolbar({ editor, docId }: EditorToolbarProps) {
  const [, setTick] = useState(0);
  const params = useParams();
  const routeDocId = (params?.id as string) || docId || "default";

  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      setTick((t) => t + 1);
    };

    editor.on("transaction", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);

    return () => {
      editor.off("transaction", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  // Click outside listener for link popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        linkPopoverRef.current &&
        !linkPopoverRef.current.contains(e.target as Node)
      ) {
        setLinkPopoverOpen(false);
      }
    };

    if (linkPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [linkPopoverOpen]);

  if (!editor) {
    return (
      <div className="flex h-11 w-full items-center border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4" />
    );
  }

  // Determine current text style
  let currentStyle = "paragraph";
  if (editor.isActive("heading", { level: 1 })) currentStyle = "h1";
  else if (editor.isActive("heading", { level: 2 })) currentStyle = "h2";
  else if (editor.isActive("heading", { level: 3 })) currentStyle = "h3";

  // Determine current font family
  const currentFontFamily =
    editor.getAttributes("textStyle").fontFamily || "default";

  // Determine current font size
  const currentFontSize =
    editor.getAttributes("textStyle").fontSize ?? "12px";

  const applyFontSize = (sizeStr: string) => {
    editor.chain().focus().setMark("textStyle", { fontSize: sizeStr }).run();
  };

  // Determine current text color
  const currentColor =
    editor.getAttributes("textStyle").color || "var(--text-primary)";

  // Determine current highlight color
  const currentHighlightColor =
    editor.getAttributes("highlight").color || "#fef08a";

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const ext = file.name.split(".").pop();
    const path = `${routeDocId}/${crypto.randomUUID()}.${ext}`;

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from("mergo-images")
      .upload(path, file, { upsert: false });

    if (error) {
      console.error("Image upload failed:", error);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("mergo-images")
      .getPublicUrl(path);

    editor.chain().focus().setImage({ src: urlData.publicUrl }).run();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const buttonBase =
    "toolbar-btn flex h-7 w-7 items-center justify-center rounded transition-colors text-xs font-mono select-none";

  return (
    <div className="editor-toolbar flex flex-col md:flex-row md:h-11 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-sans text-[var(--text-primary)] md:items-center md:space-x-2 md:overflow-x-auto md:px-4">
      {/* Row 1 on mobile, inline on desktop */}
      <div className="toolbar-row toolbar-row-1 flex items-center space-x-2 shrink-0">
        {/* Group 1 — History [↩ undo] [↪ redo] */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={`${buttonBase} text-[var(--text-muted)] hover:bg-[var(--border-subtle)] disabled:opacity-30 disabled:hover:bg-transparent`}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={`${buttonBase} text-[var(--text-muted)] hover:bg-[var(--border-subtle)] disabled:opacity-30 disabled:hover:bg-transparent`}
          title="Redo (Ctrl+Y)"
        >
          ↪
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 2 — Text Style Dropdown [Normal text ▾] */}
      <div className="flex items-center">
        <select
          value={currentStyle}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "h1")
              editor.chain().focus().toggleHeading({ level: 1 }).run();
            else if (val === "h2")
              editor.chain().focus().toggleHeading({ level: 2 }).run();
            else if (val === "h3")
              editor.chain().focus().toggleHeading({ level: 3 }).run();
            else editor.chain().focus().setParagraph().run();
          }}
          className="h-7 rounded bg-[var(--border-subtle)] px-2 text-xs font-sans text-[var(--text-primary)] outline-none hover:bg-[var(--border-default)] cursor-pointer"
          title="Text style"
        >
          <option value="paragraph">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 3 — Font Family Dropdown [font family ▾] */}
      <div className="flex items-center">
        <select
          value={currentFontFamily}
          onChange={(e) => {
            const font = e.target.value;
            if (font === "default") {
              editor.chain().focus().unsetFontFamily().run();
            } else {
              editor.chain().focus().setFontFamily(font).run();
            }
          }}
          className="h-7 rounded bg-[var(--border-subtle)] px-2 text-xs text-[var(--text-primary)] outline-none hover:bg-[var(--border-default)] cursor-pointer max-w-[135px]"
          title="Font family"
        >
          <option value="default" style={{ fontFamily: "serif" }}>
            Times New Roman (Default)
          </option>
          <option
            value="Arial, sans-serif"
            style={{ fontFamily: "Arial, sans-serif" }}
          >
            Arial
          </option>
          <option
            value="Roboto, sans-serif"
            style={{ fontFamily: "Roboto, sans-serif" }}
          >
            Roboto
          </option>
          <option
            value="Inter, sans-serif"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Inter
          </option>
          <option
            value="var(--font-geist-sans), sans-serif"
            style={{ fontFamily: "sans-serif" }}
          >
            Geist Sans
          </option>
          <option
            value="Playfair Display, serif"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            Playfair Display
          </option>
          <option
            value="Georgia, serif"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Georgia
          </option>
          <option
            value="Merriweather, serif"
            style={{ fontFamily: "Merriweather, serif" }}
          >
            Merriweather
          </option>
          <option
            value="Garamond, serif"
            style={{ fontFamily: "Garamond, serif" }}
          >
            Garamond
          </option>
          <option
            value="Courier New, monospace"
            style={{ fontFamily: "Courier New, monospace" }}
          >
            Courier New
          </option>
          <option
            value="Trebuchet MS, sans-serif"
            style={{ fontFamily: "Trebuchet MS, sans-serif" }}
          >
            Trebuchet MS
          </option>
          <option
            value="Verdana, sans-serif"
            style={{ fontFamily: "Verdana, sans-serif" }}
          >
            Verdana
          </option>
          <option
            value="Comic Sans MS, cursive"
            style={{ fontFamily: "Comic Sans MS, cursive" }}
          >
            Comic Sans MS
          </option>
        </select>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 4 — Font Size Stepper [− 14 +] */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid var(--border-default)",
          borderRadius: "6px",
          overflow: "hidden",
          height: "28px",
        }}
      >
        <button
          type="button"
          onClick={() => {
            const current = parseInt(currentFontSize) || 12;
            const next = Math.max(8, current - 1);
            applyFontSize(`${next}px`);
          }}
          style={{
            width: "24px",
            height: "28px",
            background: "transparent",
            border: "none",
            borderRight: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Decrease font size"
        >
          −
        </button>

        <input
          type="number"
          value={currentFontSize.replace("px", "").replace("pt", "") || "12"}
          min={8}
          max={96}
          onChange={(e) => applyFontSize(`${e.target.value}px`)}
          style={{
            width: "36px",
            height: "28px",
            background: "transparent",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "12px",
            textAlign: "center",
            fontFamily: "var(--font-geist-mono)",
            outline: "none",
            MozAppearance: "textfield",
          }}
          title="Font size"
        />

        <button
          type="button"
          onClick={() => {
            const current = parseInt(currentFontSize) || 12;
            const next = Math.min(96, current + 1);
            applyFontSize(`${next}px`);
          }}
          style={{
            width: "24px",
            height: "28px",
            background: "transparent",
            border: "none",
            borderLeft: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Increase font size"
        >
          +
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 5 — Inline Formatting [B] [I] [U] [S] */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${buttonBase} ${
            editor.isActive("bold")
              ? "bg-[#1fb622] text-[#060606] font-bold"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${buttonBase} ${
            editor.isActive("italic")
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${buttonBase} ${
            editor.isActive("underline")
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`${buttonBase} ${
            editor.isActive("strike")
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      <div className="hidden md:block h-5 w-[1px] bg-[var(--border-default)] shrink-0" />
    </div>

    {/* Row 2 on mobile, inline on desktop */}
    <div className="toolbar-row toolbar-row-2 flex items-center space-x-2 shrink-0">
      {/* Group 6 — Colors [A color] [▌ highlight] */}
      <div className="flex items-center space-x-1">
        {/* Text Color */}
        <div className="relative flex items-center">
          <label
            htmlFor="text-color-input"
            className={`${buttonBase} cursor-pointer flex-col justify-center text-[var(--text-muted)] hover:bg-[var(--border-subtle)]`}
            title="Text color"
          >
            <span className="font-bold text-[11px] leading-none">A</span>
            <span
              className="mt-0.5 h-[3px] w-3.5 rounded-full"
              style={{ backgroundColor: currentColor }}
            />
          </label>
          <input
            id="text-color-input"
            type="color"
            value={currentColor.startsWith("#") ? currentColor : "#eeeeee"}
            onChange={(e) => {
              editor.chain().focus().setColor(e.target.value).run();
            }}
            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Highlight Color */}
        <div className="relative flex items-center">
          <label
            htmlFor="highlight-color-input"
            className={`${buttonBase} cursor-pointer flex-col justify-center text-[var(--text-muted)] hover:bg-[var(--border-subtle)]`}
            title="Highlight color"
          >
            <span className="font-bold text-[12px] leading-none">▌</span>
            <span
              className="mt-0.5 h-[3px] w-3.5 rounded-full"
              style={{ backgroundColor: currentHighlightColor }}
            />
          </label>
          <input
            id="highlight-color-input"
            type="color"
            value={
              currentHighlightColor.startsWith("#")
                ? currentHighlightColor
                : "#fef08a"
            }
            onChange={(e) => {
              editor.chain().focus().setHighlight({ color: e.target.value }).run();
            }}
            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
          />
        </div>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 7 — Alignment [≡ left] [≡ center] [≡ right] [≡ justify] */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={`${buttonBase} ${
            editor.isActive({ textAlign: "left" })
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Align left"
        >
          ≡
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={`${buttonBase} ${
            editor.isActive({ textAlign: "center" })
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Align center"
        >
          ≗
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={`${buttonBase} ${
            editor.isActive({ textAlign: "right" })
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Align right"
        >
          ≒
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          className={`${buttonBase} ${
            editor.isActive({ textAlign: "justify" })
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Justify"
        >
          ⩶
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 8 — Lists [• list] [1. list] */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${buttonBase} ${
            editor.isActive("bulletList")
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Bullet list"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${buttonBase} ${
            editor.isActive("orderedList")
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
          }`}
          title="Numbered list"
        >
          1.
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 9 — Indentation [→ indent] [← outdent] */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => {
            if (editor.can().liftListItem("listItem")) {
              editor.chain().focus().liftListItem("listItem").run();
            }
          }}
          className={`${buttonBase} text-[var(--text-muted)] hover:bg-[var(--border-subtle)]`}
          title="Outdent"
        >
          ⇤
        </button>
        <button
          type="button"
          onClick={() => {
            if (editor.can().sinkListItem("listItem")) {
              editor.chain().focus().sinkListItem("listItem").run();
            }
          }}
          className={`${buttonBase} text-[var(--text-muted)] hover:bg-[var(--border-subtle)]`}
          title="Indent"
        >
          ⇥
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)] shrink-0" />

      {/* Group 10 — Links & Images [🔗 link] [🖼 image] */}
      <div className="flex items-center space-x-1">
        {/* Insert Link */}
        <div className="relative inline-flex items-center" ref={linkPopoverRef}>
          <button
            type="button"
            onClick={() => {
              if (!linkPopoverOpen) {
                const existingHref = editor.getAttributes("link").href || "";
                setLinkUrl(existingHref);
              }
              setLinkPopoverOpen((prev) => !prev);
            }}
            className={`${buttonBase} ${
              editor.isActive("link")
                ? "bg-[#1fb622] text-[#060606]"
                : "text-[var(--text-muted)] hover:bg-[var(--border-subtle)]"
            }`}
            title="Insert link"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>

          {/* Inline Link Popover */}
          {linkPopoverOpen && (
            <div
              style={{
                position: "absolute",
                top: "36px",
                left: 0,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px",
                display: "flex",
                gap: "6px",
                zIndex: 200,
                minWidth: "240px",
              }}
              className="shadow-xl"
            >
              <input
                autoFocus
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (linkUrl.trim()) {
                      editor
                        ?.chain()
                        .focus()
                        .setLink({ href: linkUrl.trim() })
                        .run();
                    } else {
                      editor?.chain().focus().unsetLink().run();
                    }
                    setLinkPopoverOpen(false);
                    setLinkUrl("");
                  }
                  if (e.key === "Escape") setLinkPopoverOpen(false);
                }}
                style={{
                  flex: 1,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "6px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  padding: "4px 8px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (linkUrl.trim()) {
                    editor
                      ?.chain()
                      .focus()
                      .setLink({ href: linkUrl.trim() })
                      .run();
                  } else {
                    editor?.chain().focus().unsetLink().run();
                  }
                  setLinkPopoverOpen(false);
                  setLinkUrl("");
                }}
                style={{
                  background: "#1fb622",
                  color: "#060606",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Insert Image */}
        <div className="relative inline-flex items-center">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`${buttonBase} text-[var(--text-muted)] hover:bg-[var(--border-subtle)]`}
            title="Insert image"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
