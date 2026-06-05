"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Download, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Budget, BudgetLineItem } from "@/types/database";
import {
  addBudgetLineItem,
  updateBudgetLineItem,
  deleteBudgetLineItem,
  importEstimateIntoBudget,
} from "@/app/actions/budgets";
import { getApprovedEstimates, type ApprovedEstimate } from "@/app/actions/library";

interface BudgetTabProps {
  budget: Budget;
  initialLineItems: BudgetLineItem[];
  eventSlug: string;
  componentSlug: string;
  organizationId: string;
  eventId: string;
}

type EditableField = "item_name" | "estimated_amount" | "actual_amount" | "status" | "notes";

const SECTIONS: { type: "expense" | "revenue"; label: string; totalLabel: string }[] = [
  { type: "expense", label: "Expenses", totalLabel: "Total Expense" },
  { type: "revenue", label: "Revenue", totalLabel: "Total Revenue" },
];

const STATUS_OPTIONS: BudgetLineItem["status"][] = ["estimated", "quoted", "committed", "paid"];
const MANUAL_KEY = "__manual__";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Favorable variance (positive = good = green):
//  • expenses are good when UNDER estimate  → estimated − actual
//  • revenue is good when OVER estimate     → actual − estimated
function variance(estimated: number, actual: number, sectionType: "expense" | "revenue"): number {
  const est = Number(estimated || 0);
  const act = Number(actual || 0);
  return sectionType === "revenue" ? act - est : est - act;
}

function VarianceCell({ value }: { value: number }) {
  return (
    <span className={cn("text-sm font-medium tabular-nums", value >= 0 ? "text-emerald-400" : "text-red-400")}>
      {value >= 0 ? "+" : "−"}{formatCurrency(Math.abs(value))}
    </span>
  );
}

// Grid: Item | Estimated | Actual | Status | Notes | Variance | delete
const GRID = "2fr 1fr 1fr 1fr 1.5fr 1fr 40px";

