import Link from "next/link";
import { CalendarDays, Plus, Layers, ArrowUpRight, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { EventRow } from "@/lib/queries/dashboard-events";

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Active",    color: "bg-emerald-500/15 text-emerald-400" },
  draft:     { label: "Draft",     color: "bg-amber-500/15 text-amber-400" },
  completed: { label: "Completed", color: "bg-blue-500/15 text-blue-400" },
  archived:  { label: "Archived",  color: "bg-white/10 text-white/40" },
};

export function EventCard({ event }: { event: EventRow }) {
  const componentCount = event.components?.[0]?.count ?? 0;
  const cfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.archived;

  return (
    <Link href={`/events/${event.slug}`}>
      <div className="group bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="font-semibold text-white text-sm leading-snug group-hover:text-blue-300 transition-colors line-clamp-2 flex-1">
            {event.name}
          </p>
          <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
        </div>

        <span className={`inline-flex items-center self-start px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide mb-3 ${cfg.color}`}>
          {cfg.label}
        </span>

        {event.description && (
          <p className="text-xs text-white/40 line-clamp-2 flex-1 mb-4">{event.description}</p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-white/30 font-mono mt-auto">
          {event.event_date && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(event.event_date)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {componentCount} component{componentCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EmptyEventsState({ isGuest }: { isGuest: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
        <CalendarDays className="w-6 h-6 text-blue-400" />
      </div>
      <h2 className="text-lg font-bold text-white mb-2">No events yet</h2>
      <p className="text-sm text-white/40 mb-7 max-w-xs">
        {isGuest
          ? "You have not been invited to any events yet. Ask an organizer for an invite link."
          : "Create your first event to get started. Each event can have its own custom set of components."}
      </p>
      {!isGuest && (
        <Link
          href="/events/new"
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/25"
        >
          <Plus className="w-4 h-4" />
          Create your first event
        </Link>
      )}
    </div>
  );
}
