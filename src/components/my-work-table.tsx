"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Circle,
  Check,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  Plus,
  Settings2,
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { toggleTaskDone } from "@/app/actions/my-work";
import {
  addCustomColumn,
  renameCustomColumn,
  deleteCustomColumn,
  setCellValue,
  saveViewLayout,
  resetViewLayout,
} from "@/app/actions/my-work-columns";
import type { MyWorkRow, MyWorkCustomColumn, MyWorkViewConfig } from "@/types/database";

const PRIORITY_COLOR: Record<string, string> = {
  low: "text-white/30",
  medium: "text-blue-400",
  high: "text-orange-400",
  urgent: "text-red-400",
};

const STATUS_STYLE: Record<string, string> = {
  todo: "bg-white/[0.06] text-white/50",
  in_progress: "bg-blue-500/15 text-blue-400",
  done: "bg-emerald-500/15 text-emerald-400",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const STATUS_RANK: Record<string, number> = { todo: 0, in_progress: 1, done: 2 };

// Built-in (non-removable) columns, keyed by their sort key. Custom columns are
// referenced by the token "col:<uuid>"; everything below treats columns as opaque
// string tokens so built-in and custom share one ordering/visibility model.
const BUILTIN_COLUMNS: { key: string; label: string }[] = [
  { key: "title", label: "Item" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
  { key: "dueDate", label: "Due Date" },
  { key: "lastModified", label: "Last Modified" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "reporter", label: "Reporter" },
  { key: "event", label: "Event" },
];
const BUILTIN_LABEL: Record<string, string> = Object.fromEntries(
  BUILTIN_COLUMNS.map((c) => [c.key, c.label]),
);
const DEFAULT_ORDER = BUILTIN_COLUMNS.map((c) => c.key);

// Default widths (px). Item is widest (it also carries the inline comment bubble);
// date columns fit "Jun 4"; Assignee/Reporter fit a first name + avatar.
const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 44,
  title: 360,
  status: 116,
  createdAt: 86,
  dueDate: 86,
  lastModified: 116,
  priority: 92,
  assignee: 120,
  reporter: 120,
  event: 144,
};
const DEFAULT_CUSTOM_WIDTH = 180;
const ADD_COL_WIDTH = 44;

const MIN_WIDTH = 56;
const MIN_TITLE_WIDTH = 140;

const isCustom = (token: string) => token.startsWith("col:");
const customId = (token: string) => token.slice(4);
const colToken = (id: string) => `col:${id}`;

function personName(p: MyWorkRow["assignee"]): string {
  return p?.full_name || p?.email || "";
}

function firstName(p: MyWorkRow["assignee"]): string {
  const full = personName(p);
  return full.split(/\s+/)[0] || full;
}

// Month + day only (e.g. "Jun 4"), so the date columns stay narrow.
function formatMonthDay(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(d);
}

function compareNonNullString(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Direction-independent null ranking: a present value always sorts before a
// null/empty one. Returns null when both sides are non-null (use real compare).
function nullRank(a: string | null, b: string | null): number | null {
  const aEmpty = !a;
  const bEmpty = !b;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return null;
}

export function MyWorkTable({
  rows,
  customColumns,
  viewConfig,
}: {
  rows: MyWorkRow[];
  customColumns: MyWorkCustomColumn[];
  viewConfig: MyWorkViewConfig | null;
}) {
  const [data, setData] = useState<MyWorkRow[]>(rows);
  const [columns, setColumns] = useState<MyWorkCustomColumn[]>(customColumns);
  const [order, setOrder] = useState<string[]>(viewConfig?.column_order ?? []);
  const [hidden, setHidden] = useState<string[]>(viewConfig?.hidden ?? []);
  const [widths, setWidths] = useState<Record<string, number>>({
    ...DEFAULT_WIDTHS,
    ...(viewConfig?.widths ?? {}),
  });

  const [sortBy, setSortBy] = useState<string>("dueDate");
  const [sortAsc, setSortAsc] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  // Add-column popover (anchored under the "+" header).
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Columns settings panel.
  const [showPanel, setShowPanel] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragToken, setDragToken] = useState<string | null>(null);
  const [dragOverToken, setDragOverToken] = useState<string | null>(null);

  // Inline cell editing for custom columns.
  const [editingCell, setEditingCell] = useState<{ taskId: string; columnId: string } | null>(null);
  const [cellDraft, setCellDraft] = useState("");

  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Reconcile the saved order with the columns that actually exist: keep known
  // tokens in saved order, then append any new built-in/custom columns, and drop
  // tokens for deleted columns. This is the single source of truth for layout.
  const orderedAll = useMemo(() => {
    const knownTokens = [...DEFAULT_ORDER, ...columns.map((c) => colToken(c.id))];
    const result: string[] = [];
    const seen = new Set<string>();
    for (const t of order) {
      if (knownTokens.includes(t) && !seen.has(t)) {
        result.push(t);
        seen.add(t);
      }
    }
    for (const t of knownTokens) {
      if (!seen.has(t)) {
        result.push(t);
        seen.add(t);
      }
    }
    return result;
  }, [order, columns]);
  const visible = orderedAll.filter((t) => !hidden.includes(t));

  const customById = new Map(columns.map((c) => [c.id, c]));
  const labelFor = (token: string) =>
    isCustom(token) ? customById.get(customId(token))?.name ?? "Column" : BUILTIN_LABEL[token];
  const widthFor = (token: string) =>
    widths[token] ?? DEFAULT_WIDTHS[token] ?? DEFAULT_CUSTOM_WIDTH;

  // Event handlers are recreated each render, so they close over the current
  // layout — no refs needed. persist() saves the current layout, with optional
  // overrides for the field the caller just changed.
  function persist(over?: Partial<MyWorkViewConfig>) {
    void saveViewLayout({
      column_order: over?.column_order ?? orderedAll,
      hidden: over?.hidden ?? hidden,
      widths: over?.widths ?? widths,
    });
  }

  const startResize = useCallback(
    (e: React.MouseEvent, token: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = widths[token] ?? DEFAULT_WIDTHS[token] ?? DEFAULT_CUSTOM_WIDTH;
      const start = { startX: e.clientX, startWidth };
      const min = token === "title" ? MIN_TITLE_WIDTH : MIN_WIDTH;
      // Capture the rest of the layout at drag start; widths come from the final
      // setState below since they change continuously during the drag.
      const capturedOrder = orderedAll;
      const capturedHidden = hidden;

      const move = (ev: MouseEvent) => {
        const next = Math.max(min, start.startWidth + (ev.clientX - start.startX));
        setWidths((w) => ({ ...w, [token]: next }));
      };
      const cleanup = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        dragCleanupRef.current = null;
      };
      const up = () => {
        cleanup();
        // Persist the final widths once the drag ends.
        setWidths((w) => {
          void saveViewLayout({ column_order: capturedOrder, hidden: capturedHidden, widths: w });
          return w;
        });
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      dragCleanupRef.current = cleanup;
    },
    [widths, orderedAll, hidden],
  );

  function handleReset() {
    setOrder([]);
    setHidden([]);
    setWidths({ ...DEFAULT_WIDTHS });
    void resetViewLayout();
  }

  function handleSort(token: string) {
    if (token === sortBy) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(token);
      setSortAsc(true);
    }
  }

  function toggleHidden(token: string) {
    const next = hidden.includes(token) ? hidden.filter((t) => t !== token) : [...hidden, token];
    setHidden(next);
    persist({ hidden: next });
  }

  // --- Column reorder (native DnD inside the settings panel) ---
  function handleColDrop(target: string) {
    if (!dragToken || dragToken === target) {
      setDragToken(null);
      setDragOverToken(null);
      return;
    }
    const list = [...orderedAll];
    const from = list.indexOf(dragToken);
    const to = list.indexOf(target);
    if (from !== -1 && to !== -1) {
      list.splice(from, 1);
      list.splice(to, 0, dragToken);
      setOrder(list);
      persist({ column_order: list });
    }
    setDragToken(null);
    setDragOverToken(null);
  }

  // --- Add / rename / delete custom columns ---
  async function handleAddColumn() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      setNewName("");
      return;
    }
    setAdding(false);
    setNewName("");
    const result = await addCustomColumn(name);
    if (result?.data) {
      setColumns((cols) => [...cols, result.data!]);
      setOrder([...orderedAll, colToken(result.data.id)]);
    }
  }

  async function handleRename(id: string) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, name } : c)));
    await renameCustomColumn(id, name);
  }

  async function handleDelete(id: string) {
    setColumns((cols) => cols.filter((c) => c.id !== id));
    setOrder(orderedAll.filter((t) => t !== colToken(id)));
    setData((rows) =>
      rows.map((r) => {
        if (!(id in r.customCells)) return r;
        const next = { ...r.customCells };
        delete next[id];
        return { ...r, customCells: next };
      }),
    );
    await deleteCustomColumn(id);
  }

  // --- Inline cell editing ---
  function startEditCell(taskId: string, columnId: string, current: string) {
    setEditingCell({ taskId, columnId });
    setCellDraft(current);
  }

  function commitCell() {
    if (!editingCell) return;
    const { taskId, columnId } = editingCell;
    const value = cellDraft.trim();
    setData((rows) =>
      rows.map((r) => {
        if (r.id !== taskId) return r;
        const next = { ...r.customCells };
        if (value) next[columnId] = value;
        else delete next[columnId];
        return { ...r, customCells: next };
      }),
    );
    setEditingCell(null);
    setCellDraft("");
    void setCellValue(columnId, taskId, value);
  }

  function handleToggle(rowId: string) {
    let prev: { status: MyWorkRow["status"]; lastModified: string } | undefined;
    let nextDone = false;
    setData((rows) =>
      rows.map((r) => {
        if (r.id !== rowId) return r;
        prev = { status: r.status, lastModified: r.lastModified };
        nextDone = r.status !== "done";
        return { ...r, status: nextDone ? "done" : "todo", lastModified: new Date().toISOString() };
      }),
    );
    setPendingIds((ids) => new Set(ids).add(rowId));
    void (async () => {
      const result = await toggleTaskDone(rowId, nextDone);
      if (result?.error && prev !== undefined) {
        const restore = prev;
        setData((rows) =>
          rows.map((r) =>
            r.id === rowId ? { ...r, status: restore.status, lastModified: restore.lastModified } : r,
          ),
        );
      }
      setPendingIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(rowId);
        return nextIds;
      });
    })();
  }

  const sorted = [...data].sort((a, b) => {
    if (isCustom(sortBy)) {
      const id = customId(sortBy);
      const av = a.customCells[id] ?? "";
      const bv = b.customCells[id] ?? "";
      const nr = nullRank(av || null, bv || null);
      if (nr !== null) return nr;
      const cmp = av.localeCompare(bv);
      return sortAsc ? cmp : -cmp;
    }

    const nullableDateCols = ["createdAt", "dueDate", "lastModified"] as const;
    if ((nullableDateCols as readonly string[]).includes(sortBy)) {
      const aVal = a[sortBy as "createdAt" | "dueDate" | "lastModified"];
      const bVal = b[sortBy as "createdAt" | "dueDate" | "lastModified"];
      const nr = nullRank(aVal, bVal);
      if (nr !== null) return nr;
      const cmp = compareNonNullString(aVal, bVal) ?? 0;
      return sortAsc ? cmp : -cmp;
    }

    let cmp = 0;
    switch (sortBy) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "status":
        cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        break;
      case "priority":
        cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        break;
      case "assignee":
        cmp = personName(a.assignee).localeCompare(personName(b.assignee));
        break;
      case "reporter":
        cmp = personName(a.reporter).localeCompare(personName(b.reporter));
        break;
      case "event":
        cmp = (a.event?.name ?? "").localeCompare(b.event?.name ?? "");
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  if (data.length === 0) {
    return (
      <div className="border border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center gap-2">
        <p className="text-sm text-white/40">No tasks assigned to or reported by you yet</p>
      </div>
    );
  }

  // The table fills its container; the trailing add-column slot flexes to absorb
  // any leftover width. minWidth keeps the fixed columns from collapsing on narrow
  // screens (horizontal scroll kicks in instead).
  const contentWidth = widthFor("checkbox") + visible.reduce((sum, t) => sum + widthFor(t), 0);

  return (
    <div className="space-y-2">
      <div className="relative flex justify-end gap-3">
        <button
          onClick={() => setShowPanel((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 text-[11px] transition-colors",
            showPanel ? "text-white/70" : "text-white/30 hover:text-white/60",
          )}
        >
          <Settings2 className="w-3 h-3" />
          Columns
        </button>
        <button
          onClick={handleReset}
          className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
        >
          Reset columns
        </button>

        {showPanel && (
          <ColumnsPanel
            orderedAll={orderedAll}
            hidden={hidden}
            labelFor={labelFor}
            renamingId={renamingId}
            renameDraft={renameDraft}
            dragToken={dragToken}
            dragOverToken={dragOverToken}
            onClose={() => setShowPanel(false)}
            onToggleHidden={toggleHidden}
            onDragStart={setDragToken}
            onDragOver={setDragOverToken}
            onDrop={handleColDrop}
            onDragEnd={() => {
              setDragToken(null);
              setDragOverToken(null);
            }}
            onStartRename={(id, current) => {
              setRenamingId(id);
              setRenameDraft(current);
            }}
            onRenameDraft={setRenameDraft}
            onCommitRename={handleRename}
            onCancelRename={() => setRenamingId(null)}
            onDelete={handleDelete}
          />
        )}
      </div>

      <div className="border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="table-fixed border-collapse text-xs w-full"
            style={{ minWidth: contentWidth + ADD_COL_WIDTH }}
          >
            <colgroup>
              <col style={{ width: widthFor("checkbox") }} />
              {visible.map((t) => (
                <col key={t} style={{ width: widthFor(t) }} />
              ))}
              {/* No width — this column flexes to fill the remaining space. */}
              <col />
            </colgroup>

            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.08]">
                <th className="border-r border-white/[0.06] px-3 py-2.5" />
                {visible.map((t) => (
                  <HeaderCell
                    key={t}
                    label={labelFor(t)}
                    active={sortBy === t}
                    asc={sortAsc}
                    onSort={() => handleSort(t)}
                    onResizeStart={(e) => startResize(e, t)}
                  />
                ))}
                {/* Add-column header — fills the remaining width; "+" sits at its left edge. */}
                <th className="relative px-3 py-2.5 text-left text-white/30">
                  <button
                    onClick={() => setAdding((v) => !v)}
                    className="flex items-center hover:text-white/70 transition-colors"
                    title="Add column"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {adding && (
                    <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-white/10 bg-[#0D0D1C] p-2 shadow-2xl">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAddColumn();
                          if (e.key === "Escape") {
                            setAdding(false);
                            setNewName("");
                          }
                        }}
                        placeholder="Column name"
                        className="w-full rounded-md bg-white/[0.04] border border-white/10 px-2 py-1.5 text-xs text-white/80 placeholder:text-white/30 outline-none focus:border-indigo-500/50"
                      />
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setAdding(false);
                            setNewName("");
                          }}
                          className="rounded-md px-2 py-1 text-[11px] text-white/40 hover:text-white/70"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void handleAddColumn()}
                          className="rounded-md bg-indigo-500/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((row) => {
                const done = row.status === "done";
                return (
                  <tr
                    key={row.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    {/* checkbox */}
                    <td className="border-r border-white/[0.04] px-3 py-2.5 align-middle">
                      <button
                        onClick={() => handleToggle(row.id)}
                        disabled={pendingIds.has(row.id)}
                        className="w-5 h-5 flex items-center justify-center hover:opacity-70 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                        title={done ? "Mark as to do" : "Mark as done"}
                      >
                        {done ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-white/20" />
                        )}
                      </button>
                    </td>

                    {visible.map((t) =>
                      isCustom(t) ? (
                        <CustomCell
                          key={t}
                          value={row.customCells[customId(t)] ?? ""}
                          editing={
                            editingCell?.taskId === row.id && editingCell?.columnId === customId(t)
                          }
                          draft={cellDraft}
                          onStartEdit={() =>
                            startEditCell(row.id, customId(t), row.customCells[customId(t)] ?? "")
                          }
                          onDraft={setCellDraft}
                          onCommit={commitCell}
                          onCancel={() => {
                            setEditingCell(null);
                            setCellDraft("");
                          }}
                        />
                      ) : (
                        <BuiltinCell key={t} token={t} row={row} done={done} />
                      ),
                    )}

                    {/* spacer cell under the add-column header */}
                    <td className="px-2 py-2.5" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BuiltinCell({ token, row, done }: { token: string; row: MyWorkRow; done: boolean }) {
  switch (token) {
    case "title":
      return (
        <Cell>
          <div className="flex items-center gap-2 min-w-0">
            {row.href ? (
              <Link
                href={row.href}
                className={cn(
                  "flex-1 min-w-0 truncate font-medium transition-colors hover:text-indigo-300 hover:underline",
                  done ? "line-through text-white/30" : "text-white/80",
                )}
                title={row.title}
              >
                {row.title}
              </Link>
            ) : (
              <span
                className={cn(
                  "flex-1 min-w-0 truncate font-medium",
                  done ? "line-through text-white/30" : "text-white/80",
                )}
                title={row.title}
              >
                {row.title}
              </span>
            )}
            {row.commentCount > 0 && (
              <span
                className="shrink-0 inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-white/50"
                title={`${row.commentCount} comment${row.commentCount === 1 ? "" : "s"}`}
              >
                <MessageSquare className="w-3 h-3" />
                {row.commentCount}
              </span>
            )}
          </div>
        </Cell>
      );
    case "status":
      return (
        <Cell className="text-center">
          <span
            className={cn(
              "inline-block truncate max-w-full rounded-md px-2 py-0.5 font-medium",
              STATUS_STYLE[row.status],
            )}
          >
            {STATUS_LABEL[row.status]}
          </span>
        </Cell>
      );
    case "createdAt":
      return (
        <Cell className="text-center text-white/40 whitespace-nowrap">
          {formatMonthDay(row.createdAt)}
        </Cell>
      );
    case "dueDate":
      return (
        <Cell className="text-center text-white/40 whitespace-nowrap">
          {row.dueDate ? formatMonthDay(row.dueDate) : "—"}
        </Cell>
      );
    case "lastModified":
      return (
        <Cell className="text-center text-white/40 whitespace-nowrap" title={formatDate(row.lastModified)}>
          {formatMonthDay(row.lastModified)}
        </Cell>
      );
    case "priority":
      return (
        <Cell className={cn("text-center font-semibold capitalize", PRIORITY_COLOR[row.priority])}>
          {row.priority}
        </Cell>
      );
    case "assignee":
      return (
        <Cell className="text-center">
          <Person person={row.assignee} />
        </Cell>
      );
    case "reporter":
      return (
        <Cell className="text-center">
          <Person person={row.reporter} />
        </Cell>
      );
    case "event":
      return (
        <Cell className="text-center">
          {row.event ? (
            <Link
              href={`/events/${row.event.slug}`}
              className="block truncate text-white/50 hover:text-indigo-300 hover:underline"
              title={row.event.name}
            >
              {row.event.name}
            </Link>
          ) : (
            <span className="text-white/30">—</span>
          )}
        </Cell>
      );
    default:
      return <Cell />;
  }
}

function CustomCell({
  value,
  editing,
  draft,
  onStartEdit,
  onDraft,
  onCommit,
  onCancel,
}: {
  value: string;
  editing: boolean;
  draft: string;
  onStartEdit: () => void;
  onDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <td className="border-r border-white/[0.04] px-1.5 py-1 align-middle overflow-hidden">
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          className="w-full rounded-md bg-white/[0.06] border border-indigo-500/40 px-2 py-1 text-xs text-white/80 outline-none"
        />
      </td>
    );
  }
  return (
    <td
      onClick={onStartEdit}
      className="border-r border-white/[0.04] px-3 py-2.5 align-middle overflow-hidden cursor-text hover:bg-white/[0.04]"
      title={value || "Click to edit"}
    >
      {value ? (
        <span className="block truncate text-white/70">{value}</span>
      ) : (
        <span className="block text-white/20">—</span>
      )}
    </td>
  );
}

function Cell({
  children,
  className,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn("px-3 py-2.5 align-middle overflow-hidden border-r border-white/[0.04]", className)}
    >
      {children}
    </td>
  );
}

