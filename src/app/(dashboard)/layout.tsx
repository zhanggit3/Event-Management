import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { getInitials } from "@/lib/utils";

type OrgShape = {
  id: string;
  name: string;
  slug: string;
  is_workspace: boolean;
  membershipScope: "org" | "event" | "component";
};
type EventShape = {
  id: string;
  name: string;
  slug: string;
  status: string;
  event_date: string | null;
  organization_id: string;
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let uniqueOrgs: OrgShape[] = [];
  let allEvents: EventShape[] = [];
  let workspaceEvents: EventShape[] = [];
  let displayName = "";
  let userEmail = "";
  let firstName = "";

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("active_org_id")?.value ?? null;

  if (user) {
    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    displayName = profile?.full_name || user.email || "User";
    userEmail = profile?.email || user.email || "";
    firstName = profile?.full_name?.split(" ")[0] || "";

    // Step A: Fetch all organization_members rows (scope=org and scope=component)
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role, scope, organizations(id, name, slug, is_workspace)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const rawOrgs = (memberships ?? []).filter(
      (m) => m.organizations && !(m.organizations as unknown as { is_workspace: boolean }).is_workspace
    );

    // Build org list with scope attached
    const allOrgs: OrgShape[] = rawOrgs.map((m) => ({
      ...(m.organizations as unknown as { id: string; name: string; slug: string; is_workspace: boolean }),
      membershipScope: (m.scope ?? "org") as "org" | "event" | "component",
    }));

    // Deduplicate by org ID — take the broadest scope ("org" beats "event" beats "component")
    const scopeRank: Record<string, number> = { org: 0, event: 1, component: 2 };
    uniqueOrgs = allOrgs.reduce<OrgShape[]>((acc, org) => {
      const existing = acc.find((o) => o.id === org.id);
      if (!existing) return [...acc, org];
      if (scopeRank[org.membershipScope] < scopeRank[existing.membershipScope]) {
        return acc.map((o) => (o.id === org.id ? org : o));
      }
      return acc;
    }, []);

    // Workspace events: events owned directly by the user's personal workspace org
    const workspaceMembership = (memberships ?? []).find(
      (m) => (m.organizations as unknown as { is_workspace: boolean })?.is_workspace === true
    );
    if (workspaceMembership) {
      const wsOrgId = (workspaceMembership.organizations as unknown as { id: string }).id;
      const { data: wsEvents } = await supabase
        .from("events")
        .select("id, name, slug, status, event_date, organization_id")
        .eq("organization_id", wsOrgId)
        .order("created_at", { ascending: false });
      workspaceEvents = (wsEvents ?? []) as EventShape[];
    }

    // Step B: Fetch events — scoped per membership type

    // B1. Full org members: fetch all events for those orgs in one query
    const fullOrgIds = uniqueOrgs.filter((o) => o.membershipScope === "org").map((o) => o.id);
    if (fullOrgIds.length > 0) {
      const { data } = await supabase
        .from("events")
        .select("id, name, slug, status, event_date, organization_id")
        .in("organization_id", fullOrgIds)
        .order("created_at", { ascending: false });
      allEvents.push(...((data ?? []) as EventShape[]));
    }

    // B2. Event guests: query event_members unconditionally (event guests have NO organization_members row)
    // Fetch all event_members for this user, then merge their orgs into uniqueOrgs if not already present
    {
      const { data } = await supabase
        .from("event_members")
        .select("event_id, events(id, name, slug, status, event_date, organization_id, organizations(id, name, slug, is_workspace))")
        .eq("user_id", user.id);
      const guestEvents = (data ?? [])
        .map((m) => m.events as unknown as (EventShape & { organizations: { id: string; name: string; slug: string; is_workspace: boolean } | null }) | null)
        .filter(Boolean) as (EventShape & { organizations: { id: string; name: string; slug: string; is_workspace: boolean } | null })[];

      for (const evt of guestEvents) {
        // Merge the org into uniqueOrgs if the user isn't already a full org member there
        const evtOrg = evt.organizations;
        if (evtOrg && !evtOrg.is_workspace) {
          const existing = uniqueOrgs.find((o) => o.id === evtOrg.id);
          if (!existing) {
            uniqueOrgs.push({ ...evtOrg, membershipScope: "event" });
          }
          // If existing has a broader scope (org), leave it alone; "event" doesn't downgrade
        }
        allEvents.push(evt);
      }
    }

    // B3. Component guests: derive the event from component_members → components → events
    const hasComponentScope = uniqueOrgs.some((o) => o.membershipScope === "component");
    if (hasComponentScope) {
      const { data } = await supabase
        .from("component_members")
        .select("component_id, components(event_id, events(id, name, slug, status, event_date, organization_id))")
        .eq("user_id", user.id);
      const componentEvents = (data ?? [])
        .map((m) => {
          const comp = m.components as unknown as { events: EventShape } | null;
          return comp?.events ?? null;
        })
        .filter(Boolean) as EventShape[];
      allEvents.push(...componentEvents);
    }

    // Deduplicate events by ID
    allEvents = allEvents.filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);
  }

  return (
    <div className="flex min-h-screen bg-[#05050F]">
      <Sidebar
        organizations={uniqueOrgs}
        allEvents={allEvents}
        workspaceEvents={workspaceEvents}
        firstName={firstName}
        activeOrgId={activeOrgId}
        userInitials={getInitials(displayName)}
        userEmail={userEmail}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
