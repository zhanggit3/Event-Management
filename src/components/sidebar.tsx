"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Settings, LogOut, Plus, LayoutDashboard, Building2, Zap, ChevronDown, Menu, X } from "lucide-react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes (e.g. tapping a nav link).
  // Uses React's "adjust state during render from a previous value" pattern
  // (storing the prior pathname in state) instead of a setState-in-effect,
  // which the project's lint config disallows.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  function toggleOrg(orgId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  // The rail is a top-level switcher; the panel below shows the active section's context.
  // "dashboard" must be an EXACT match for "/" — otherwise fallthrough routes like
  // /settings would light up the Dashboard icon and render the Overview panel.
  const activeSection: "dashboard" | "events" | "company" | "other" = pathname.startsWith("/company")
    ? "company"
    : pathname.startsWith("/events")
      ? "events"
      : pathname === "/"
        ? "dashboard"
        : "other";

  return (
    <>
      {/* ── Mobile top bar — hidden on md+ ───────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 h-14 px-3 bg-[#080814] border-b border-white/[0.06]">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
          <Zap className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* ── Backdrop — only when open, only < md ─────────────────────────── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      <aside
        className={cn(
          "flex bg-[#080814] text-white border-r border-white/[0.06]",
          // mobile: fixed off-canvas drawer
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // md+: restore original static behavior
          "md:static md:translate-x-0 md:min-h-screen md:shrink-0 md:z-auto"
        )}
      >

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

        {/* Primary nav icons — top-level section switcher */}
        <nav className="flex-1 flex flex-col items-center py-3 gap-1">
          <IconTooltip label="Dashboard">
            <Link
              href="/"
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                activeSection === "dashboard"
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
              )}
            >
              <LayoutDashboard className="w-4 h-4" />
            </Link>
          </IconTooltip>

          <IconTooltip label="Events">
            <Link
              href="/events"
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                activeSection === "events"
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
              )}
            >
              <CalendarDays className="w-4 h-4" />
            </Link>
          </IconTooltip>

          <IconTooltip label="Company">
            <Link
              href="/company"
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                activeSection === "company"
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
              )}
            >
              <Building2 className="w-4 h-4" />
            </Link>
          </IconTooltip>
        </nav>

        {/* Footer icons */}
        <div className="flex flex-col items-center pb-3 pt-3 gap-1 border-t border-white/[0.06]">
          <IconTooltip label="Notifications">
            <NotificationBell />
          </IconTooltip>

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

      {/* ── Content Panel — contextual to the active section ──────────────── */}
      <div className="flex flex-col w-48 min-h-screen">

        {/* Workspace header */}
        <div className="relative flex flex-col justify-center px-3 h-14 border-b border-white/[0.06] shrink-0">
          <p className="text-sm font-semibold text-white truncate leading-tight pr-8 md:pr-0">
            {firstName ? `${firstName}’s Workspace` : "Your Workspace"}
          </p>
          <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5 font-mono uppercase tracking-wider pr-8 md:pr-0">
            Personal
          </p>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden absolute top-3 right-2 flex items-center justify-center w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {activeSection === "events" && (
            <EventsPanel
              workspaceEvents={workspaceEvents}
              organizations={organizations}
              allEvents={allEvents}
              activeOrgId={activeOrgId}
              pathname={pathname}
              collapsed={collapsed}
              toggleOrg={toggleOrg}
            />
          )}

          {activeSection === "company" && <CompanyPanel pathname={pathname} />}

          {activeSection === "dashboard" && (
            <>
              <p className="px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/25">
                Workspace
              </p>
              <Link
                href="/"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs bg-indigo-500/15 text-indigo-300 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                <span className="flex-1 truncate font-medium">Overview</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </aside>
    </>
  );
}

function EventsPanel({
  workspaceEvents,
  organizations,
  allEvents,
  activeOrgId,
  pathname,
  collapsed,
  toggleOrg,
}: {
  workspaceEvents: SidebarProps["workspaceEvents"];
  organizations: SidebarProps["organizations"];
  allEvents: SidebarProps["allEvents"];
  activeOrgId?: string | null;
  pathname: string;
  collapsed: Set<string>;
  toggleOrg: (orgId: string) => void;
}) {
  return (
    <>
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
    </>
  );
}

function CompanyPanel({ pathname }: { pathname: string }) {
  return (
    <>
      {/* ── Collaborators ────────────────────────────────── */}
      <p className="px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/25">
        Collaborators
      </p>
      <div className="space-y-0.5">
        <CompanyNavItem href="/company" label="Clients" active={pathname === "/company"} />
      </div>

      {/* ── Library ──────────────────────────────────────── */}
      <div className="pt-3 pb-1 px-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/25">
          Library
        </p>
      </div>
      <div className="space-y-0.5">
        <CompanyNavItem
          href="/company/templates"
          label="Templates"
          active={pathname === "/company/templates" || pathname.startsWith("/company/templates/")}
        />
        <CompanyNavItem
          href="/company/my-items"
          label="My Items"
          active={pathname === "/company/my-items" || pathname.startsWith("/company/my-items/")}
        />
      </div>
    </>
  );
}

function CompanyNavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 pl-5 rounded-lg text-xs transition-colors font-medium",
        active
          ? "bg-indigo-500/15 text-indigo-300"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
      )}
    >
      <span className="flex-1 truncate">{label}</span>
    </Link>
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
