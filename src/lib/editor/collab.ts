export interface PresenceUser {
  siteId: string;
  userId: string;
  userName: string;
  userImage: string;
  name?: string;
  email?: string;
  imageUrl?: string;
  color?: string;
  isTyping?: boolean;
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

export function getCaretAndSelectionCoordinates(
  _textarea: HTMLTextAreaElement,
  _index: number,
  _selectionStart?: number,
  _selectionEnd?: number
): CaretCoordinates | null {
  return {
    left: 0,
    top: 0,
    height: 16,
    selectionRects: [],
  };
}

