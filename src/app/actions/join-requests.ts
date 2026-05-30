"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { JoinRequestWithProfile, BlockedUserWithProfile } from "@/types/database";

/** Max pending requests a user can have at once */
const MAX_PENDING = 5;

/**
 * Submit a join request to an organization.
 * Fails if: user already has 5 pending requests, user is blocked, user is already a member,
 * or a pending request already exists for this org.
 */
export async function submitJoinRequest(organizationId: string): Promise<{
  data?: { id: string };
  error?: string;
  blocked?: boolean;
  atLimit?: boolean;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check that the target org is not a personal workspace (workspaces are not joinable)
  const { data: targetOrg } = await supabase
    .from("organizations")
    .select("is_workspace")
    .eq("id", organizationId)
    .single();

  if (!targetOrg) return { error: "Organization not found" };
  if (targetOrg.is_workspace) return { error: "Personal workspaces cannot be joined" };

  // Check if blocked
  const { data: block } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (block) return { error: "You are blocked from this organization", blocked: true };

  // Check if already a member
  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingMember) return { error: "You are already a member of this organization" };

  // Count pending requests
  const { count } = await supabase
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if ((count ?? 0) >= MAX_PENDING) {
    return { error: "You have reached the maximum of 5 pending requests", atLimit: true };
  }

  // Check if a request already exists (any status) — use upsert logic
  const { data: existing } = await supabase
    .from("join_requests")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "pending") {
      return { error: "You already have a pending request for this organization" };
    }
    // Resolved request — update back to pending
    const { data: updated, error } = await supabase
      .from("join_requests")
      .update({ status: "pending", resolved_at: null, resolved_by: null, created_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) return { error: error.message };
    revalidatePath("/join");
    return { data: { id: updated.id } };
  }

  const { data, error } = await supabase
    .from("join_requests")
    .insert({ user_id: user.id, organization_id: organizationId })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/join");
  return { data: { id: data.id } };
}

/**
 * Get a user's join requests (for the /join page slot counter and history).
 */
