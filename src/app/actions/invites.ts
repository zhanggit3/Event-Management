"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { InviteTokenWithOrg } from "@/types/database";
import { createNotificationInternal } from "@/app/actions/notifications";
import { isValidEmail } from "@/lib/utils";
import { sendInviteEmail, expiresLabel } from "@/lib/email/invite-email";
import { isEmailConfigured } from "@/lib/email/client";

/** Look up the current user's display name for invite emails. */
export async function getInviterIdentity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ name: string; email?: string }> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .single();
  return { name: prof?.full_name || prof?.email || "A team member", email: prof?.email ?? undefined };
}

/**
 * Create an event-scoped invite token that pre-selects specific component grants.
 * When the invitee accepts, they are added to event_members only (NOT organization_members),
 * and the specified components are granted via event_member_components.
 */
export async function createEventInviteWithComponents(
  organizationId: string,
  eventId: string,
  componentIds: string[],
  expiresInHours: number = 48,
  email?: string
): Promise<{ data?: { token: string; inviteUrl: string; emailSent: boolean; emailConfigured: boolean }; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  if (componentIds.length === 0) return { error: "Select at least one component" };

  const cleanEmail = email?.toLowerCase().trim() || undefined;
  if (cleanEmail && !isValidEmail(cleanEmail)) {
    return { error: "Please enter a valid email address" };
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("invite_tokens")
    .insert({
      organization_id: organizationId,
      invited_by: user.id,
      email: cleanEmail ?? null,
      role: "member" as const,
      invite_type: "event" as const,
      event_id: eventId,
      expires_at: expiresAt,
    })
    .select("id, token")
    .single();

  if (tokenErr || !tokenRow) return { error: tokenErr?.message ?? "Failed to create token" };

  const { error: grantErr } = await supabase
    .from("invite_token_components")
    .insert(componentIds.map((cid) => ({ invite_token_id: tokenRow.id, component_id: cid })));

  if (grantErr) return { error: grantErr.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = `${siteUrl}/invite/${tokenRow.token}`;

  const emailConfigured = isEmailConfigured();
  let emailSent = false;
  if (cleanEmail && emailConfigured) {
    // Independent lookups — run concurrently.
    const [{ data: ev }, inviter] = await Promise.all([
      supabase.from("events").select("name").eq("id", eventId).single(),
      getInviterIdentity(supabase, user.id),
    ]);
    const send = await sendInviteEmail({
      to: cleanEmail,
      replyTo: inviter.email,
      inviterName: inviter.name,
      scope: "event",
      scopeName: ev?.name ?? "an event",
      role: "member",
      inviteUrl,
      expiresLabel: expiresLabel(expiresInHours),
    });
    emailSent = send.sent;
  }

  revalidatePath(`/events`);
  return { data: { token: tokenRow.token, inviteUrl, emailSent, emailConfigured } };
}

/**
 * Add a component grant for an existing event collaborator (post-invite management).
 * Caller must be an org admin.
 */
export async function addEventCollaboratorComponentGrant(
  eventId: string,
  userId: string,
  componentId: string,
  organizationId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  // Use upsert with ignoreDuplicates to safely handle already-granted components
  const { error } = await supabase
    .from("event_member_components")
    .upsert(
      { event_id: eventId, user_id: userId, component_id: componentId, granted_by: user.id },
      { onConflict: "event_id,user_id,component_id", ignoreDuplicates: true }
    );

  if (error) return { error: error.message };

  revalidatePath(`/events`);
  return {};
}

/**
 * Remove a component grant for an existing event collaborator (post-invite management).
 * Caller must be an org admin.
 */
export async function removeEventCollaboratorComponentGrant(
  eventId: string,
  userId: string,
  componentId: string,
  organizationId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  const { error } = await supabase
    .from("event_member_components")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("component_id", componentId);

  if (error) return { error: error.message };

  revalidatePath(`/events`);
  return {};
}

export type InviteScope = "organization" | "event" | "component";

/**
 * Create a shareable (no-email) invite token with a specific scope.
 * Caller must be admin/owner of the organization.
 */
export async function createShareableInviteToken(
  organizationId: string,
  inviteType: InviteScope,
  role: "member" | "admin" | "lead",
  scopeId?: string, // event_id for event scope, component_id for component scope
  expiresInHours: number = 48,
  email?: string
): Promise<{ data?: { token: string; inviteUrl: string; emailSent: boolean; emailConfigured: boolean }; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  const cleanEmail = email?.toLowerCase().trim() || undefined;
  if (cleanEmail && !isValidEmail(cleanEmail)) {
    return { error: "Please enter a valid email address" };
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

  const insert: Record<string, unknown> = {
    organization_id: organizationId,
    invited_by: user.id,
    email: cleanEmail ?? null,
    role,
    invite_type: inviteType,
    expires_at: expiresAt,
  };

  if (inviteType === "event" && scopeId) insert.event_id = scopeId;
  if (inviteType === "component" && scopeId) insert.component_id = scopeId;

  const { data, error } = await supabase
    .from("invite_tokens")
    .insert(insert)
    .select("token")
    .single();

  if (error) return { error: error.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = `${siteUrl}/invite/${data.token}`;

  const emailConfigured = isEmailConfigured();
  let emailSent = false;
  if (cleanEmail && emailConfigured) {
    // Scope-name lookup and inviter identity are independent — run concurrently.
    const scopeNamePromise = (async (): Promise<string> => {
      if (inviteType === "organization") {
        const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).single();
        return org?.name ?? "an organization";
      } else if (inviteType === "event" && scopeId) {
        const { data: ev } = await supabase.from("events").select("name").eq("id", scopeId).single();
        return ev?.name ?? "an event";
      } else if (inviteType === "component" && scopeId) {
        const { data: comp } = await supabase.from("components").select("name").eq("id", scopeId).single();
        return comp?.name ?? "a component";
      }
      return "an organization";
    })();

    const [scopeName, inviter] = await Promise.all([
      scopeNamePromise,
      getInviterIdentity(supabase, user.id),
    ]);

    const send = await sendInviteEmail({
      to: cleanEmail,
      replyTo: inviter.email,
      inviterName: inviter.name,
      scope: inviteType,
      scopeName,
      role,
      inviteUrl,
      expiresLabel: expiresLabel(expiresInHours),
    });
    emailSent = send.sent;
  }

  revalidatePath("/settings");
  return { data: { token: data.token, inviteUrl, emailSent, emailConfigured } };
}

/**
 * Look up an invite token and return its details (org, role, inviter, expiry, scope).
 * No auth required — called from the public /invite/[token] page.
 */
export async function getInviteToken(token: string): Promise<{
  data?: InviteTokenWithOrg;
  error?: string;
  expired?: boolean;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invite_tokens")
    .select(`
      *,
      organization:organization_id(id, name, slug),
      inviter:invited_by(full_name, email),
      event:event_id(id, name, slug),
      component:component_id(id, name, slug)
    `)
    .eq("token", token)
    .single();

  if (error || !data) return { error: "Invite not found" };

  const expired = !!data.used_at || new Date(data.expires_at) < new Date();

  if (expired) {
    return { data: data as unknown as InviteTokenWithOrg, expired: true };
  }

  return { data: data as unknown as InviteTokenWithOrg };
}

/**
 * Consume an invite token via a SECURITY DEFINER database function.
 *
 * All business logic (validation, membership writes, token mark-used) runs
 * inside accept_invite() which bypasses RLS for the writes but still validates
 * auth.uid() — solving the circular RLS problem where the user isn't yet a
 * member of the org they're trying to join.
 */
export async function consumeInviteToken(token: string): Promise<{
  data?: { organizationId: string; orgName: string; role: string; redirectPath: string };
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Fetch invite context before consuming
    const { data: tokenRow } = await supabase
      .from("invite_tokens")
      .select("invited_by")
      .eq("token", token)
      .single();

    const { data, error } = await supabase.rpc("accept_invite", { p_token: token });

    if (error) return { error: error.message };

    const result = data as {
      error?: string;
      organizationId?: string;
      orgName?: string;
      role?: string;
      redirectPath?: string;
    } | null;

    if (!result) return { error: "No response from invite function" };
    if (result.error) return { error: result.error };

    revalidatePath("/");
    revalidatePath("/settings");

    // Set a cookie so the sidebar highlights the newly joined org on redirect.
    if (result.organizationId) {
      const cookieStore = await cookies();
      cookieStore.set("active_org_id", result.organizationId, {
        path: "/",
        maxAge: 60 * 60, // 1 hour — just long enough to survive the redirect
        httpOnly: false,
      });
    }

    if (tokenRow?.invited_by) {
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      await createNotificationInternal({
        recipientId: tokenRow.invited_by,
        actorId: user.id,
        type: "invite_accepted",
        title: `${actorProfile?.full_name ?? "Someone"} accepted your invitation to ${result.orgName ?? ""}`,
        link: "/settings",
      });
    }

    return {
      data: {
        organizationId: result.organizationId ?? "",
        orgName: result.orgName ?? "",
        role: result.role ?? "member",
        redirectPath: result.redirectPath ?? "/",
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Invite acceptance failed: ${message}` };
  }
}
