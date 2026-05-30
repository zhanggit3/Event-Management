"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface IconTooltipProps {
  label: string;
  children: React.ReactNode;
  /** "right" for sidebar rail icons, "top" for inline toolbar icons */
  side?: "right" | "top";
}

export function IconTooltip({ label, children, side = "right" }: IconTooltipProps) {
  return (
    <div className="relative group/tip">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute z-50 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap",
          "bg-[#1c1c2e] border border-white/[0.08] text-white/80",
          "opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150",
          side === "right" && "left-full top-1/2 -translate-y-1/2 ml-2",
          side === "top"   && "bottom-full left-1/2 -translate-x-1/2 mb-1.5"
        )}
      >
        {label}
      </span>
    </div>
  );
}
