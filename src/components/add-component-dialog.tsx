"use client";

import { useState, useTransition } from "react";
import { Plus, Library, CopyPlus, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createComponent, createComponentFromTemplate } from "@/app/actions/components";

export type ComponentTemplate = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  tasks_json: { title: string; description?: string; priority?: string }[];
  // Nested activities → tasks → subtasks (ISSUE-012). Optional for older templates.
  structure_json?: unknown[];
};

export type EventWithComponents = {
  id: string;
  name: string;
  slug: string;
  components: { id: string; name: string; slug: string; color: string | null }[];
};

interface AddComponentDialogProps {
  eventId: string;
  eventSlug: string;
  templates?: ComponentTemplate[];
  otherEvents?: EventWithComponents[];
  cardTrigger?: boolean;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#78716c",
];

type Tab = "library" | "clone" | "custom";

export function AddComponentDialog({
  eventId,
  eventSlug,
  templates = [],
  otherEvents = [],
  cardTrigger = false,
}: AddComponentDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(templates.length > 0 ? "library" : "custom");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  function reset() {
    setName("");
    setColor(PRESET_COLORS[0]);
    setError(null);
    setLoadingId(null);
    setExpandedEvent(null);
    setTab(templates.length > 0 ? "library" : "custom");
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  async function addComponent(
    data: { name: string; color?: string | null },
    trackingId: string,
    template?: ComponentTemplate
  ) {
    setLoadingId(trackingId);
    setError(null);
    const formData = new FormData();
    formData.set("event_id", eventId);
    formData.set("event_slug", eventSlug);
    formData.set("name", data.name);
    formData.set("color", data.color ?? PRESET_COLORS[0]);

    startTransition(async () => {
      let result: { error?: string } | undefined;
      if (template) {
        formData.set("template_id", template.id);
        formData.set("tasks_json", JSON.stringify(template.tasks_json ?? []));
        formData.set("structure_json", JSON.stringify(template.structure_json ?? []));
        result = await createComponentFromTemplate(formData) as { error?: string } | undefined;
      } else {
        result = await createComponent(formData) as { error?: string } | undefined;
      }
      if (result?.error) {
        setError(result.error);
        setLoadingId(null);
      } else {
        handleOpenChange(false);
      }
    });
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addComponent({ name: name.trim(), color }, "custom", undefined);
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "library", label: "Library", icon: <Library className="w-3.5 h-3.5" /> },
    { key: "clone", label: "Clone", icon: <CopyPlus className="w-3.5 h-3.5" /> },
    { key: "custom", label: "Custom", icon: <Pencil className="w-3.5 h-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {cardTrigger ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] border border-dashed border-white/10 rounded-xl hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-all cursor-pointer group">
            <Plus className="w-6 h-6 text-white/20 group-hover:text-indigo-400 transition-colors mb-2" />
            <span className="text-xs text-white/30 group-hover:text-indigo-400 transition-colors">
              Add component
            </span>
          </div>
        ) : (
          <button className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-sm transition-all">
            <Plus className="w-4 h-4" />
            Add component
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add component</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tab === key
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* LIBRARY TAB */}
        {tab === "library" && (
          <div>
            {templates.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
                <Library className="w-8 h-8 mx-auto mb-3 text-white/20" />
                <p className="text-sm text-white/40">No templates in your library yet.</p>
                <button
                  onClick={() => setTab("custom")}
                  className="mt-2 text-xs text-indigo-400 hover:underline"
                >
                  Create a custom component instead
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    disabled={isPending}
                    onClick={() => addComponent({ name: t.name, color: t.color }, t.id, t)}
                    className="flex flex-col p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl hover:bg-white/[0.07] hover:border-white/10 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {t.icon && <span className="text-base leading-none">{t.icon}</span>}
                      <p className="text-sm font-semibold text-white truncate flex-1">
                        {loadingId === t.id ? "Adding..." : t.name}
                      </p>
                    </div>
                    {t.description && (
                      <p className="text-xs text-white/40 line-clamp-2 mb-2">{t.description}</p>
                    )}
                    {t.tasks_json?.length > 0 && (
                      <span className="self-start mt-auto bg-white/[0.08] rounded-md px-1.5 py-0.5 text-[10px] text-white/50">
                        {t.tasks_json.length} tasks
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CLONE TAB */}
        {tab === "clone" && (
          <div className="max-h-72 overflow-y-auto pr-1 space-y-1">
            {otherEvents.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
                <CopyPlus className="w-8 h-8 mx-auto mb-3 text-white/20" />
                <p className="text-sm text-white/40">No other events to clone from yet.</p>
              </div>
            ) : (
              otherEvents.map((ev) => (
                <div key={ev.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedEvent(expandedEvent === ev.id ? null : ev.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-sm font-semibold text-white"
                  >
                    <span>{ev.name}</span>
                    <span className="flex items-center gap-1.5 text-white/40 text-xs">
                      {ev.components.length} components
                      {expandedEvent === ev.id
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                  {expandedEvent === ev.id && (
                    <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                      {ev.components.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-white/30">No components in this event.</p>
                      ) : (
                        ev.components.map((c) => (
                          <button
                            key={c.id}
                            disabled={isPending}
                            onClick={() => addComponent({ name: c.name, color: c.color }, c.id, undefined)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
                          >
                            <div
                              className="w-2 h-5 rounded-sm shrink-0"
                              style={{ backgroundColor: c.color ?? "#64748b" }}
                            />
                            <span className="text-sm font-semibold text-white flex-1">{loadingId === c.id ? "Cloning..." : c.name}</span>
                            <span className="text-xs text-white/40">Clone</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* CUSTOM TAB */}
        {tab === "custom" && (
          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5" htmlFor="comp-name">Name *</label>
              <input
                id="comp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Art Auction"
                required
                className="flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "#ffffff" : "transparent",
                      transform: color === c ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !name.trim()}
                className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isPending ? "Adding..." : "Add component"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
