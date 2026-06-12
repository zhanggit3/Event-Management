"use client";

import { useState, useTransition } from "react";
import { Building2, Users, UserPlus, Trash2, CheckCircle, XCircle, Ban, Shield, Copy, Check, Link, Lock, ChevronDown, Plus } from "lucide-react";
import { getInitials, formatDate, isValidEmail } from "@/lib/utils";
import type { MemberWithProfile, JoinRequestWithProfile, BlockedUserWithProfile, ComponentAccessRequestWithDetails } from "@/types/database";
import type { InviteScope } from "@/app/actions/invites";

type Tab = "members" | "join-requests" | "blocked" | "access-requests";

interface OrgEvent {
  id: string; name: string; slug: string;
  components: { id: string; name: string; slug: string }[];
}

interface Actions {
  createShareableInviteToken: (
    orgId: string, type: InviteScope, role: "member" | "admin" | "lead", scopeId?: string, expiresInHours?: number, email?: string
  ) => Promise<{ data?: { token: string; inviteUrl: string; emailSent: boolean; emailConfigured: boolean }; error?: string }>;
  removeMember: (memberId: string, orgId: string) => Promise<{ error?: string }>;
  updateMemberRole: (memberId: string, role: string, orgId: string) => Promise<{ error?: string }>;
  approveJoinRequest: (requestId: string) => Promise<{ error?: string }>;
  denyJoinRequest: (requestId: string) => Promise<{ error?: string }>;
  blockUser: (requestId: string) => Promise<{ error?: string }>;
  unblockUser: (blockedUserId: string, orgId: string) => Promise<{ error?: string }>;
  acceptAccessRequest: (requestId: string, role?: "member" | "lead") => Promise<{ error?: string }>;
  denyAccessRequest: (requestId: string, reason?: string) => Promise<{ error?: string }>;
  createOrganization: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
}

interface InviteLinkModal {
  url: string;
  label: string;
  emailSent?: boolean;
  emailConfigured?: boolean;
  email?: string;
}

interface Props {
  organization: { id: string; name: string; slug: string; is_workspace: boolean };
  currentUserId: string;
  userRole: string;
  isAdmin: boolean;
  isOwner: boolean;
  members: MemberWithProfile[];
  joinRequests: JoinRequestWithProfile[];
  blockedUsers: BlockedUserWithProfile[];
  accessRequests: ComponentAccessRequestWithDetails[];
  orgEvents: OrgEvent[];
  hasNonWorkspaceOrg: boolean;
  actions: Actions;
}

interface BlockModal {
  requestId: string;
  email: string;
}

interface RemoveBlockModal {
  userId: string;
  email: string;
}

interface RoleChangeModal {
  memberId: string;
  memberName: string;
  memberEmail: string;
  fromRole: string;
  toRole: string;
  activeBlockCount: number;
}

// Role badge helper
function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-sky-500/15 text-sky-400",
    admin: "bg-violet-500/15 text-violet-400",
    member: "bg-white/10 text-white/40",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? "bg-white/10 text-white/40"}`}>
      {role}
    </span>
  );
}

// Avatar initials
function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-11 h-11 text-base" : "w-8 h-8 text-xs";
  return (
    <div className={`${dim} rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center font-semibold text-white/60 shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

