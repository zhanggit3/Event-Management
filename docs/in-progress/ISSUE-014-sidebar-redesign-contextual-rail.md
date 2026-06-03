# ISSUE-014: Sidebar redesign — contextual rail (Dashboard / Events / Company)

**Type:** Design
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #014

> **Sequence first.** This is the shell that [[ISSUE-011]] (Company › Clients), [[ISSUE-012]] (Templates), and [[ISSUE-013]] (My Items) plug into. It also **supersedes the sidebar edit and in-page section nav** that 011 originally specced — those move here. Build 014 before 011.

## Problem

The sidebar's icon rail only has Dashboard + Notifications; events live solely in the second panel and `/` *is* the event list, so there is no top-level switcher and no home for a Company section. Redesign the sidebar to a Houzz-style **contextual** model: a leftmost icon rail with **Dashboard, Events, Company**, and a second panel whose contents change with the selected section. Also create a dedicated **Dashboard overview** home (moving the event list to an Events view) and move the notification (Alerts) button down next to Settings.

## Acceptance Criteria

- [ ] The icon rail shows three primary items in order: **Dashboard** (`/`), **Events** (`/events`), **Company** (`/company`), each with an icon and tooltip, and an active (indigo) state derived from the path.
- [ ] The **Alerts** (NotificationBell) button is moved out of the top nav into the footer, positioned directly **above Settings**. Footer order: Alerts · Settings · Sign out · avatar.
- [ ] The second panel is **contextual**: on `/events*` it shows the event tree (My Space / Shared with me); on `/company*` it shows the Company nav (Collaborators › Clients; Library › Templates, My Items); on `/` (Dashboard) it shows a minimal panel (workspace header only).
- [ ] Active state in the panel: the current event is highlighted under Events; the current Company sub-page (Clients/Templates/My Items) is highlighted under Company.
- [ ] `/` renders a new **Dashboard overview** (greeting, stat row, upcoming events, quick "New Event" action), NOT the full event list.
- [ ] `/events` renders the full grouped event list that `/` used to show (My Space, Shared with me, per-org grouping, empty state).
- [ ] The existing component-scope-only redirect and `NoOrgPrompt` behavior are preserved on `/`.
- [ ] Navigating between sections does not lose the rail; the Vibe logo stays at the top of the rail.
- [ ] No regression: event detail pages (`/events/[slug]/...`) still show the event tree panel and work as before.

## Affected Files

**Modify:**
- `src/components/sidebar.tsx` — restructure: rail nav (Dashboard/Events/Company), move `NotificationBell` to footer, make the panel contextual (derive `activeSection` from `usePathname()`); extract `EventsPanel` and add `CompanyPanel`.
- `src/app/(dashboard)/page.tsx` — replace the event-list body with the new Dashboard overview (keep the membership fetch + component-scope redirect + `NoOrgPrompt`).

