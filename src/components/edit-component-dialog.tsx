"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateComponent } from "@/app/actions/components";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#78716c",
];

const PRESET_ICONS = [
  "📋", "💰", "📣", "🤝", "🎨", "🚛",
  "🍔", "🎮", "🎵", "📸", "🏗️", "⚡",
  "🌟", "🔧", "📊", "🎯", "🗂️", "🌿",
];

interface EditComponentDialogProps {
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  initialName: string;
  initialIcon: string | null | undefined;
  initialColor: string | null;
}

export function EditComponentDialog({
  componentId,
  eventSlug,
  componentSlug,
  initialName,
  initialIcon,
  initialColor,
}: EditComponentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon ?? "");
  const [color, setColor] = useState(initialColor ?? PRESET_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setName(initialName);
      setIcon(initialIcon ?? "");
      setColor(initialColor ?? PRESET_COLORS[0]);
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setError(null);
    startTransition(async () => {
      const updates: { name?: string; icon?: string | null; color?: string | null } = {};
      if (name.trim() !== initialName) updates.name = name.trim();
      if (icon !== (initialIcon ?? "")) updates.icon = icon.trim() || null;
      if (color !== initialColor) updates.color = color;

      let changed = false;
      if (Object.keys(updates).length > 0) {
        const result = await updateComponent(componentId, updates, eventSlug, componentSlug);
        if (result.error) { setError(result.error); return; }
        changed = true;
      }
      setOpen(false);
      if (changed) router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 text-xs font-semibold hover:bg-white/[0.1] hover:text-white transition-all">
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Component</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-white/10 bg-white/[0.06] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
              placeholder="Component name"
              autoFocus
            />
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest">Icon</label>
            <div className="flex items-center gap-2">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-20 h-10 px-3 rounded-xl border border-white/10 bg-white/[0.06] text-lg text-center text-white focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
                placeholder="📋"
                maxLength={4}
              />
              <div className="flex flex-wrap gap-1 flex-1">
                {PRESET_ICONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`w-8 h-8 text-base flex items-center justify-center rounded-lg border transition-all ${
                      icon === emoji
                        ? "border-indigo-500/60 bg-indigo-500/10"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest">Color</label>
            <div className="flex flex-wrap gap-2 items-center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-lg border-2 transition-all relative"
                  style={{ backgroundColor: c, borderColor: color === c ? "#ffffff" : "transparent" }}
                >
                  {color === c && (
                    <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                  )}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0"
                  title="Custom color"
                />
                <span className="text-xs text-white/40">custom</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-5 h-5 rounded-md border border-white/10 shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-white/40 font-mono">{color}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 px-4 rounded-xl border border-white/10 bg-white/[0.06] text-white/70 font-medium text-sm hover:bg-white/[0.1] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
