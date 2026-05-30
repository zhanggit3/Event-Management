"use client";

import { useEffect, useState } from "react";
import { X, Users, Zap } from "lucide-react";

interface OrgBannerProps {
  orgId: string;
  orgName: string;
  role: string;
  bannerType: "welcome" | "joined";
}

export function OrgBanner({ orgId, orgName, role, bannerType }: OrgBannerProps) {
  const storageKey = bannerType === "welcome" ? `welcomed_${orgId}` : `joined_${orgId}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) {
      setVisible(true);
    }
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  }

  if (!visible) return null;

  if (bannerType === "welcome") {
    return (
      <div className="bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border-b border-emerald-500/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{orgName} is live</p>
            <p className="text-xs text-white/50">You're the owner. Create your first event to get started.</p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-indigo-500/15 to-violet-500/15 border-b border-indigo-500/20 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <Users className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">You've joined {orgName}</p>
          <p className="text-xs text-white/50">You're a {role}. Here's what's happening.</p>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
