import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ArrowRight, CalendarDays } from "lucide-react";
import { NoOrgPrompt } from "@/components/no-org-prompt";
import { EventCard } from "@/components/event-card";
import { getDashboardData } from "@/lib/queries/dashboard-events";

export default async function DashboardPage() {
  const { firstName, workspaceEvents, events, allOrgInfos, noOrg, componentRedirectSlug } =
    await getDashboardData();

  // Component-scope-only users are bounced straight to their event.
  if (componentRedirectSlug) {
    redirect(`/events/${componentRedirectSlug}`);
  }

  if (noOrg) {
    return (
      <div className="min-h-full">
        <NoOrgPrompt />
      </div>
    );
  }

  const allEvents = [...workspaceEvents, ...events];
  const totalEvents = allEvents.length;
  const activeCount = allEvents.filter((e) => e.status === "active").length;
  const draftCount = allEvents.filter((e) => e.status === "draft").length;

  // "Upcoming" = events with a date today or later, soonest first. Dateless events are excluded here.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allEvents
    .filter((e) => e.event_date && e.event_date >= today)
    .sort((a, b) => (a.event_date as string).localeCompare(b.event_date as string))
    .slice(0, 6);

  return (
    <div className="min-h-full">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {firstName ? `${firstName}'s Workspace` : "Your Workspace"}
            </h1>
            <p className="text-sm text-white/40 mt-1 font-mono">
              {totalEvents} event{totalEvents !== 1 ? "s" : ""}
              {allOrgInfos.length > 0 && ` · ${allOrgInfos.length} organization${allOrgInfos.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link
            href="/events/new"
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/25"
          >
            <Plus className="w-4 h-4" />
            New Event
          </Link>
        </div>

        {/* Stats row */}
        {totalEvents > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { label: "Total events", value: totalEvents, sub: "all time" },
              { label: "Active",       value: activeCount, sub: "in progress" },
              { label: "Drafts",       value: draftCount,  sub: "in planning" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-5 py-4">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/50 mt-0.5 font-medium">{stat.label}</p>
                <p className="text-xs text-white/25 mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming events */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-white/25">
              Upcoming events
            </p>
            <Link
              href="/events"
              className="flex items-center gap-1 text-xs font-medium text-white/40 hover:text-white/70 transition-colors"
            >
              View all events
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {upcoming.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-white/[0.02] border border-white/[0.06] rounded-xl">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <CalendarDays className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-sm text-white/50 mb-4 max-w-xs">
                {totalEvents > 0
                  ? "No upcoming events with a scheduled date."
                  : "No events yet. Create your first event to get started."}
              </p>
              <Link
                href="/events"
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 text-sm font-semibold hover:bg-white/[0.1] hover:text-white transition-all"
              >
                Go to events
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
