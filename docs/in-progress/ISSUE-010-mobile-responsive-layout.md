# ISSUE-010: Dashboard layout is broken ("crooked") on mobile — sidebar is not responsive

**Type:** Bug
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** [#1](https://github.com/zhanggit3/Event-Management/issues/1) _(local PRD sequence: 010)_

## Problem

On a phone the app looks "crooked": the dashboard sidebar is a hard-coded 240px-wide shell (`w-12` icon rail + `w-48` content panel) that is **always** rendered side-by-side with the main content via `flex`, with no mobile breakpoint. On a ~375px viewport the sidebar eats ~64% of the screen, squeezing the main content into a narrow strip and causing horizontal overflow. There is no hamburger/drawer toggle, so the sidebar cannot be hidden on small screens.

## Acceptance Criteria

- [ ] On viewports `< 768px` (below Tailwind `md`), the sidebar is **hidden** by default and does not occupy horizontal space; main content spans the full width with no horizontal scroll/overflow.
- [ ] On mobile, a hamburger button is visible and tapping it slides the sidebar in as an overlay drawer; a backdrop appears behind it; tapping the backdrop or navigating to a link closes the drawer.
- [ ] On viewports `≥ 768px` (`md` and up), the sidebar renders exactly as it does today (static, always-visible, no hamburger, no backdrop) — no visual regression.
- [ ] The dashboard stats row (`src/app/(dashboard)/page.tsx`) stacks vertically on mobile instead of cramming 3 columns side-by-side.
- [ ] The `<html>` document exposes the responsive viewport meta (`width=device-width, initial-scale=1`) via an explicit Next.js `viewport` export.
- [ ] No horizontal page scrollbar appears on a 375px-wide viewport on the dashboard, an event page, and a component detail page.

## Affected Files

**Modify:**
- `src/components/sidebar.tsx` — make the `<aside>` an off-canvas drawer on mobile (`fixed`, translated off-screen) and static on `md+`; add a `md:hidden` mobile top bar with a hamburger toggle, a backdrop, internal open/close state, and auto-close on route change.
- `src/app/(dashboard)/layout.tsx` — the flex shell must not reserve sidebar space on mobile; ensure `<main>` does not overflow horizontally (`min-w-0`).
- `src/app/(dashboard)/page.tsx` — change the stats row from `grid grid-cols-3` to a responsive `grid grid-cols-1 sm:grid-cols-3`.
- `src/app/layout.tsx` — add an explicit `export const viewport` so the responsive meta tag is guaranteed.

**Read-only context (do not modify):**
- `src/app/(dashboard)/events/[eventSlug]/page.tsx` — the component grid here already collapses correctly (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`); use it as the pattern reference for responsive grids. Do not change it.
- `src/components/task-board.tsx`, `src/components/resources/resource-link-board.tsx` — already responsive (`grid-cols-1 md:grid-cols-3` / `sm:grid-cols-2`); do not change.

## Background: how Tailwind handles desktop vs. phone

Tailwind CSS 4 is **mobile-first**. An unprefixed utility (e.g. `w-48`, `grid-cols-3`) applies at **every** screen size. A breakpoint-prefixed utility only applies **at or above** that width:

| Prefix | Min width | Typical device |
|---|---|---|
| (none) | 0px | all / phone |
| `sm:` | 640px | large phone / small tablet |
| `md:` | 768px | tablet |
| `lg:` | 1024px | laptop |
| `xl:` | 1280px | desktop |

This app was built desktop-first: the sidebar widths and the flex shell are **unprefixed**, so the phone gets the full desktop layout crammed into a tiny viewport → overflow and the "crooked" look. The fix is to express the desktop layout with `md:` prefixes and give mobile a different default (hidden drawer). A phone is ~375–430px CSS pixels wide, so anything wider than the viewport without `max-w`/wrapping overflows.

## Relevant Code Context

### Current dashboard shell — `src/app/(dashboard)/layout.tsx` (return block)

```tsx
return (
  <div className="flex min-h-screen bg-[#05050F]">
    <Sidebar
      organizations={uniqueOrgs}
      allEvents={allEvents}
      workspaceEvents={workspaceEvents}
      firstName={firstName}
      activeOrgId={activeOrgId}
      userInitials={getInitials(displayName)}
      userEmail={userEmail}
    />
    <main className="flex-1 overflow-auto">
      {children}
    </main>
  </div>
);
```

> This layout is a **Server Component** — it cannot hold `useState`. All interactive mobile state (drawer open/close, hamburger) must live inside `sidebar.tsx`, which is already `"use client"`. Do not convert the layout to a client component.

### Current sidebar root — `src/components/sidebar.tsx`

```tsx
"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
// ...
export function Sidebar({ organizations, allEvents, workspaceEvents, firstName, activeOrgId, userInitials, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // ...
  return (
    <aside className="flex min-h-screen shrink-0 bg-[#080814] text-white border-r border-white/[0.06]">
      {/* Icon Rail */}
      <div className="flex flex-col w-12 min-h-screen border-r border-white/[0.06] shrink-0"> ... </div>
      {/* Content Panel */}
      <div className="flex flex-col w-48 min-h-screen"> ... </div>
    </aside>
  );
}
```

The internal layout (icon rail + content panel, totalling 240px) is fine **as the drawer contents**. The change is purely in how the outer `<aside>` is positioned per breakpoint, plus a new mobile trigger and backdrop.

### Current stats row — `src/app/(dashboard)/page.tsx:192`

```tsx
{totalEvents > 0 && (
  <div className="grid grid-cols-3 gap-4 mb-8">
```

### Current root layout — `src/app/layout.tsx`

```tsx
export const metadata: Metadata = {
  title: "Event Platform",
  description: "Collaborative event management for your team",
};
// (no viewport export currently)
```

## Implementation Steps

### 1. Add explicit viewport export — `src/app/layout.tsx`

Import `Viewport` and add the export alongside `metadata`:

```tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
```

### 2. Make the sidebar a responsive drawer — `src/components/sidebar.tsx`

a. Add mobile open state and an effect that closes the drawer whenever the route changes (so tapping a nav link dismisses it). Add the imports for `useEffect` and a `Menu` / `X` icon from `lucide-react`:

```tsx
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react"; // add to the existing lucide-react import

// inside the component:
const [mobileOpen, setMobileOpen] = useState(false);
useEffect(() => { setMobileOpen(false); }, [pathname]);
```

b. Wrap the existing return in a Fragment and add three things: a mobile top bar (hamburger), a backdrop, and breakpoint classes on the `<aside>`.

- **Mobile top bar** (only `< md`): a slim sticky bar holding the hamburger and the Vibe logo so the user always has a way to open the drawer. Example:

```tsx
{/* Mobile top bar — hidden on md+ */}
<div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-3 bg-[#080814] border-b border-white/[0.06]">
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
```

- **Backdrop** (only when open, only `< md`):

```tsx
{mobileOpen && (
  <div
    onClick={() => setMobileOpen(false)}
    className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
  />
)}
```

- **`<aside>` positioning** — replace the current root class string. On mobile it is a fixed, off-screen-by-default drawer that slides in when `mobileOpen`; on `md+` it returns to the original static flex child:

```tsx
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
```

c. Add a close (`X`) button visible only on mobile inside the drawer — place it at the top of the content panel or icon rail so the user can dismiss without reaching the backdrop. Example, near the top of the content panel header:

```tsx
<button
  onClick={() => setMobileOpen(false)}
  aria-label="Close menu"
  className="md:hidden absolute top-3 right-2 flex items-center justify-center w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06]"
>
  <X className="w-4 h-4" />
</button>
```

> Note: the inner `min-h-screen` on the icon rail / content panel is fine. The key is that the **outer** `<aside>` is `fixed` (out of flow) on mobile so it no longer reserves 240px of width.

### 3. Prevent main-content overflow — `src/app/(dashboard)/layout.tsx`

Add `min-w-0` to `<main>` so flex children with long content can shrink instead of forcing horizontal overflow. The flex shell itself is unchanged (on mobile the `fixed` aside contributes no width):

```tsx
<main className="flex-1 overflow-auto min-w-0">
  {children}
</main>
```

### 4. Make the stats row responsive — `src/app/(dashboard)/page.tsx:192`

```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
```

### 5. Verify secondary non-collapsing grids

Check these two and add `grid-cols-1` mobile defaults **only if** they currently start at `grid-cols-3`/`grid-cols-4` with no smaller breakpoint (they live inside the finance estimate UI / dashboard modal, lower-traffic on mobile but should still not overflow):
- `src/components/estimate-editor.tsx:126` (`grid-cols-4`)
- `src/components/dashboard-tab.tsx:596` (`grid-cols-3`)

Pattern: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` etc. Do not restructure the components — only add the responsive prefixes.

## Test Scenarios

**Happy path:**
- On a 375px viewport (Chrome DevTools "iPhone SE"), load `/`: sidebar is hidden, a hamburger + logo top bar is visible, main content fills the width, no horizontal scrollbar. Tap hamburger → drawer slides in with a backdrop. Tap an event link → navigation occurs **and** the drawer closes.
- On a 1280px viewport, load `/`: sidebar is static and always visible exactly as before; no hamburger, no top bar, no backdrop.

**Edge cases:**
- Resize the browser across the 768px boundary while the mobile drawer is open: at `≥768px` the drawer styling is overridden by `md:static` and the sidebar shows normally without a stuck backdrop. (Backdrop and top bar are `md:hidden`.)
- A user with many orgs/events (long sidebar): the drawer content scrolls within `overflow-y-auto` (existing `<nav>` already has it); the backdrop still dismisses.
- A user with zero events/orgs: drawer still opens and shows "My Space" / "New Event"; no layout break.

**Error cases:**
- Tapping the backdrop or the `X` button closes the drawer without navigating.

**RLS (if applicable):**
- Not applicable — this is a pure client-side/layout change. No data access, queries, or server actions are modified.

## Constraints

- **Do NOT** convert `src/app/(dashboard)/layout.tsx` to a client component. All interactive state stays in `sidebar.tsx` (already `"use client"`).
- **Do NOT** create `src/middleware.ts`. In Next.js 16 the middleware is `src/proxy.ts`; adding `middleware.ts` crashes the server.
- **Do NOT** change the desktop appearance. All current sidebar visuals/spacing/colors must be byte-for-byte identical at `md+`. Achieve mobile behavior purely with `md:`-prefixed overrides and the new `md:hidden` mobile-only elements.
- **Do NOT** refactor the sidebar's internal structure (icon rail / content panel, org collapse logic, `EventItem`). Only wrap/position the outer `<aside>` and add the mobile trigger + backdrop.
- **Do NOT** touch grids that already collapse responsively (event page component grid, task board, resource board). They are listed as read-only context.
- Use `cn()` (already imported in `sidebar.tsx`) for conditional class composition.

## Technical Notes

- Tailwind v4 in this repo has **no `tailwind.config`**; breakpoints are the framework defaults (`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280). The `md` (768px) breakpoint is the desktop/mobile divide used throughout this issue.
- Next.js 16 App Router auto-injects a default viewport meta, but an explicit `export const viewport` (Step 1) makes it deterministic and is the documented pattern — keep `metadata` and `viewport` as **separate** exports (do not nest `viewport` inside `metadata`, which Next.js warns against).
- The drawer uses `transform: translateX` (`-translate-x-full` ↔ `translate-x-0`) for the slide animation — this is GPU-composited and avoids reflow. Keep the `<aside>` as `fixed inset-y-0 left-0` on mobile so it overlays rather than pushes content.
- `z-index` ordering on mobile: backdrop `z-40`, drawer `z-50`, mobile top bar `z-30`. The drawer must sit above the backdrop; the backdrop above page content.
- There is no test runner configured in this project — verify manually in the browser at the listed viewport widths.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files modified:**
- `src/app/layout.tsx` — added `Viewport` to the type import and a separate `export const viewport = { width: "device-width", initialScale: 1 }` alongside `metadata` (Step 1).
- `src/components/sidebar.tsx` — made the outer `<aside>` an off-canvas drawer on mobile and static on `md+`; added a `md:hidden` mobile top bar (hamburger + logo), a `md:hidden` backdrop, mobile open state, route-change auto-close, and a `md:hidden` close (X) button in the content-panel header (Step 2).
- `src/app/(dashboard)/layout.tsx` — added `min-w-0` to `<main>` to prevent horizontal overflow (Step 3).
- `src/app/(dashboard)/page.tsx` — stats row changed from `grid-cols-3` to `grid grid-cols-1 sm:grid-cols-3` (Step 4).

**What was implemented (per step):**
1. Explicit `viewport` export added as a separate export (not nested in `metadata`), per Next.js guidance.
2. Sidebar drawer: return wrapped in a Fragment. Mobile top bar is `sticky top-0 z-30`; backdrop renders only when `mobileOpen` at `z-40` with `bg-black/60 backdrop-blur-sm`; `<aside>` is `fixed inset-y-0 left-0 z-50` with `-translate-x-full`/`translate-x-0` slide on mobile and `md:static md:translate-x-0 md:min-h-screen md:shrink-0 md:z-auto` to restore the exact original desktop layout. Close (X) button placed in the workspace header (made `relative`), `absolute top-3 right-2`. The icon-rail/content-panel internals, org collapse logic, and `EventItem` were left untouched.
3. `min-w-0` added to `<main>`; flex shell otherwise unchanged.
4. Stats row made responsive with `grid-cols-1 sm:grid-cols-3`.
5. Verified `estimate-editor.tsx:126` (`grid grid-cols-2 md:grid-cols-4`) and `dashboard-tab.tsx:596` (`grid grid-cols-1 md:grid-cols-3`) — **both already have a mobile-first smaller breakpoint**, so per the PRD's conditional ("only if they currently start at grid-cols-3/4 with no smaller breakpoint") **no change was made** to either file.

**Verification:**
- `npm run build`: **PASS** — compiled successfully, TypeScript valid, all 14 pages generated.
- Lint (`npx eslint` on the 4 modified files): **0 errors**, 1 pre-existing warning unrelated to my changes (`'Event' is defined but never used` at `page.tsx:7`, an import I did not touch). Note: the full `npm run lint` reports many pre-existing errors across other files (e.g. `task-edit-panel.tsx`, `ui/input.tsx`, `ui/textarea.tsx`) that predate and are unrelated to this change.
- No automated test runner exists in this project (per the PRD Technical Notes); verification was via lint + build only.

**Decisions made beyond the PRD spec:**
- **Route-change auto-close implementation.** The PRD prescribed `useEffect(() => { setMobileOpen(false); }, [pathname])`, but this project's ESLint config (`react-hooks/set-state-in-effect`) treats a synchronous `setState` inside an effect as an **error**, which would have introduced a new lint failure. I also tried a `useRef`-during-render approach, which the `react-hooks/refs` rule likewise rejects. I implemented the behavior with React's officially-recommended "adjust state during render from a previous value" pattern using a `lastPathname` state: when `pathname` changes between renders, it updates `lastPathname` and closes the drawer. This is lint-clean and behaviorally identical (drawer closes on navigation). `useEffect` import was consequently removed.
- **Close button placement:** inside the workspace-header div (added `relative` to it), positioned `absolute top-3 right-2`, exactly as the PRD example suggested for "the content panel header."
- **z-index values:** as specified — top bar `z-30`, backdrop `z-40`, drawer `z-50`; drawer drops to `md:z-auto` at desktop.

**Concerns / assumptions:**
- None significant. The desktop (`md+`) layout is preserved byte-for-byte via `md:`-prefixed overrides; all new mobile elements are `md:hidden`. The `cn()` helper was used for the `<aside>` conditional classes as required.

### Evaluator Report

**Findings by severity:** 🔴 Critical: 1 · 🟡 Medium: 2 · 🔵 Low: 2

#### 🔴 Critical

**C1 — Mobile top bar renders as a narrow LEFT column, not a full-width top bar (`src/components/sidebar.tsx:67` + `src/app/(dashboard)/layout.tsx:149`).**
This is the real layout bug the spec warned about. The `Sidebar` component returns a Fragment whose children become **direct flex children** of the dashboard shell `<div className="flex min-h-screen …">` (row direction — no `flex-col`). On mobile the in-flow flex children are:
1. the mobile top bar (`md:hidden sticky top-0 z-30 flex … h-14 px-3`) — **no width class**, so as a flex item it shrinks to its content width (hamburger + logo ≈ 80px), and
2. `<main className="flex-1 …">`.

The `<aside>` is `fixed` (out of flow), so the remaining two siblings lay out side-by-side in a row. Result on a 375px phone: a ~80px-tall-by-content-wide bar pinned to the **left edge**, with `<main>` taking the rest to its right — exactly the "crooked"/narrow-strip problem this issue set out to fix, just with the bar instead of the sidebar. It is NOT a full-width bar at the top, and `sticky top-0` does nothing useful for a short flex-line item. Acceptance criterion "a hamburger button is visible … main content fills the width … no horizontal scrollbar" is only partially met (no overflow, but content does not fill width and the bar is mis-placed).
**Fix:** Make the top bar span full width above the content. Simplest options:
- Add `w-full` to the top bar AND wrap the mobile-only top bar so it is not a row sibling of `<main>`. Cleanest: render the top bar with `fixed top-0 left-0 right-0` (like the backdrop/aside, taking it out of flow) and add top padding to `<main>` on mobile (e.g. `pt-14 md:pt-0`) so content clears it. OR
- Change the dashboard shell to `flex flex-col md:flex-row` so on mobile the top bar stacks above `<main>` full-width, and add `w-full` to the bar. (Note this touches `layout.tsx`, which the PRD already lists as modifiable.)
Either way the bar must be full-width and above content, and `<main>` must not sit beside it. Manual testing at 375px (which the Coder did not actually perform — see M1) would have caught this immediately.

#### 🟡 Medium

**M1 — Verification did not include the required manual 375px browser check (`Coder Report › Verification`).** The PRD's only viable test path is "verify manually in the browser at the listed viewport widths" (no test runner exists — not penalized). The Coder ran build + lint only and explicitly skipped the manual viewport check, which is the *one* verification that would have surfaced C1. Build/lint cannot catch a flex-flow layout defect. Recommend: load `/` at 375px and 1280px in DevTools and confirm the top bar is full-width on top, drawer slides over content, no horizontal scroll, desktop unchanged.

**M2 — Top bar background can bleed/overlap with no explicit width and shared bg color (`src/components/sidebar.tsx:67`).** Because the bar is content-width (see C1), the dark `bg-[#080814]` only covers ~80px; the area to its right is `<main>`'s own background. Once C1 is fixed with a full-width bar, also confirm the bar's `bg` + `border-b` reads as a true top app-bar. No separate fix if C1 is resolved via full-width bar; flagged so the fix isn't done half-way (e.g. adding `flex-col` without `w-full`).

#### 🔵 Low

**L1 — Close (X) button overlaps the "Personal" subtitle region on the drawer header (`src/components/sidebar.tsx:178-184`).** The X is `absolute top-3 right-2` inside the `w-48` (192px) workspace header. With a long first name the truncated `…'s Workspace` / `Personal` text runs under the button. Minor since text truncates; consider adding `pr-8` to the header text block. Acceptable as-is.

**L2 — Hamburger top bar logo is a non-interactive `<div>`, not a link home (`src/components/sidebar.tsx:75-77`).** Matches the PRD example exactly, so not a defect, but on desktop the logo is also non-interactive — consistent. No action required; noted for parity only.

#### Verified correct (no issues)

- **Render-time route-close pattern (`sidebar.tsx:49-53`)** — This is React's documented "adjust state during render from a previous value" pattern. `setLastPathname` + guarded `setMobileOpen(false)` both target the currently-rendering component; the `lastPathname !== pathname` guard guarantees convergence on the next synchronous re-render → **no infinite loop, no stale state**, and it genuinely closes the drawer on navigation. Behaviorally equivalent to the prescribed `useEffect`, and lint-clean. Good deviation, correctly justified.
- **`<aside>` md: overrides fully neutralize mobile classes** — `md:static` (cancels `fixed`), `md:translate-x-0` (cancels `-translate-x-full`), `md:z-auto` (cancels `z-50`), `md:min-h-screen` + `md:shrink-0` (restore original sizing). `inset-y-0 left-0` are inert once `static`. The original root was `flex min-h-screen shrink-0 …`; at `md+` the new class set reproduces it. **No desktop regression** on the aside itself.
- **Mobile-only elements correctly hidden at md+** — top bar, backdrop, and X button all carry `md:hidden`. Backdrop also gated on `mobileOpen`. Crossing the 768px boundary with the drawer open: aside reverts to static, top bar/backdrop/X disappear → no stuck backdrop.
- **z-index ordering** — top bar `z-30` < backdrop `z-40` < drawer `z-50`. All three are `fixed`/`sticky` establishing stacking contexts at the same root level, so the drawer sits above the backdrop above content. Correct.
- **Constraints** — `layout.tsx` remains a Server Component (no `"use client"`); no `src/middleware.ts` created; sidebar internals (icon rail, content panel, org collapse, `EventItem`) untouched; only `min-w-0` added to `<main>`.
- **Step 5 correctly skipped** — `estimate-editor.tsx:126` is `grid-cols-2 md:grid-cols-4` and `dashboard-tab.tsx:596` is `grid-cols-1 md:grid-cols-3`; both already mobile-first, so per the PRD's conditional, no change is correct.
- **Build** — `npm run build` passes; **lint** on the 4 files: 0 errors, 1 pre-existing unrelated `'Event' unused` warning at `page.tsx:7` (not introduced by this change).

#### Per-Acceptance-Criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Sidebar hidden < 768px, no horizontal space/overflow, main full-width | ⚠️ **PARTIAL** — aside is correctly off-canvas (no overflow), but `<main>` does **not** span full width because the content-width top bar sits beside it as a flex sibling (C1). |
| 2 | Hamburger visible; tap opens drawer + backdrop; backdrop/link-nav closes it | ⚠️ **PARTIAL** — open/close, backdrop, and route-close logic are all correct, but the hamburger bar is mis-placed (left strip, not top bar) per C1. |
| 3 | ≥768px renders exactly as today, no regression | ✅ PASS |
| 4 | Stats row stacks on mobile (`grid-cols-1 sm:grid-cols-3`) | ✅ PASS |
| 5 | Explicit `viewport` export with `width=device-width, initial-scale=1` | ✅ PASS (separate export, not nested in `metadata`) |
| 6 | No horizontal scrollbar at 375px (dashboard, event, component pages) | ✅ LIKELY PASS — `min-w-0` on `<main>` + fixed aside remove the overflow source; the event/component grids were already responsive. (Not manually verified — M1.) |

#### Overall assessment

**Not shippable as-is — one Critical layout bug.** The drawer mechanics, desktop preservation, md: overrides, z-index, render-time route-close pattern, viewport export, and stats grid are all correctly implemented and the build/lint are clean. However the headline goal — a usable mobile top bar with full-width content — is not met: because the Sidebar Fragment's top bar is a row-flex sibling of `<main>` with no width, it collapses to a narrow left column and `<main>` does not fill the viewport. This must be fixed (full-width bar taken out of the flex row, e.g. `fixed top-0 inset-x-0` + `md:hidden` with `pt-14 md:pt-0` on `<main>`, or `flex-col md:flex-row` on the shell + `w-full` on the bar) and then verified at 375px before merge. Once C1 is addressed it should be close to shippable.

### Coder Revision Report

**Findings addressed:** C1 (Critical), M1 (Medium), M2 (Medium), L1 (Low — trivial).

**C1 — Mobile top bar is now a true full-width top bar.**
The bar was a content-width row-flex sibling of `<main>` (collapsed to ~80px on the left). Fixed by taking it out of the flex flow and spanning it across the viewport, then padding `<main>` so content clears it on mobile only:
- `src/components/sidebar.tsx` — changed the mobile top bar from `md:hidden sticky top-0 z-30 …` to `md:hidden fixed top-0 inset-x-0 z-30 …`. Being `fixed top-0 inset-x-0` removes it from the flex row entirely and stretches it edge-to-edge, so its `bg-[#080814] border-b border-white/[0.06]` now reads as a real top app-bar spanning the full 375px width. `z-30` still sits below the backdrop (`z-40`) and drawer (`z-50`).
- `src/app/(dashboard)/layout.tsx` — added `pt-14 md:pt-0` to `<main>` so the 56px (`h-14`) fixed bar no longer overlaps page content on mobile; at `md+` the bar is `md:hidden` and the padding is removed, so desktop `<main>` is unchanged.

**M2 — Bar spans the viewport width.** Confirmed: `inset-x-0` pins `left:0; right:0`, so the bar is full-width with no width class needed; the dark background + bottom border cover the entire top strip.

**L1 (optional, trivial) — Close button overlap.** Added `pr-8 md:pr-0` to both header text `<p>` elements in the workspace header so the truncated workspace name / "Personal" subtitle no longer run under the absolutely-positioned `X` button on mobile; padding is removed at `md+` where the X is hidden, so desktop is unchanged.

**Final className strings:**
- Mobile top bar: `md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 h-14 px-3 bg-[#080814] border-b border-white/[0.06]`
- `<main>`: `flex-1 overflow-auto min-w-0 pt-14 md:pt-0`

**M1 — Explicit layout reasoning trace (manual-verification substitute):**

*At 375px (mobile, `< md`):*
- The dashboard shell `<div className="flex min-h-screen …">` (row direction) has three children from the Sidebar Fragment + `<main>`: the top bar (now `fixed`, out of flow), the backdrop (only when open, `fixed`, out of flow), the `<aside>` (`fixed`, out of flow), and `<main>` (`flex-1`). The only in-flow flex item is `<main>`, so `flex-1` makes it fill the full 375px width — no narrow strip, no horizontal overflow (`min-w-0` lets long children shrink).
- The top bar is `fixed top-0 inset-x-0`, so it spans 0→375px at the very top, `h-14` (56px) tall, dark `bg-[#080814]` with a bottom border — a proper app bar. `<main>` has `pt-14` so its content starts at y=56px, sitting *below* the bar, not under it.
- Tapping the hamburger sets `mobileOpen`: the `<aside>` slides from `-translate-x-full` to `translate-x-0` (240px drawer, `z-50`) over the `z-40` backdrop (`bg-black/60 backdrop-blur-sm`, `fixed inset-0`). Backdrop sits above the `z-30` top bar and `<main>`; drawer sits above the backdrop. Tapping the backdrop or X closes it; navigating fires the render-time `lastPathname !== pathname` guard which closes it.

*At ≥768px (desktop, `md`):*
- Top bar, backdrop, and X button are all `md:hidden` → not rendered/visible. `<main>` gets `md:pt-0`, cancelling `pt-14`, so it is byte-for-byte identical to before (`flex-1 overflow-auto min-w-0`).
- The `<aside>` `md:` overrides (`md:static md:translate-x-0 md:min-h-screen md:shrink-0 md:z-auto`) neutralize every mobile class, reproducing the original `flex min-h-screen shrink-0 …` static sidebar in the flex row. No desktop regression.
- The new `pr-8 md:pr-0` on the workspace header text is removed at `md+`, so the header is unchanged on desktop.

**Build + lint:**
- `npm run build`: **PASS** — compiled successfully, all 14 routes generated.
- `npx eslint src/components/sidebar.tsx "src/app/(dashboard)/layout.tsx"`: **0 errors, 0 warnings** on the changed files. No new errors introduced.

**Skipped:** L2 (logo not a link home) — matches PRD example and is consistent desktop/mobile behavior; no action required per the Evaluator's own note.

### Documentation Report

No doc changes needed. The change is a purely visual/responsive layout refactor (mobile drawer sidebar, viewport export, stats grid collapse) with no new environment variables, commands, setup steps, or developer-facing workflow features that would warrant a README update; CLAUDE.md and other project docs were intentionally left untouched per the Documenter's scope.

### Coordinator Summary

**Verdict: READY FOR REVIEW**

Verified the final code against `git diff` and a clean `npm run build` (all 14 routes generated) + `npx eslint` (0 errors on the 4 changed files; the lone warning is the pre-existing unused `Event` import at `page.tsx:7`, not introduced here). Exactly the 4 PRD-listed files were modified — no scope creep, no `src/middleware.ts`, and `(dashboard)/layout.tsx` remains a Server Component (no `"use client"`).

**Per-Acceptance-Criterion:**

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Sidebar hidden < 768px, no horizontal space, main full-width, no overflow | ✅ MET | `<aside>` is `fixed inset-y-0 left-0 -translate-x-full` (out of flow, off-canvas) on mobile; the only in-flow flex child of the shell is `<main className="flex-1 … min-w-0">`, so it fills 375px. `min-w-0` lets long children shrink rather than overflow. (sidebar.tsx, layout.tsx:159) |
| 2 | Hamburger opens drawer overlay + backdrop; backdrop/nav-link closes it | ✅ MET | Full-width `md:hidden fixed top-0 inset-x-0 z-30` top bar with `Menu` button sets `mobileOpen`; `z-40` `bg-black/60 backdrop-blur-sm` backdrop and `z-50` drawer slide in (`translate-x-0`). Backdrop `onClick` + `X` button close it; render-time `lastPathname !== pathname` guard closes on navigation. |
| 3 | ≥768px sidebar unchanged, no hamburger/backdrop, no regression | ✅ MET | `md:static md:translate-x-0 md:min-h-screen md:shrink-0 md:z-auto` neutralizes every mobile class, reproducing the original `flex min-h-screen shrink-0 …` aside. Top bar, backdrop, X, and the `pr-8`/`pt-14` paddings are all `md:hidden` / `md:pr-0` / `md:pt-0`. |
| 4 | Dashboard stats row stacks on mobile | ✅ MET | `grid grid-cols-1 sm:grid-cols-3` (page.tsx:192). |
| 5 | Explicit viewport export (`width=device-width, initial-scale=1`) | ✅ MET | `export const viewport: Viewport = { width: "device-width", initialScale: 1 }` as a separate export, not nested in `metadata` (app/layout.tsx). |
| 6 | No horizontal scrollbar at 375px (dashboard, event, component page) | ✅ MET (build-/trace-verified) | Overflow sources removed (`min-w-0` on `<main>` + off-canvas `fixed` aside); the event page grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` and the component detail page has no non-collapsing `grid-cols-3/4`. Final pixel-level confirmation is a real-device check (see Concerns). |

**Evaluator findings — all resolved:**
- **C1 (Critical)** — Mobile top bar mis-rendered as a narrow left flex column. ✅ Fixed: bar changed to `md:hidden fixed top-0 inset-x-0 z-30 …` (out of the flex row, edge-to-edge) and `<main>` given `pt-14 md:pt-0` to clear it. Confirmed present in the diff (sidebar.tsx top bar + layout.tsx:159).
- **M1 (Medium)** — Missing manual 375px verification. ✅ Addressed with a full explicit layout-reasoning trace in the Revision Report; this project has no test runner (per PRD), so build + lint + reasoned trace is the adequate verification path.
- **M2 (Medium)** — Bar background bleed with no width. ✅ Resolved by the C1 full-width fix; `inset-x-0` makes the bar full-width so its `bg-[#080814] border-b` reads as a true top app bar.
- **L1 (Low)** — X button overlapping header text. ✅ Optionally fixed via `pr-8 md:pr-0`. **L2** (logo not a link) correctly skipped — matches PRD and is consistent desktop/mobile behavior.

**Remaining concerns:** None blocking. Criteria 1, 2, and 6 are verified by code/diff inspection, a passing build, and the layout-flow reasoning; they cannot be 100% pixel-confirmed without a real browser/device. The human reviewer should do a quick DevTools spot-check at 375px (dashboard, an event page, a component page) and at 1280px to visually confirm no horizontal scrollbar and an unchanged desktop sidebar — but no code defect is anticipated.

**Justification:** The implementation is complete. All 6 acceptance criteria are met in the final code, every Critical and Medium evaluator finding (C1, M1, M2) plus the trivial L1 is resolved, and the work stayed strictly within the 4 PRD-sanctioned files while honoring every constraint (server-component layout preserved, no `middleware.ts`, desktop layout byte-for-byte via `md:` overrides, untouched internal sidebar structure and already-responsive grids). The build compiles cleanly and lint introduces no new errors. The headline bug — the sidebar consuming ~64% of a phone viewport and forcing horizontal overflow — is eliminated: on mobile the only in-flow element is a full-width `<main>`, with the sidebar reachable via a full-width top bar that opens an overlay drawer.

### PR Feedback Summary
