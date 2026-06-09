"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface IconTooltipProps {
  label: string;
  children: React.ReactNode;
  /** "right" for sidebar rail icons, "top" for inline toolbar icons */
  side?: "right" | "top";
}

/**
 * Hover/focus tooltip whose label is rendered through a portal to document.body with
 * `fixed` positioning, so it escapes any `overflow-hidden`/scroll ancestor (e.g. the
 * activity-row cards on the dashboard tab) that would otherwise clip an in-flow label.
 */
export function IconTooltip({ label, children, side = "right" }: IconTooltipProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  function show() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (side === "right") {
      setCoords({ left: r.right + 8, top: r.top + r.height / 2 });
    } else {
      setCoords({ left: r.left + r.width / 2, top: r.top - 6 });
    }
  }
  function hide() {
    setCoords(null);
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {coords && typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[100] px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap",
              "bg-[#1c1c2e] border border-white/[0.08] text-white/80 shadow-lg shadow-black/40"
            )}
            style={{
              left: coords.left,
              top: coords.top,
              transform: side === "right" ? "translateY(-50%)" : "translate(-50%, -100%)",
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </div>
  );
}
