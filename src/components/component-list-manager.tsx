"use client";

import { useState } from "react";
import { GripVertical, Pencil, Trash2, Eye, EyeOff, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateComponent, deleteComponent, reorderComponents } from "@/app/actions/components";
import type { Component } from "@/types/database";

interface ComponentListManagerProps {
  components: Component[];
  eventSlug: string;
}

export function ComponentListManager({ components: initialComponents, eventSlug }: ComponentListManagerProps) {
  const [components, setComponents] = useState(initialComponents);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  async function handleToggleActive(component: Component) {
    await updateComponent(component.id, { is_active: !component.is_active }, eventSlug);
    setComponents((prev) =>
      prev.map((c) => (c.id === component.id ? { ...c, is_active: !c.is_active } : c))
    );
  }

  function startEdit(component: Component) {
    setEditingId(component.id);
    setEditName(component.name);
  }

  async function saveEdit(component: Component) {
    if (!editName.trim()) return;
    await updateComponent(component.id, { name: editName.trim() }, eventSlug);
    setComponents((prev) =>
      prev.map((c) => (c.id === component.id ? { ...c, name: editName.trim() } : c))
    );
    setEditingId(null);
  }

  async function handleDelete(componentId: string) {
    await deleteComponent(componentId, eventSlug);
    setComponents((prev) => prev.filter((c) => c.id !== componentId));
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (id !== draggingId) setDragOverId(id);
  }

  async function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const from = components.findIndex((c) => c.id === draggingId);
    const to = components.findIndex((c) => c.id === targetId);
    const reordered = [...components];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, sort_order: i }));
    setComponents(updated);
    setDraggingId(null);
    setDragOverId(null);
    await reorderComponents(
      updated.map((c) => ({ id: c.id, sort_order: c.sort_order })),
      eventSlug
    );
  }

  return (
    <div className="space-y-2">
      {components.length === 0 && (
        <p className="text-sm text-white/40 py-4 text-center">
          No components yet. Add your first one above.
        </p>
      )}
      {components.map((component) => (
        <div
          key={component.id}
          draggable
          onDragStart={() => handleDragStart(component.id)}
          onDragOver={(e) => handleDragOver(e, component.id)}
          onDrop={() => handleDrop(component.id)}
          onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
            dragOverId === component.id
              ? "bg-indigo-500/10 border-indigo-500/40"
              : "bg-white/[0.03] border-white/[0.07]"
          } ${draggingId === component.id ? "opacity-50" : ""}`}
        >
          {/* Color dot + drag handle */}
          <div className="flex items-center gap-2 shrink-0">
            <GripVertical className="w-4 h-4 text-white/20 cursor-grab active:cursor-grabbing" />
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: component.color ?? "#64748b" }}
            />
          </div>

          {/* Name (editable) */}
          {editingId === component.id ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-sm flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-white focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(component);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <button
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all"
                onClick={() => saveEdit(component)}
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              </button>
              <button
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/[0.07] text-white/40 hover:text-white transition-all"
                onClick={() => setEditingId(null)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className={`flex-1 text-sm font-semibold truncate ${!component.is_active ? "text-white/30 line-through" : "text-white"}`}>
              {component.name}
            </span>
          )}

          {/* Actions */}
          {editingId !== component.id && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-white/[0.07] hover:text-white transition-all"
                onClick={() => handleToggleActive(component)}
                title={component.is_active ? "Deactivate" : "Activate"}
              >
                {component.is_active
                  ? <Eye className="w-3.5 h-3.5" />
                  : <EyeOff className="w-3.5 h-3.5" />
                }
              </button>
              <button
                className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-white/[0.07] hover:text-white transition-all"
                onClick={() => startEdit(component)}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {component.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the component and all its tasks and notes.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(component.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
