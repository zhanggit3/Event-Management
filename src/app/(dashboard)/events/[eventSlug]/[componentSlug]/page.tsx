import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LayoutDashboard, FileText, Users, FolderOpen, CalendarDays, Link as LinkIcon, Lock, Wallet } from "lucide-react";
import { LockedComponentCard } from "@/components/locked-component-card";
import { DashboardTab } from "@/components/dashboard-tab";
import { BudgetTab } from "@/components/budget-tab";
import { getOrCreateBudget } from "@/app/actions/budgets";
import { ComponentTasksProvider } from "@/components/component-tasks-context";
import { NoteSection } from "@/components/note-section";
import { FilesTab } from "@/components/files-tab";
import { ComponentCalendar } from "@/components/calendar/component-calendar";
import { ResourceLinkBoard } from "@/components/resources/resource-link-board";
import { AddMemberDialog } from "@/components/add-member-dialog";
import { TeamMemberList } from "@/components/team-member-list";
import { SaveAsTemplateButton } from "@/components/save-as-template-button";
import { EditComponentDialog } from "@/components/edit-component-dialog";
import { getCalendarEventsByComponent } from "@/lib/queries/calendar-events";
import { getResourceLinksByComponent } from "@/lib/queries/resource-links";
import type { Task, Profile, Note, ComponentMember, FolderWithFiles, CalendarEvent, ResourceLink, Activity, Budget, BudgetLineItem } from "@/types/database";

interface PageProps {
  params: Promise<{ eventSlug: string; componentSlug: string }>;
  searchParams: Promise<{ task?: string }>;
}

type DevComp = { id: string; event_id: string; name: string; slug: string; icon: string; color: string; description: string | null; sort_order: number; is_active: boolean; created_at: string };

