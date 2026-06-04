"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { saveComponentAsTemplate } from "@/app/actions/components";

interface Props {
  componentId: string;
  componentName: string;
  componentColor: string | null;
  componentSlug: string;
  organizationId: string;
  eventSlug: string;
  eventName: string;
}

export function SaveAsTemplateButton({
  componentId,
  componentName,
  componentColor,
  componentSlug,
  organizationId,
  eventSlug,
  eventName,
}: Props) {
  // Default template name = "{component} — {event}" (editable).
  const defaultName = `${componentName} — ${eventName}`;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setName(defaultName);
    setError(null);
    setSuccess(false);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("organization_id", organizationId);
    formData.set("name", name.trim());
    formData.set("color", componentColor ?? "");
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    startTransition(async () => {
      const result = await saveComponentAsTemplate(formData) as { error?: string } | undefined;
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => setOpen(false), 1200);
      }
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 h-9 px-3 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-white/70 text-xs hover:bg-white/[0.1] hover:text-white transition-all"
      >
        <BookmarkPlus className="w-3.5 h-3.5" />
        Save as template
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#0d0d1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold text-white">Save as template</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5">
                  Template name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                  className="flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
                />
              </div>
              <p className="text-xs text-white/40">
                Activities, tasks, and subtasks in this component will be saved to the template.
              </p>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !name.trim() || success}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {success ? (
                    <><Check className="w-3.5 h-3.5" /> Saved!</>
                  ) : isPending ? "Saving..." : "Save template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
