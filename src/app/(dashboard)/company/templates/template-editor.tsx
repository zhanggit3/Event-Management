"use client";

import { useState } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ComponentTemplate, TemplateActivity } from "@/types/database";
import { updateTemplate } from "@/app/actions/components";

const inputClass =
  "flex h-9 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";

// Normalize the stored structure into a fully-populated editable shape.
function normalize(structure: TemplateActivity[]): TemplateActivity[] {
  return (structure ?? []).map((a) => ({
    name: a.name ?? "",
    description: a.description,
    priority: a.priority ?? null,
    tasks: (a.tasks ?? []).map((t) => ({
      title: t.title ?? "",
      description: t.description,
      priority: t.priority ?? "medium",
      subtasks: (t.subtasks ?? []).map((s) => ({
        title: s.title ?? "",
        description: s.description,
        priority: s.priority ?? "medium",
      })),
    })),
  }));
}

export function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: ComponentTemplate;
  onClose: () => void;
  onSaved: (updated: ComponentTemplate) => void;
}) {
  const [name, setName] = useState(template.name);
  const [structure, setStructure] = useState<TemplateActivity[]>(() =>
    normalize(template.structure_json),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Immutable updater — clones the structure, applies `fn`, sets state.
  function mutate(fn: (draft: TemplateActivity[]) => void) {
    setStructure((prev) => {
      const next: TemplateActivity[] = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateTemplate(template.id, { name: name.trim(), structure_json: structure });
    if ("error" in result) {
      setError(result.error || "Failed to save template");
      setSaving(false);
      return;
    }
    // Use the server-normalized values (blanks dropped, trimmed) so the card reflects
    // exactly what was persisted.
    onSaved({
      ...template,
      name: result.name ?? name.trim(),
      structure_json: result.structure_json ?? structure,
      tasks_json: result.tasks_json ?? template.tasks_json,
    });
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Template name"
              autoFocus
            />
          </div>

          <div className="space-y-3">
            {structure.map((activity, ai) => (
              <div key={ai} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                  <input
                    value={activity.name}
                    onChange={(e) => mutate((d) => { d[ai].name = e.target.value; })}
                    className={inputClass}
                    placeholder="Activity name"
                  />
                  <button
                    onClick={() => mutate((d) => { d.splice(ai, 1); })}
                    aria-label="Remove activity"
                    className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tasks */}
                <div className="space-y-2 pl-6">
                  {activity.tasks.map((task, ti) => (
                    <div key={ti} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/30 shrink-0" />
                        <input
                          value={task.title}
                          onChange={(e) => mutate((d) => { d[ai].tasks[ti].title = e.target.value; })}
                          className={inputClass}
                          placeholder="Task title"
                        />
                        <button
                          onClick={() => mutate((d) => { d[ai].tasks.splice(ti, 1); })}
                          aria-label="Remove task"
                          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Subtasks */}
                      <div className="space-y-1.5 pl-5">
                        {task.subtasks.map((sub, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                            <input
                              value={sub.title}
                              onChange={(e) => mutate((d) => { d[ai].tasks[ti].subtasks[si].title = e.target.value; })}
                              className={inputClass}
                              placeholder="Subtask title"
                            />
                            <button
                              onClick={() => mutate((d) => { d[ai].tasks[ti].subtasks.splice(si, 1); })}
                              aria-label="Remove subtask"
                              className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => mutate((d) => { d[ai].tasks[ti].subtasks.push({ title: "", priority: "medium" }); })}
                          className="inline-flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors pl-3"
                        >
                          <Plus className="w-3 h-3" /> Subtask
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => mutate((d) => { d[ai].tasks.push({ title: "", priority: "medium", subtasks: [] }); })}
                    className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Task
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => mutate((d) => { d.push({ name: "", priority: null, tasks: [] }); })}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-white/70 text-xs font-semibold hover:bg-white/[0.1] hover:text-white transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add activity
            </button>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