export async function getMyJoinRequests(): Promise<{
  data?: JoinRequestWithProfile[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("join_requests")
    .select(`
      *,
      profile:user_id(id, full_name, email),
      organization:organization_id(id, name, slug)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { data: data as unknown as JoinRequestWithProfile[] };
}

/**
 * Admin: get all pending join requests for an org.
 */
export async function getPendingJoinRequests(organizationId: string): Promise<{
  data?: JoinRequestWithProfile[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("join_requests")
    .select(`
      *,
      profile:user_id(id, full_name, email),
      organization:organization_id(id, name, slug)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };
  return { data: data as unknown as JoinRequestWithProfile[] };
}

/**
 * Admin: approve a join request — adds the user to the org.
 */
export async function approveJoinRequest(requestId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: request, error: fetchErr } = await supabase
    .from("join_requests")
    .select("*, organization:organization_id(id, name)")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) return { error: "Request not found" };

  // Verify admin
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", request.organization_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  // Add to org
  const { error: memberErr } = await supabase
    .from("organization_members")
    .upsert(
      { organization_id: request.organization_id, user_id: request.user_id, role: "member" },
      { onConflict: "organization_id,user_id" }
    );

  if (memberErr) return { error: memberErr.message };

  // Update request status
  await supabase
    .from("join_requests")
    .update({ status: "approved", resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq("id", requestId);

  revalidatePath("/settings");
  return {};
}

/**
 * Admin: deny a join request.
 */
export async function denyJoinRequest(requestId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: request, error: fetchErr } = await supabase
    .from("join_requests")
    .select("organization_id")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) return { error: "Request not found" };

  // Verify admin
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", request.organization_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  await supabase
    .from("join_requests")
    .update({ status: "denied", resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq("id", requestId);

  revalidatePath("/settings");
  return {};
}

/**
 * Admin: block a user — denies their request, inserts into blocked_users.
 */
export async function blockUser(requestId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: request, error: fetchErr } = await supabase
    .from("join_requests")
    .select("organization_id, user_id")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) return { error: "Request not found" };

  // Verify admin
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", request.organization_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  // Insert block (upsert to be safe)
  const { error: blockErr } = await supabase
    .from("blocked_users")
    .upsert(
      { user_id: request.user_id, organization_id: request.organization_id, blocked_by: user.id },
      { onConflict: "user_id,organization_id" }
    );

  if (blockErr) return { error: blockErr.message };

  // Update request to blocked
  await supabase
    .from("join_requests")
    .update({ status: "blocked", resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq("id", requestId);

  revalidatePath("/settings");
  return {};
}

/**
 * Admin: unblock a user (remove from blocked_users).
 */
export async function unblockUser(blockedUserId: string, organizationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify admin
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  await supabase
    .from("blocked_users")
    .delete()
    .eq("user_id", blockedUserId)
    .eq("organization_id", organizationId);

  revalidatePath("/settings");
  return {};
}

/**
 * Admin: get all blocked users for an org.
 */
export async function getBlockedUsers(organizationId: string): Promise<{
  data?: BlockedUserWithProfile[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("blocked_users")
    .select(`
      *,
      profile:user_id(id, full_name, email),
      blocker:blocked_by(full_name, email)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { data: data as unknown as BlockedUserWithProfile[] };
}

/**
 * Search public organizations by name (for /join page).
 */
export async function searchOrganizations(query: string): Promise<{
  data?: Array<{
    id: string;
    name: string;
    slug: string;
    member_count: number;
    userRequest: { status: string; created_at: string } | null;
    isBlocked: boolean;
  }>;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch orgs matching query — exclude personal workspaces (is_workspace = false only)
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .ilike("name", `%${query}%`)
    .eq("is_workspace", false)
    .limit(20);

  if (error) return { error: error.message };
  if (!orgs || orgs.length === 0) return { data: [] };

  const orgIds = orgs.map((o) => o.id);

  // Get member counts
  const { data: memberCounts } = await supabase
    .from("organization_members")
    .select("organization_id")
    .in("organization_id", orgIds);

  // Get user's existing requests for these orgs
  const { data: myRequests } = await supabase
    .from("join_requests")
    .select("organization_id, status, created_at")
    .eq("user_id", user.id)
    .in("organization_id", orgIds);

  // Get blocks for user in these orgs
  const { data: myBlocks } = await supabase
    .from("blocked_users")
    .select("organization_id")
    .eq("user_id", user.id)
    .in("organization_id", orgIds);

  // Get user's own memberships
  const { data: myMemberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .in("organization_id", orgIds);

  const memberCountMap: Record<string, number> = {};
  (memberCounts ?? []).forEach((m) => {
    memberCountMap[m.organization_id] = (memberCountMap[m.organization_id] ?? 0) + 1;
  });

  const requestMap: Record<string, { status: string; created_at: string }> = {};
  (myRequests ?? []).forEach((r) => {
    requestMap[r.organization_id] = { status: r.status, created_at: r.created_at };
  });

  const blockedSet = new Set((myBlocks ?? []).map((b) => b.organization_id));
  const memberSet = new Set((myMemberships ?? []).map((m) => m.organization_id));

  const results = orgs
    .filter((org) => !memberSet.has(org.id)) // exclude orgs user is already in
    .map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      member_count: memberCountMap[org.id] ?? 0,
      userRequest: requestMap[org.id] ?? null,
      isBlocked: blockedSet.has(org.id),
    }));

  return { data: results };
}

/**
 * Get pending slot count for current user.
 */
export async function getMyPendingSlotCount(): Promise<{ count: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { count: 0, error: "Not authenticated" };

  const { count, error } = await supabase
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}

/**
 * Owner: remove all blocks created by a specific admin (called when downgrading admin→member).
 */
export async function removeAdminBlocks(adminUserId: string, organizationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify owner
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return { error: "Only the owner can perform this action" };
  }

  await supabase
    .from("blocked_users")
    .delete()
    .eq("blocked_by", adminUserId)
    .eq("organization_id", organizationId);

  revalidatePath("/settings");
  return {};
}
