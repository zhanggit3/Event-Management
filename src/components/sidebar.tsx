"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Settings, LogOut, Plus, LayoutDashboard, Zap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/actions/auth";
import { NotificationBell } from "@/components/notification-bell";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface SidebarProps {
  organizations: {
    id: string;
    name: string;
    slug: string;
    is_workspace: boolean;
    membershipScope: "org" | "event" | "component";
  }[];
  allEvents: {
    id: string;
    name: string;
    slug: string;
    status: string;
    organization_id: string;
  }[];
  workspaceEvents: {
    id: string;
    name: string;
    slug: string;
    status: string;
    organization_id: string;
  }[];
  firstName: string;
  activeOrgId?: string | null;
  userInitials: string;
  userEmail: string;
}

export function Sidebar({ organizations, allEvents, workspaceEvents, firstName, activeOrgId, userInitials, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleOrg(orgId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  return (
    <aside className="flex min-h-screen shrink-0 bg-[#080814] text-white border-r border-white/[0.06]">

      {/* ── Icon Rail ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col w-12 min-h-screen border-r border-white/[0.06] shrink-0">

        {/* App logo */}
        <div className="flex items-center justify-center h-14 border-b border-white/[0.06] shrink-0">
          <IconTooltip label="Vibe">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 cursor-default">
              <Zap className="w-4 h-4 text-white" />
            </div>
          </IconTooltip>
        </div>

        {/* Primary nav icons */}
        <nav className="flex-1 flex flex-col items-center py-3 gap-1">
          <IconTooltip label="Dashboard">
            <Link
              href="/"
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                pathname === "/"
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
              )}
            >
              <LayoutDashboard className="w-4 h-4" />
            </Link>
          </IconTooltip>

          <IconTooltip label="Notifications">
            <NotificationBell />
          </IconTooltip>
        </nav>

        {/* Footer icons */}
        <div className="flex flex-col items-center pb-3 pt-3 gap-1 border-t border-white/[0.06]">
          <IconTooltip label="Settings">
            <Link
              href="/settings"
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                pathname === "/settings"
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
              )}
            >
              <Settings className="w-4 h-4" />
            </Link>
          </IconTooltip>

          <form action={signOut}>
            <IconTooltip label="Sign out">
              <button
                type="submit"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </IconTooltip>
          </form>

          <IconTooltip label={userEmail || "Account"}>
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-[11px] font-bold mt-1 cursor-default select-none">
              {userInitials}
            </div>
          </IconTooltip>
        </div>
      </div>

      {/* ── Content Panel ─────────────────────────────────────────────────── */}
      <div className="flex flex-col w-48 min-h-screen">

        {/* Workspace header */}
        <div className="flex flex-col justify-center px-3 h-14 border-b border-white/[0.06] shrink-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {firstName ? `${firstName}’s Workspace` : "Your Workspace"}
          </p>
          <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5 font-mono uppercase tracking-wider">
            Personal
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">

          {/* ── My Space ─────────────────────────────────────── */}
          <p className="px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/25">
            My Space
          </p>
          {workspaceEvents.length > 0 ? (
            <div className="space-y-0.5">
              {workspaceEvents.map((event) => (
                <EventItem
                  key={event.id}
                  href={`/events/${event.slug}`}
                  label={event.name}
                  active={pathname === `/events/${event.slug}` || pathname.startsWith(`/events/${event.slug}/`)}
                  status={event.status}
                />
              ))}
              <Link
                href="/events/new"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span>New Event</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5">
              <Link
                href="/events/new"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span>New Event</span>
              </Link>
            </div>
          )}

          {/* ── Shared with me ───────────────────────────────── */}
          {organizations.length > 0 && (
            <>
              <div className="pt-3 pb-1 px-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/25">
                  Shared with me
                </p>
              </div>
              <div className="space-y-1">
                {organizations.map((org) => {
                  const orgEvents = allEvents.filter((e) => e.organization_id === org.id);
                  const isGuest = org.membershipScope !== "org";
                  const isCollapsed = collapsed.has(org.id);
                  const isNewlyJoined = activeOrgId === org.id;

                  return (
                    <div key={org.id} className={cn(isNewlyJoined && "ring-1 ring-indigo-500/30 rounded-lg")}>
                      <button
                        onClick={() => toggleOrg(org.id)}
                        className={cn(
                          "flex items-center gap-1.5 w-full px-2 py-1 rounded-lg transition-colors",
                          isNewlyJoined
                            ? "text-white/80 bg-indigo-500/10 hover:bg-indigo-500/15"
                            : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                        )}
                      >
                        <ChevronDown
                          className={cn(
                            "w-3 h-3 shrink-0 transition-transform",
                            isNewlyJoined ? "text-indigo-400/60" : "text-white/30",
                            isCollapsed && "-rotate-90"
                          )}
                        />
                        <span className="flex-1 text-left text-xs font-medium truncate">
                          {org.name}
                        </span>
                        {isNewlyJoined && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        )}
                        {isGuest && !isNewlyJoined && (
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 shrink-0">
                            Guest
                          </span>
                        )}
                      </button>

                      {!isCollapsed && (
                        <div className="mt-0.5 space-y-0.5">
                          {orgEvents.map((event) => (
                            <EventItem
                              key={event.id}
                              href={`/events/${event.slug}`}
                              label={event.name}
                              active={pathname === `/events/${event.slug}` || pathname.startsWith(`/events/${event.slug}/`)}
                              status={event.status}
                            />
                          ))}
                          {!isGuest && (
                            <Link
                              href="/events/new"
                              className="flex items-center gap-2 px-2 py-1.5 pl-5 rounded-lg text-xs text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
                            >
                              <Plus className="w-3 h-3 shrink-0" />
                              <span>New Event</span>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </nav>
      </div>
    </aside>
  );
}

function EventItem({
  href,
  label,
  active,
  status,
}: {
  href: string;
  label: string;
  active: boolean;
  status?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 pl-5 rounded-lg text-xs transition-colors group",
        active
          ? "bg-indigo-500/15 text-indigo-300"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
      )}
    >
      <CalendarDays
        className={cn(
          "w-3.5 h-3.5 shrink-0",
          active ? "text-indigo-400" : "text-white/30 group-hover:text-white/50"
        )}
      />
      <span className="flex-1 truncate font-medium">{label}</span>
      {status && status !== "active" && (
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0",
            status === "draft" && "bg-amber-500/15 text-amber-400",
            status === "completed" && "bg-emerald-500/15 text-emerald-400",
            status === "archived" && "bg-white/10 text-white/40"
          )}
        >
          {status}
        </span>
      )}
    </Link>
  );
}
