"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { InviteTokenWithOrg } from "@/types/database";
import { formatDate } from "@/lib/utils";

interface Props {
  invite: InviteTokenWithOrg;
}

export function InviteExpiredPage({ invite }: Props) {
  const org = invite.organization as unknown as { id: string; name: string; slug: string };

  return (
    <div className="max-w-sm mx-auto w-full">
      {/* Card */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8">

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-700 flex items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-zinc-500/20 blur-md" />
            <AlertTriangle className="relative w-8 h-8 text-white/60" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">
          {invite.used_at ? "Invite Already Used" : "Invite Has Expired"}
        </h1>
        <p className="text-center text-sm text-white/50 mb-6">
          {invite.used_at
            ? "This invite link has already been used and is no longer valid."
            : "This invite link has expired. Ask the organization admin for a new one."}
        </p>

        {/* Org context block */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-6 space-y-1">
          <span className="text-xs font-mono uppercase tracking-widest text-white/30">Organization</span>
          <p className="text-sm font-semibold text-white/80">{org.name}</p>
          <p className="text-xs font-mono text-white/30">
            {invite.used_at
              ? `Used on ${formatDate(invite.used_at)}`
              : `Expired on ${formatDate(invite.expires_at)}`}
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <Link
            href={`/join?q=${encodeURIComponent(org.name)}`}
            className="flex items-center justify-center w-full h-11 bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] rounded-xl font-semibold text-white text-sm tracking-wide transition-all"
          >
            Find {org.name} →
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center w-full h-11 bg-white/[0.04] hover:bg-white/[0.07] rounded-xl font-semibold text-white/60 text-sm tracking-wide transition-all"
          >
            Sign In Instead →
          </Link>
        </div>
      </div>
    </div>
  );
}
