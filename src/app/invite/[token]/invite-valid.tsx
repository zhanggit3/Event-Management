"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Building2, CalendarDays, Layers } from "lucide-react";
import type { InviteTokenWithOrg } from "@/types/database";
import { consumeInviteToken } from "@/app/actions/invites";

interface Props {
  invite: InviteTokenWithOrg;
  token: string;
  isAuthenticated: boolean;
}

function useCountdown(expiresAt: string) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function calc() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        h > 0
          ? `${h}h ${String(m).padStart(2, "0")}m`
          : `${m}m ${String(s).padStart(2, "0")}s`
      );
    }
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return timeLeft;
}

const SCOPE_CONFIG = {
  organization: {
    icon: Building2,
    label: "Organization",
    gradient: "from-blue-500 to-cyan-500",
    glow: "bg-blue-500/20",
  },
  event: {
    icon: CalendarDays,
    label: "Event",
    gradient: "from-violet-500 to-purple-500",
    glow: "bg-violet-500/20",
  },
  component: {
    icon: Layers,
    label: "Component",
    gradient: "from-teal-500 to-emerald-500",
    glow: "bg-teal-500/20",
  },
} as const;

export function InviteValidPage({ invite, token, isAuthenticated }: Props) {
  const org = (invite.organization ?? null) as { id: string; name: string; slug: string } | null;
  const inviter = (invite.inviter ?? null) as { full_name: string; email: string } | null;
  const eventScope = (invite.event ?? null) as { id: string; name: string; slug: string } | null;
  const componentScope = (invite.component ?? null) as { id: string; name: string; slug: string } | null;
  const inviteType = (invite.invite_type ?? "organization") as "organization" | "event" | "component";
  const timeLeft = useCountdown(invite.expires_at);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    const result = await consumeInviteToken(token);
    if (result.error) {
      setAcceptError(result.error);
      setAccepting(false);
      return;
    }
    window.location.href = result.data?.redirectPath ?? "/";
  }

  const scope = SCOPE_CONFIG[inviteType];
  const ScopeIcon = scope.icon;

  const scopeName = inviteType === "component" ? componentScope?.name
    : inviteType === "event" ? eventScope?.name
    : org?.name ?? "Organization";

  return (
    <div className="max-w-sm mx-auto w-full">
      {/* Card */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8">

        {/* Scope icon */}
        <div className="flex justify-center mb-6">
          <div className={`relative w-16 h-16 rounded-xl bg-gradient-to-br ${scope.gradient} flex items-center justify-center`}>
            <div className={`absolute inset-0 rounded-xl ${scope.glow} blur-md`} />
            <ScopeIcon className="relative w-8 h-8 text-white" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">
          You&apos;ve Been Invited
        </h1>
        <p className="text-center text-sm text-white/50 mb-6">
          {inviteType === "organization"
            ? "Join the full organization — access to all events and components."
            : inviteType === "event"
            ? "Join this event — access to all its components."
            : "Join a specific component of this event."}
        </p>

        {/* Inviter / role info block */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono uppercase tracking-widest px-2 py-0.5 rounded-md bg-gradient-to-r ${scope.gradient} text-white font-semibold`}>
              {scope.label}
            </span>
            <p className="text-sm font-semibold text-white truncate">{scopeName ?? org?.name ?? "Organization"}</p>
          </div>

          {/* Parent context for event/component scopes */}
          {inviteType !== "organization" && (
            <div className="flex items-center gap-2 text-xs font-mono text-white/40">
              <Building2 className="w-3 h-3 shrink-0" />
              <span>{org?.name ?? "Organization"}</span>
              {inviteType === "component" && eventScope && (
                <>
                  <span>·</span>
                  <CalendarDays className="w-3 h-3 shrink-0" />
                  <span>{eventScope.name}</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs font-mono text-white/40 pt-2 border-t border-white/[0.06]">
            <span>Invited by {inviter?.full_name || inviter?.email || "a team member"}</span>
            <span>
              Role:{" "}
              <span className="uppercase font-bold text-white/70">{invite.role}</span>
            </span>
          </div>
        </div>

        {/* Expiry */}
        <p className="text-xs text-white/30 font-mono text-center mb-6">
          Expires in{" "}
          <span className="font-bold text-white/50">{timeLeft}</span>
          {" "}· single-use
        </p>

        {/* Buttons */}
        <div className="space-y-3">
          {acceptError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-sm">
              {acceptError}
            </div>
          )}

          {isAuthenticated ? (
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="flex items-center justify-center w-full h-11 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 rounded-xl font-semibold text-white text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting ? "Joining..." : "Accept & Join →"}
            </button>
          ) : (
            <>
              <Link
                href={`/signup?invite=${token}`}
                className="flex items-center justify-center w-full h-11 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-sm tracking-wide transition-all"
              >
                Create Account &amp; Join →
              </Link>
              <Link
                href={`/login?invite=${token}`}
                className="flex items-center justify-center w-full h-11 bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] rounded-xl font-semibold text-white text-sm tracking-wide transition-all"
              >
                Sign In &amp; Join →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
