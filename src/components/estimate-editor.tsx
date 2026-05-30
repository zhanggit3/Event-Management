"use client";
import { useState, useRef } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Estimate, EstimateColumn, EstimateSection, EstimateLineItem } from "@/types/database";
import {
  updateEstimateStatus,
  addEstimateRow,
  deleteEstimateRow,
  upsertEstimateCell,
  addEstimateColumn,
  deleteEstimateColumn,
} from "@/app/actions/estimates";

// F-01: formatDate is imported directly from @/lib/utils — not passed as a prop

interface EstimateEditorProps {
  estimate: Estimate;
  columns: EstimateColumn[];
  sections: (EstimateSection & { lineItems: EstimateLineItem[] })[];
  eventSlug: string;
  componentSlug: string;
  activityId: string;
  eventDate: string | null;
  eventAddress: string | null;
}

export function EstimateEditor(props: EstimateEditorProps) {
  const { estimate, eventSlug, componentSlug, activityId, eventDate, eventAddress } = props;

  const [columns, setColumns] = useState(props.columns);
  const [sections, setSections] = useState(props.sections);
  const [status, setStatus] = useState(props.estimate.status);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<EstimateColumn["col_type"]>("text");

  // F-03: per-cell debounce timers — keyed by `${lineItemId}:${columnId}`
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // F-05: stores the cell value at focus time to skip no-change saves
  const focusValues = useRef<Map<string, string>>(new Map());

  // Use qty_column_id and amount_column_id stored on the estimate to identify
  // which columns power the Total. If either is null (column was deleted), Total = null.
  const qtyColId    = props.estimate.qty_column_id;
  const amountColId = props.estimate.amount_column_id;

  function getRowTotal(cells: Record<string, string>): number | null {
    if (!qtyColId || !amountColId) return null;
    // Check if the referenced columns still exist in the current columns list
    if (!columns.some(c => c.id === qtyColId) || !columns.some(c => c.id === amountColId)) return null;
    const qty    = parseFloat(cells[qtyColId]    || "0");
    const amount = parseFloat(cells[amountColId] || "0");
    if (isNaN(qty) || isNaN(amount)) return null;
    return qty * amount;
  }

  function getSectionTotal(section: EstimateSection & { lineItems: EstimateLineItem[] }): number {
    return section.lineItems.reduce((sum, item) => {
      const t = getRowTotal(item.cells);
      return sum + (t ?? 0);
    }, 0);
  }

  function formatCurrency(n: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  }

  // Total column visible only when both qty and amount columns still exist
  const totalVisible =
    qtyColId != null &&
    amountColId != null &&
    columns.some(c => c.id === qtyColId) &&
    columns.some(c => c.id === amountColId);

  function gridTemplate(colCount: number): string {
    if (colCount === 0) return "1fr 40px";
    // First column (Item) gets 2fr, rest get 1fr, plus optional Total and 40px delete button
    const rest = colCount > 1 ? Array(colCount - 1).fill("1fr").join(" ") : "";
    return `2fr${rest ? " " + rest : ""}${totalVisible ? " 1fr" : ""} 40px`;
  }

  // F-05: record the cell value at focus time so we can skip saves when unchanged
  function handleCellFocus(lineItemId: string, columnId: string, currentValue: string) {
    const key = `${lineItemId}:${columnId}`;
    focusValues.current.set(key, currentValue);
  }

  // F-03 + F-05 + F-06: controlled change updates state immediately; blur persists
  function handleCellChange(sectionId: string, lineItemId: string, columnId: string, value: string) {
    // Optimistic state update for controlled inputs
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      lineItems: s.lineItems.map(li => li.id !== lineItemId ? li : {
        ...li,
        cells: { ...li.cells, [columnId]: value },
      }),
    }));
  }

  function handleCellBlur(sectionId: string, lineItemId: string, columnId: string, value: string) {
    const key = `${lineItemId}:${columnId}`;

    // F-05: skip save if value hasn't changed since focus
    const originalValue = focusValues.current.get(key) ?? "";
    if (value === originalValue) return;

    // F-03: debounce — cancel any pending save for this cell and schedule a new one
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      debounceTimers.current.delete(key);
      await upsertEstimateCell(lineItemId, columnId, value, eventSlug, componentSlug, activityId);
    }, 300);

    debounceTimers.current.set(key, timer);
  }

  return (
    <div className="space-y-6">

      {/* General Info */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/30 mb-1.5">Proposal #</p>
            <p className="text-sm font-mono font-semibold text-white">{estimate.proposal_number}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/30 mb-1.5">Date</p>
            {/* F-01: formatDate imported directly, not from props */}
            <p className="text-sm text-white/60">{eventDate ? formatDate(eventDate) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/30 mb-1.5">Location</p>
            <p className="text-sm text-white/60 truncate">{eventAddress || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/30 mb-1.5">Status</p>
            <select
              value={status}
              onChange={async (e) => {
                const s = e.target.value as Estimate["status"];
                setStatus(s);
                await updateEstimateStatus(estimate.id, s, eventSlug, componentSlug, activityId);
              }}
              className="text-sm bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-white/70 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            >
              {(["draft", "sent", "approved", "declined"] as Estimate["status"][]).map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">

        {/* Table toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white/70">Items</h2>
          <button
            onClick={() => setAddColOpen(v => !v)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all"
          >
            <Plus className="w-3 h-3" /> Add Column
          </button>
        </div>

        {/* Add column inline form */}
        {addColOpen && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <input
              placeholder="Column name"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              className="h-7 px-2 rounded-lg bg-white/[0.06] border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-40"
            />
            <select
              value={newColType}
              onChange={(e) => setNewColType(e.target.value as EstimateColumn["col_type"])}
              className="h-7 px-2 rounded-lg bg-white/[0.06] border border-white/10 text-sm text-white/70 focus:outline-none"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="currency">Currency</option>
            </select>
            <button
              onClick={async () => {
                if (!newColName.trim()) return;
                const result = await addEstimateColumn(estimate.id, newColName, newColType, eventSlug, componentSlug, activityId);
                if (result.data) {
                  setColumns(prev => [...prev, result.data!]);
                  setNewColName("");
                  setAddColOpen(false);
                }
              }}
              className="h-7 px-3 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-medium hover:bg-indigo-500/30 transition-all"
            >
              Add
            </button>
            <button onClick={() => setAddColOpen(false)} className="text-white/30 hover:text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Column headers */}
        {columns.length > 0 && (
          <div
            className="grid border-b border-white/[0.06] bg-white/[0.02]"
            style={{ gridTemplateColumns: gridTemplate(columns.length) }}
          >
            {columns.map(col => (
              <div key={col.id} className="px-3 py-2 flex items-center justify-between group">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{col.name}</span>
                <button
                  onClick={async () => {
                    // F-10: save previous state for rollback
                    const prevColumns = columns;
                    const prevSections = sections;

                    setColumns(prev => prev.filter(c => c.id !== col.id));
                    setSections(prev => prev.map(s => ({
                      ...s,
                      lineItems: s.lineItems.map(li => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { [col.id]: _removed, ...rest } = li.cells;
                        return { ...li, cells: rest };
                      }),
                    })));

                    const result = await deleteEstimateColumn(col.id, estimate.id, eventSlug, componentSlug, activityId);
                    if (result.error) {
                      // Rollback on server error
                      console.error("Failed to delete column:", result.error);
                      setColumns(prevColumns);
                      setSections(prevSections);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white/20 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {totalVisible && (
              <div className="px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Total</span>
              </div>
            )}
            <div /> {/* row-delete column header */}
          </div>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.id}>
            {/* Section header */}
            <div className="px-5 py-2.5 bg-white/[0.015] border-b border-white/[0.04] flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">{section.name}</span>
              {/* F-09: show "—" when Total column is unavailable, otherwise show formatted sum */}
              <span className="text-xs text-white/30 font-mono">
                {totalVisible ? formatCurrency(getSectionTotal(section)) : "—"}
              </span>
            </div>

            {/* Rows */}
            {section.lineItems.map(item => (
              <div
                key={item.id}
                className="grid border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group/item"
                style={{ gridTemplateColumns: gridTemplate(columns.length) }}
              >
                {columns.map(col => (
                  <div key={col.id} className="px-3 py-1.5">
                    {/* F-06: controlled input — value driven by sections state */}
                    <input
                      type={col.col_type === "text" ? "text" : "number"}
                      value={item.cells[col.id] ?? ""}
                      onChange={(e) => handleCellChange(section.id, item.id, col.id, e.target.value)}
                      onFocus={() => handleCellFocus(item.id, col.id, item.cells[col.id] ?? "")}
                      onBlur={(e) => handleCellBlur(section.id, item.id, col.id, e.target.value)}
                      className="w-full bg-transparent text-sm text-white/80 outline-none px-1 py-0.5 rounded hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/30 transition-all"
                      placeholder="—"
                    />
                  </div>
                ))}
                {totalVisible && (
                  <div className="px-3 py-1.5 flex items-center">
                    <span className="text-sm text-white/60 font-mono">
                      {getRowTotal(item.cells) !== null ? formatCurrency(getRowTotal(item.cells)!) : "—"}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-center">
                  <button
                    onClick={async () => {
                      // F-10: save previous state for rollback
                      const prevSections = sections;

                      setSections(prev => prev.map(s => s.id !== section.id ? s : {
                        ...s, lineItems: s.lineItems.filter(li => li.id !== item.id),
                      }));

                      const result = await deleteEstimateRow(item.id, eventSlug, componentSlug, activityId);
                      if (result.error) {
                        // Rollback on server error
                        console.error("Failed to delete row:", result.error);
                        setSections(prevSections);
                      }
                    }}
                    className="opacity-0 group-hover/item:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded text-white/20 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add row */}
            <button
              onClick={async () => {
                const result = await addEstimateRow(estimate.id, section.id, eventSlug, componentSlug, activityId);
                if (result.data) {
                  setSections(prev => prev.map(s => s.id !== section.id ? s : {
                    ...s, lineItems: [...s.lineItems, result.data!],
                  }));
                }
              }}
              className="flex items-center gap-2 px-5 py-2.5 text-xs text-white/25 hover:text-white/50 hover:bg-white/[0.02] transition-all w-full border-b border-white/[0.03]"
            >
              <Plus className="w-3 h-3" /> Add row
            </button>
          </div>
        ))}

        {/* Net summary */}
        {(() => {
          const expenseSection = sections.find(s => s.section_type === "expense");
          const revenueSection = sections.find(s => s.section_type === "revenue");
          const expenseTotal = expenseSection ? getSectionTotal(expenseSection) : 0;
          const revenueTotal = revenueSection ? getSectionTotal(revenueSection) : 0;
          const net = revenueTotal - expenseTotal;
          return (
            <div className="px-5 py-4 flex items-center justify-end gap-8">
              <div className="text-right">
                <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Total Expenses</p>
                <p className="text-sm font-semibold text-white">{totalVisible ? formatCurrency(expenseTotal) : "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Total Revenue</p>
                <p className="text-sm font-semibold text-white">{totalVisible ? formatCurrency(revenueTotal) : "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Net</p>
                {totalVisible ? (
                  <p className={cn("text-sm font-bold", net >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(net))}
                  </p>
                ) : (
                  <p className="text-sm font-bold text-white/30">—</p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
