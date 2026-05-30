"use client";

import { useState, useTransition, useRef } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createResourceLink, updateResourceLink } from "@/app/actions/resources";
import type { ResourceLink, ResourceCategory } from "@/types/database";

const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";

const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  document: "Document",
  spreadsheet: "Spreadsheet",
  design: "Design",
  project_management: "Project Management",
  communication: "Communication",
  other: "Other",
};

interface ResourceLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  editingLink: ResourceLink | null;
  onLinkCreated: (link: ResourceLink) => void;
  onLinkUpdated: (link: ResourceLink) => void;
}

export function ResourceLinkModal({
  open,
  onOpenChange,
  componentId,
  eventSlug,
  componentSlug,
  editingLink,
  onLinkCreated,
  onLinkUpdated,
}: ResourceLinkModalProps) {
  const isEdit = !!editingLink;

  const [title, setTitle] = useState(editingLink?.title ?? "");
  const [url, setUrl] = useState(editingLink?.url ?? "");
  const [category, setCategory] = useState<ResourceCategory>(editingLink?.category ?? "other");
  const [description, setDescription] = useState(editingLink?.description ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const lastFetchedUrl = useRef<string>("");

  function validateUrl(value: string): boolean {
    if (!value) return true;
    return value.startsWith("http://") || value.startsWith("https://");
  }

  function handleUrlChange(value: string) {
    setUrl(value);
    if (value && !validateUrl(value)) {
      setUrlError("URL must start with http:// or https://");
    } else {
      setUrlError(null);
    }
  }

  async function handleUrlBlur() {
    if (!url || !validateUrl(url) || url === lastFetchedUrl.current || isEdit) return;
    lastFetchedUrl.current = url;
    setFetching(true);
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json() as { title: string | null; description: string | null };
        if (data.title && !title) setTitle(data.title);
        if (data.description && !description) setDescription(data.description);
      }
    } catch {
      // silently ignore
    } finally {
      setFetching(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    if (!validateUrl(url)) return;

    setError(null);
    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("title", title.trim());
    formData.set("url", url.trim());
    formData.set("category", category);
    formData.set("description", description);
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    startTransition(async () => {
      if (isEdit) {
        const result = await updateResourceLink(editingLink!.id, formData);
        if (result?.error) {
          setError(result.error);
        } else if (result?.data) {
          onLinkUpdated(result.data);
          onOpenChange(false);
        }
      } else {
        const result = await createResourceLink(formData);
        if (result?.error) {
          setError(result.error);
        } else if (result?.data) {
          onLinkCreated(result.data);
          onOpenChange(false);
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit resource" : "Add resource"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="res-url" className={labelClass}>URL *</label>
            <input
              id="res-url"
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://..."
              required
              autoFocus={!isEdit}
              className={inputClass}
            />
            {urlError && (
              <p className="text-xs text-red-400 mt-1">{urlError}</p>
            )}
            {fetching && (
              <p className="flex items-center gap-1.5 text-xs text-white/40 mt-1">
                <Sparkles className="w-3 h-3 animate-pulse" />
                Fetching preview…
              </p>
            )}
          </div>

          <div>
            <label htmlFor="res-title" className={labelClass}>Title *</label>
            <input
              id="res-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Brand Guidelines"
              required
              autoFocus={isEdit}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as ResourceCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as ResourceCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>{CATEGORY_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="res-desc" className={labelClass}>Description</label>
            <textarea
              id="res-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="flex w-full min-h-[72px] rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || !url.trim() || !!urlError}
              className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Add resource"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
