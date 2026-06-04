"use client";

import { useState } from "react";
import { Layers, ListTodo, Pencil, Trash2, FileStack } from "lucide-react";
import type { ComponentTemplate } from "@/types/database";
import { deleteTemplate, type TemplateWithMeta } from "@/app/actions/components";
import { formatDate, cn } from "@/lib/utils";
import { TemplateEditor } from "./template-editor";

function counts(t: ComponentTemplate) {
  const activities = t.structure_json?.length ?? 0;
  const tasks = (t.structure_json ?? []).reduce((n, a) => n + (a.tasks?.length ?? 0), 0);
  // Older templates: no structure, fall back to flat tasks_json.
  const flatTasks = activities === 0 ? (t.tasks_json?.length ?? 0) : tasks;
  return { activities, tasks: flatTasks };
}

export function TemplatesManager({ templates }: { templates: TemplateWithMeta[] }) {
  const [list, setList] = useState<TemplateWithMeta[]>(templates);
  // Show the org name on each card only when templates span more than one org.
  const multiOrg = new Set(templates.map((t) => t.org_name)).size > 1;
  const [editing, setEditing] = useState<ComponentTemplate | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const result = await deleteTemplate(id);
    if (result && "error" in result && result.error) {
      setError(result.error);
      setDeletingId(null);
      setConfirmingId(null);
      return;
    }
    setList((prev) => prev.filter((t) => t.id !== id));
    setDeletingId(null);
    setConfirmingId(null);
  }

  function handleSaved(updated: ComponentTemplate) {
    // Preserve the per-template meta (org_name, can_manage) the editor doesn't return.
    setList((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    setEditing(null);
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
          <FileStack className="w-6 h-6 text-indigo-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">No templates yet</h2>
        <p className="text-sm text-white/40 max-w-sm">
          Save a component as a template from any event (its activities, tasks, and subtasks are
          captured). Saved templates show up here.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((t) => {
          const c = counts(t);
          const isConfirming = confirmingId === t.id;
          const canManage = t.can_manage;
          return (
            <div
              key={t.id}
              role={canManage ? "button" : undefined}
              tabIndex={canManage ? 0 : undefined}
              onClick={canManage ? () => setEditing(t) : undefined}
              onKeyDown={
                canManage
                  ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(t); } }
                  : undefined
              }
              className={cn(
                "group bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 flex flex-col transition-all",
                canManage && "cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.12]",
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${t.color ?? "#6366f1"}26` }}
                >
                  <FileStack className="w-4 h-4" style={{ color: t.color ?? "#818cf8" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{t.name}</p>
                  {t.source_event_name && (
                    <p className="text-[11px] text-white/30 mt-0.5 truncate">from {t.source_event_name}</p>
                  )}
                  {multiOrg && t.org_name && (
                    <p className="text-[10px] text-indigo-300/60 mt-1 truncate font-medium uppercase tracking-wide">{t.org_name}</p>
                  )}
                </div>
                {canManage && !isConfirming && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                      aria-label="Edit template"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:bg-white/[0.12] hover:text-white transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmingId(t.id); }}
                      aria-label="Delete template"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 text-white/40 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-white/40 font-mono">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {c.activities} activit{c.activities === 1 ? "y" : "ies"}
                </span>
                <span className="flex items-center gap-1">
                  <ListTodo className="w-3 h-3" />
                  {c.tasks} task{c.tasks === 1 ? "" : "s"}
                </span>
                <span className="text-white/25">·</span>
                <span>{formatDate(t.created_at)}</span>
              </div>

              {canManage && isConfirming && (
                <div className="flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-all disabled:opacity-50"
                  >
                    {deletingId === t.id ? "Deleting…" : "Confirm delete"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/[0.1] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
