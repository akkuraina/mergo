"use client";

import React, { useRef, useState, useCallback } from "react";

export interface DocMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface HorizontalRulerProps {
  margins: DocMargins;
  onMarginChange: (newMargins: Partial<DocMargins>) => void;
  zoom?: number;
  onDragStateChange?: (dragging: boolean, guidelinePos?: number | null, label?: string) => void;
}

interface VerticalRulerProps {
  margins: DocMargins;
  onMarginChange: (newMargins: Partial<DocMargins>) => void;
  pageHeight?: number;
  zoom?: number;
  onDragStateChange?: (dragging: boolean, guidelinePos?: number | null, label?: string) => void;
}

export function HorizontalRuler({
  margins,
  onMarginChange,
  zoom = 100,
  onDragStateChange,
}: HorizontalRulerProps) {
  const totalWidth = 816; // 8.5 inches * 96px
  const inchPx = 96;
  const rulerRef = useRef<HTMLDivElement>(null);
  const [activeMarker, setActiveMarker] = useState<"left" | "right" | null>(null);
  const [dragTooltip, setDragTooltip] = useState<string | null>(null);

  const leftMargin = margins.left;
  const rightMarginPos = totalWidth - margins.right;

  // Generate ticks for 8.5 inches (every 12px = 1/8 inch)
  const ticks = [];
  const totalEighths = (totalWidth / inchPx) * 8; // 68 eighths

  for (let i = 0; i <= totalEighths; i++) {
    const x = i * 12;
    const isInch = i % 8 === 0;
    const isHalf = i % 4 === 0 && !isInch;
    const isQuarter = i % 2 === 0 && !isHalf && !isInch;

    let height = 3;
    if (isInch) height = 10;
    else if (isHalf) height = 7;
    else if (isQuarter) height = 5;

    const inchNumber = isInch && i > 0 && i < totalEighths ? i / 8 : null;

    ticks.push({
      x,
      height,
      isInch,
      inchNumber,
    });
  }

  const handleStartDrag = useCallback(
    (marker: "left" | "right", startEvent: React.PointerEvent) => {
      startEvent.preventDefault();
      startEvent.stopPropagation();
      setActiveMarker(marker);

      const scale = zoom / 100;
      const rulerRect = rulerRef.current?.getBoundingClientRect();
      if (!rulerRect) return;

      const handlePointerMove = (e: PointerEvent) => {
        const currentRulerRect = rulerRef.current?.getBoundingClientRect();
        if (!currentRulerRect) return;

        const currentX = (e.clientX - currentRulerRect.left) / scale;

        if (marker === "left") {
          // Clamp left margin: min 36px (0.375"), max: rightMarginPos - 200px
          const clamped = Math.max(36, Math.min(totalWidth - margins.right - 180, currentX));
          const snapped = Math.round(clamped / 6) * 6; // snap to nearest 1/16"
          const inchVal = (snapped / inchPx).toFixed(2);
          const label = `Left Margin: ${inchVal}"`;

          onMarginChange({ left: snapped });
          setDragTooltip(label);
          onDragStateChange?.(true, snapped, label);
        } else {
          // Right marker position from left
          const clamped = Math.max(margins.left + 180, Math.min(totalWidth - 36, currentX));
          const snappedPos = Math.round(clamped / 6) * 6;
          const newRightMargin = totalWidth - snappedPos;
          const inchVal = (newRightMargin / inchPx).toFixed(2);
          const label = `Right Margin: ${inchVal}"`;

          onMarginChange({ right: newRightMargin });
          setDragTooltip(label);
          onDragStateChange?.(true, snappedPos, label);
        }
      };

      const handlePointerUp = () => {
        setActiveMarker(null);
        setDragTooltip(null);
        onDragStateChange?.(false, null);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [zoom, margins.left, margins.right, onMarginChange, onDragStateChange, totalWidth]
  );

  return (
    <div
      ref={rulerRef}
      className="relative select-none rounded-t-sm border border-b-0 border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
      style={{
        width: `${totalWidth}px`,
        height: "22px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      {/* Non-printable Left Margin area */}
      <div
        className="absolute top-0 bottom-0 left-0 bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] opacity-75 transition-all duration-75"
        style={{ width: `${leftMargin}px` }}
      />

      {/* Printable Center Body area */}
      <div
        className="absolute top-0 bottom-0 bg-[var(--page-bg)] opacity-35 transition-all duration-75"
        style={{ left: `${leftMargin}px`, width: `${rightMarginPos - leftMargin}px` }}
      />

      {/* Non-printable Right Margin area */}
      <div
        className="absolute top-0 bottom-0 right-0 bg-[var(--bg-elevated)] border-l border-[var(--border-subtle)] opacity-75 transition-all duration-75"
        style={{ width: `${margins.right}px` }}
      />

      {/* Ticks & Numbers */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        viewBox={`0 0 ${totalWidth} 22`}
      >
        {ticks.map((tick, index) => (
          <g key={index}>
            <line
              x1={tick.x}
              y1={22 - tick.height}
              x2={tick.x}
              y2={22}
              stroke="var(--border-default)"
              strokeWidth={tick.isInch ? 1.2 : 0.8}
            />
            {tick.inchNumber !== null && (
              <text
                x={tick.x}
                y={10}
                fill="var(--text-muted)"
                fontSize="9"
                fontFamily="var(--font-sans), sans-serif"
                fontWeight="500"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {tick.inchNumber}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Left Margin Draggable Marker */}
      <div
        onPointerDown={(e) => handleStartDrag("left", e)}
        className="group absolute z-20 cursor-ew-resize py-1 touch-none"
        style={{
          left: `${leftMargin}px`,
          top: "-2px",
          transform: "translateX(-50%)",
        }}
      >
        <div className="flex flex-col items-center">
          {/* Top rectangle */}
          <div
            className={`h-[4px] w-[11px] rounded-t-[1px] shadow-sm transition-colors ${
              activeMarker === "left" ? "bg-[#28d72c]" : "bg-[#1fb622] group-hover:bg-[#28d72c]"
            }`}
          />
          {/* Downward triangle */}
          <div
            className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] transition-colors ${
              activeMarker === "left" ? "border-t-[#28d72c]" : "border-t-[#1fb622] group-hover:border-t-[#28d72c]"
            }`}
          />
        </div>

        {/* Floating tooltip during drag or hover */}
        <div
          className={`absolute top-[-26px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#0f172a] px-2 py-0.5 text-[10px] font-semibold text-white shadow-md border border-white/10 pointer-events-none transition-opacity ${
            activeMarker === "left" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {dragTooltip || `Left: ${(leftMargin / 96).toFixed(2)}"`}
        </div>
      </div>

      {/* Right Margin Draggable Marker */}
      <div
        onPointerDown={(e) => handleStartDrag("right", e)}
        className="group absolute z-20 cursor-ew-resize py-1 touch-none"
        style={{
          left: `${rightMarginPos}px`,
          top: "2px",
          transform: "translateX(-50%)",
        }}
      >
        <div className="flex flex-col items-center">
          <div
            className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] shadow-sm transition-colors ${
              activeMarker === "right" ? "border-t-[#28d72c]" : "border-t-[#1fb622] group-hover:border-t-[#28d72c]"
            }`}
          />
        </div>

        {/* Floating tooltip during drag or hover */}
        <div
          className={`absolute top-[-26px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#0f172a] px-2 py-0.5 text-[10px] font-semibold text-white shadow-md border border-white/10 pointer-events-none transition-opacity ${
            activeMarker === "right" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {dragTooltip || `Right: ${(margins.right / 96).toFixed(2)}"`}
        </div>
      </div>
    </div>
  );
}

export function VerticalRuler({
  margins,
  onMarginChange,
  pageHeight = 1056,
  zoom = 100,
  onDragStateChange,
}: VerticalRulerProps) {
  const topMargin = margins.top;
  const bottomMarginPos = pageHeight - margins.bottom;
  const inchPx = 96;
  const totalEighths = Math.floor((pageHeight / inchPx) * 8);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [activeMarker, setActiveMarker] = useState<"top" | "bottom" | null>(null);
  const [dragTooltip, setDragTooltip] = useState<string | null>(null);

  const ticks = [];
  for (let i = 0; i <= totalEighths; i++) {
    const y = i * 12;
    const isInch = i % 8 === 0;
    const isHalf = i % 4 === 0 && !isInch;
    const isQuarter = i % 2 === 0 && !isHalf && !isInch;

    let width = 3;
    if (isInch) width = 10;
    else if (isHalf) width = 7;
    else if (isQuarter) width = 5;

    const inchNumber = isInch && i > 0 && i < totalEighths ? i / 8 : null;

    ticks.push({
      y,
      width,
      isInch,
      inchNumber,
    });
  }

  const handleStartDrag = useCallback(
    (marker: "top" | "bottom", startEvent: React.PointerEvent) => {
      startEvent.preventDefault();
      startEvent.stopPropagation();
      setActiveMarker(marker);

      const scale = zoom / 100;
      const rulerRect = rulerRef.current?.getBoundingClientRect();
      if (!rulerRect) return;

      const handlePointerMove = (e: PointerEvent) => {
        const currentRulerRect = rulerRef.current?.getBoundingClientRect();
        if (!currentRulerRect) return;

        const currentY = (e.clientY - currentRulerRect.top) / scale;

        if (marker === "top") {
          // Clamp top margin: min 36px (0.375"), max: pageHeight - margins.bottom - 200px
          const clamped = Math.max(36, Math.min(pageHeight - margins.bottom - 200, currentY));
          const snapped = Math.round(clamped / 6) * 6;
          const inchVal = (snapped / inchPx).toFixed(2);
          const label = `Top Margin: ${inchVal}"`;

          onMarginChange({ top: snapped });
          setDragTooltip(label);
          onDragStateChange?.(true, snapped, label);
        } else {
          // Bottom marker position from top
          const clamped = Math.max(margins.top + 200, Math.min(pageHeight - 36, currentY));
          const snappedPos = Math.round(clamped / 6) * 6;
          const newBottomMargin = pageHeight - snappedPos;
          const inchVal = (newBottomMargin / inchPx).toFixed(2);
          const label = `Bottom Margin: ${inchVal}"`;

          onMarginChange({ bottom: newBottomMargin });
          setDragTooltip(label);
          onDragStateChange?.(true, snappedPos, label);
        }
      };

      const handlePointerUp = () => {
        setActiveMarker(null);
        setDragTooltip(null);
        onDragStateChange?.(false, null);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [zoom, margins.top, margins.bottom, pageHeight, onMarginChange, onDragStateChange]
  );

  return (
    <div
      ref={rulerRef}
      className="relative select-none border border-r-0 border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
      style={{
        width: "22px",
        height: `${pageHeight}px`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      {/* Non-printable Top Margin area */}
      <div
        className="absolute top-0 left-0 right-0 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] opacity-75 transition-all duration-75"
        style={{ height: `${topMargin}px` }}
      />

      {/* Printable Center Body area */}
      <div
        className="absolute left-0 right-0 bg-[var(--page-bg)] opacity-35 transition-all duration-75"
        style={{ top: `${topMargin}px`, height: `${bottomMarginPos - topMargin}px` }}
      />

      {/* Non-printable Bottom Margin area */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] opacity-75 transition-all duration-75"
        style={{ height: `${margins.bottom}px` }}
      />

      {/* Ticks & Numbers */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        viewBox={`0 0 22 ${pageHeight}`}
      >
        {ticks.map((tick, index) => (
          <g key={index}>
            <line
              x1={22 - tick.width}
              y1={tick.y}
              x2={22}
              y2={tick.y}
              stroke="var(--border-default)"
              strokeWidth={tick.isInch ? 1.2 : 0.8}
            />
            {tick.inchNumber !== null && (
              <text
                x={10}
                y={tick.y}
                fill="var(--text-muted)"
                fontSize="9"
                fontFamily="var(--font-sans), sans-serif"
                fontWeight="500"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {tick.inchNumber}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Top Margin Draggable Marker */}
      <div
        onPointerDown={(e) => handleStartDrag("top", e)}
        className="group absolute z-20 cursor-ns-resize px-1 touch-none"
        style={{
          top: `${topMargin}px`,
          right: "0px",
          transform: "translateY(-50%)",
        }}
      >
        <div
          className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] shadow-sm transition-colors ${
            activeMarker === "top" ? "border-l-[#28d72c]" : "border-l-[#1fb622] group-hover:border-l-[#28d72c]"
          }`}
        />

        {/* Floating tooltip during drag or hover */}
        <div
          className={`absolute left-[-90px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#0f172a] px-2 py-0.5 text-[10px] font-semibold text-white shadow-md border border-white/10 pointer-events-none transition-opacity ${
            activeMarker === "top" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {dragTooltip || `Top: ${(topMargin / 96).toFixed(2)}"`}
        </div>
      </div>

      {/* Bottom Margin Draggable Marker */}
      <div
        onPointerDown={(e) => handleStartDrag("bottom", e)}
        className="group absolute z-20 cursor-ns-resize px-1 touch-none"
        style={{
          top: `${bottomMarginPos}px`,
          right: "0px",
          transform: "translateY(-50%)",
        }}
      >
        <div
          className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] shadow-sm transition-colors ${
            activeMarker === "bottom" ? "border-l-[#28d72c]" : "border-l-[#1fb622] group-hover:border-l-[#28d72c]"
          }`}
        />

        {/* Floating tooltip during drag or hover */}
        <div
          className={`absolute left-[-90px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#0f172a] px-2 py-0.5 text-[10px] font-semibold text-white shadow-md border border-white/10 pointer-events-none transition-opacity ${
            activeMarker === "bottom" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {dragTooltip || `Bottom: ${(margins.bottom / 96).toFixed(2)}"`}
        </div>
      </div>
    </div>
  );
}