function HeaderCell({
  label,
  active,
  asc,
  onSort,
  onResizeStart,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onSort: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <th className="relative px-3 py-2.5 font-medium text-white/30 overflow-hidden border-r border-white/[0.06]">
      <button
        onClick={onSort}
        className={cn(
          "flex items-center justify-center gap-1 w-full text-center hover:text-white/60 transition-colors",
          active && "text-white/60",
        )}
      >
        <span className="truncate">{label}</span>
        {active &&
          (asc ? (
            <ChevronUp className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 shrink-0" />
          ))}
      </button>

      {/* Drag handle — sits over the right column line; resizes this column. */}
      <span
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-indigo-500/40 active:bg-indigo-500/60"
        title="Drag to resize"
      />
    </th>
  );
}

function ColumnsPanel({
  orderedAll,
  hidden,
  labelFor,
  renamingId,
  renameDraft,
  dragToken,
  dragOverToken,
  onClose,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onStartRename,
  onRenameDraft,
  onCommitRename,
  onCancelRename,
  onDelete,
}: {
  orderedAll: string[];
  hidden: string[];
  labelFor: (token: string) => string;
  renamingId: string | null;
  renameDraft: string;
  dragToken: string | null;
  dragOverToken: string | null;
  onClose: () => void;
  onToggleHidden: (token: string) => void;
  onDragStart: (token: string) => void;
  onDragOver: (token: string) => void;
  onDrop: (token: string) => void;
  onDragEnd: () => void;
  onStartRename: (id: string, current: string) => void;
  onRenameDraft: (v: string) => void;
  onCommitRename: (id: string) => void;
  onCancelRename: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="absolute top-full right-0 z-30 mt-1 w-72 rounded-lg border border-white/10 bg-[#0D0D1C] p-2 shadow-2xl">
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <span className="text-[11px] font-medium text-white/50">Columns</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/70" title="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {orderedAll.map((token) => {
          const isHidden = hidden.includes(token);
          const custom = isCustom(token);
          const id = custom ? customId(token) : "";
          const renaming = custom && renamingId === id;
          return (
            <div
              key={token}
              draggable={!renaming}
              onDragStart={() => onDragStart(token)}
              onDragOver={(e) => {
                e.preventDefault();
                if (token !== dragToken) onDragOver(token);
              }}
              onDrop={() => onDrop(token)}
              onDragEnd={onDragEnd}
              className={cn(
                "group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs",
                dragOverToken === token && dragToken !== token
                  ? "bg-indigo-500/20"
                  : "hover:bg-white/[0.04]",
                dragToken === token && "opacity-40",
              )}
            >
              <GripVertical className="w-3.5 h-3.5 shrink-0 cursor-grab text-white/20" />
              {renaming ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => onRenameDraft(e.target.value)}
                  onBlur={() => onCommitRename(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommitRename(id);
                    if (e.key === "Escape") onCancelRename();
                  }}
                  className="flex-1 min-w-0 rounded bg-white/[0.06] border border-indigo-500/40 px-1.5 py-0.5 text-xs text-white/80 outline-none"
                />
              ) : (
                <span
                  className={cn("flex-1 min-w-0 truncate", isHidden ? "text-white/30" : "text-white/70")}
                >
                  {labelFor(token)}
                </span>
              )}
              {custom && !renaming && (
                <>
                  <button
                    onClick={() => onStartRename(id, labelFor(token))}
                    className="shrink-0 text-white/20 hover:text-white/70"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(id)}
                    className="shrink-0 text-white/20 hover:text-red-400"
                    title="Delete column"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={() => onToggleHidden(token)}
                className="shrink-0 text-white/20 hover:text-white/70"
                title={isHidden ? "Show column" : "Hide column"}
              >
                {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Person({ person }: { person: MyWorkRow["assignee"] }) {
  if (!person) return <span className="text-white/30">—</span>;
  const full = person.full_name || person.email || "—";
  const shown = firstName(person) || full;
  return (
    <span className="flex items-center justify-center gap-1.5 min-w-0" title={full}>
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatar_url}
          alt={full}
          className="w-6 h-6 rounded-full object-cover border border-indigo-500/30 shrink-0"
        />
      ) : (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-semibold text-indigo-300 shrink-0">
          {getInitials(full)}
        </span>
      )}
      <span className="truncate text-white/60">{shown}</span>
    </span>
  );
}
