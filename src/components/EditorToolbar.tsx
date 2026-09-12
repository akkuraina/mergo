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
      <div className="flex h-11 w-full items-center border-b border-[#1a1a1a] bg-[#111111] px-4" />
    );
  }

  // Determine current text style
  let currentStyle = "paragraph";
  if (editor.isActive("heading", { level: 1 })) currentStyle = "h1";
  else if (editor.isActive("heading", { level: 2 })) currentStyle = "h2";
  else if (editor.isActive("heading", { level: 3 })) currentStyle = "h3";

  // Determine current font size
  const currentFontSize =
    editor.getAttributes("textStyle").fontSize?.replace("pt", "") || "12";

  // Determine current text color
  const currentColor =
    editor.getAttributes("textStyle").color || "#eeeeee";

  const buttonBase =
    "flex h-7 w-7 items-center justify-center rounded transition-colors text-xs font-mono select-none";

  return (
    <div className="flex h-11 w-full items-center space-x-2 overflow-x-auto border-b border-[#1a1a1a] bg-[#111111] px-4 font-sans text-[#eeeeee]">
      {/* Group 1 — History */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={`${buttonBase} text-[#aaaaaa] hover:bg-[#1a1a1a] disabled:opacity-30 disabled:hover:bg-transparent`}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={`${buttonBase} text-[#aaaaaa] hover:bg-[#1a1a1a] disabled:opacity-30 disabled:hover:bg-transparent`}
          title="Redo (Ctrl+Y)"
        >
          ↪
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 2 — Text Style Dropdown */}
      <div className="flex items-center">
        <select
          value={currentStyle}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
            else if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
            else if (val === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
            else editor.chain().focus().setParagraph().run();
          }}
          className="h-7 rounded bg-[#1a1a1a] px-2 text-xs font-sans text-[#eeeeee] outline-none hover:bg-[#222222]"
          title="Text style"
        >
          <option value="paragraph">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 3 — Font Size */}
      <div className="flex items-center">
        <select
          value={currentFontSize}
          onChange={(e) => {
            const size = e.target.value;
            editor.chain().focus().setMark("textStyle", { fontSize: `${size}pt` }).run();
          }}
          className="h-7 rounded bg-[#1a1a1a] px-2 text-xs font-sans text-[#eeeeee] outline-none hover:bg-[#222222]"
          title="Font size"
        >
          {["10", "11", "12", "14", "16", "18", "24", "36"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 4 — Inline Formatting */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${buttonBase} ${
            editor.isActive("bold")
              ? "bg-[#1fb622] text-[#060606] font-bold"
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
          }`}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 5 — Text Color */}
      <div className="relative flex items-center">
        <label
          htmlFor="text-color-input"
          className={`${buttonBase} cursor-pointer flex-col justify-center text-[#aaaaaa] hover:bg-[#1a1a1a]`}
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
          value={currentColor}
          onChange={(e) => {
            editor.chain().focus().setColor(e.target.value).run();
          }}
          className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
        />
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 6 — Alignment */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={`${buttonBase} ${
            editor.isActive({ textAlign: "left" })
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
          }`}
          title="Justify"
        >
          ⩶
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 7 — Lists */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${buttonBase} ${
            editor.isActive("bulletList")
              ? "bg-[#1fb622] text-[#060606]"
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
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
              : "text-[#aaaaaa] hover:bg-[#1a1a1a]"
          }`}
          title="Numbered list"
        >
          1.
        </button>
      </div>

      <div className="h-5 w-[1px] bg-[#222222]" />

      {/* Group 8 — Indentation */}
      <div className="flex items-center space-x-1">
        <button
          type="button"
          onClick={() => {
            if (editor.can().liftListItem("listItem")) {
              editor.chain().focus().liftListItem("listItem").run();
            }
          }}
          className={`${buttonBase} text-[#aaaaaa] hover:bg-[#1a1a1a]`}
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
          className={`${buttonBase} text-[#aaaaaa] hover:bg-[#1a1a1a]`}
          title="Indent"
        >
          ⇥
        </button>
      </div>
    </div>
  );
}
