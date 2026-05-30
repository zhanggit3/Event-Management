import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { removeMember, updateMemberRole, createOrganization } from "@/app/actions/organizations";
import { approveJoinRequest, denyJoinRequest, blockUser, unblockUser } from "@/app/actions/join-requests";
import { createShareableInviteToken } from "@/app/actions/invites";
import { getPendingAccessRequests, acceptAccessRequest, denyAccessRequest } from "@/app/actions/component-access-requests";
import type { MemberWithProfile, JoinRequestWithProfile, BlockedUserWithProfile, ComponentAccessRequestWithDetails } from "@/types/database";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let organization: { id: string; name: string; slug: string; is_workspace: boolean } | null = null;
  let userRole: string = "member";
  let typedMembers: MemberWithProfile[] = [];
  let joinRequests: JoinRequestWithProfile[] = [];
  let blockedUsers: BlockedUserWithProfile[] = [];
  let accessRequests: ComponentAccessRequestWithDetails[] = [];
  let orgEvents: { id: string; name: string; slug: string; components: { id: string; name: string; slug: string }[] }[] = [];
  let hasNonWorkspaceOrg = false;

  // Fetch all memberships to find workspace vs org
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug, is_workspace)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) redirect("/");

  // Find a non-workspace org first; fall back to workspace
  const nonWorkspaceMembership = memberships.find(
    (m) => (m.organizations as unknown as { is_workspace: boolean })?.is_workspace === false
  );
  const firstMembership = nonWorkspaceMembership ?? memberships[0];

  hasNonWorkspaceOrg = !!nonWorkspaceMembership;

  organization = firstMembership.organizations as unknown as { id: string; name: string; slug: string; is_workspace: boolean };
  userRole = firstMembership.role;
  const isAdmin = userRole === "owner" || userRole === "admin";

  const { data: members } = await supabase
    .from("organization_members")
    .select("*, profile:user_id(id, full_name, email, avatar_url, created_at)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  typedMembers = (members ?? []) as MemberWithProfile[];

  if (isAdmin) {
    const { data: requests } = await supabase
      .from("join_requests")
      .select("*, profile:user_id(id, full_name, email), organization:organization_id(id, name, slug)")
      .eq("organization_id", organization.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    joinRequests = (requests ?? []) as JoinRequestWithProfile[];

    const { data: blocked } = await supabase
      .from("blocked_users")
      .select("*, profile:user_id(id, full_name, email), blocker:blocked_by(full_name, email)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    blockedUsers = (blocked ?? []) as BlockedUserWithProfile[];

    // Fetch org events + components for invite scope selector
    const { data: eventsRaw } = await supabase
      .from("events")
      .select("id, name, slug, components(id, name, slug)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    orgEvents = (eventsRaw ?? []) as typeof orgEvents;
  } else {
    joinRequests = [];
    blockedUsers = [];
  }

  // Component access requests (admins + component leads)
  const accessResult = await getPendingAccessRequests(organization.id);
  accessRequests = accessResult.data ?? [];

  const isOwner = userRole === "owner";

  return (
    <SettingsClient
      organization={organization!}
      currentUserId={user.id}
      userRole={userRole}
      isAdmin={isAdmin}
      isOwner={isOwner}
      members={typedMembers}
      joinRequests={joinRequests}
      blockedUsers={blockedUsers}
      accessRequests={accessRequests}
      orgEvents={orgEvents}
      hasNonWorkspaceOrg={hasNonWorkspaceOrg}
      actions={{
        createShareableInviteToken,
        removeMember,
        updateMemberRole,
        approveJoinRequest,
        denyJoinRequest,
        blockUser,
        unblockUser,
        acceptAccessRequest,
        denyAccessRequest,
        createOrganization,
      }}
    />
  );
}
