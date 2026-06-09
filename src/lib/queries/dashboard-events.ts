import { createClient } from "@/lib/supabase/server";

export type EventRow = {
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

export type OrgInfo = { id: string; name: string; slug: string };

export type DashboardData = {
  firstName: string;
  displayName: string;
  workspaceEvents: EventRow[];
  events: EventRow[];
  allOrgInfos: { org: OrgInfo; role: string }[];
  noOrg: boolean;
  /** True when the user belongs to a personal workspace org (is_workspace=true). */
  hasWorkspace: boolean;
  /** Set when a component-scope-only user should be bounced straight to their event. */
  componentRedirectSlug: string | null;
};

/**
 * Shared server fetch for the Dashboard overview (`/`) and the Events list (`/events`).
 * Returns the user's workspace events, shared (org) events, org infos, and the
 * component-scope redirect decision. The caller (the page) performs `redirect()` —
 * this helper never redirects, so both pages can reuse it.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let allOrgInfos: { org: OrgInfo; role: string }[] = [];
  let events: EventRow[] = [];
  let workspaceEvents: EventRow[] = [];
  let noOrg = false;
  let hasWorkspace = false;
  let firstName = "";
  let displayName = "";
  let componentRedirectSlug: string | null = null;

  if (!user) {
    return { firstName, displayName, workspaceEvents, events, allOrgInfos, noOrg, hasWorkspace, componentRedirectSlug };
  }

  // Fetch profile for name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();
  displayName = profile?.full_name || user.email || "User";
  // Mirror the layout's derivation exactly — do NOT fall back to the email for the
  // first name, or the workspace greeting renders "bob@x.com's Workspace".
  firstName = profile?.full_name?.split(" ")[0] || "";

  // Fetch all memberships upfront (used for component-scope redirect check and full-org detection)
  const { data: orgMemberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, scope, organizations(id, name, slug, is_workspace)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Check for component-scope-ONLY users — they should be bounced to their event.
  // Only when the user has NO scope=org and NO scope=event memberships.
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
      if (eventSlug) componentRedirectSlug = eventSlug;
    }
  }

  // Workspace events — events in the user's personal workspace org (is_workspace=true)
  const workspaceMembership = (orgMemberships ?? []).find(
    (m) => (m.organizations as unknown as { is_workspace: boolean })?.is_workspace === true
  );
  hasWorkspace = Boolean(workspaceMembership);
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
      if (!events.find((e) => e.id === evt.id)) {
        events.push(evt);
      }
      const evtOrg = evt.organizations;
      if (evtOrg && !allOrgInfos.find((o) => o.org.id === evtOrg.id)) {
        allOrgInfos.push({ org: evtOrg, role: "guest" });
      }
    }
  }

  // A user with a personal workspace (or any org/event membership) is NOT "no org" even
  // with zero events — they should see their workspace dashboard, not the NoOrgPrompt.
  if (!hasWorkspace && allOrgInfos.length === 0 && events.length === 0) {
    noOrg = true;
  }

  return { firstName, displayName, workspaceEvents, events, allOrgInfos, noOrg, hasWorkspace, componentRedirectSlug };
}
