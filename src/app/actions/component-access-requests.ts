"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ComponentAccessRequestWithDetails } from "@/types/database";

const COOLDOWN_DAYS = 7;

/**
 * Submit a request to access a component.
 * Enforces: one pending request per user per component, and a cooldown after denial.
 */
export async function requestComponentAccess(
  componentId: string,
  note: string | null,
  eventSlug: string
): Promise<{ data?: { id: string }; error?: string; cooldown?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check for an existing pending request
  const { data: existing } = await supabase
    .from("component_access_requests")
    .select("id, status, responded_at")
    .eq("component_id", componentId)
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "pending") {
    return { error: "You already have a pending request for this component" };
  }

  // Cooldown: if denied within last COOLDOWN_DAYS days, block re-request
  if (existing?.status === "denied" && existing.responded_at) {
    const cooldownEnd = new Date(existing.responded_at);
    cooldownEnd.setDate(cooldownEnd.getDate() + COOLDOWN_DAYS);
    if (new Date() < cooldownEnd) {
      return {
        error: `Re-request available after ${cooldownEnd.toLocaleDateString()}`,
        cooldown: cooldownEnd.toISOString(),
      };
    }
  }

  const { data, error } = await supabase
    .from("component_access_requests")
    .insert({ component_id: componentId, requester_id: user.id, note: note ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}`);
  return { data: { id: data.id } };
}

/**
 * Cancel a pending access request (requester only).
 */
export async function cancelComponentAccessRequest(
  requestId: string,
  eventSlug: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("component_access_requests")
    .delete()
    .eq("id", requestId)
    .eq("requester_id", user.id)
    .eq("status", "pending");

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}`);
  return {};
}

/**
 * Get all pending access requests for components the caller leads or admins.
 */
export async function getPendingAccessRequests(organizationId: string): Promise<{
  data?: ComponentAccessRequestWithDetails[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return { error: "Not a member" };

  const isAdmin = ["owner", "admin"].includes(membership.role);

  if (isAdmin) {
    // Fetch event IDs for this org, then component IDs, then requests
    const { data: orgEvents } = await supabase
      .from("events")
      .select("id")
      .eq("organization_id", organizationId);
    const eventIds = (orgEvents ?? []).map((e) => e.id);
    if (eventIds.length === 0) return { data: [] };

    const { data: orgComponents } = await supabase
      .from("components")
      .select("id")
      .in("event_id", eventIds);
    const componentIds = (orgComponents ?? []).map((c) => c.id);
    if (componentIds.length === 0) return { data: [] };

    const { data, error } = await supabase
      .from("component_access_requests")
      .select(`
        *,
        requester:requester_id(id, full_name, email),
        component:component_id(id, name, slug, event_id, events(name, slug))
      `)
      .eq("status", "pending")
      .in("component_id", componentIds)
      .order("created_at", { ascending: true });

    if (error) return { error: error.message };
    return { data: data as unknown as ComponentAccessRequestWithDetails[] };
  }

  // Component leads see requests for their own components
  const { data: leadRows } = await supabase
    .from("component_members")
    .select("component_id")
    .eq("user_id", user.id)
    .eq("role", "lead");

  const ledComponentIds = (leadRows ?? []).map((r) => r.component_id);
  if (ledComponentIds.length === 0) return { data: [] };

  const { data, error } = await supabase
    .from("component_access_requests")
    .select(`
      *,
      requester:requester_id(id, full_name, email),
      component:component_id(id, name, slug, event_id, events(name, slug))
    `)
    .eq("status", "pending")
    .in("component_id", ledComponentIds)
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };
  return { data: data as unknown as ComponentAccessRequestWithDetails[] };
}

/**
 * Accept a component access request.
 * - If the requester is an event guest (in event_members but NOT in organization_members
 *   for the event's org), grants access via event_member_components.
 * - If the requester is an org member, grants access via component_leads (existing path).
 */
export async function acceptAccessRequest(
  requestId: string,
  role: "member" | "lead" = "member"
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch request + the component's event_id
  const { data: request, error: fetchErr } = await supabase
    .from("component_access_requests")
    .select("*, component:component_id(id, event_id)")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) return { error: "Request not found" };

  const componentRow = request.component as { id: string; event_id: string } | null;
  const eventId = componentRow?.event_id ?? null;

  // Resolve the org + event slug so we can verify caller is admin and revalidate
  let orgId: string | null = null;
  let eventSlug: string | null = null;
  if (eventId) {
    const { data: eventRow } = await supabase
      .from("events")
      .select("organization_id, slug")
      .eq("id", eventId)
      .single();
    orgId = eventRow?.organization_id ?? null;
    eventSlug = eventRow?.slug ?? null;
  }

  // Application-layer authorization: caller must be an org admin
  if (!orgId) return { error: "Could not determine organization for this request" };
  const { data: callerMembership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const isCallerAdmin = callerMembership?.role === "owner" || callerMembership?.role === "admin";
  if (!isCallerAdmin) return { error: "Not authorized" };

  // Determine if the requester is an event guest vs org member
  const [{ data: orgMembership }, { data: eventMembership }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", request.requester_id)
      .eq("organization_id", orgId)
      .maybeSingle(),
    eventId
      ? supabase
          .from("event_members")
          .select("id")
          .eq("user_id", request.requester_id)
          .eq("event_id", eventId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const isGuest = !!eventMembership && !orgMembership;

  if (isGuest && eventId) {
    // Grant via event_member_components (not component_leads)
    const { error: grantErr } = await supabase
      .from("event_member_components")
      .upsert(
        {
          event_id: eventId,
          user_id: request.requester_id,
          component_id: request.component_id,
          granted_by: user.id,
        },
        { onConflict: "event_id,user_id,component_id" }
      );
    if (grantErr) return { error: grantErr.message };
  } else {
    // Grant via component_members (look up profile for name/email)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", request.requester_id)
      .single();

    const { data: existing } = await supabase
      .from("component_members")
      .select("id")
      .eq("component_id", request.component_id)
      .eq("user_id", request.requester_id)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from("component_members")
        .update({ role })
        .eq("id", existing.id);
      if (updateErr) return { error: updateErr.message };
    } else {
      const { error: insertErr } = await supabase
        .from("component_members")
        .insert({
          component_id: request.component_id,
          user_id: request.requester_id,
          name: profile?.full_name || profile?.email || "",
          email: profile?.email ?? null,
          role,
        });
      if (insertErr) return { error: insertErr.message };
    }
  }

  // Mark request accepted
  await supabase
    .from("component_access_requests")
    .update({ status: "accepted", responded_by: user.id, responded_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/settings");
  if (eventSlug) revalidatePath(`/events/${eventSlug}`);
  return {};
}

/**
 * Deny a component access request.
 */
export async function denyAccessRequest(
  requestId: string,
  denialReason?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("component_access_requests")
    .update({
      status: "denied",
      responded_by: user.id,
      denial_reason: denialReason ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return {};
}
