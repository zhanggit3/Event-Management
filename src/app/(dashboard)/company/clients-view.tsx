"use client";

import { useState } from "react";
import { Trash2, Pencil, ChevronUp, ChevronDown, Users, Plus } from "lucide-react";
import type { Client } from "@/types/database";
import { deleteClient } from "@/app/actions/clients";
import { ClientDialog } from "@/components/client-dialog";
import { formatDate, cn } from "@/lib/utils";

type SortKey = "client_name" | "company_name" | "email" | "phone" | "created_at";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const COLUMNS: { key: SortKey | "projects"; label: string; sortable: boolean }[] = [
  { key: "client_name", label: "Client Name", sortable: true },
  { key: "company_name", label: "Company Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "projects", label: "Projects", sortable: false },
  { key: "created_at", label: "Date Added", sortable: true },
];

function valueFor(c: Client, key: SortKey): string {
  switch (key) {
    case "client_name": return c.client_name ?? "";
    case "company_name": return c.company_name ?? "";
    case "email": return c.email ?? "";
    case "phone": return c.phone ?? "";
    case "created_at": return c.created_at ?? "";
  }
}

export function ClientsView({
  organizationId,
  isAdmin,
  currentUserId,
  clients,
}: {
  organizationId: string;
  isAdmin: boolean;
  currentUserId: string;
  clients: Client[];
}) {
  const [list, setList] = useState<Client[]>(clients);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = closed · "new" = add mode · Client = edit mode
  const [dialog, setDialog] = useState<Client | "new" | null>(null);

  const canManage = (c: Client) => isAdmin || c.created_by === currentUserId;
  const showActions = isAdmin || list.some((c) => c.created_by === currentUserId);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? list.filter((c) =>
        [c.client_name, c.company_name, c.email].some((v) => (v ?? "").toLowerCase().includes(q)),
      )
    : list;

  const rows = sort
    ? [...filtered].sort((a, b) => {
        const cmp = valueFor(a, sort.key).toLowerCase().localeCompare(valueFor(b, sort.key).toLowerCase());
        return sort.dir === "asc" ? cmp : -cmp;
      })
    : filtered;

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev && prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function handleSaved(c: Client) {
    setList((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const result = await deleteClient(id);
    if ("error" in result && result.error) {
      setError(result.error);
      setDeletingId(null);
      setConfirmingId(null);
      return;
    }
    setList((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
    setConfirmingId(null);
  }

  const colCount = COLUMNS.length + (showActions ? 1 : 0);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">Clients</h1>
        <button
          onClick={() => setDialog("new")}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {/* Search */}
      <div className="mb-5 max-w-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Clients"
          className="flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
        />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {COLUMNS.map((col) => (
                  <th key={col.key} className="text-left font-medium text-white/40 px-4 py-3 whitespace-nowrap">
                    {col.sortable ? (
                      <button
                        onClick={() => toggleSort(col.key as SortKey)}
                        className="inline-flex items-center gap-1 hover:text-white/70 transition-colors uppercase tracking-wide text-[11px]"
                      >
                        {col.label}
                        {sort?.key === col.key &&
                          (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    ) : (
                      <span className="uppercase tracking-wide text-[11px]">{col.label}</span>
                    )}
                  </th>
                ))}
                {showActions && <th className="w-20 px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-white/40">
                    No clients match “{search}”.
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const isConfirming = confirmingId === c.id;
                  return (
                    <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{c.client_name}</td>
                      <td className="px-4 py-3 text-white/70 whitespace-nowrap">{c.company_name || "—"}</td>
                      <td className="px-4 py-3 text-white/70 whitespace-nowrap">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-white/70 whitespace-nowrap">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-white/70 whitespace-nowrap">{c.projects || "—"}</td>
                      <td className="px-4 py-3 text-white/50 whitespace-nowrap">{formatDate(c.created_at)}</td>
                      {showActions && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {canManage(c) && (
                            isConfirming ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(c.id)}
                                  disabled={deletingId === c.id}
                                  className="inline-flex items-center justify-center h-7 px-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-semibold hover:bg-red-500/25 transition-all disabled:opacity-50"
                                >
                                  {deletingId === c.id ? "…" : "Delete"}
                                </button>
                                <button
                                  onClick={() => setConfirmingId(null)}
                                  className="inline-flex items-center justify-center h-7 px-2 rounded-lg bg-white/[0.06] border border-white/10 text-white/60 text-[11px] font-semibold hover:bg-white/[0.1] transition-all"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => setDialog(c)}
                                  aria-label="Edit client"
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:bg-white/[0.12] hover:text-white transition-all"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setConfirmingId(c.id)}
                                  aria-label="Delete client"
                                  className={cn(
                                    "inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 text-white/40",
                                    "hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30 transition-all",
                                  )}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            )
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialog !== null && (
        <ClientDialog
          organizationId={organizationId}
          client={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
        <Users className="w-6 h-6 text-indigo-400" />
      </div>
      <h2 className="text-lg font-bold text-white mb-2">No clients yet</h2>
      <p className="text-sm text-white/40 max-w-xs">
        Add your first client to start building your company directory. Use the “Add Client” button above.
      </p>
    </div>
  );
}
