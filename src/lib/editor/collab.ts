export interface PresenceUser {
  siteId: string;
  userId: string;
  name: string;
  email: string;
  imageUrl?: string;
  color: string;
  isTyping: boolean;
  cursor?: {
    index: number;
    selectionStart?: number;
    selectionEnd?: number;
  } | null;
  lastActive?: number;
}

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CaretCoordinates {
  left: number;
  top: number;
  height: number;
  selectionRects: SelectionRect[];
}

export const COLLAB_PALETTE = [
  "#1fb622", // emerald
  "#3b82f6", // blue
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#eab308", // yellow
  "#14b8a6", // teal
  "#8b5cf6", // violet
  "#f43f5e", // rose
];

export function getUserColor(identifier: string): string {
  if (!identifier) return COLLAB_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLAB_PALETTE.length;
  return COLLAB_PALETTE[index];
}

export function getUserInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return "U";
}

let mirrorDiv: HTMLDivElement | null = null;

function getMirrorDiv(): HTMLDivElement {
  if (mirrorDiv && document.body.contains(mirrorDiv)) {
    return mirrorDiv;
  }
  mirrorDiv = document.createElement("div");
  mirrorDiv.setAttribute("aria-hidden", "true");
  mirrorDiv.style.position = "absolute";
  mirrorDiv.style.top = "-9999px";
  mirrorDiv.style.left = "-9999px";
  mirrorDiv.style.visibility = "hidden";
  mirrorDiv.style.pointerEvents = "none";
  mirrorDiv.style.whiteSpace = "pre-wrap";
  mirrorDiv.style.wordBreak = "break-word";
  mirrorDiv.style.overflowWrap = "break-word";
  document.body.appendChild(mirrorDiv);
  return mirrorDiv;
}

const COPIED_STYLES = [
  "boxSizing",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "wordSpacing",
  "overflowWrap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const;

export function getCaretAndSelectionCoordinates(
  textarea: HTMLTextAreaElement,
  cursorIndex: number,
  selectionStart?: number,
  selectionEnd?: number
): CaretCoordinates | null {
  if (typeof window === "undefined" || !textarea) return null;

  const mirror = getMirrorDiv();
  const computed = window.getComputedStyle(textarea);

  for (const prop of COPIED_STYLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mirror.style as any)[prop] = computed[prop];
  }

  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.innerHTML = "";

  const text = textarea.value || "";
  const clampedIndex = Math.max(0, Math.min(cursorIndex, text.length));
  const selStart =
    selectionStart !== undefined
      ? Math.max(0, Math.min(selectionStart, text.length))
      : clampedIndex;
  const selEnd =
    selectionEnd !== undefined
      ? Math.max(0, Math.min(selectionEnd, text.length))
      : clampedIndex;

  const hasSelection = selStart !== selEnd;
  const minSel = Math.min(selStart, selEnd);
  const maxSel = Math.max(selStart, selEnd);

  // Build mirror DOM with markers
  const textBeforeCaret = text.slice(0, clampedIndex);
  const textAfterCaret = text.slice(clampedIndex);

  const beforeCaretNode = document.createTextNode(textBeforeCaret);
  const caretMarker = document.createElement("span");
  caretMarker.textContent = text[clampedIndex] || "\u200b"; // zero-width space if at end
  const afterCaretNode = document.createTextNode(textAfterCaret.slice(1));

  mirror.appendChild(beforeCaretNode);
  mirror.appendChild(caretMarker);
  mirror.appendChild(afterCaretNode);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = caretMarker.getBoundingClientRect();

  const lineHeight = parseFloat(computed.lineHeight) || 20;

  const left = markerRect.left - mirrorRect.left - textarea.scrollLeft;
  const top = markerRect.top - mirrorRect.top - textarea.scrollTop;

  const selectionRects: SelectionRect[] = [];

  if (hasSelection) {
    mirror.innerHTML = "";
    const textBeforeSel = text.slice(0, minSel);
    const selectedText = text.slice(minSel, maxSel);
    const textAfterSel = text.slice(maxSel);

    const selSpan = document.createElement("span");
    selSpan.textContent = selectedText || "\u200b";

    mirror.appendChild(document.createTextNode(textBeforeSel));
    mirror.appendChild(selSpan);
    mirror.appendChild(document.createTextNode(textAfterSel));

    const clientRects = selSpan.getClientRects();
    const curMirrorRect = mirror.getBoundingClientRect();

    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      selectionRects.push({
        left: r.left - curMirrorRect.left - textarea.scrollLeft,
        top: r.top - curMirrorRect.top - textarea.scrollTop,
        width: r.width,
        height: r.height || lineHeight,
      });
    }
  }

  return {
    left,
    top,
    height: lineHeight,
    selectionRects,
  };
}
