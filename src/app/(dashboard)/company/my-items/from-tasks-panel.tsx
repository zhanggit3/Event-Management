"use client";

import { useEffect, useState } from "react";
import { Download, FilePlus2, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import type { LibraryFolder, LibraryFile } from "@/types/database";
import {
  getOrgTaskAttachments, getApprovedEstimates,
  getTaskAttachmentDownloadUrl, saveTaskAttachmentToLibrary, saveApprovedEstimateToLibrary,
  type OrgTaskAttachment, type ApprovedEstimate,
} from "@/app/actions/library";
import { cn } from "@/lib/utils";

type EventGroup = {
  event: string;
  components: { component: string; tasks: { task: string; atts: OrgTaskAttachment[] }[] }[];
};

function group(atts: OrgTaskAttachment[]): EventGroup[] {
  const byEvent = new Map<string, Map<string, Map<string, OrgTaskAttachment[]>>>();
  for (const a of atts) {
    const ev = byEvent.get(a.event_name) ?? new Map();
    byEvent.set(a.event_name, ev);
    const comp = ev.get(a.component_name) ?? new Map();
    ev.set(a.component_name, comp);
    const list = comp.get(a.task_title) ?? [];
    list.push(a);
    comp.set(a.task_title, list);
  }
  return [...byEvent.entries()].map(([event, comps]) => ({
    event,
    components: [...comps.entries()].map(([component, tasks]) => ({
      component,
      tasks: [...tasks.entries()].map(([task, list]) => ({ task, atts: list })),
    })),
  }));
}

export function FromTasksPanel({
  organizationId,
  folders,
  onSaved,
}: {
  organizationId: string;
  folders: LibraryFolder[];
  onSaved: (file: LibraryFile) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<OrgTaskAttachment[]>([]);
  const [estimates, setEstimates] = useState<ApprovedEstimate[]>([]);
  const [target, setTarget] = useState<string>("root");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [atts, ests] = await Promise.all([
        getOrgTaskAttachments(organizationId),
        getApprovedEstimates(organizationId),
      ]);
      if (active) { setAttachments(atts); setEstimates(ests); setLoading(false); }
    })();
    return () => { active = false; };
  }, [organizationId]);

  const targetFolderId = target === "root" ? null : target;

  async function downloadAtt(a: OrgTaskAttachment) {
    const r = await getTaskAttachmentDownloadUrl(a.storage_key);
    if (r.url) window.open(r.url, "_blank");
    else setError(r.error ?? "Could not download");
  }

  async function saveAtt(a: OrgTaskAttachment) {
    setBusyId(a.id); setError(null);
    const r = await saveTaskAttachmentToLibrary(a.id, targetFolderId, organizationId);
    if ("error" in r && r.error) setError(r.error);
    else if (r.data) onSaved(r.data);
    setBusyId(null);
  }

  async function saveEstimate(e: ApprovedEstimate) {
    setBusyId(e.id); setError(null);
    const r = await saveApprovedEstimateToLibrary(e.id, targetFolderId, organizationId);
    if ("error" in r && r.error) setError(r.error);
    else if (r.data) onSaved(r.data);
    setBusyId(null);
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-white/40">
        <Loader2 className="w-6 h-6 mx-auto animate-spin" />
      </div>
    );
  }

  const grouped = group(attachments);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-white/50">
        <span>Save items into:</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="h-8 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-white/80 focus:outline-none focus:border-indigo-500/50">
          <option value="root">All files (root)</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Task attachments */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-3">Task &amp; subtask attachments</h3>
        {grouped.length === 0 ? (
          <p className="text-sm text-white/40 py-6 text-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
            No attachments found in this organization’s events.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map((ev) => (
              <div key={ev.event} className="rounded-xl border border-white/[0.07] overflow-hidden">
                <div className="px-4 py-2 bg-white/[0.03] text-sm font-semibold text-white">{ev.event}</div>
                {ev.components.map((comp) => (
                  <div key={comp.component} className="px-4 py-2 border-t border-white/[0.05]">
                    <p className="text-xs text-white/40 mb-1.5">{comp.component}</p>
                    {comp.tasks.map((t) => (
                      <div key={t.task} className="mb-2 last:mb-0">
                        <p className="text-[11px] text-white/30 mb-1">{t.task}</p>
                        {t.atts.map((a) => (
                          <AttRow key={a.id} name={a.file_name} busy={busyId === a.id}
                            onDownload={() => downloadAtt(a)} onSave={() => saveAtt(a)} icon={<FileText className="w-4 h-4 text-white/40" />} />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Approved estimates */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-3">Approved estimates</h3>
        {estimates.length === 0 ? (
          <p className="text-sm text-white/40 py-6 text-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
            No approved estimates yet. Approve an estimate to snapshot it here.
          </p>
        ) : (
          <div className="rounded-xl border border-white/[0.07] divide-y divide-white/[0.05]">
            {estimates.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400/70 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{e.proposal_number}</p>
                  <p className="text-[11px] text-white/30 truncate">{e.label}</p>
                </div>
                <button onClick={() => saveEstimate(e)} disabled={busyId === e.id}
                  className="inline-flex items-center gap-1.5 h-8 px-3 bg-white/[0.06] border border-white/10 rounded-lg text-white/70 text-xs font-semibold hover:bg-white/[0.1] hover:text-white transition-all disabled:opacity-50">
                  <FilePlus2 className="w-3.5 h-3.5" /> {busyId === e.id ? "Saving…" : "Add CSV"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AttRow({ name, busy, onDownload, onSave, icon }: {
  name: string; busy: boolean; onDownload: () => void; onSave: () => void; icon: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-1.5")}>
      {icon}
      <span className="text-sm text-white/80 truncate flex-1 min-w-0">{name}</span>
      <button onClick={onDownload} aria-label="Download"
        className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:bg-white/[0.12] hover:text-white transition-all">
        <Download className="w-3.5 h-3.5" />
      </button>
      <button onClick={onSave} disabled={busy}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 bg-white/[0.06] border border-white/10 rounded-lg text-white/70 text-[11px] font-semibold hover:bg-white/[0.1] hover:text-white transition-all disabled:opacity-50">
        <FilePlus2 className="w-3 h-3" /> {busy ? "…" : "Save"}
      </button>
    </div>
  );
}