export function SettingsClient({
  organization,
  currentUserId,
  userRole,
  isAdmin,
  isOwner,
  members: initialMembers,
  joinRequests: initialRequests,
  blockedUsers: initialBlocked,
  accessRequests: initialAccessRequests,
  orgEvents,
  hasNonWorkspaceOrg,
  actions,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [members, setMembers] = useState(initialMembers);
  const [joinRequests, setJoinRequests] = useState(initialRequests);
  const [blockedUsers, setBlockedUsers] = useState(initialBlocked);
  const [accessRequests, setAccessRequests] = useState(initialAccessRequests);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Invite scope state
  const [inviteType, setInviteType] = useState<InviteScope>("organization");
  const [inviteScopeId, setInviteScopeId] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "lead">("member");
  const [inviteExpiry, setInviteExpiry] = useState(48);
  const [inviteEmail, setInviteEmail] = useState("");

  // Modals
  const [blockModal, setBlockModal] = useState<BlockModal | null>(null);
  const [removeBlockModal, setRemoveBlockModal] = useState<RemoveBlockModal | null>(null);
  const [roleChangeModal, setRoleChangeModal] = useState<RoleChangeModal | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<{ memberId: string; role: string } | null>(null);
  const [inviteLinkModal, setInviteLinkModal] = useState<InviteLinkModal | null>(null);
  const [denyRequestModal, setDenyRequestModal] = useState<{ id: string; componentName: string } | null>(null);
  const [denyReason, setDenyReason] = useState("");

  // Create org state (for workspace-only users)
  const [newOrgName, setNewOrgName] = useState("");
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [createOrgSuccess, setCreateOrgSuccess] = useState(false);

  const showBlockedTab = blockedUsers.length > 0;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "members", label: "Members", count: members.length },
    ...(isAdmin ? [{ id: "join-requests" as Tab, label: "Join Requests", count: joinRequests.length }] : []),
    ...(accessRequests.length > 0 ? [{ id: "access-requests" as Tab, label: "Access Requests", count: accessRequests.length }] : []),
    ...(isAdmin && showBlockedTab ? [{ id: "blocked" as Tab, label: "Blocked", count: blockedUsers.length }] : []),
  ];

  // Derive component list for scope selector
  const componentOptions = inviteType === "component"
    ? (orgEvents.flatMap((e) => e.components.map((c) => ({ ...c, eventName: e.name, eventId: e.id }))))
    : [];

  function handleInviteTypeChange(type: InviteScope) {
    setInviteType(type);
    setInviteScopeId("");
    setInviteRole(type === "organization" ? "member" : "member");
  }

  async function handleGenerateLink() {
    setInviteError(null);
    const scopeId = inviteType === "organization" ? undefined : inviteScopeId || undefined;
    if ((inviteType === "event" || inviteType === "component") && !scopeId) {
      setInviteError(`Please select a ${inviteType} first.`);
      return;
    }
    const email = inviteEmail.trim();
    if (email && !isValidEmail(email)) {
      setInviteError("Please enter a valid email address");
      return;
    }
    startTransition(async () => {
      const result = await actions.createShareableInviteToken(
        organization.id, inviteType, inviteRole, scopeId, inviteExpiry, email || undefined
      );
      if (result.error) { setInviteError(result.error); return; }
      if (result.data) {
        const typeLabel = inviteType === "organization" ? "Org"
          : inviteType === "event" ? `Event: ${orgEvents.find(e=>e.id===scopeId)?.name ?? ""}`
          : `Component: ${componentOptions.find(c=>c.id===scopeId)?.name ?? ""}`;
        setInviteLinkModal({
          url: result.data.inviteUrl,
          label: typeLabel,
          emailSent: result.data.emailSent,
          emailConfigured: result.data.emailConfigured,
          email: email || undefined,
        });
        setInviteEmail("");
      }
    });
  }

  async function handleAccessRequestAccept(requestId: string) {
    startTransition(async () => {
      const result = await actions.acceptAccessRequest(requestId, "member");
      if (result.error) { setError(result.error); return; }
      setAccessRequests((prev) => prev.filter((r) => r.id !== requestId));
    });
  }

  async function handleAccessRequestDeny() {
    if (!denyRequestModal) return;
    startTransition(async () => {
      const result = await actions.denyAccessRequest(denyRequestModal.id, denyReason || undefined);
      if (result.error) { setError(result.error); return; }
      setAccessRequests((prev) => prev.filter((r) => r.id !== denyRequestModal.id));
      setDenyRequestModal(null);
      setDenyReason("");
    });
  }

  async function handleRemoveMember(memberId: string) {
    startTransition(async () => {
      const result = await actions.removeMember(memberId, organization.id);
      if (result.error) { setError(result.error); return; }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    });
  }

  function initiateRoleChange(member: MemberWithProfile, newRole: string) {
    if (member.role === "admin" && newRole === "member") {
      const adminBlockCount = blockedUsers.filter((b) => b.blocked_by === member.user_id).length;
      setRoleChangeModal({
        memberId: member.id,
        memberName: member.profile.full_name || member.profile.email,
        memberEmail: member.profile.email,
        fromRole: member.role,
        toRole: newRole,
        activeBlockCount: adminBlockCount,
      });
      setPendingRoleChange({ memberId: member.id, role: newRole });
    } else {
      startTransition(async () => {
        const result = await actions.updateMemberRole(member.id, newRole, organization.id);
        if (result.error) { setError(result.error); return; }
        setMembers((prev) =>
          prev.map((m) => m.id === member.id ? { ...m, role: newRole as "owner" | "admin" | "member" } : m)
        );
      });
    }
  }

  async function confirmRoleChange() {
    if (!pendingRoleChange || !roleChangeModal) return;
    startTransition(async () => {
      const result = await actions.updateMemberRole(pendingRoleChange.memberId, pendingRoleChange.role, organization.id);
      if (result.error) { setError(result.error); return; }
      setMembers((prev) =>
        prev.map((m) =>
          m.id === pendingRoleChange.memberId
            ? { ...m, role: pendingRoleChange.role as "owner" | "admin" | "member" }
            : m
        )
      );
      if (roleChangeModal.activeBlockCount > 0) {
        const adminMember = members.find((m) => m.id === pendingRoleChange.memberId);
        if (adminMember) {
          setBlockedUsers((prev) => prev.filter((b) => b.blocked_by !== adminMember.user_id));
        }
      }
      setRoleChangeModal(null);
      setPendingRoleChange(null);
    });
  }

  async function handleApprove(requestId: string) {
    startTransition(async () => {
      const result = await actions.approveJoinRequest(requestId);
      if (result.error) { setError(result.error); return; }
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
    });
  }

  async function handleDeny(requestId: string) {
    startTransition(async () => {
      const result = await actions.denyJoinRequest(requestId);
      if (result.error) { setError(result.error); return; }
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
    });
  }

  function initiateBlock(requestId: string, email: string) {
    setBlockModal({ requestId, email });
  }

  async function confirmBlock() {
    if (!blockModal) return;
    startTransition(async () => {
      const result = await actions.blockUser(blockModal.requestId);
      if (result.error) { setError(result.error); return; }
      setJoinRequests((prev) => prev.filter((r) => r.id !== blockModal.requestId));
      setBlockModal(null);
    });
  }

  function initiateRemoveBlock(userId: string, email: string) {
    setRemoveBlockModal({ userId, email });
  }

  async function confirmRemoveBlock() {
    if (!removeBlockModal) return;
    startTransition(async () => {
      const result = await actions.unblockUser(removeBlockModal.userId, organization.id);
      if (result.error) { setError(result.error); return; }
      setBlockedUsers((prev) => prev.filter((b) => b.user_id !== removeBlockModal.userId));
      setRemoveBlockModal(null);
    });
  }

  async function handleCreateOrg() {
    setCreateOrgError(null);
    if (!newOrgName.trim()) { setCreateOrgError("Please enter an organization name."); return; }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", newOrgName.trim());
      const result = await actions.createOrganization(fd);
      if (result.error) { setCreateOrgError(result.error); return; }
      setCreateOrgSuccess(true);
      setNewOrgName("");
      // Reload to reflect new org
      window.location.reload();
    });
  }

  // ─── Select style ───────────────────────────────────────────────────────────
  const selectCls = "w-full h-9 bg-white/[0.06] border border-white/10 rounded-xl text-white/80 text-sm px-3 focus:outline-none focus:border-sky-500/50 appearance-none cursor-pointer";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Organization Settings</h1>
        <p className="text-sm text-white/30 mt-1">Manage members, invites, and access control.</p>
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Create Organization section — visible only for workspace-only users */}
      {!hasNonWorkspaceOrg && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Create an Organization</p>
          </div>
          <p className="text-sm text-white/50 mb-4">
            Start collaborating with a team by creating an organization. You can invite members after it's created.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Acme Events"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              className="flex-1 h-10 px-3 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            <button
              onClick={handleCreateOrg}
              disabled={isPending || createOrgSuccess}
              className="h-10 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>
          </div>
          {createOrgError && (
            <p className="text-xs text-red-400 mt-2">{createOrgError}</p>
          )}
          {createOrgSuccess && (
            <p className="text-xs text-emerald-400 mt-2">Organization created! Refreshing…</p>
          )}
        </div>
      )}

      {/* Org info card */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Organization</p>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-base shrink-0">
            {getInitials(organization.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold leading-tight truncate">{organization.name}</p>
            <p className="text-sm text-white/30 font-mono">/{organization.slug}</p>
          </div>
          <div className="flex items-center gap-1.5 text-white/30 text-sm">
            <Users className="w-4 h-4" />
            <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-1 bg-white/[0.03] border border-white/[0.07] rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === tab.id
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold ${
                tab.id === "blocked"
                  ? "bg-red-500/20 text-red-400"
                  : activeTab === tab.id
                    ? "bg-sky-500/20 text-sky-400"
                    : "bg-white/10 text-white/40"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content panel */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl">

        {/* ── MEMBERS TAB ── */}
        {activeTab === "members" && (
          <div className="p-6 space-y-6">
            {/* Invite link generator — only for non-workspace orgs */}
            {isAdmin && !organization.is_workspace && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Generate Invite Link
                </p>

                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  {/* Scope selector pills */}
                  <div className="flex gap-2">
                    {(["organization", "event", "component"] as InviteScope[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => handleInviteTypeChange(t)}
                        className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-all ${
                          inviteType === t
                            ? "bg-sky-600 text-white"
                            : "bg-white/[0.05] text-white/40 hover:text-white/60 hover:bg-white/[0.08]"
                        }`}
                      >
                        {t === "organization" ? "Org" : t === "event" ? "Event" : "Component"}
                      </button>
                    ))}
                  </div>

                  {/* Event selector */}
                  {inviteType === "event" && (
                    <div className="relative">
                      <select
                        value={inviteScopeId}
                        onChange={(e) => setInviteScopeId(e.target.value)}
                        className={selectCls}
                      >
                        <option value="" className="bg-[#0D0D1C]">Select event…</option>
                        {orgEvents.map((ev) => (
                          <option key={ev.id} value={ev.id} className="bg-[#0D0D1C]">{ev.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                    </div>
                  )}

                  {/* Component selector */}
                  {inviteType === "component" && (
                    <div className="relative">
                      <select
                        value={inviteScopeId}
                        onChange={(e) => setInviteScopeId(e.target.value)}
                        className={selectCls}
                      >
                        <option value="" className="bg-[#0D0D1C]">Select component…</option>
                        {orgEvents.map((ev) => (
                          <optgroup key={ev.id} label={ev.name} className="bg-[#0D0D1C]">
                            {ev.components.map((c) => (
                              <option key={c.id} value={c.id} className="bg-[#0D0D1C]">{c.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                    </div>
                  )}

                  {/* Optional email — sends the invite link to this address */}
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => { setInviteEmail(e.target.value); if (inviteError) setInviteError(null); }}
                    placeholder="Email (optional) — send the link directly"
                    className="w-full h-9 px-3 bg-white/[0.05] border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-sky-500/50"
                  />

                  {/* Role + Expiry + Generate */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                        className={selectCls}
                      >
                        <option value="member" className="bg-[#0D0D1C]">Member</option>
                        {inviteType === "organization" && <option value="admin" className="bg-[#0D0D1C]">Admin</option>}
                        {(inviteType === "event" || inviteType === "component") && (
                          <option value="lead" className="bg-[#0D0D1C]">Lead</option>
                        )}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                    </div>
                    <div className="relative flex-1">
                      <select
                        value={inviteExpiry}
                        onChange={(e) => setInviteExpiry(Number(e.target.value))}
                        className={selectCls}
                      >
                        <option value={24} className="bg-[#0D0D1C]">24 hours</option>
                        <option value={48} className="bg-[#0D0D1C]">48 hours</option>
                        <option value={168} className="bg-[#0D0D1C]">7 days</option>
                        <option value={720} className="bg-[#0D0D1C]">30 days</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                    </div>
                    <button
                      onClick={handleGenerateLink}
                      disabled={isPending}
                      className="h-9 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      <Link className="w-3.5 h-3.5" />
                      Generate
                    </button>
                  </div>

                  {inviteError && (
                    <p className="text-xs text-red-400">{inviteError}</p>
                  )}
                </div>
              </div>
            )}

            {/* Member list */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">
                Team Members
              </p>
              <div className="divide-y divide-white/[0.06]">
                {members.map((member) => {
                  const isCurrentUser = member.user_id === currentUserId;
                  return (
                    <div key={member.id} className="flex items-center gap-3 py-3">
                      <Avatar name={member.profile.full_name || member.profile.email} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/70 font-medium truncate">
                          {member.profile.full_name || member.profile.email}
                          {isCurrentUser && (
                            <span className="text-white/30 font-normal ml-1.5 text-xs">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-white/30 truncate">{member.profile.email}</p>
                      </div>

                      {/* Role badge / selector */}
                      {isOwner && !isCurrentUser && member.role !== "owner" ? (
                        <div className="relative">
                          <select
                            value={member.role}
                            onChange={(e) => initiateRoleChange(member, e.target.value)}
                            className="h-7 pl-2 pr-6 bg-white/[0.05] border border-white/10 rounded-full text-[10px] font-semibold uppercase tracking-wide text-white/60 focus:outline-none focus:border-sky-500/50 appearance-none cursor-pointer"
                          >
                            <option value="admin" className="bg-[#0D0D1C]">Admin</option>
                            <option value="member" className="bg-[#0D0D1C]">Member</option>
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
                        </div>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}

                      {isAdmin && !isCurrentUser && member.role !== "owner" && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={isPending}
                          className="text-red-400/60 hover:text-red-400 text-xs transition-colors disabled:opacity-50 p-1"
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── JOIN REQUESTS TAB ── */}
        {activeTab === "join-requests" && (
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Pending Join Requests
            </p>

            {joinRequests.length === 0 ? (
              <div className="text-center py-14">
                <CheckCircle className="w-7 h-7 text-emerald-400/60 mx-auto mb-3" />
                <p className="text-sm text-white/30">No pending requests.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {joinRequests.map((req) => {
                  const profile = req.profile as unknown as { id: string; full_name: string; email: string };
                  return (
                    <div key={req.id} className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Avatar name={profile.full_name || profile.email} />
                          <div>
                            <p className="text-sm text-white/70 font-medium">{profile.full_name || profile.email}</p>
                            <p className="text-xs text-white/30">{profile.email}</p>
                            <p className="text-xs text-white/20 mt-0.5">
                              Requested {formatDate(req.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={isPending}
                            className="h-8 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDeny(req.id)}
                            disabled={isPending}
                            className="h-8 px-3 bg-white/[0.05] hover:bg-white/[0.08] text-white/50 hover:text-white/70 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => initiateBlock(req.id, profile.email)}
                            disabled={isPending}
                            className="h-8 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400/70 hover:text-red-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            Block
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── COMPONENT ACCESS REQUESTS TAB ── */}
        {activeTab === "access-requests" && (
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Component Access Requests
            </p>

            {accessRequests.length === 0 ? (
              <div className="text-center py-14">
                <CheckCircle className="w-7 h-7 text-emerald-400/60 mx-auto mb-3" />
                <p className="text-sm text-white/30">No pending access requests.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {accessRequests.map((req) => {
                  const requester = req.requester as unknown as { id: string; full_name: string; email: string };
                  const component = req.component as unknown as { id: string; name: string; slug: string; events?: { name: string; slug: string } };
                  return (
                    <div key={req.id} className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Avatar name={requester.full_name || requester.email} />
                          <div>
                            <p className="text-sm text-white/70 font-medium">{requester.full_name || requester.email}</p>
                            <p className="text-xs text-white/30">{requester.email}</p>
                            <p className="text-xs text-sky-400/70 mt-0.5 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              {component.name}
                              {(component as unknown as { events?: { name: string } }).events?.name && (
                                <span className="text-white/30"> · {(component as unknown as { events?: { name: string } }).events?.name}</span>
                              )}
                            </p>
                            {req.note && (
                              <p className="text-xs text-white/30 mt-1.5 italic border-l border-violet-500/40 pl-2">&ldquo;{req.note}&rdquo;</p>
                            )}
                            <p className="text-xs text-white/20 mt-0.5">{formatDate(req.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleAccessRequestAccept(req.id)}
                            disabled={isPending}
                            className="h-8 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-xs transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => setDenyRequestModal({ id: req.id, componentName: component.name })}
                            disabled={isPending}
                            className="h-8 px-3 bg-white/[0.05] hover:bg-white/[0.08] text-white/50 hover:text-white/70 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BLOCKED USERS TAB ── */}
        {activeTab === "blocked" && (
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4 flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" /> Blocked Users
            </p>

            <div className="divide-y divide-white/[0.06]">
              {blockedUsers.map((blocked) => {
                const profile = blocked.profile as unknown as { id: string; full_name: string; email: string };
                const blocker = blocked.blocker as unknown as { full_name: string; email: string };
                return (
                  <div key={blocked.id} className="py-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={profile.full_name || profile.email} />
                      <div>
                        <p className="text-sm text-white/70 font-medium">{profile.full_name || profile.email}</p>
                        <p className="text-xs text-white/30">{profile.email}</p>
                        <p className="text-xs text-white/20 mt-0.5">
                          Blocked {formatDate(blocked.created_at)} · by {blocker?.email ?? "admin"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => initiateRemoveBlock(blocked.user_id, profile.email)}
                      disabled={isPending}
                      className="h-8 px-3 bg-white/[0.05] hover:bg-white/[0.08] text-white/40 hover:text-white/60 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
                    >
                      Remove Block
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── BLOCK CONFIRMATION MODAL ── */}
      {blockModal && (
        <Modal onClose={() => setBlockModal(null)}>
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
              <Ban className="w-5 h-5 text-red-400" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-white text-center mb-1">Block This User?</h2>
          <p className="text-sm text-white/40 text-center mb-5">This action will:</p>

          <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-white/60 font-medium">{blockModal.email}</p>
          </div>

          <ul className="space-y-1.5 text-sm text-white/50 mb-4">
            {[
              "Deny their current request",
              "Prevent them from requesting again",
              "Notify them by email",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-red-400/60 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <p className="text-xs text-white/25 mb-6">You can remove the block in Settings later.</p>

          <div className="flex gap-3">
            <button
              onClick={confirmBlock}
              disabled={isPending}
              className="flex-1 h-10 bg-red-500/80 hover:bg-red-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              Block User
            </button>
            <button
              onClick={() => setBlockModal(null)}
              className="flex-1 h-10 bg-white/[0.06] hover:bg-white/[0.09] text-white/60 rounded-xl font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── REMOVE BLOCK CONFIRMATION MODAL ── */}
      {removeBlockModal && (
        <Modal onClose={() => setRemoveBlockModal(null)}>
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-white text-center mb-1">Remove Block?</h2>

          <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 mb-4 mt-4">
            <p className="text-sm text-white/60 font-medium">{removeBlockModal.email}</p>
          </div>

          <ul className="space-y-1.5 text-sm text-white/50 mb-6">
            {[
              "Allow them to request again",
              "Send email notification",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-emerald-400/60 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex gap-3">
            <button
              onClick={confirmRemoveBlock}
              disabled={isPending}
              className="flex-1 h-10 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              Remove Block
            </button>
            <button
              onClick={() => setRemoveBlockModal(null)}
              className="flex-1 h-10 bg-white/[0.06] hover:bg-white/[0.09] text-white/60 rounded-xl font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── INVITE LINK MODAL ── */}
      {inviteLinkModal && (
        <InviteLinkModalDialog
          url={inviteLinkModal.url}
          label={inviteLinkModal.label}
          emailSent={inviteLinkModal.emailSent}
          emailConfigured={inviteLinkModal.emailConfigured}
          email={inviteLinkModal.email}
          onClose={() => setInviteLinkModal(null)}
        />
      )}

      {/* ── DENY ACCESS REQUEST MODAL ── */}
      {denyRequestModal && (
        <Modal onClose={() => { setDenyRequestModal(null); setDenyReason(""); }}>
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-white/50" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-white text-center mb-1">Deny Access?</h2>
          <p className="text-sm text-center text-white/40 mb-5">
            Component: <span className="text-white/70">{denyRequestModal.componentName}</span>
          </p>
          <div className="space-y-2 mb-4">
            {[
              "This component contains sensitive vendor information",
              "Please coordinate through your component lead",
              "Not needed for your role",
            ].map((r) => (
              <button
                key={r}
                onClick={() => setDenyReason(r)}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-colors ${
                  denyReason === r
                    ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                    : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/60"
                }`}
              >
                {r}
              </button>
            ))}
            <input
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Or write a custom reason…"
              className="w-full h-9 bg-white/[0.06] border border-white/10 rounded-xl text-white/70 placeholder:text-white/20 text-xs px-3 focus:outline-none focus:border-sky-500/50"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAccessRequestDeny}
              disabled={isPending}
              className="flex-1 h-10 bg-white/[0.08] hover:bg-white/[0.12] text-white/70 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              Deny
            </button>
            <button
              onClick={() => { setDenyRequestModal(null); setDenyReason(""); }}
              className="flex-1 h-10 bg-white/[0.06] hover:bg-white/[0.09] text-white/50 rounded-xl font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── ROLE CHANGE MODAL ── */}
      {roleChangeModal && (
        <Modal onClose={() => { setRoleChangeModal(null); setPendingRoleChange(null); }}>
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
              <Shield className="w-5 h-5 text-sky-400" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-white text-center mb-1">Change Role?</h2>
          <p className="text-sm text-center text-white/40 mb-5">
            {roleChangeModal.memberName} →{" "}
            <span className="text-white/70 capitalize">{roleChangeModal.toRole}</span>
          </p>

          {roleChangeModal.activeBlockCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-amber-400 text-sm font-semibold">
                {roleChangeModal.activeBlockCount} active block{roleChangeModal.activeBlockCount !== 1 ? "s" : ""} will be removed
              </p>
              <p className="text-amber-400/60 text-xs mt-1">
                Downgrading will automatically remove their blocks and notify affected users.
              </p>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={confirmRoleChange}
              disabled={isPending}
              className="flex-1 h-10 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              Confirm Change
            </button>
            <button
              onClick={() => { setRoleChangeModal(null); setPendingRoleChange(null); }}
              className="flex-1 h-10 bg-white/[0.06] hover:bg-white/[0.09] text-white/60 rounded-xl font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0D0D1C] border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] flex items-center justify-center text-white/40 hover:text-white/60 transition-colors text-sm"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function InviteLinkModalDialog({
  url,
  label,
  emailSent,
  emailConfigured,
  email,
  onClose,
}: {
  url: string;
  label: string;
  emailSent?: boolean;
  emailConfigured?: boolean;
  email?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0D0D1C] border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] flex items-center justify-center text-white/40 hover:text-white/60 transition-colors text-sm"
        >
          ✕
        </button>

        <div className="flex justify-center mb-5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
            <Link className="w-5 h-5 text-sky-400" />
          </div>
        </div>

        <h2 className="text-lg font-semibold text-white text-center mb-1">Invite Link Created</h2>
        <p className="text-sm text-center text-white/40 mb-5">
          Scope: <span className="text-white/70">{label}</span>.{" "}
          {email
            ? <>Only <span className="text-white/70">{email}</span> can accept this invite.</>
            : <>Anyone with this link can join.</>}
        </p>

        {email && (
          <div
            className={`rounded-xl px-4 py-2.5 mb-4 text-sm text-center ${
              emailSent
                ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                : emailConfigured
                  ? "bg-amber-500/10 border border-amber-500/25 text-amber-400"
                  : "bg-white/[0.04] border border-white/[0.08] text-white/50"
            }`}
          >
            {emailSent
              ? <>Invite emailed to <span className="font-semibold">{email}</span></>
              : emailConfigured
                ? <>Couldn&apos;t send the email — copy the link below and share it manually.</>
                : <>Email delivery isn&apos;t set up — copy the link below to share it.</>}
          </div>
        )}

        {/* Link display */}
        <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-white/40 break-all select-all font-mono leading-relaxed">{url}</p>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={`w-full h-10 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            copied
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-sky-600 hover:bg-sky-500 text-white"
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Invite Link
            </>
          )}
        </button>

        <p className="text-xs text-center text-white/20 mt-3">
          Single-use · expires based on your setting
        </p>
      </div>
    </div>
  );
}
