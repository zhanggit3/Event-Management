import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CalendarDays, MapPin, Settings, Plus, CheckSquare, FileText,
  Users, ChevronRight, Circle
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Component, CalendarEvent } from "@/types/database";
import { AddComponentDialog, type ComponentTemplate, type EventWithComponents } from "@/components/add-component-dialog";
import { EventMasterCalendar } from "@/components/calendar/event-master-calendar";
import { getCalendarEventsByEvent } from "@/lib/queries/calendar-events";
import { LockedComponentCard } from "@/components/locked-component-card";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  draft: "bg-amber-500/15 text-amber-400",
  completed: "bg-blue-500/15 text-blue-400",
  archived: "bg-white/10 text-white/40",
};

type DevComponent = { id: string; event_id: string; name: string; slug: string; icon: string; color: string; sort_order: number; is_active: boolean; description: null; created_at: string; tasks: { id: string; status: string }[]; component_members: { id: string; user_id: string | null; role: string }[] };

interface PageProps {
  params: Promise<{ eventSlug: string }>;
}

export default async function EventDashboardPage({ params }: PageProps) {
  const { eventSlug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let event: { id: string; name: string; slug: string; status: string; description: string | null; event_date: string | null; organization_id: string } | null = null;
  let components: DevComponent[] = [];
  let isAdmin = false;
  let templates: ComponentTemplate[] = [];
  let otherEvents: EventWithComponents[] = [];
  let masterCalendarEvents: CalendarEvent[] = [];
  let componentInfoForCalendar: { id: string; name: string; color: string | null }[] = [];
  let allComponentTasks: { id: string; title: string; due_date: string | null; priority: string; status: string; parent_task_id: string | null; component_id: string }[] = [];
  let userAccessibleComponentIds: Set<string> | null = null; // null = all access
  let userComponentRequestMap: Record<string, { id: string; status: "pending" | "denied"; responded_at: string | null }> = {};
  let userScope: "org" | "event" | "component" = "org";
  // For event guests (in event_members but NOT organization_members)
  let isEventGuest = false;
  let guestGrantedComponentIds: Set<string> = new Set();

  if (user) {
    // Phase 1: fetch event (everything else depends on its id/org)
    const { data: dbEvent } = await supabase.from("events").select("*").eq("slug", eventSlug).single();
    if (!dbEvent) notFound();
    event = dbEvent;

    // Phase 2: 5 independent queries in one round-trip
    const [
      { data: dbComponents },
      { data: membership },
      { data: dbTemplates },
      { data: dbOtherEvents },
      calendarEvts,
    ] = await Promise.all([
      supabase
        .from("components")
        .select("*, tasks(id, status), component_members(id, user_id, role)")
        .eq("event_id", dbEvent.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("organization_members")
        .select("role, scope")
        .eq("organization_id", dbEvent.organization_id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("component_templates")
        .select("id, name, slug, icon, color, description")
        .eq("organization_id", dbEvent.organization_id)
        .order("name"),
      supabase
        .from("events")
        .select("id, name, slug, components(id, name, slug, icon, color)")
        .eq("organization_id", dbEvent.organization_id)
        .neq("id", dbEvent.id)
        .order("created_at", { ascending: false }),
      getCalendarEventsByEvent(dbEvent.id),
    ]);

    components = (dbComponents ?? []) as unknown as DevComponent[];
    templates = (dbTemplates ?? []) as ComponentTemplate[];
    otherEvents = (dbOtherEvents ?? []) as unknown as EventWithComponents[];
    masterCalendarEvents = calendarEvts;
    isAdmin = membership?.role === "owner" || membership?.role === "admin";
    userScope = (membership?.scope ?? "org") as "org" | "event" | "component";
    componentInfoForCalendar = (dbComponents ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color ?? null,
    }));

    const componentIds = (dbComponents ?? []).map((c) => c.id);

    // Phase 3: scope-access checks run in parallel with the calendar-tasks query
    await Promise.all([
      // Branch A: access-control checks (scope-dependent)
      (async () => {
        if (userScope === "component") {
          const { data: leads } = await supabase
            .from("component_members")
            .select("component_id")
            .eq("user_id", user.id);
          userAccessibleComponentIds = new Set((leads ?? []).map((l) => l.component_id));

          const lockedIds = componentIds.filter((id) => !userAccessibleComponentIds!.has(id));
          if (lockedIds.length > 0) {
            const { data: requests } = await supabase
              .from("component_access_requests")
              .select("id, component_id, status, responded_at")
              .eq("requester_id", user.id)
              .in("component_id", lockedIds)
              .in("status", ["pending", "denied"]);
            for (const r of requests ?? []) {
              userComponentRequestMap[r.component_id] = {
                id: r.id,
                status: r.status as "pending" | "denied",
                responded_at: r.responded_at,
              };
            }
          }
        } else if (!membership || membership.scope === "event") {
          // scope='event': old invite-flow artifact; new guests only have event_members rows
          const { data: eventMembership } = await supabase
            .from("event_members")
            .select("id")
            .eq("event_id", dbEvent.id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (eventMembership) {
            isEventGuest = true;
            const [{ data: grants }, { data: pendingRequests }] = await Promise.all([
              supabase
                .from("event_member_components")
                .select("component_id")
                .eq("event_id", dbEvent.id)
                .eq("user_id", user.id),
              componentIds.length > 0
                ? supabase
                    .from("component_access_requests")
                    .select("id, component_id, status, responded_at")
                    .eq("requester_id", user.id)
                    .in("component_id", componentIds)
                    .in("status", ["pending", "denied"])
                : Promise.resolve({ data: null }),
            ]);
            guestGrantedComponentIds = new Set((grants ?? []).map((g) => g.component_id));
            for (const r of pendingRequests ?? []) {
              userComponentRequestMap[r.component_id] = {
                id: r.id,
                status: r.status as "pending" | "denied",
                responded_at: r.responded_at,
              };
            }
          }
        }
      })(),

      // Branch B: tasks with due dates for the master calendar (always needed)
      (async () => {
        if (componentIds.length > 0) {
          const { data: tasksRaw } = await supabase
            .from("tasks")
            .select("id, title, due_date, priority, status, parent_task_id, component_id")
            .in("component_id", componentIds)
            .not("due_date", "is", null);
          allComponentTasks = (tasksRaw ?? []) as typeof allComponentTasks;
        }
      })(),
    ]);
  }

  if (!event) return null;

  function getCountdown(dateStr: string): { label: string; variant: "upcoming" | "soon" | "past" | "today" } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return { label: "Today!", variant: "today" };
    if (diff === 1) return { label: "Tomorrow", variant: "soon" };
    if (diff > 1 && diff <= 14) return { label: `${diff} days away`, variant: "soon" };
    if (diff > 14) return { label: `${diff} days away`, variant: "upcoming" };
    if (diff === -1) return { label: "Yesterday", variant: "past" };
    return { label: `${Math.abs(diff)} days ago`, variant: "past" };
  }

  const countdown = event.event_date ? getCountdown(event.event_date) : null;

  const totalTasks = components.reduce((acc, c) => acc + (c.tasks?.length ?? 0), 0);
  const doneTasks = components.reduce(
    (acc, c) => acc + (c.tasks?.filter((t) => t.status === "done").length ?? 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#05050F]">
      {/* Page header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          {/* Back link */}
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-5">
            <ChevronRight className="w-3 h-3 rotate-180" />
            All events
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">{event.name}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[event.status] ?? "bg-white/10 text-white/40"}`}>
                  {event.status}
                </span>
              </div>
              {event.description && (
                <p className="text-white/40 text-sm mb-3">{event.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-white/40">
                {event.event_date && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {formatDate(event.event_date)}
                    {countdown && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        countdown.variant === "today"    ? "bg-violet-500/20 text-violet-300" :
                        countdown.variant === "soon"     ? "bg-amber-500/15 text-amber-400" :
                        countdown.variant === "upcoming" ? "bg-emerald-500/15 text-emerald-400" :
                                                           "bg-white/[0.06] text-white/30"
                      }`}>
                        {countdown.label}
                      </span>
                    )}
                  </span>
                )}
                {(event as { address?: string | null }).address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {(event as { address?: string | null }).address}
                  </span>
                )}
                {totalTasks > 0 && (
                  <span className="flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5" />
                    {doneTasks}/{totalTasks} tasks done
                  </span>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/events/${eventSlug}/settings`}
                  className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-2"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Settings
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-8 py-8 max-w-6xl mx-auto">
        {/* Overall progress bar */}
        {totalTasks > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/30">Overall progress</span>
              <span className="text-xs text-white/40">{doneTasks}/{totalTasks} &mdash; {Math.round((doneTasks / totalTasks) * 100)}%</span>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Components section header */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/30">Components</span>
        </div>

        {/* Component grid */}
        {components.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {components.map((component) => {
              // Determine locked state for component-scoped org members
              const isLockedForOrgMember = userAccessibleComponentIds !== null && !userAccessibleComponentIds.has(component.id);

              // Determine locked state for event guests
              const isLockedForGuest = isEventGuest && !guestGrantedComponentIds.has(component.id);

              const isLocked = isLockedForOrgMember || isLockedForGuest;

              if (isLocked) {
                const existingRequest = userComponentRequestMap[component.id] ?? null;
                const lead = (component as unknown as { component_members?: { id: string; user_id: string | null; role: string }[] })
                  .component_members?.find((m) => m.role === "lead" && m.user_id);
                return (
                  <LockedComponentCard
                    key={component.id}
                    componentId={component.id}
                    componentName={component.name}
                    componentColor={component.color ?? null}
                    leadName={lead ? "Team Lead" : null}
                    eventSlug={eventSlug}
                    existingRequestId={existingRequest?.id ?? null}
                    existingRequestStatus={existingRequest?.status ?? null}
                    cooldownUntil={
                      existingRequest?.status === "denied" && existingRequest.responded_at
                        ? new Date(new Date(existingRequest.responded_at).getTime() + 7 * 86400000).toISOString()
                        : null
                    }
                  />
                );
              }
              return <ComponentCard key={component.id} component={component} eventSlug={eventSlug} />;
            })}
            {isAdmin && (
              <AddComponentDialog
                eventId={event.id}
                eventSlug={eventSlug}
                templates={templates}
                otherEvents={otherEvents}
                cardTrigger
              />
            )}
          </div>
        ) : (
          <EmptyComponentsState eventSlug={eventSlug} isAdmin={isAdmin} />
        )}

        {/* Event calendar */}
        {user && (masterCalendarEvents.length > 0 || allComponentTasks.length > 0 || componentInfoForCalendar.length > 0) && (
          <div className="mt-12">
            <div className="border-t border-white/[0.06] pt-8 mb-6">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs font-semibold uppercase tracking-widest text-white/30">Event Calendar</span>
              </div>
            </div>
            <EventMasterCalendar
              initialEvents={masterCalendarEvents}
              components={componentInfoForCalendar}
              eventDate={event.event_date ?? undefined}
              eventName={event.name}
              serverTasks={allComponentTasks}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ComponentCard({
  component,
  eventSlug,
}: {
  component: Component & { tasks?: { status: string }[]; component_members?: { id: string }[] };
  eventSlug: string;
}) {
  const tasks = component.tasks ?? [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const leadCount = component.component_members?.length ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const accentColor = component.color ?? "#64748b";

  return (
    <Link href={`/events/${eventSlug}/${component.slug}`}>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 cursor-pointer group h-full flex flex-col hover:bg-white/[0.06] hover:border-white/[0.12] transition-all">
        {/* Icon area */}
        <div className="flex items-center justify-between mb-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: `${accentColor}26` }}
          >
            {component.icon}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
        </div>

        <span className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors mb-1 truncate">
          {component.name}
        </span>

        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-white/30 mb-1.5">
              <span>{done}/{total} tasks</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-white/30 mt-auto pt-3">
          <div className="flex items-center gap-2">
            {inProgress > 0 && (
              <span className="flex items-center gap-1">
                <Circle className="w-2 h-2 fill-blue-400/70 text-blue-400/70" />
                {inProgress} active
              </span>
            )}
            {total === 0 && (
              <span className="text-white/20">No tasks yet</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {leadCount}
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyComponentsState({ eventSlug, isAdmin }: { eventSlug: string; isAdmin: boolean }) {
  return (
    <div className="border border-dashed border-white/[0.08] rounded-xl p-14 text-center">
      <div className="w-14 h-14 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
        <FileText className="w-6 h-6 text-white/20" />
      </div>
      <h2 className="text-lg font-semibold text-white/60 mb-2">No components yet</h2>
      <p className="text-white/30 text-sm mb-7 max-w-sm mx-auto">
        Components are the building blocks of your event. Add Finance, Marketing, Volunteer, or any custom module.
      </p>
      {isAdmin && (
        <Link href={`/events/${eventSlug}/settings`}>
          <span className="inline-flex items-center justify-center gap-2 h-10 px-5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm transition-colors">
            <Plus className="w-4 h-4" />
            Add components
          </span>
        </Link>
      )}
    </div>
  );
}