export function BudgetTab(props: BudgetTabProps) {
  const { budget, eventSlug, componentSlug, organizationId, eventId } = props;
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>(props.initialLineItems);

  // Pending debounced saves: timers + latest value per `${id}:${field}`, flushed on blur / unmount.
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pending = useRef<Map<string, { id: string; field: EditableField; value: string | number }>>(new Map());

  // Per-cell string drafts for numeric inputs so the field can be cleared / show "1." mid-edit.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<ApprovedEstimate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timers = debounceTimers.current;
    const pend = pending.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      for (const p of pend.values()) {
        void updateBudgetLineItem(p.id, { [p.field]: p.value }, eventSlug, componentSlug);
      }
    };
  }, [eventSlug, componentSlug]);

  const sumField = (items: BudgetLineItem[], field: "estimated_amount" | "actual_amount") =>
    items.reduce((s, li) => s + Number(li[field] || 0), 0);

  // Top totals are NET of revenue: expenses − revenue.
  const expItems = lineItems.filter((li) => li.section_type === "expense");
  const revItems = lineItems.filter((li) => li.section_type === "revenue");
  const expEst = sumField(expItems, "estimated_amount");
  const expAct = sumField(expItems, "actual_amount");
  const revEst = sumField(revItems, "estimated_amount");
  const revAct = sumField(revItems, "actual_amount");
  // Net position = revenue − expense (positive = surplus).
  const grandEst = revEst - expEst;
  const grandAct = revAct - expAct;
  // Favorable total variance = under-spend on expenses + over-earn on revenue (both positive/green).
  const grandVar = (expEst - expAct) + (revAct - revEst);

  function patchLocal(id: string, patch: Partial<BudgetLineItem>) {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  }

  function scheduleSave(id: string, field: EditableField, value: string | number) {
    const key = `${id}:${field}`;
    pending.current.set(key, { id, field, value });
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => fireSave(key), 300);
    debounceTimers.current.set(key, timer);
  }

  async function fireSave(key: string) {
    const p = pending.current.get(key);
    if (!p) return;
    pending.current.delete(key);
    const t = debounceTimers.current.get(key);
    if (t) { clearTimeout(t); debounceTimers.current.delete(key); }
    const result = await updateBudgetLineItem(p.id, { [p.field]: p.value }, eventSlug, componentSlug);
    if (result.error) setError(result.error);
  }

  function flushCell(id: string, field: EditableField) {
    fireSave(`${id}:${field}`);
  }

  function editField(id: string, field: "item_name" | "status" | "notes", value: string) {
    patchLocal(id, { [field]: value } as Partial<BudgetLineItem>);
    scheduleSave(id, field, value);
  }

  function editNumber(id: string, field: "estimated_amount" | "actual_amount", raw: string) {
    setDrafts((d) => ({ ...d, [`${id}:${field}`]: raw }));
    const num = parseFloat(raw);
    const value = isNaN(num) ? 0 : num;
    patchLocal(id, { [field]: value } as Partial<BudgetLineItem>);
    scheduleSave(id, field, value);
  }

  function commitNumber(id: string, field: "estimated_amount" | "actual_amount") {
    setDrafts((d) => { const next = { ...d }; delete next[`${id}:${field}`]; return next; });
    flushCell(id, field);
  }

  async function addRow(sectionType: "expense" | "revenue") {
    const result = await addBudgetLineItem(budget.id, sectionType, eventSlug, componentSlug);
    if (result.error) { setError(result.error); return; }
    if (result.data) setLineItems((prev) => [...prev, result.data!]);
  }

  async function removeRow(id: string) {
    const prev = lineItems;
    setLineItems((cur) => cur.filter((li) => li.id !== id));
    const result = await deleteBudgetLineItem(id, eventSlug, componentSlug);
    if (result.error) { setError(result.error); setLineItems(prev); }
  }

  async function openImport() {
    setImportOpen(true);
    setError(null);
    setImportLoading(true);
    const list = await getApprovedEstimates(organizationId, eventId);
    setEstimates(list);
    setImportLoading(false);
  }

  async function runImport(estimateId: string) {
    setImporting(estimateId);
    setError(null);
    const result = await importEstimateIntoBudget(budget.id, estimateId, eventSlug, componentSlug);
    setImporting(null);
    if (result.error) { setError(result.error); return; }
    if (result.data && result.data.length) {
      setLineItems((prev) => [...prev, ...result.data!]);
      setImportOpen(false);
    } else {
      setError("That estimate has no line items to import.");
    }
  }

  // Group a section's items by source_label (null → Manual / Other).
  function groupsFor(sectionType: "expense" | "revenue") {
    const items = lineItems.filter((li) => li.section_type === sectionType);
    const order: string[] = [];
    const map = new Map<string, BudgetLineItem[]>();
    for (const li of items) {
      const key = li.source_label ?? MANUAL_KEY;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(li);
    }
    return order.map((key) => ({ key, label: key === MANUAL_KEY ? "Manual / Other" : key, items: map.get(key)! }));
  }

  const numCell = "px-3 py-1.5 text-right";

  return (
    <div className="space-y-6 pb-8">
      {/* Summary + import */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-10">
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Total Estimated</p>
            <p className={cn("text-lg font-bold tabular-nums", grandEst >= 0 ? "text-emerald-400" : "text-red-400")}>
              {grandEst >= 0 ? "+" : "−"}{formatCurrency(Math.abs(grandEst))}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Total Actual</p>
            <p className={cn("text-lg font-bold tabular-nums", grandAct >= 0 ? "text-emerald-400" : "text-red-400")}>
              {grandAct >= 0 ? "+" : "−"}{formatCurrency(Math.abs(grandAct))}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Total Variance</p>
            <p className={cn("text-lg font-bold tabular-nums", grandVar >= 0 ? "text-emerald-400" : "text-red-400")}>
              {grandVar >= 0 ? "+" : "−"}{formatCurrency(Math.abs(grandVar))}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={openImport}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Import from approved estimate
          </button>

          {importOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setImportOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 z-20 bg-[#0D0D1C] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.07]">
                  <span className="text-xs font-semibold text-white/70">Approved estimates</span>
                  <button onClick={() => setImportOpen(false)} className="text-white/30 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {importLoading ? (
                    <div className="py-8 text-center text-white/40"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
                  ) : estimates.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-white/40 text-center">No approved estimates in this event yet.</p>
                  ) : (
                    estimates.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => runImport(e.id)}
                        disabled={importing === e.id}
                        className="w-full text-left px-3 py-2.5 hover:bg-white/[0.05] transition-colors border-b border-white/[0.04] last:border-b-0 disabled:opacity-50"
                      >
                        <p className="text-xs font-medium text-white truncate">{e.label}</p>
                        <p className="text-[10px] text-white/30 truncate">{e.proposal_number}{importing === e.id ? " — importing…" : ""}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Sections */}
      {SECTIONS.map((section) => {
        const groups = groupsFor(section.type);
        const inSection = lineItems.filter((li) => li.section_type === section.type);
        const sectionEst = sumField(inSection, "estimated_amount");
        const sectionAct = sumField(inSection, "actual_amount");
        // Expense amounts are red (money out), revenue amounts green (money in).
        const amountColor = section.type === "expense" ? "text-red-400" : "text-emerald-400";

        return (
          <div key={section.type} className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            {/* Section header */}
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold text-white/70">{section.label}</h2>
            </div>

            {/* Column headers */}
            <div className="grid border-b border-white/[0.06] bg-white/[0.02]" style={{ gridTemplateColumns: GRID }}>
              <div className="px-3 py-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Item</span></div>
              <div className="px-3 py-2 text-right"><span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Estimated</span></div>
              <div className="px-3 py-2 text-right"><span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Actual</span></div>
              <div className="px-3 py-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Status</span></div>
              <div className="px-3 py-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Notes</span></div>
              <div className="px-3 py-2 text-right"><span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Variance</span></div>
              <div />
            </div>

            {groups.length === 0 && (
              <p className="px-5 py-4 text-xs text-white/30">No line items yet.</p>
            )}

            {groups.map((group) => {
              const gEst = sumField(group.items, "estimated_amount");
              const gAct = sumField(group.items, "actual_amount");
              return (
                <div key={group.key}>
                  {/* Source-team subheader: name + variance only */}
                  <div className="grid bg-white/[0.015] border-b border-white/[0.04]" style={{ gridTemplateColumns: GRID }}>
                    <div className="px-5 py-2"><span className="text-xs font-semibold text-white/45">▸ {group.label}</span></div>
                    <div /><div /><div /><div />
                    <div className={numCell}><VarianceCell value={variance(gEst, gAct, section.type)} /></div>
                    <div />
                  </div>

                  {group.items.map((li) => {
                    const estKey = `${li.id}:estimated_amount`;
                    const actKey = `${li.id}:actual_amount`;
                    return (
                      <div
                        key={li.id}
                        className="grid border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group/row"
                        style={{ gridTemplateColumns: GRID }}
                      >
                        <div className="px-3 py-1.5">
                          <input
                            value={li.item_name}
                            onChange={(e) => editField(li.id, "item_name", e.target.value)}
                            onBlur={() => flushCell(li.id, "item_name")}
                            placeholder="—"
                            className="w-full bg-transparent text-sm text-white/80 outline-none px-1 py-0.5 rounded hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/30 transition-all"
                          />
                        </div>
                        <div className="px-3 py-1.5">
                          <input
                            type="number"
                            value={drafts[estKey] ?? String(li.estimated_amount)}
                            onChange={(e) => editNumber(li.id, "estimated_amount", e.target.value)}
                            onBlur={() => commitNumber(li.id, "estimated_amount")}
                            className="w-full bg-transparent text-sm text-white/80 outline-none px-1 py-0.5 rounded text-right tabular-nums hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/30 transition-all"
                          />
                        </div>
                        <div className="px-3 py-1.5">
                          <input
                            type="number"
                            value={drafts[actKey] ?? String(li.actual_amount)}
                            onChange={(e) => editNumber(li.id, "actual_amount", e.target.value)}
                            onBlur={() => commitNumber(li.id, "actual_amount")}
                            className="w-full bg-transparent text-sm text-white/80 outline-none px-1 py-0.5 rounded text-right tabular-nums hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/30 transition-all"
                          />
                        </div>
                        <div className="px-3 py-1.5">
                          <select
                            value={li.status}
                            onChange={(e) => editField(li.id, "status", e.target.value)}
                            onBlur={() => flushCell(li.id, "status")}
                            className="w-full bg-transparent text-sm text-white/70 outline-none px-1 py-0.5 rounded hover:bg-white/[0.04] focus:bg-white/[0.06] transition-all [&>option]:bg-[#0D0D1C]"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="px-3 py-1.5">
                          <input
                            value={li.notes ?? ""}
                            onChange={(e) => editField(li.id, "notes", e.target.value)}
                            onBlur={() => flushCell(li.id, "notes")}
                            placeholder="—"
                            className="w-full bg-transparent text-sm text-white/80 outline-none px-1 py-0.5 rounded hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/30 transition-all"
                          />
                        </div>
                        <div className="px-3 py-1.5 flex items-center justify-end">
                          <VarianceCell value={variance(Number(li.estimated_amount), Number(li.actual_amount), section.type)} />
                        </div>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => removeRow(li.id)}
                            className="opacity-0 group-hover/row:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded text-white/20 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Add row */}
            <button
              onClick={() => addRow(section.type)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs text-white/25 hover:text-white/50 hover:bg-white/[0.02] transition-all w-full border-b border-white/[0.04]"
            >
              <Plus className="w-3 h-3" /> Add row
            </button>

            {/* Section totals (bottom) */}
            <div className="grid bg-white/[0.02]" style={{ gridTemplateColumns: GRID }}>
              <div className="px-5 py-3"><span className="text-xs font-bold uppercase tracking-wider text-white/60">{section.totalLabel}</span></div>
              <div className={cn(numCell, "py-3")}><span className={cn("text-sm font-bold tabular-nums", amountColor)}>{formatCurrency(sectionEst)}</span></div>
              <div className={cn(numCell, "py-3")}><span className={cn("text-sm font-bold tabular-nums", amountColor)}>{formatCurrency(sectionAct)}</span></div>
              <div /><div />
              <div className={cn(numCell, "py-3 font-bold")}><VarianceCell value={variance(sectionEst, sectionAct, section.type)} /></div>
              <div />
            </div>
          </div>
        );
      })}
    </div>
  );
}
