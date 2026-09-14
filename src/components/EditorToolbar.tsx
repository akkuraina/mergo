"use client";

import type { Editor } from "@tiptap/react";
import { useState, useEffect } from "react";

interface EditorToolbarProps {
  editor: Editor | null;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const [, setTick] = useState(0);

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
    editor.getAttributes("textStyle").fontSize?.replace("pt", "") || "12";

  // Determine current text color
  const currentColor =
    editor.getAttributes("textStyle").color || "var(--text-primary)";

  const buttonBase =
    "flex h-7 w-7 items-center justify-center rounded transition-colors text-xs font-mono select-none";

  return (
    <div className="flex h-11 w-full items-center space-x-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 font-sans text-[var(--text-primary)]">
      {/* Group 1 — History */}
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

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 2 — Text Style Dropdown */}
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

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 2.5 — Font Family Dropdown */}
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
          <option value="default" style={{ fontFamily: "serif" }}>Times New Roman (Default)</option>
          <option value="Arial, sans-serif" style={{ fontFamily: "Arial, sans-serif" }}>Arial</option>
          <option value="Roboto, sans-serif" style={{ fontFamily: "Roboto, sans-serif" }}>Roboto</option>
          <option value="Inter, sans-serif" style={{ fontFamily: "Inter, sans-serif" }}>Inter</option>
          <option value="var(--font-geist-sans), sans-serif" style={{ fontFamily: "sans-serif" }}>Geist Sans</option>
          <option value="Playfair Display, serif" style={{ fontFamily: "Playfair Display, serif" }}>Playfair Display</option>
          <option value="Georgia, serif" style={{ fontFamily: "Georgia, serif" }}>Georgia</option>
          <option value="Merriweather, serif" style={{ fontFamily: "Merriweather, serif" }}>Merriweather</option>
          <option value="Garamond, serif" style={{ fontFamily: "Garamond, serif" }}>Garamond</option>
          <option value="Courier New, monospace" style={{ fontFamily: "Courier New, monospace" }}>Courier New</option>
          <option value="Trebuchet MS, sans-serif" style={{ fontFamily: "Trebuchet MS, sans-serif" }}>Trebuchet MS</option>
          <option value="Verdana, sans-serif" style={{ fontFamily: "Verdana, sans-serif" }}>Verdana</option>
          <option value="Comic Sans MS, cursive" style={{ fontFamily: "Comic Sans MS, cursive" }}>Comic Sans MS</option>
        </select>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 3 — Font Size */}
      <div className="flex items-center">
        <select
          value={currentFontSize}
          onChange={(e) => {
            const size = e.target.value;
            editor
              .chain()
              .focus()
              .setMark("textStyle", { fontSize: `${size}pt` })
              .run();
          }}
          className="h-7 rounded bg-[var(--border-subtle)] px-2 text-xs font-sans text-[var(--text-primary)] outline-none hover:bg-[var(--border-default)]"
          title="Font size"
        >
          {["10", "11", "12", "14", "16", "18", "24", "36"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 4 — Inline Formatting */}
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

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 5 — Text Color */}
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

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 6 — Alignment */}
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

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 7 — Lists */}
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
          •=
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

      <div className="h-5 w-[1px] bg-[var(--border-default)]" />

      {/* Group 8 — Indentation */}
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
    </div>
  );
}
