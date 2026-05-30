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
}

export function SaveAsTemplateButton({
  componentId,
  componentName,
  componentColor,
  componentSlug,
  organizationId,
  eventSlug,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(componentName);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setName(componentName);
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
        className="inline-flex items-center gap-1.5 h-9 px-3 border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000000] font-mono text-xs uppercase tracking-widest hover:shadow-[1px_1px_0px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
      >
        <BookmarkPlus className="w-3.5 h-3.5" />
        Save as template
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#FFF8F0] border-2 border-black shadow-[8px_8px_0px_0px_#000000] w-full max-w-sm mx-4">
            <div className="bg-black px-4 py-2.5 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-white">Save as template</span>
              <button onClick={() => setOpen(false)} className="text-white font-mono text-xs hover:text-[#00CC66] transition-colors">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="block font-mono text-xs uppercase tracking-widest text-[#555555]">
                  Template Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                  className="flex h-11 w-full border-2 border-black rounded-none bg-white px-3 text-sm focus:outline-none focus:border-[#00CC66] focus:bg-[#E8FFF5] transition-colors"
                />
              </div>
              <p className="font-mono text-xs text-[#555555] uppercase tracking-wide">
                All current tasks in this component will be saved as the template's default tasks.
              </p>
              {error && (
                <p className="font-mono text-xs text-[#FF0000] uppercase tracking-widest">{error}</p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 px-4 border-2 border-black bg-white font-mono text-xs uppercase tracking-widest hover:bg-[#F0F0F0] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !name.trim() || success}
                  className="h-10 px-4 border-2 border-black bg-[#00CC66] shadow-[4px_4px_0px_0px_#000000] font-bold uppercase tracking-wide text-black text-xs hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_0px_#000000] flex items-center gap-1.5"
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