export default async function ComponentPage({ params, searchParams }: PageProps) {
  const { eventSlug, componentSlug } = await params;
  const { task: defaultOpenTaskId = null } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const currentUserId = user?.id ?? "";

  let event: { id: string; name: string; organization_id: string; event_date: string | null; created_by: string | null } | null = null;
  let component: DevComp | null = null;
  let tasks: (Task & { assignee?: Profile | null })[] = [];
  let notes: (Note & { author: Profile })[] = [];
  let teamMembers: ComponentMember[] = [];
  let members: Profile[] = [];
  let folders: FolderWithFiles[] = [];
  let calendarEvents: CalendarEvent[] = [];
  let resourceLinks: ResourceLink[] = [];
  let activities: Activity[] = [];
  let budget: Budget | null = null;
  let budgetLineItems: BudgetLineItem[] = [];
  let isAdmin = false;
  let isLockedForUser = false;
  let lockedRequestId: string | null = null;
  let lockedRequestStatus: "pending" | "denied" | null = null;
  let lockedCooldownUntil: string | null = null;

  if (user) {
    const { data: dbEvent } = await supabase.from("events").select("id, name, organization_id, event_date, created_by").eq("slug", eventSlug).single();
    if (!dbEvent) notFound();
    event = dbEvent;

    const { data: dbComponent } = await supabase.from("components").select("*").eq("event_id", dbEvent.id).eq("slug", componentSlug).single();
    if (!dbComponent) notFound();
    component = dbComponent as unknown as DevComp;

    const { data: membership } = await supabase.from("organization_members").select("role, scope").eq("organization_id", dbEvent.organization_id).eq("user_id", user.id).single();
    isAdmin = membership?.role === "owner" || membership?.role === "admin";
    const userScope = (membership?.scope ?? "org") as "org" | "event" | "component";

    // Gate content for component-scoped org members who lack access to THIS component
    if (userScope === "component") {
      const { data: lead } = await supabase
        .from("component_members")
        .select("id")
        .eq("component_id", dbComponent.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!lead) {
        isLockedForUser = true;
        const { data: existingReq } = await supabase
          .from("component_access_requests")
          .select("id, status, responded_at")
          .eq("component_id", dbComponent.id)
          .eq("requester_id", user.id)
          .in("status", ["pending", "denied"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingReq) {
          lockedRequestId = existingReq.id;
          lockedRequestStatus = existingReq.status as "pending" | "denied";
          if (existingReq.status === "denied" && existingReq.responded_at) {
            lockedCooldownUntil = new Date(
              new Date(existingReq.responded_at).getTime() + 7 * 86400000
            ).toISOString();
          }
        }
      }
    }

    // Gate content for event guests (no org membership, or old scope='event' row)
    if (!membership || membership.scope === "event") {
      const { data: grant } = await supabase
        .from("event_member_components")
        .select("id")
        .eq("event_id", dbEvent.id)
        .eq("user_id", user.id)
        .eq("component_id", dbComponent.id)
        .maybeSingle();

      if (!grant) {
        isLockedForUser = true;
        const { data: existingReq } = await supabase
          .from("component_access_requests")
          .select("id, status, responded_at")
          .eq("component_id", dbComponent.id)
          .eq("requester_id", user.id)
          .in("status", ["pending", "denied"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingReq) {
          lockedRequestId = existingReq.id;
          lockedRequestStatus = existingReq.status as "pending" | "denied";
          if (existingReq.status === "denied" && existingReq.responded_at) {
            lockedCooldownUntil = new Date(
              new Date(existingReq.responded_at).getTime() + 7 * 86400000
            ).toISOString();
          }
        }
      }
    }

    // Skip expensive data fetches for locked components
    if (!isLockedForUser) {
      const { data: tasksRaw } = await supabase.from("tasks").select("*").eq("component_id", dbComponent.id).order("created_at", { ascending: false });
      const { data: notesRaw } = await supabase.from("notes").select("*, author:created_by(id, full_name, email, avatar_url, created_at)").eq("component_id", dbComponent.id).order("created_at", { ascending: false });
      const { data: teamMembersRaw } = await supabase.from("component_members").select("*").eq("component_id", dbComponent.id).order("created_at", { ascending: true });
      const { data: orgMembers } = await supabase.from("organization_members").select("profile:user_id(id, full_name, email, avatar_url, created_at)").eq("organization_id", dbEvent.organization_id);

      // Fetch event guests who have been granted access to this specific component
      const { data: eventGuestRows } = await supabase
        .from("event_member_components")
        .select("user_id, granted_at, profile:user_id(id, full_name, email)")
        .eq("component_id", dbComponent.id)
        .eq("event_id", dbEvent.id);

      // Resolve assignee profiles separately to avoid FK join ambiguity
      const assignedIds = [...new Set((tasksRaw ?? []).map((t) => t.assigned_to).filter(Boolean))] as string[];
      let assigneeMap: Record<string, Profile> = {};
      if (assignedIds.length > 0) {
        const { data: assigneeProfiles } = await supabase.from("profiles").select("id, full_name, email, avatar_url, job_titles, created_at").in("id", assignedIds);
        assigneeMap = Object.fromEntries((assigneeProfiles ?? []).map((p) => [p.id, p as Profile]));
      }
      tasks = (tasksRaw ?? []).map((t) => ({ ...t, assignee: t.assigned_to ? (assigneeMap[t.assigned_to] ?? null) : null })) as unknown as typeof tasks;
      notes = (notesRaw ?? []) as unknown as typeof notes;
      const existingUserIds = new Set((teamMembersRaw ?? []).map((m) => m.user_id).filter(Boolean));
      const guestMembers: ComponentMember[] = (eventGuestRows ?? [])
        .filter((g) => !existingUserIds.has(g.user_id))
        .map((g) => {
          const profile = g.profile as unknown as { id: string; full_name: string; email: string } | null;
          return {
            id: `guest-${g.user_id}`,
            component_id: dbComponent.id,
            user_id: g.user_id,
            name: profile?.full_name ?? profile?.email ?? "Unknown",
            email: profile?.email ?? null,
            role: "member" as const,
            created_at: g.granted_at,
            is_guest: true,
          };
        });
      teamMembers = [...(teamMembersRaw ?? []), ...guestMembers] as ComponentMember[];
      members = (orgMembers?.map((m) => m.profile).filter(Boolean) ?? []) as unknown as Profile[];

      const { data: foldersRaw } = await supabase
        .from("component_folders")
        .select("*, files:component_files(*)")
        .eq("component_id", dbComponent.id)
        .order("created_at", { ascending: true });
      folders = (foldersRaw ?? []) as unknown as FolderWithFiles[];

      calendarEvents = await getCalendarEventsByComponent(dbComponent.id);
      resourceLinks = await getResourceLinksByComponent(dbComponent.id);

      const { data: activitiesRaw } = await supabase
        .from("activities")
        .select("*")
        .eq("component_id", dbComponent.id)
        .order("sort_order", { ascending: true });
      activities = (activitiesRaw ?? []) as Activity[];

      // Finance master budget (one per Finance component, created on first access).
      if (dbComponent.slug === "finance") {
        const b = await getOrCreateBudget(dbComponent.id);
        if (b.data) {
          budget = b.data.budget;
          budgetLineItems = b.data.lineItems;
        }
      }
    }
  }

  if (!event || !component) return null;

  // Locked page: component-scoped user without access to this component
  if (isLockedForUser) {
    return (
      <div className="min-h-screen bg-[#05050F] px-6 py-8">
        <div>
          {/* Locked header */}
          <div className="flex items-center gap-3 mb-10">
            <Link href={`/events/${eventSlug}`}>
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:bg-white/[0.10] hover:text-white/80 transition-all">
                <ArrowLeft className="w-4 h-4" />
              </span>
            </Link>
            <span className="text-white/30 text-xs">{event?.name}</span>
            <span className="text-white/20 text-xs">/</span>
            <span className="text-white/50 text-xs">{component.name}</span>
          </div>

          {/* Locked card */}
          <div className="max-w-md mx-auto mt-20 text-center">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-white/30" />
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              Access restricted
            </h1>
            <p className="text-sm text-white/40 mb-8">
              You don&apos;t have access to &ldquo;{component.name}&rdquo;. Request access from a team lead or org admin.
            </p>

            <div className="max-w-xs mx-auto">
              <LockedComponentCard
                componentId={component.id}
                componentName={component.name}
                componentColor={component.color ?? null}
                leadName={null}
                eventSlug={eventSlug}
                existingRequestId={lockedRequestId}
                existingRequestStatus={lockedRequestStatus}
                cooldownUntil={lockedCooldownUntil}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05050F]">
      <div className="px-6 py-8">

        {/* Page header */}
        <div className="flex items-start gap-4 mb-8 flex-wrap">
          {/* Back arrow */}
          <Link href={`/events/${eventSlug}`} className="mt-0.5">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:bg-white/[0.10] hover:text-white/80 transition-all shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </span>
          </Link>

          {/* Icon + title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {component.icon && (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 border"
                style={{
                  backgroundColor: `${component.color}26`,
                  borderColor: `${component.color}4D`,
                }}
              >
                {component.icon}
              </div>
            )}
            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-white/30 text-xs truncate">{event.name}</span>
                <span className="text-white/20 text-xs">/</span>
                <span className="text-white/30 text-xs">{component.name}</span>
              </div>
              {/* Component name */}
              <h1 className="text-xl font-semibold text-white leading-tight truncate">
                {component.name}
              </h1>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {user && isAdmin && (
              <div className="[&>button]:bg-white/[0.06] [&>button]:border [&>button]:border-white/10 [&>button]:text-white/60 [&>button]:rounded-xl [&>button]:hover:bg-white/[0.09] [&>button]:transition-all">
                <EditComponentDialog
                  componentId={component.id}
                  eventSlug={eventSlug}
                  componentSlug={componentSlug}
                  initialName={component.name}
                  initialIcon={component.icon}
                  initialColor={component.color}
                />
              </div>
            )}
            {/* Saving a template requires org admin (RLS on component_templates) — only
                show the button to users who can actually use it. */}
            {user && isAdmin && (
              <div className="[&>button]:bg-white/[0.06] [&>button]:border [&>button]:border-white/10 [&>button]:text-white/60 [&>button]:rounded-xl [&>button]:text-sm [&>button]:hover:bg-white/[0.09] [&>button]:transition-all">
                <SaveAsTemplateButton
                  componentId={component.id}
                  componentName={component.name}
                  componentColor={component.color}
                  componentSlug={componentSlug}
                  organizationId={event.organization_id}
                  eventSlug={eventSlug}
                  eventName={event.name}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <ComponentTasksProvider initialTasks={tasks}>
          <Tabs defaultValue="dashboard">
            <TabsList className="mb-6 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 w-full overflow-x-auto flex gap-0.5">
              <TabsTrigger
                value="dashboard"
                className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </TabsTrigger>
              {component.slug === "finance" && (
                <TabsTrigger
                  value="budget"
                  className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Budget
                </TabsTrigger>
              )}
              <TabsTrigger
                value="notes"
                className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Notes
                {notes.length > 0 && (
                  <span className="ml-0.5 text-xs bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{notes.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="team"
                className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                Team
                {teamMembers.length > 0 && (
                  <span className="ml-0.5 text-xs bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{teamMembers.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Files
                {folders.length > 0 && (
                  <span className="ml-0.5 text-xs bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{folders.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="calendar"
                className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Calendar
                {calendarEvents.length > 0 && (
                  <span className="ml-0.5 text-xs bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{calendarEvents.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="resources"
                className="flex items-center gap-1.5 rounded-lg text-white/40 hover:text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-sm px-3 py-1.5"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                Resources
                {resourceLinks.length > 0 && (
                  <span className="ml-0.5 text-xs bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{resourceLinks.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            {component.slug === "finance" && budget && (
              <TabsContent value="budget" className="pb-8">
                <BudgetTab
                  budget={budget}
                  initialLineItems={budgetLineItems}
                  eventSlug={eventSlug}
                  componentSlug={componentSlug}
                  organizationId={event.organization_id}
                  eventId={event.id}
                />
              </TabsContent>
            )}

            {/* DASHBOARD TAB */}
            <TabsContent value="dashboard" className="pb-8">
              <DashboardTab
                activities={activities}
                componentId={component.id}
                eventSlug={eventSlug}
                componentSlug={componentSlug}
                members={members}
                currentUserId={currentUserId}
                eventCreatorId={event?.created_by ?? undefined}
                defaultOpenTaskId={defaultOpenTaskId}
              />
            </TabsContent>

            {/* NOTES TAB */}
            <TabsContent value="notes" className="pb-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
                  <FileText className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-semibold text-white/70">Notes</h2>
                </div>
                <div className="p-5">
                  <NoteSection
                    componentId={component.id}
                    eventSlug={eventSlug}
                    componentSlug={componentSlug}
                    notes={notes}
                    currentUserId={currentUserId}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TEAM TAB */}
            <TabsContent value="team" className="pb-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-white/40" />
                    <h2 className="text-sm font-semibold text-white/70">Team members</h2>
                  </div>
                  {isAdmin && (
                    <div className="[&>button]:bg-teal-600 [&>button]:hover:bg-teal-500 [&>button]:text-white [&>button]:rounded-xl [&>button]:font-semibold [&>button]:text-sm [&>button]:transition-all">
                      <AddMemberDialog componentId={component.id} eventSlug={eventSlug} componentSlug={componentSlug} />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <TeamMemberList
                    members={teamMembers}
                    eventSlug={eventSlug}
                    componentSlug={componentSlug}
                    isAdmin={isAdmin}
                  />
                </div>
              </div>
            </TabsContent>

            {/* FILES TAB */}
            <TabsContent value="files" className="pb-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
                  <FolderOpen className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-semibold text-white/70">Shared Folder</h2>
                </div>
                <div className="p-5">
                  <FilesTab
                    folders={folders}
                    componentId={component.id}
                    eventSlug={eventSlug}
                    componentSlug={componentSlug}
                    isLoggedIn={!!user}
                  />
                </div>
              </div>
            </TabsContent>

            {/* CALENDAR TAB */}
            <TabsContent value="calendar" className="pb-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
                  <CalendarDays className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-semibold text-white/70">Calendar</h2>
                </div>
                <div className="p-5">
                  <ComponentCalendar
                    componentId={component.id}
                    eventId={event.id}
                    eventDate={event.event_date}
                    eventName={event.name}
                    componentColor={component.color}
                    initialEvents={calendarEvents}
                    serverTasks={tasks}
                    activities={activities}
                    eventSlug={eventSlug}
                    componentSlug={componentSlug}
                    isLoggedIn={!!user}
                  />
                </div>
              </div>
            </TabsContent>

            {/* RESOURCES TAB */}
            <TabsContent value="resources" className="pb-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
                  <LinkIcon className="w-4 h-4 text-white/40" />
                  <h2 className="text-sm font-semibold text-white/70">Resources</h2>
                </div>
                <div className="p-5">
                  <ResourceLinkBoard
                    initialLinks={resourceLinks}
                    componentId={component.id}
                    eventSlug={eventSlug}
                    componentSlug={componentSlug}
                    isLoggedIn={!!user}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </ComponentTasksProvider>
      </div>
    </div>
  );
}