**Create:**
- `src/app/(dashboard)/events/page.tsx` — the full grouped event list (today's `/` body).
- `src/lib/queries/dashboard-events.ts` — shared server helper returning the membership/event data both pages need (avoids duplicating ~120 lines).
- `src/components/event-card.tsx` — extracted `EventCard`, `EmptyEventsState`, `STATUS_CONFIG` (shared by `/` and `/events`).
- `src/app/(dashboard)/company/templates/page.tsx` and `src/app/(dashboard)/company/my-items/page.tsx` — "Coming soon" placeholders so the Company panel links don't 404 until [[ISSUE-012]]/[[ISSUE-013]] land. (Replaced by those issues.)

**Read-only context (do not modify):**
- `src/app/(dashboard)/layout.tsx` — already fetches `organizations`, `allEvents`, `workspaceEvents`, `firstName`, etc. and passes them to `<Sidebar>`. No new props are needed for the Company panel (static links).

## Relevant Code Context

### Current rail nav block (from `sidebar.tsx`, "Primary nav icons")

```tsx
<nav className="flex-1 flex flex-col items-center py-3 gap-1">
  <IconTooltip label="Dashboard">
    <Link href="/" className={cn("flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
      pathname === "/" ? "bg-indigo-500/15 text-indigo-400" : "text-white/40 hover:text-white/70 hover:bg-white/[0.06]")}>
      <LayoutDashboard className="w-4 h-4" />
    </Link>
  </IconTooltip>
  <IconTooltip label="Notifications">
    <NotificationBell />          {/* <-- moves to the footer */}
  </IconTooltip>
</nav>
```

### Current footer block (from `sidebar.tsx`)

```tsx
<div className="flex flex-col items-center pb-3 pt-3 gap-1 border-t border-white/[0.06]">
  <IconTooltip label="Settings"><Link href="/settings" ...><Settings className="w-4 h-4" /></Link></IconTooltip>
  <form action={signOut}><IconTooltip label="Sign out"><button type="submit" ...><LogOut className="w-4 h-4" /></button></IconTooltip></form>
  <IconTooltip label={userEmail || "Account"}><div ...>{userInitials}</div></IconTooltip>
</div>
```

### Current panel (event tree) — becomes `EventsPanel`

The block under `{/* ── My Space ── */}` and `{/* ── Shared with me ── */}` (sidebar.tsx ~lines 187–298), plus the `EventItem` helper, render the event tree. This becomes the **Events** context. Keep it byte-for-byte; just relocate it behind `activeSection === "events"`.

### Icons (lucide-react, already importable)

`LayoutDashboard` (Dashboard), `CalendarDays` (Events), `Building2` (Company — add to the import on line 6). `Settings`, `LogOut`, `Plus`, `ChevronDown`, `Zap` already imported.

### Current `/` page — what moves vs stays

`src/app/(dashboard)/page.tsx` currently: fetches profile + memberships; **redirects component-scope-only users to their event** (lines ~58–84); fetches `workspaceEvents` + `events` + `allOrgInfos`; sets `noOrg`; renders header + stats + My Space grid + Shared-with-me grid + `EmptyEventsState`. Helpers `EventCard`, `EmptyEventsState`, `STATUS_CONFIG` live in this file.

- **Stays on `/`:** the membership fetch, the component-scope redirect, the `noOrg`/`NoOrgPrompt` branch.
- **Moves to `/events`:** the full grouped grid (My Space / Shared with me / per-org).
- **Extracted to `event-card.tsx`:** `EventCard`, `EmptyEventsState`, `STATUS_CONFIG`.

## Implementation Steps

1. **Shared query helper** `src/lib/queries/dashboard-events.ts`: extract the data fetching from the current `/` page into one server function, e.g.

   ```ts
   export type DashboardData = {
     firstName: string;
     workspaceEvents: EventRow[];
     events: EventRow[];
     allOrgInfos: { org: OrgInfo; role: string }[];
     noOrg: boolean;
     componentRedirectSlug: string | null; // set when a component-scope-only user should be bounced
   };
   export async function getDashboardData(): Promise<DashboardData> { /* current lines 41–153 logic */ }
   ```
   The component-scope redirect decision is returned as `componentRedirectSlug` (the page performs the `redirect()` — `redirect()` must be called from the page/route, not buried in a helper that swallows it... actually `redirect()` works from any server function, but returning the slug keeps the helper reusable by `/events` without forcing a redirect there).

2. **Extract** `EventCard`, `EmptyEventsState`, `STATUS_CONFIG` into `src/components/event-card.tsx` (server-safe — they're presentational, use `Link` + `formatDate`). Export each.

3. **New `/` (Dashboard overview)** in `page.tsx`:
   - `const data = await getDashboardData()`.
   - If `data.componentRedirectSlug` → `redirect(\`/events/${data.componentRedirectSlug}\`)`.
   - If `data.noOrg` → render `<NoOrgPrompt />`.
   - Else render: greeting header (`{firstName}'s Workspace` or "Your Workspace") + the existing stat row; an **"Upcoming events"** section = `[...workspaceEvents, ...events]` filtered to `event_date >= today` (string compare on ISO date is fine), sorted ascending, sliced to ~6, rendered with `<EventCard>`; a "View all events →" `Link` to `/events`; if there are zero upcoming, show a short empty hint linking to `/events`. Keep it lighter than the full list.

4. **New `/events/page.tsx`**: `const data = await getDashboardData()`; render the full grouped grid exactly as `/` does today (My Space, Shared with me, per-org grouping, `EmptyEventsState`) using the extracted `<EventCard>`. Title: "Events". Keep the "New Event" button. (Do not re-run the component-scope redirect here — that stays on `/`.)

5. **Sidebar rail** (`sidebar.tsx`): replace the "Primary nav icons" `<nav>` with three `IconTooltip`+`Link` items:
   - Dashboard → `/`, `LayoutDashboard`, active when `pathname === "/"`.
   - Events → `/events`, `CalendarDays`, active when `pathname === "/events" || pathname.startsWith("/events/")`.
   - Company → `/company`, `Building2`, active when `pathname === "/company" || pathname.startsWith("/company/")`.
   Use the existing active/inactive class pattern.

6. **Move Alerts to footer**: remove `<NotificationBell />` from the rail nav; in the footer block, add it as the **first** item (above Settings), wrapped in `<IconTooltip label="Notifications">`. Resulting footer: Alerts · Settings · Sign out · avatar.

7. **Contextual panel**: compute
   ```ts
   const activeSection = pathname.startsWith("/company") ? "company"
     : (pathname.startsWith("/events") ? "events" : "dashboard");
   ```
   Render the panel body by section:
   - `"events"` → `<EventsPanel ... />` (the relocated My Space / Shared-with-me tree).
   - `"company"` → `<CompanyPanel pathname={pathname} />`: header "Company"; group **Collaborators** with item Clients → `/company`; group **Library** with items Templates → `/company/templates`, My Items → `/company/my-items`. Reuse the panel's group-label styling (`text-[10px] font-medium uppercase tracking-wider text-white/25`) and the `EventItem`-style active link styling.
   - `"dashboard"` → minimal: keep the workspace header; no nav list (or a single "Overview" label).
   The workspace header (`{firstName}'s Workspace`) stays at the top of the panel for all sections.

8. **Company placeholder routes**: create `company/templates/page.tsx` and `company/my-items/page.tsx` returning a simple "Coming soon" shell so the panel links resolve. [[ISSUE-012]]/[[ISSUE-013]] replace these. (`/company` itself is created by [[ISSUE-011]]; if 011 isn't merged yet, also add a `company/page.tsx` placeholder, to be replaced by 011.)

## Test Scenarios

**Happy path:**
- Land on `/` → Dashboard overview (greeting, stats, upcoming events). Rail shows Dashboard active; panel is minimal.
- Click Events → `/events` shows the full grouped list; panel shows the event tree with the current event highlighted when you open one.
- Click Company → `/company`; panel shows Collaborators › Clients (active) and Library › Templates / My Items. Click Templates → panel highlights Templates.
- Alerts bell now sits above Settings in the footer and still opens notifications.

**Edge cases:**
- Component-scope-only user hits `/` → still redirected to their event (preserved).
- User with no org → `/` shows `NoOrgPrompt`.
- No upcoming events but past events exist → Dashboard shows the "no upcoming" hint; `/events` still lists them.
- Deep link directly to `/company/my-items` → Company section active, My Items highlighted, panel correct without first visiting `/company`.

**Error cases:**
- Visiting `/company/templates` before [[ISSUE-012]] merges → placeholder page renders (no 404).

**RLS:** No data-model change in this issue; existing event/org RLS unchanged.

## Constraints

- Do NOT change the data the layout fetches or `<Sidebar>`'s incoming props — the Company panel is static links and needs no new data.
- Do NOT duplicate the membership/event fetch — extract it into `dashboard-events.ts` and call it from both `/` and `/events`.
- Preserve the component-scope redirect and `NoOrgPrompt` exactly (regression-sensitive auth/navigation behavior).
- Keep `EventsPanel` markup identical to today's tree (don't redesign the event list while moving it).
- Do NOT create `src/middleware.ts`; routing/auth is via `src/proxy.ts`.
- Follow the existing dark theme tokens; the Houzz screenshot is for layout/arrangement only, not its light colors.
- Keep `sidebar.tsx` a single client component (it already is) — `usePathname()` drives `activeSection`.

## Technical Notes

- `redirect()` from `next/navigation` throws to interrupt rendering; call it in the page after reading `componentRedirectSlug`, not inside the shared helper, so `/events` can reuse the helper without being force-redirected.
- "Upcoming" = `event_date` (a `date` string) `>= today`'s ISO date; lexicographic compare on `YYYY-MM-DD` is correct. Events with `event_date = null` are not "upcoming" — exclude them from the overview list (they still appear under `/events`).
- This issue revises [[ISSUE-011]]: 011 must drop its own `sidebar.tsx` edit and its in-page `company-shell.tsx` section nav, and render the Clients view directly at `/company`. Update 011 alongside merging this.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `src/lib/queries/dashboard-events.ts` — shared `getDashboardData()` helper (exports `EventRow`, `OrgInfo`, `DashboardData`). Encapsulates the membership/event fetch formerly inline in `/`. Returns `componentRedirectSlug` instead of calling `redirect()`, so `/events` can reuse it without being force-redirected.
- `src/components/event-card.tsx` — extracted `EventCard`, `EmptyEventsState`, `STATUS_CONFIG` (presentational, server-safe).
- `src/app/(dashboard)/events/page.tsx` — the full grouped event list (former `/` body): My Space / Shared with me / per-org grouping / empty state, titled "Events".
- `src/app/(dashboard)/company/page.tsx`, `company/templates/page.tsx`, `company/my-items/page.tsx` — "Coming soon" placeholders.
- `src/app/(dashboard)/company/company-placeholder.tsx` — shared placeholder shell (helper to avoid duplicating placeholder JSX 3×).

**Files modified:**
- `src/app/(dashboard)/page.tsx` — replaced the event list with the new Dashboard overview (greeting + stat row + "Upcoming events" grid + "View all events →" + no-upcoming hint). Preserves the component-scope redirect (via `componentRedirectSlug`) and the `NoOrgPrompt` branch.
- `src/components/sidebar.tsx` — rail is now a 3-item switcher (Dashboard `/`, Events `/events`, Company `/company`) with `activeSection` derived from `usePathname()`; `NotificationBell` moved from the top nav into the footer above Settings (footer: Alerts · Settings · Sign out · avatar); content panel is contextual — extracted `EventsPanel` (markup unchanged), added `CompanyPanel` (Collaborators › Clients; Library › Templates, My Items) and `CompanyNavItem`; Dashboard shows a minimal "Overview" item. `EventItem` helper unchanged.

**What was implemented:** The full Houzz-style contextual sidebar redesign per the PRD, plus the Dashboard-overview / Events-list split with a shared fetch helper.

**Verification (test results):** The project has **no test runner configured** (`package.json` scripts are only `dev`/`build`/`start`/`lint`; no jest/vitest/RTL/playwright; zero existing test files). Per the PRD constraint ("No stage should modify files outside scope … plus test files") and to avoid introducing a whole framework for a navigation refactor, the gate used is the project's actual tooling:
- `npx tsc --noEmit` → **clean (exit 0, no type errors)**.
- `npm run build` (`next build`, Turbopack) → **✓ Compiled successfully, ✓ TypeScript passed, ✓ all 18 pages generated.** Route table confirms `/`, `/events`, `/company`, `/company/templates`, `/company/my-items` all build.
- `npm run lint` → my touched files produce **zero** problems. (Repo has a pre-existing baseline of 23 errors / 11 warnings in untouched files: `task-edit-panel.tsx`, `task-form.tsx`, `ui/input.tsx`, `ui/textarea.tsx` — not introduced here.)
- The PRD's Test Scenarios are behavioral/navigation; documented for manual verification (see Coordinator manual-test list) since there's no harness to encode them.

**Decisions not fully specified in the PRD:**
1. Added `company-placeholder.tsx` (a tiny shared shell) rather than duplicating placeholder markup across three Company routes — internal helper for in-scope files.
2. `getDashboardData()` also returns `displayName` (cheap, available); only `firstName` is currently consumed.
3. Dashboard panel renders a single active "Overview" link (PRD allowed "minimal … or a single 'Overview' label").
4. "Upcoming events" empty state distinguishes "no upcoming dated events" vs "no events yet"; links to `/events` in both.

**Assumptions / concerns:**
- `next build` does not run ESLint in this Next 16 setup, so the pre-existing lint baseline does not block builds. If CI runs `npm run lint` separately, that baseline is already red independent of this change.
- Component-scope redirect preserved on `/` only (not `/events`), exactly as the PRD specifies.

### Evaluator Report

### Coder Revision Report

All three 🟡 Medium findings fixed; 🔵 Low items reviewed (rationale below).

**🟡 #1 — `/settings` mis-activated the Dashboard rail icon + Overview panel** — FIXED.
`src/components/sidebar.tsx`: `activeSection` now resolves `dashboard` only on an **exact** `pathname === "/"` and adds an `"other"` case for fallthrough routes. On `/settings` the Dashboard rail icon is no longer active (only the Settings footer icon is) and the contextual panel renders empty instead of the "Overview" context. Restores the pre-redesign `pathname === "/"` behavior for the Dashboard icon.

**🟡 #2 — `firstName` leaked the email into the workspace greeting** — FIXED.
`src/lib/queries/dashboard-events.ts`: `firstName` now derives as `profile?.full_name?.split(" ")[0] || ""`, mirroring `layout.tsx` exactly. A user with no `full_name` now sees "Your Workspace" on `/` and `/events` (consistent with the sidebar header) instead of "bob@x.com's Workspace". `displayName` retained for parity.

**🟡 #3 — `/company/*` was reachable while unauthenticated** — FIXED.
`src/proxy.ts`: added `"/company"` to `PROTECTED_PREFIXES`. Logged-out users hitting `/company`, `/company/templates`, `/company/my-items` now redirect to `/login`. Important groundwork before ISSUE-011/012/013 add RLS-backed data to these routes. (Edited `proxy.ts`'s list — not creating `middleware.ts` — consistent with the project's routing model and the PRD constraint.)

**🔵 Low items — intentionally not changed:**
- **#4 (empty `<p>` "Shared with me" label):** carried over verbatim from the original `/` page; leaving it keeps the "EventsPanel/list markup identical" intent and avoids unrelated churn. Cosmetic only.
- **#5 (UTC "today" vs local date):** explicitly endorsed by the PRD Technical Notes (ISO string compare). Out of scope to change here.
- **#6 (`displayName` returned but unused):** harmless; kept as a cheap field for future callers. Tied to #2, which is now correct.
- **#7 (Clients active is exact-match):** correct for the current placeholder; revisit when ISSUE-011 adds `/company/...` Clients sub-routes.

**Test results after revisions:**
- `npx tsc --noEmit` → **exit 0, clean**.
- `npm run build` → **✓ Compiled successfully, ✓ Finished TypeScript** (all routes build).
- `npm run lint` → **zero problems in touched files** (pre-existing baseline in untouched files unchanged).

### Documentation Report

**No doc changes needed.** This is a UI/navigation refactor: no new environment variables, setup steps, commands, or developer-workflow changes. `npm run dev/build/start/lint` are unchanged. The README contains no route/sidebar/dashboard documentation that this change makes stale (`grep` for `dashboard|/events|/company|sidebar|event list|route` in README returned nothing). Per the Documenter rules, README was intentionally left untouched (no restructuring). CLAUDE.md and other project docs were not modified (out of scope), though note CLAUDE.md §4's route map now lags reality (`/` is an overview, the event list lives at `/events`, `/company/*` exists) — a maintainer may want to refresh it later; not done here per the "do not update CLAUDE.md" rule.

PRD status updated to **In Review**.

### Coordinator Summary

**Acceptance Criteria:**
- ✅ Rail shows Dashboard (`/`), Events (`/events`), Company (`/company`), each with icon + tooltip and a path-derived active state (made exact for Dashboard in revision #1).
- ✅ Alerts (NotificationBell) moved out of the top nav into the footer, directly above Settings → footer order Alerts · Settings · Sign out · avatar.
- ✅ Second panel is contextual: `/events*` → event tree; `/company*` → Collaborators/Library nav; `/` → minimal (workspace header + "Overview"); other routes (e.g. `/settings`) → empty panel.
- ✅ Panel active states: current event highlighted under Events; current Company sub-page (Clients/Templates/My Items) highlighted.
- ✅ `/` renders the new Dashboard overview (greeting + stats + upcoming events + New Event), not the full list.
- ✅ `/events` renders the full grouped list (My Space / Shared with me / per-org / empty state).
- ✅ Component-scope-only redirect and `NoOrgPrompt` preserved on `/` (redirect kept out of the shared helper so `/events` reuses it without redirecting).
- ✅ Rail persists across sections; Vibe logo stays at the top.
- ✅ No regression: event detail pages still show the event tree panel; `EventsPanel` markup unchanged.

**Evaluator findings:** 0 Critical, 3 Medium, 4 Low. All 3 Medium fixed in revision (rail/panel mislighting on `/settings`; email-in-greeting; `/company` auth gate). Low items reviewed — none require action (cosmetic / PRD-endorsed / forward-looking).

**Tests / verification:** No test runner exists in the project; the gate is `tsc --noEmit` (exit 0, clean), `next build` (✓ compiled, ✓ TypeScript, all routes build), and `npm run lint` (zero problems in touched files; pre-existing baseline in untouched files unchanged). Behavioral scenarios require manual verification (no harness).

**Remaining concerns:** Verification is static (types/build/lint) — there is no automated runtime/visual check, and I could not run the live app or DB. Recommend a quick manual pass (see below). CLAUDE.md's route map is now slightly stale but was intentionally left per the Documenter rules.

**Verdict: READY FOR REVIEW.**

All nine Acceptance Criteria are satisfied and every Critical/Medium evaluator finding is resolved; the project type-checks and builds cleanly with no new lint problems. The implementation faithfully follows the PRD's structure (contextual rail via `usePathname`-derived `activeSection`, shared `getDashboardData()` helper feeding both `/` and `/events`, extracted `EventCard`, preserved auth/redirect behavior) and the revision round hardened two real regressions (`/settings` mis-highlighting, unauthenticated `/company` access) plus a user-visible greeting bug. The only thing standing between this and "done" is human manual/visual confirmation, which is expected for a UI change with no test harness.

### PR Feedback Summary

**PR #3 review (`/fix-pr-feedback`):** 1 PR comment received — the Vercel deploy bot (noise). 0 actionable review comments, 0 inline code comments, no human/automated reviewer. All checks pass (both Vercel preview deployments `Ready`); PR is `MERGEABLE` / `CLEAN`. No code changes required.
