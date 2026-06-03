import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalendarDays, Plus, Layers, ArrowUpRight, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { NoOrgPrompt } from "@/components/no-org-prompt";
import type { Event } from "@/types/database";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: "Active",    color: "bg-emerald-500/15 text-emerald-400" },
  draft:     { label: "Draft",     color: "bg-amber-500/15 text-amber-400" },
  completed: { label: "Completed", color: "bg-blue-500/15 text-blue-400" },
  archived:  { label: "Archived",  color: "bg-white/10 text-white/40" },
};

type EventRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  event_date: string | null;
  organization_id: string;
  created_at: string;
  components: { count: number }[];
};

type OrgInfo = { id: string; name: string; slug: string };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let allOrgInfos: { org: OrgInfo; role: string }[] = [];
  let events: EventRow[] = [];
  let workspaceEvents: EventRow[] = [];
  let noOrg = false;
  let firstName = "";
  let displayName = "";

  if (user) {
    // Fetch profile for name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();
    displayName = profile?.full_name || user.email || "User";
    firstName = displayName.split(" ")[0] || "";

    // Fetch all memberships upfront (used for component-scope redirect check and full-org detection)
    const { data: orgMemberships } = await supabase
      .from("organization_members")
      .select("organization_id, role, scope, organizations(id, name, slug, is_workspace)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // Check for component-scope-ONLY users and redirect early (preserve existing behavior).
    // Only redirect if the user has NO scope=org and NO scope=event memberships.
    const hasOrgOrEventScope = (orgMemberships ?? []).some(
      (m) => m.scope === "org" || m.scope === "event"
    );
    const hasComponentScope = (orgMemberships ?? []).some((m) => m.scope === "component");

    if (hasComponentScope && !hasOrgOrEventScope) {
      // Also check event_members in case they're an event guest (no organization_members row for that)
      const { data: evtMemberRows } = await supabase
        .from("event_members")
        .select("event_id")
        .eq("user_id", user.id)
        .limit(1);
      const isAlsoEventGuest = (evtMemberRows ?? []).length > 0;

      if (!isAlsoEventGuest) {
        const { data: lead } = await supabase
          .from("component_members")
          .select("component_id, components(event_id, events(slug))")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        const eventSlug = (lead?.components as unknown as { events?: { slug: string } } | null)?.events?.slug;
        if (eventSlug) redirect(`/events/${eventSlug}`);
      }
    }

    // Workspace events — events in the user's personal workspace org (is_workspace=true)
    const workspaceMembership = (orgMemberships ?? []).find(
      (m) => (m.organizations as unknown as { is_workspace: boolean })?.is_workspace === true
    );
    if (workspaceMembership) {
      const wsOrgId = (workspaceMembership.organizations as unknown as { id: string }).id;
      const { data: wsData } = await supabase
        .from("events")
        .select("*, components(count)")
        .eq("organization_id", wsOrgId)
        .order("created_at", { ascending: false });
      workspaceEvents = (wsData ?? []) as EventRow[];
    }

    // Full org members (scope=org, non-workspace)
    const fullOrgMemberships = (orgMemberships ?? []).filter(
      (m) =>
        m.scope === "org" &&
        m.organizations &&
        !(m.organizations as unknown as { is_workspace: boolean }).is_workspace
    );

    allOrgInfos = fullOrgMemberships.map((m) => ({
      org: m.organizations as unknown as OrgInfo,
      role: m.role,
    }));

    if (fullOrgMemberships.length > 0) {
      // Fetch all events for all full-org memberships
      const orgIds = allOrgInfos.map((m) => m.org.id);
      const { data } = await supabase
        .from("events")
        .select("*, components(count)")
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false });
      events = (data ?? []) as EventRow[];
    }

    // Always query event_members directly — event guests have NO organization_members row.
    // Merge their events and orgs in regardless of whether full-org memberships exist.
    {
      const { data: eventMemberships } = await supabase
        .from("event_members")
        .select("event_id, events(id, name, slug, status, description, event_date, organization_id, created_at, components(count), organizations(id, name, slug))")
        .eq("user_id", user.id);

      type GuestEventRow = EventRow & { organizations: OrgInfo | null };
      const guestEvents = (eventMemberships ?? [])
        .map((m) => m.events as unknown as GuestEventRow)
        .filter(Boolean);

      for (const evt of guestEvents) {
        // Add to events if not already present (avoid duplicates if full-org also fetched it)
        if (!events.find((e) => e.id === evt.id)) {
          events.push(evt);
        }
        // Merge org into allOrgInfos if not already present
        const evtOrg = evt.organizations;
        if (evtOrg && !allOrgInfos.find((o) => o.org.id === evtOrg.id)) {
          allOrgInfos.push({ org: evtOrg, role: "guest" });
        }
      }
    }

    if (allOrgInfos.length === 0 && events.length === 0 && workspaceEvents.length === 0) {
      noOrg = true;
    }
  }

  if (noOrg) {
    return (
      <div className="min-h-full">
        <NoOrgPrompt />
      </div>
    );
  }

  const totalEvents = workspaceEvents.length + events.length;
  const activeCount = [...workspaceEvents, ...events].filter((e) => e.status === "active").length;
  const draftCount  = [...workspaceEvents, ...events].filter((e) => e.status === "draft").length;

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

function EventCard({ event }: { event: EventRow }) {
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

function EmptyEventsState({ isGuest }: { isGuest: boolean }) {
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
