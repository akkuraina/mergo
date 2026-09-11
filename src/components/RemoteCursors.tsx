"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type PresenceUser,
  type CaretCoordinates,
  getCaretAndSelectionCoordinates,
} from "@/lib/editor/collab";

interface RemoteCursorsProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  remoteUsers: PresenceUser[];
  text: string;
}

interface UserRenderData {
  user: PresenceUser;
  coords: CaretCoordinates;
}

export default function RemoteCursors({
  textareaRef,
  remoteUsers,
  text,
}: RemoteCursorsProps) {
  const [renderedUsers, setRenderedUsers] = useState<UserRenderData[]>([]);

  const updateCoordinates = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const data: UserRenderData[] = [];

    for (const user of remoteUsers) {
      if (!user.cursor) continue;

      const coords = getCaretAndSelectionCoordinates(
        textarea,
        user.cursor.index,
        user.cursor.selectionStart,
        user.cursor.selectionEnd
      );

      if (coords) {
        data.push({ user, coords });
      }
    }

    setRenderedUsers(data);
  }, [remoteUsers, textareaRef]);

  useEffect(() => {
    updateCoordinates();
  }, [text, remoteUsers, updateCoordinates]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleScroll = () => {
      updateCoordinates();
    };

    const handleResize = () => {
      updateCoordinates();
    };

    textarea.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      textarea.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [textareaRef, updateCoordinates]);

  if (renderedUsers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {renderedUsers.map(({ user, coords }) => {
        const hasSelection =
          user.cursor?.selectionStart !== undefined &&
          user.cursor?.selectionEnd !== undefined &&
          user.cursor.selectionStart !== user.cursor.selectionEnd;

        return (
          <div key={user.siteId} className="contents">
            {/* Selection highlight rectangles */}
            {hasSelection &&
              coords.selectionRects.map((rect, idx) => (
                <div
                  key={`${user.siteId}-sel-${idx}`}
                  style={{
                    left: `${rect.left}px`,
                    top: `${rect.top}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    backgroundColor: `${user.color}35`,
                  }}
                  className="absolute pointer-events-none rounded-sm transition-all duration-75"
                />
              ))}

            {/* Remote Caret line */}
            <div
              style={{
                left: `${coords.left}px`,
                top: `${coords.top}px`,
                height: `${coords.height}px`,
                backgroundColor: user.color,
                boxShadow: `0 0 8px ${user.color}60`,
              }}
              className="absolute w-[2px] pointer-events-none transition-all duration-75 z-20"
            >
              {/* Caret User Name Flag */}
              <div
                style={{
                  backgroundColor: user.color,
                }}
                className="absolute -top-5 left-0 z-30 flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#060606] shadow-sm whitespace-nowrap select-none opacity-90 transition-opacity"
              >
                <span>{user.name || "Anonymous"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
