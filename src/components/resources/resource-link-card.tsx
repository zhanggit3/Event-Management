"use client";

import {
  FileText,
  Table2,
  Palette,
  LayoutDashboard,
  MessageSquare,
  Link,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResourceLink, ResourceCategory } from "@/types/database";

const CATEGORY_ICONS: Record<ResourceCategory, React.ElementType> = {
  document: FileText,
  spreadsheet: Table2,
  design: Palette,
  project_management: LayoutDashboard,
  communication: MessageSquare,
  other: Link,
};

const CATEGORY_COLORS: Record<ResourceCategory, string> = {
  document: "text-blue-400 bg-blue-500/15",
  spreadsheet: "text-emerald-400 bg-emerald-500/15",
  design: "text-purple-400 bg-purple-500/15",
  project_management: "text-orange-400 bg-orange-500/15",
  communication: "text-pink-400 bg-pink-500/15",
  other: "text-white/50 bg-white/[0.06]",
};

const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  document: "Document",
  spreadsheet: "Spreadsheet",
  design: "Design",
  project_management: "Project Mgmt",
  communication: "Communication",
  other: "Other",
};

function getFavicon(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return null;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface ResourceLinkCardProps {
  link: ResourceLink;
  onEdit: (link: ResourceLink) => void;
  onDelete: (link: ResourceLink) => void;
  isDeleting?: boolean;
}

export function ResourceLinkCard({
  link,
  onEdit,
  onDelete,
  isDeleting,
}: ResourceLinkCardProps) {
  const Icon = CATEGORY_ICONS[link.category] ?? Link;
  const iconClass = CATEGORY_COLORS[link.category] ?? CATEGORY_COLORS.other;
  const favicon = getFavicon(link.url);
  const domain = getDomain(link.url);

  return (
    <div
      className={`group relative bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-3 hover:bg-white/[0.06] hover:border-white/10 transition-all ${
        isDeleting ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug line-clamp-1">
            {link.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {favicon && (
              <img
                src={favicon}
                alt=""
                className="w-3.5 h-3.5 opacity-60"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="text-xs text-white/40 truncate">{domain}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/[0.07] text-white/50 hover:text-white">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onEdit(link)}>
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(link)}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      {link.description && (
        <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">
          {link.description}
        </p>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-white/50">
          {CATEGORY_LABELS[link.category]}
        </span>
        <button
          className="inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs font-semibold text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
          onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </button>
      </div>
    </div>
  );
}
