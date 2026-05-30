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
        const result = await updateComponent(componentId, updates, eventSlug);
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
        <button className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] rounded-none font-bold uppercase tracking-wide text-black hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-xs">
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md rounded-none border-2 border-black shadow-[8px_8px_0px_0px_#000000] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-black uppercase">Edit Component</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase font-mono tracking-widest">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 border-2 border-black bg-white text-sm font-mono rounded-none focus:outline-none focus:border-[#00CC66] focus:bg-[#E8FFF5]"
              placeholder="Component name"
              autoFocus
            />
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase font-mono tracking-widest">Icon</label>
            <div className="flex items-center gap-2">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-20 h-10 px-3 border-2 border-black bg-white text-lg text-center rounded-none focus:outline-none focus:border-[#00CC66] focus:bg-[#E8FFF5]"
                placeholder="📋"
                maxLength={4}
              />
              <div className="flex flex-wrap gap-1 flex-1">
                {PRESET_ICONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`w-8 h-8 text-base flex items-center justify-center border-2 transition-all ${
                      icon === emoji
                        ? "border-[#00CC66] bg-[#E8FFF5] shadow-[2px_2px_0px_0px_#000000]"
                        : "border-black bg-white hover:bg-gray-100"
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
            <label className="text-xs font-bold uppercase font-mono tracking-widest">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 border-2 border-black transition-all relative"
                  style={{ backgroundColor: c }}
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
                  className="w-8 h-8 border-2 border-black cursor-pointer p-0"
                  title="Custom color"
                />
                <span className="text-xs font-mono text-[#555555]">custom</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-5 h-5 border-2 border-black shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs font-mono text-[#555555]">{color}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-mono">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-10 bg-[#00CC66] border-2 border-black shadow-[4px_4px_0px_0px_#000000] font-bold uppercase tracking-wide text-sm text-black hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 px-4 border-2 border-black bg-white font-bold uppercase tracking-wide text-sm text-black hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
