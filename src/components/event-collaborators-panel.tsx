"use client";

import { useState, useTransition } from "react";
import { Users, Plus, Check, Copy, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createEventInviteWithComponents,
  addEventCollaboratorComponentGrant,
  removeEventCollaboratorComponentGrant,
} from "@/app/actions/invites";
import { isValidEmail } from "@/lib/utils";

type ComponentSummary = {
  id: string;
  name: string;
  icon?: string | null;
  color: string | null;
};

type CollaboratorGrant = {
  component_id: string;
};

type Collaborator = {
  user_id: string;
  role: string;
  profile: { id: string; full_name: string; email: string } | null;
  grants: CollaboratorGrant[];
};

interface EventCollaboratorsPanelProps {
  collaborators: Collaborator[];
  components: ComponentSummary[];
  eventId: string;
  organizationId: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function EventCollaboratorsPanel({
  collaborators: initialCollaborators,
  components,
  eventId,
  organizationId,
}: EventCollaboratorsPanelProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>(initialCollaborators);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sentToEmail, setSentToEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Per-collaborator manage state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  function toggleInviteComponent(id: string) {
    setSelectedComponents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleInviteOpenChange(v: boolean) {
    setInviteOpen(v);
    if (!v) {
      setSelectedComponents(new Set());
      setGeneratedUrl(null);
      setInviteEmail("");
      setSentToEmail("");
      setEmailSent(false);
      setEmailConfigured(true);
      setCopied(false);
      setInviteError(null);
    }
  }

  function handleGenerateLink() {
    setInviteError(null);
    const email = inviteEmail.trim();
    if (email && !isValidEmail(email)) {
      setInviteError("Please enter a valid email address");
      return;
    }
    startTransition(async () => {
      const result = await createEventInviteWithComponents(
        organizationId,
        eventId,
        Array.from(selectedComponents),
        48,
        email || undefined
      );
      if (result.error) {
        setInviteError(result.error);
      } else if (result.data) {
        setGeneratedUrl(result.data.inviteUrl);
        setEmailSent(result.data.emailSent);
        setEmailConfigured(result.data.emailConfigured);
        setSentToEmail(email);
      }
    });
  }

  async function handleCopy() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function isGranted(collab: Collaborator, componentId: string) {
    return collab.grants.some((g) => g.component_id === componentId);
  }

  function handleToggleGrant(collab: Collaborator, componentId: string) {
    setManageError(null);
    const has = isGranted(collab, componentId);
    startTransition(async () => {
      let result: { error?: string };
      if (has) {
        result = await removeEventCollaboratorComponentGrant(
          eventId,
          collab.user_id,
          componentId,
          organizationId
        );
      } else {
        result = await addEventCollaboratorComponentGrant(
          eventId,
          collab.user_id,
          componentId,
          organizationId
        );
      }

      if (result.error) {
        setManageError(result.error);
        return;
      }

      // Optimistic update
      setCollaborators((prev) =>
        prev.map((c) => {
          if (c.user_id !== collab.user_id) return c;
          const grants = has
            ? c.grants.filter((g) => g.component_id !== componentId)
            : [...c.grants, { component_id: componentId }];
          return { ...c, grants };
        })
      );
    });
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-white/40" />
            External Collaborators
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            Invite guests to specific components of this event.
          </p>
        </div>

        <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 h-9 px-3 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-white text-sm hover:bg-white/[0.1] transition-all">
              <Plus className="w-4 h-4" />
              Invite Collaborator
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite External Collaborator</DialogTitle>
            </DialogHeader>

            {!generatedUrl ? (
              <div className="space-y-4">
                <p className="text-sm text-white/50">
                  Select the components this person should have access to. They will only be added
                  to this event — not to the organization.
                </p>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                    Grant access to:
                  </p>
                  {components.length === 0 ? (
                    <p className="text-sm text-white/30 py-4 text-center">
                      No components in this event yet.
                    </p>
                  ) : (
                    components.map((comp) => {
                      const checked = selectedComponents.has(comp.id);
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => toggleInviteComponent(comp.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                            checked
                              ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                              : "bg-white/[0.03] border-white/[0.07] text-white/60 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <div
                            className="w-2 h-5 rounded-sm shrink-0"
                            style={{ backgroundColor: comp.color ?? "#64748b" }}
                          />
                          <span className="flex-1 text-sm font-medium">
                            {comp.icon && <span className="mr-1.5">{comp.icon}</span>}
                            {comp.name}
                          </span>
                          {checked && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                    Email <span className="normal-case font-normal text-white/30">(optional — send the link directly)</span>
                  </p>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => { setInviteEmail(e.target.value); if (inviteError) setInviteError(null); }}
                    placeholder="name@example.com"
                    className="w-full h-10 px-3 bg-white/[0.03] border border-white/[0.07] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                {inviteError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-sm text-red-400">{inviteError}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleInviteOpenChange(false)}
                    className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateLink}
                    disabled={isPending || selectedComponents.size === 0}
                    className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Link"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {sentToEmail && emailSent ? (
                  <div className="rounded-xl px-4 py-2.5 text-sm bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    Invite emailed to <span className="font-semibold">{sentToEmail}</span>. You can also copy the link below.
                  </div>
                ) : sentToEmail && emailConfigured ? (
                  <div className="rounded-xl px-4 py-2.5 text-sm bg-amber-500/10 border border-amber-500/25 text-amber-400">
                    Couldn&apos;t send the email — copy the link below and share it manually.
                  </div>
                ) : sentToEmail ? (
                  <div className="rounded-xl px-4 py-2.5 text-sm bg-white/[0.04] border border-white/[0.08] text-white/50">
                    Email delivery isn&apos;t set up — copy the link below to share it.
                  </div>
                ) : null}
                <p className="text-sm text-white/60">
                  Share this link with your collaborator. It can only be used once.
                </p>

                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5">
                  <span className="flex-1 text-sm text-white/70 truncate font-mono">
                    {generatedUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-green-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleInviteOpenChange(false)}
                    className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Collaborator list */}
      {collaborators.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-3">
            <Users className="w-5 h-5 text-white/20" />
          </div>
          <p className="text-sm text-white/30">
            No external collaborators yet. Generate an invite link to add one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {manageError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-2">
              <p className="text-sm text-red-400">{manageError}</p>
            </div>
          )}
          {collaborators.map((collab) => {
            const name = collab.profile?.full_name ?? collab.profile?.email ?? collab.user_id;
            const email = collab.profile?.email ?? "";
            const isExpanded = expandedUserId === collab.user_id;
            const grantedComponents = components.filter((c) => isGranted(collab, c.id));

            return (
              <div
                key={collab.user_id}
                className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden"
              >
                {/* Collaborator row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-indigo-300">
                      {getInitials(name)}
                    </span>
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{name}</p>
                    {email && name !== email && (
                      <p className="text-xs text-white/40 truncate">{email}</p>
                    )}
                  </div>

                  {/* Component grant pills */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end max-w-[240px]">
                    {grantedComponents.length === 0 ? (
                      <span className="text-xs text-white/30 italic">No access</span>
                    ) : (
                      grantedComponents.slice(0, 3).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{
                            backgroundColor: `${c.color ?? "#64748b"}22`,
                            color: c.color ?? "#94a3b8",
                          }}
                        >
                          {c.icon && <span>{c.icon}</span>}
                          {c.name}
                        </span>
                      ))
                    )}
                    {grantedComponents.length > 3 && (
                      <span className="text-xs text-white/40">
                        +{grantedComponents.length - 3} more
                      </span>
                    )}
                  </div>

                  {/* Manage toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedUserId(isExpanded ? null : collab.user_id)
                    }
                    className="shrink-0 flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors ml-2"
                  >
                    Manage
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Inline component checklist */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 py-3 space-y-1">
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Component access
                    </p>
                    {components.map((comp) => {
                      const granted = isGranted(collab, comp.id);
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggleGrant(collab, comp.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left ${
                            granted
                              ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                              : "bg-white/[0.02] border-white/[0.05] text-white/50 hover:bg-white/[0.05] hover:text-white"
                          } disabled:opacity-50`}
                        >
                          <div
                            className="w-2 h-4 rounded-sm shrink-0"
                            style={{ backgroundColor: comp.color ?? "#64748b" }}
                          />
                          <span className="flex-1 text-sm">
                            {comp.icon && <span className="mr-1.5">{comp.icon}</span>}
                            {comp.name}
                          </span>
                          {granted && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
