import Link from "next/link";
import { Plus } from "lucide-react";
import { NoOrgPrompt } from "@/components/no-org-prompt";
import { EventCard, EmptyEventsState } from "@/components/event-card";
import { getDashboardData } from "@/lib/queries/dashboard-events";

export default async function EventsPage() {
  const { firstName, workspaceEvents, events, allOrgInfos, noOrg } = await getDashboardData();

  if (noOrg) {
    return (
      <div className="min-h-full">
        <NoOrgPrompt />
      </div>
    );
  }

  const totalEvents = workspaceEvents.length + events.length;

  return (
    <div className="min-h-full">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Events</h1>
            <p className="text-sm text-white/40 mt-1 font-mono">
              {firstName ? `${firstName}'s Workspace` : "Your Workspace"} · {totalEvents} event{totalEvents !== 1 ? "s" : ""}
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

        {/* My Space — workspace-owned events */}
        {workspaceEvents.length > 0 && (
          <div className="mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-white/25 mb-4">
              My Space
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {workspaceEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* Shared with me — events from invited orgs */}
        {events.length > 0 && (
          <div>
            {allOrgInfos.length > 0 && (
              <p className="text-xs font-medium uppercase tracking-wider text-white/25 mb-4">
                {workspaceEvents.length > 0 ? "Shared with me" : null}
              </p>
            )}
            {allOrgInfos.length > 1 ? (
              // Multiple orgs: group by org name
              allOrgInfos.map(({ org }) => {
                const orgEvents = events.filter((e) => e.organization_id === org.id);
                if (orgEvents.length === 0) return null;
                return (
                  <div key={org.id} className="mb-10">
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">
                      {org.name}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {orgEvents.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              // Single org: flat list
              <>
                {workspaceEvents.length === 0 && (
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">
                    {allOrgInfos[0]?.org.name ?? "Events"}
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Empty state — no events anywhere */}
        {totalEvents === 0 && (
          <EmptyEventsState isGuest={!allOrgInfos.some((m) => m.role !== "guest")} />
        )}
      </div>
    </div>
  );
}
