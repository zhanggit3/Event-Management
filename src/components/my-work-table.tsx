"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Circle, Check, MessageSquare, ChevronUp, ChevronDown } from "lucide-react";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { toggleTaskDone } from "@/app/actions/my-work";
import type { MyWorkRow } from "@/types/database";

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

type SortCol =
  | "title"
  | "status"
  | "createdAt"
  | "dueDate"
  | "lastModified"
  | "priority"
  | "assignee"
  | "reporter"
  | "event";

type ColKey = "checkbox" | SortCol;

const COLUMNS: { key: SortCol; label: string }[] = [
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

// Default widths (px). Item is widest (it also carries the inline comment bubble);
// date columns fit "Jun 4"; Assignee/Reporter fit a first name + avatar. The user
// can drag the column edge to resize any of these.
const DEFAULT_WIDTHS: Record<ColKey, number> = {
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

const MIN_WIDTH = 56;
const MIN_TITLE_WIDTH = 140;

function personName(p: MyWorkRow["assignee"]): string {
  return p?.full_name || p?.email || "";
}

function firstName(p: MyWorkRow["assignee"]): string {
  const full = personName(p);
  return full.split(/\s+/)[0] || full;
}

// Month + day only (e.g. "Jun 4"), so the date columns stay narrow. The shared
// formatDate() includes the year and is used elsewhere, so we keep a local one.
function formatMonthDay(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  // A date-only string ("YYYY-MM-DD", e.g. due_date) parses as UTC midnight; format
  // it in UTC so it doesn't shift to the previous day in negative-offset timezones.
  // Full timestamps (created_at, updated_at) are instants — format in local time.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(d);
}

// Returns the non-null ordering only (subject to the asc/desc sign flip).
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

export function MyWorkTable({ rows }: { rows: MyWorkRow[] }) {
  const [data, setData] = useState<MyWorkRow[]>(rows);
  const [sortBy, setSortBy] = useState<SortCol>("dueDate");
  const [sortAsc, setSortAsc] = useState(true);
  const [widths, setWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  // Per-row in-flight toggles, so one pending toggle doesn't disable every checkbox.
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  // Holds the teardown for an in-progress column drag so we can run it on unmount
  // if the user navigates away while still holding the handle.
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  const startResize = useCallback((e: React.MouseEvent, key: ColKey) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { startX: e.clientX, startWidth: widths[key] };
    const min = key === "title" ? MIN_TITLE_WIDTH : MIN_WIDTH;

    const move = (ev: MouseEvent) => {
      const next = Math.max(min, start.startWidth + (ev.clientX - start.startX));
      setWidths((w) => ({ ...w, [key]: next }));
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      dragCleanupRef.current = null;
    };
    const up = () => cleanup();

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    dragCleanupRef.current = cleanup;
  }, [widths]);

  function resetWidths() {
    setWidths(DEFAULT_WIDTHS);
  }

  function handleSort(col: SortCol) {
    if (col === sortBy) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(col);
      setSortAsc(true);
    }
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
        // Restore both status and the prior timestamp so a failed toggle doesn't
        // leave a bogus "now" Last Modified (which would also re-sort the row).
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

  const totalWidth = (Object.keys(DEFAULT_WIDTHS) as ColKey[]).reduce((sum, k) => sum + widths[k], 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          onClick={resetWidths}
          className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
        >
          Reset columns
        </button>
      </div>

      <div className="border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="table-fixed border-collapse text-xs"
            style={{ width: totalWidth }}
          >
            <colgroup>
              <col style={{ width: widths.checkbox }} />
              {COLUMNS.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] }} />
              ))}
            </colgroup>

            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.08]">
                <th className="border-r border-white/[0.06] px-3 py-2.5" />
                {COLUMNS.map((c, i) => (
                  <HeaderCell
                    key={c.key}
                    label={c.label}
                    active={sortBy === c.key}
                    asc={sortAsc}
                    last={i === COLUMNS.length - 1}
                    onSort={() => handleSort(c.key)}
                    onResizeStart={(e) => startResize(e, c.key)}
                  />
                ))}
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

                    {/* Item name (deep link) + inline comment bubble */}
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

                    {/* Status */}
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

                    {/* Created */}
                    <Cell className="text-center text-white/40 whitespace-nowrap">
                      {formatMonthDay(row.createdAt)}
                    </Cell>

                    {/* Due */}
                    <Cell className="text-center text-white/40 whitespace-nowrap">
                      {row.dueDate ? formatMonthDay(row.dueDate) : "—"}
                    </Cell>

                    {/* Last Modified */}
                    <Cell
                      className="text-center text-white/40 whitespace-nowrap"
                      title={formatDate(row.lastModified)}
                    >
                      {formatMonthDay(row.lastModified)}
                    </Cell>

                    {/* Priority */}
                    <Cell className={cn("text-center font-semibold capitalize", PRIORITY_COLOR[row.priority])}>
                      {row.priority}
                    </Cell>

                    {/* Assignee */}
                    <Cell className="text-center">
                      <Person person={row.assignee} />
                    </Cell>

                    {/* Reporter */}
                    <Cell className="text-center">
                      <Person person={row.reporter} />
                    </Cell>

                    {/* Event */}
                    <Cell className="text-center" last>
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

function Cell({
  children,
  className,
  last,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  last?: boolean;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        "px-3 py-2.5 align-middle overflow-hidden",
        !last && "border-r border-white/[0.04]",
        className,
      )}
    >
      {children}
    </td>
  );
}

function HeaderCell({
  label,
  active,
  asc,
  last,
  onSort,
  onResizeStart,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  last: boolean;
  onSort: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <th
      className={cn(
        "relative px-3 py-2.5 font-medium text-white/30 overflow-hidden",
        !last && "border-r border-white/[0.06]",
      )}
    >
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
