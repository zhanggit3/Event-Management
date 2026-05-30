# ISSUE-005: Component access requests for event guests

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #5
**Depends on:** ISSUE-004 (requires `event_members` and `event_member_components` tables + RLS helpers)

## Problem

Event guests (contractors invited via an event-scoped token) can currently only access the components they were explicitly granted at invite time. If they need access to additional components, there is no in-app path to request it. The existing `component_access_requests` system only works for org members — it assumes org membership for both the requester (to submit) and the reviewer (to see requests). Event guests are excluded from this flow entirely.

## Acceptance Criteria

- [x] An event guest visiting the event page sees ALL components listed, with locked (non-granted) ones visually greyed out
- [x] A locked component shows a "Request Access" button; granted components open normally
- [x] An event guest can submit a component access request (with optional note) for any locked component
- [x] An event guest with a pending request sees "Pending" state on that component instead of "Request Access"
- [x] An event guest who was denied sees a cooldown message (re-request available after N days) — same as existing org-member flow
- [x] Org admins see event guest component access requests in the settings page alongside org-member requests
- [x] When an org admin accepts a guest's request, a row is inserted into `event_member_components` (not `component_leads`)
- [x] When an org admin accepts an org member's request, the existing `component_leads` path is unchanged

## Affected Files

**Modify:**
- `src/app/actions/component-access-requests.ts` — update `requestComponentAccess`, `getPendingAccessRequests`, `acceptAccessRequest`
- `src/app/(dashboard)/events/[eventSlug]/page.tsx` — fetch all components + guest grants; render locked state + request button
- `supabase/migrations/20260527000002_component_access_requests_for_guests.sql` — RLS updates for guests on `component_access_requests`

**Read-only context (do not modify):**
- `supabase/migrations/20260527000001_event_collaborator_grants.sql` (from ISSUE-004) — `is_event_guest()`, `is_event_component_granted()`, `event_member_components`, `event_members`
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` — see how component pages enforce access

## Relevant Code Context

### Existing `requestComponentAccess` (component-access-requests.ts lines 13–58)

```ts
export async function requestComponentAccess(
  componentId: string,
  note: string | null,
  eventSlug: string
): Promise<{ data?: { id: string }; error?: string; cooldown?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check for existing pending request (unchanged — apply to all users)
  const { data: existing } = await supabase
    .from("component_access_requests")
    .select("id, status, responded_at")
    .eq("component_id", componentId)
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "pending") {
    return { error: "You already have a pending request for this component" };
  }

  // Cooldown check (unchanged)
  if (existing?.status === "denied" && existing.responded_at) {
    const cooldownEnd = new Date(existing.responded_at);
    cooldownEnd.setDate(cooldownEnd.getDate() + COOLDOWN_DAYS);
    if (new Date() < cooldownEnd) {
      return { error: `Re-request available after ${cooldownEnd.toLocaleDateString()}`, cooldown: cooldownEnd.toISOString() };
    }
  }

  // INSERT — currently may fail RLS for event guests
  const { data, error } = await supabase
    .from("component_access_requests")
    .insert({ component_id: componentId, requester_id: user.id, note: note ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}`);
  return { data: { id: data.id } };
}
```

### Existing `acceptAccessRequest` (lines 165–198)

```ts
export async function acceptAccessRequest(
  requestId: string,
  role: "member" | "lead" = "member"
): Promise<{ error?: string }> {
  // ...fetches request, verifies caller is admin...
  
  // Currently ALWAYS adds to component_leads:
  const { error: leadErr } = await supabase
    .from("component_leads")
    .upsert(
      { component_id: request.component_id, user_id: request.requester_id, role },
      { onConflict: "component_id,user_id" }
    );
  if (leadErr) return { error: leadErr.message };

  await supabase.from("component_access_requests")
    .update({ status: "accepted", responded_by: user.id, responded_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/settings");
  return {};
}
```

### Existing `getPendingAccessRequests` (lines 87–159)

The function checks `organization_members` to determine if the caller is an admin. For org admins, it fetches all requests for all components in their org. This part is correct — the issue is only on the INSERT side (guests can't submit) and the ACCEPT side (grants go to wrong table for guests).

### `component_access_requests` table schema

```
id            uuid
component_id  uuid → components.id
requester_id  uuid → profiles.id
note          text nullable
status        text  check in ('pending', 'accepted', 'denied')
responded_by  uuid nullable → profiles.id
denial_reason text nullable
created_at    timestamptz
responded_at  timestamptz nullable
```

### Event page (events/[eventSlug]/page.tsx) — current component fetch

```ts
const { data: components } = await supabase
  .from("components")
  .select("*")
  .eq("event_id", dbEvent.id)
  .order("sort_order");
```

Thanks to the RLS policy added in ISSUE-004 (`"Event guests can view component list"`), this query already returns all components for event guests. What's missing is: knowing which ones the guest has been granted, and surfacing that in the UI.

## Implementation Steps

### Step 1 — Migration: RLS for guests on `component_access_requests`

Create `supabase/migrations/20260527000002_component_access_requests_for_guests.sql`:

```sql
-- Allow event guests to insert their own access requests
create policy "Event guests can request component access"
  on public.component_access_requests for insert
  with check (
    requester_id = auth.uid()
    and (
      -- Either an org member for this component's event's org
      public.is_org_member_for_component(component_id)
      -- Or an event guest for this component's event
      or exists(
        select 1 from public.components c
        join public.event_members em on em.event_id = c.event_id
        where c.id = component_id and em.user_id = auth.uid()
      )
    )
  );

-- Allow event guests to view their own requests
create policy "Event guests can view their own requests"
  on public.component_access_requests for select
  using (
    requester_id = auth.uid()
    or public.is_org_admin_for_component(component_id)
  );

-- Allow event guests to cancel their own pending requests
create policy "Event guests can cancel their own pending requests"
  on public.component_access_requests for delete
  using (requester_id = auth.uid() and status = 'pending');
```

Note: `is_org_member_for_component` and `is_org_admin_for_component` already exist from the prior migration.

### Step 2 — Update `acceptAccessRequest` to branch on guest vs org member

In `src/app/actions/component-access-requests.ts`, update `acceptAccessRequest`:

```ts
export async function acceptAccessRequest(
  requestId: string,
  role: "member" | "lead" = "member"
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: request, error: fetchErr } = await supabase
    .from("component_access_requests")
    .select("*, component:component_id(id, event_id)")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) return { error: "Request not found" };

  // Verify caller is org admin for this component's event
  const eventId = request.component?.event_id;
  // (use existing org admin check via organization_members)

  // Is the requester an event guest (in event_members) but NOT an org member?
  const { data: orgMembership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", request.requester_id)
    // org_id: derive from eventId via a subquery or separate fetch
    .maybeSingle();

  const { data: eventMembership } = await supabase
    .from("event_members")
    .select("id")
    .eq("user_id", request.requester_id)
    .eq("event_id", eventId)
    .maybeSingle();

  const isGuest = !!eventMembership && !orgMembership;

  if (isGuest) {
    // Grant via event_member_components
    const { error: grantErr } = await supabase
      .from("event_member_components")
      .upsert(
        { event_id: eventId, user_id: request.requester_id, component_id: request.component_id },
        { onConflict: "event_id,user_id,component_id" }
      );
    if (grantErr) return { error: grantErr.message };
  } else {
    // Existing path: grant via component_leads
    const { error: leadErr } = await supabase
      .from("component_leads")
      .upsert(
        { component_id: request.component_id, user_id: request.requester_id, role },
        { onConflict: "component_id,user_id" }
      );
    if (leadErr) return { error: leadErr.message };
  }

  await supabase
    .from("component_access_requests")
    .update({ status: "accepted", responded_by: user.id, responded_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/settings");
  return {};
}
```

**Note on org_id lookup:** to check `organization_members` for the requester, you need the event's org_id. Fetch it with:
```ts
const { data: eventRow } = await supabase.from("events").select("organization_id").eq("id", eventId).single();
// then .eq("organization_id", eventRow.organization_id) in the org membership check
```

### Step 3 — Event page: pass guest grants + pending requests to the component list

In `src/app/(dashboard)/events/[eventSlug]/page.tsx`, after fetching `components`, add two more fetches (only if `user` exists and `is_event_guest` for this event — i.e., user is NOT an org member):

```ts
// For event guests: fetch their granted component IDs
let guestGrantedComponentIds: string[] = [];
let guestPendingRequestComponentIds: string[] = [];

if (user && !orgMembership) {
  const { data: grants } = await supabase
    .from("event_member_components")
    .select("component_id")
    .eq("event_id", dbEvent.id)
    .eq("user_id", user.id);
  guestGrantedComponentIds = (grants ?? []).map((g) => g.component_id);

  const { data: pendingRequests } = await supabase
    .from("component_access_requests")
    .select("component_id")
    .eq("requester_id", user.id)
    .eq("status", "pending")
    .in("component_id", components?.map((c) => c.id) ?? []);
  guestPendingRequestComponentIds = (pendingRequests ?? []).map((r) => r.component_id);
}
```

Pass these arrays down to the component list render. In the component cards:
- If the user is an org member → existing behavior (all components accessible)
- If `guestGrantedComponentIds.includes(component.id)` → component is accessible, render normal link
- If `guestPendingRequestComponentIds.includes(component.id)` → render greyed card with "Pending" badge
- Otherwise → render greyed card with "Request Access" button that calls `requestComponentAccess`

### Step 4 — "Request Access" button UI

The locked component card state:

```tsx
<div className="opacity-50 pointer-events-none cursor-not-allowed relative">
  {/* existing component card markup */}
  <div className="absolute inset-0 flex items-center justify-center">
    <button
      className="pointer-events-auto px-3 py-1.5 text-xs font-medium bg-white/10 border border-white/20 rounded-lg text-white/70 hover:bg-white/15 transition"
      onClick={() => requestComponentAccess(component.id, null, eventSlug)}
    >
      Request Access
    </button>
  </div>
</div>
```

For the "Pending" state, replace the button with a non-interactive badge:
```tsx
<span className="pointer-events-auto px-3 py-1.5 text-xs font-medium bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
  Pending
</span>
```

The event page component is a Server Component — the "Request Access" button needs to be extracted into a small `"use client"` component that calls `requestComponentAccess` via `useTransition`.

## Test Scenarios

**Happy path:**
- Event guest visits event page → sees 4 components; 2 are granted (clickable), 2 are locked (greyed, "Request Access" button)
- Guest clicks "Request Access" on a locked component → button changes to "Pending"
- Org admin opens settings → sees the guest's request in the access requests panel
- Admin clicks "Accept" → row inserted into `event_member_components` (NOT `component_leads`) → guest can now access that component
- Org member clicks "Accept" on an org-member request → row inserted into `component_leads` (unchanged behavior)

**Edge cases:**
- Guest requests a component they were already granted → `requestComponentAccess` returns existing row or no-op (guarded by pending check)
- Guest with a denied request tries to re-request within cooldown → error message with re-request date

**RLS:**
- Event guest CAN INSERT into `component_access_requests` for components in their event
- Event guest CANNOT INSERT for components outside their event
- Event guest CAN SELECT their own requests
- Org admin CAN SELECT all pending requests for their org's components (including from guests)
- Random authenticated user CANNOT SELECT or INSERT requests for other users' events

## Constraints

- Do not change the `getPendingAccessRequests` function signature or response shape — the settings UI that renders it must not need updating
- Do not modify `denyAccessRequest` — denial is the same for guests and org members
- The "Request Access" button must be a `"use client"` component using `useTransition` — the event page `page.tsx` itself stays as a Server Component
- Do not refactor the component card layout — only add the locked overlay state

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Date:** 2026-05-27
**Status:** Complete — build passes (0 TypeScript errors)

#### Step 1 — Migration

Created `supabase/migrations/20260527000003_component_access_requests_for_guests.sql` and applied via `mcp__supabase__apply_migration`.

Pre-existing RLS policies on `component_access_requests`:
- `car_insert` — org members only (INSERT) — **replaced**
- `car_select` — own requests + org admins + component leads (SELECT) — unchanged (already covers guests via `requester_id = auth.uid()`)
- `car_delete` — own requests, no status filter (DELETE) — unchanged (already covers guests)
- `car_update` — own requests + org admins + component leads (UPDATE) — unchanged

The old `car_insert` policy was dropped and replaced with a new one that permits both org members (`is_org_member_for_component`) and event guests (users in `event_members` for the component's event).

#### Step 2 — `acceptAccessRequest` updated

In `src/app/actions/component-access-requests.ts`:
- Fetches the component's `event_id` via the joined `component` relation
- Fetches the event's `organization_id` from the `events` table
- Runs parallel queries for org membership and event membership of the requester
- If `isGuest` (in `event_members` AND NOT in `organization_members`): upserts into `event_member_components` with `granted_by`
- Otherwise: existing `component_leads` upsert path unchanged

#### Step 3 & 4 — Event page updated

In `src/app/(dashboard)/events/[eventSlug]/page.tsx`:
- Added `isEventGuest`, `guestGrantedComponentIds: Set<string>`, `guestPendingComponentIds: Set<string>` variables
- After the `organization_members` check, if `membership` is null, checks `event_members` for the current user
- If event guest: fetches `event_member_components` grants and pending `component_access_requests` for this event's components
- Also populates `userComponentRequestMap` for denied/cooldown state
- Component grid updated: locked state is now `isLockedForOrgMember || isLockedForGuest`
- Both locked paths use the existing `LockedComponentCard` component (already handles pending/cooldown/request states)
- The `LockedComponentCard` is already a `"use client"` component using `useTransition` — no new client component needed (PRD Step 4 option was achieved by reusing existing component)
- Event guests correctly see AddComponentDialog hidden (gated by `isAdmin` which is `false` for non-org-members)

**Build:** `npm run build` — compiled successfully, 0 TypeScript errors, all 14 static/dynamic pages generated.

### Evaluator Report

**Date:** 2026-05-27

#### Acceptance Criteria Review

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC1 | Event guest sees ALL component names | PASS | ISSUE-004 RLS + existing query covers this |
| AC2 | Locked components show "Request Access" button | PASS | `LockedComponentCard` renders button when no existing request |
| AC3 | Pending state shown correctly | PASS | `userComponentRequestMap` populated for guests; `LockedComponentCard` renders "Request pending" state |
| AC4 | Guests can submit requests (RLS INSERT) | PASS | Migration replaced `car_insert` to include event guests |
| AC5 | `acceptAccessRequest` routes guest→`event_member_components`, org→`component_leads` | PASS | Implemented with org/event membership checks |
| AC6 | Org admins see guest requests in settings | PASS | `getPendingAccessRequests` fetches all requests for all org components; `car_select` policy allows org admins |
| AC7 | TypeScript types correct | PASS | Build passes with 0 errors |
| AC8 | Security gaps | PARTIAL — see findings |

#### Findings

🟡 **[MEDIUM] `acceptAccessRequest` lacks application-layer auth check** — The action doesn't verify the caller is an org admin before writing to `event_member_components`. This was a pre-existing gap in the `component_leads` path as well; RLS is the backstop (the `"Org admins can manage grants"` ALL policy on `event_member_components` blocks non-admin writes). However, an explicit early return should be added to fail fast with a meaningful error rather than leaking RLS errors to the client.

🔵 **[LOW] `guestPendingComponentIds` Set is populated but never read** — The variable is created and populated in the guest path, but the render only uses `userComponentRequestMap`. The Set is dead code. Clean up by removing it.

🔵 **[LOW] `isEventGuest` variable declared but only used in one render expression** — Minor — the variable is used correctly, no action needed.

🔵 **[LOW] `acceptAccessRequest` does not `revalidatePath` for the event page** — After accepting a guest's request, the event page should revalidate so the guest sees their new access. Currently only `/settings` is revalidated.

#### Summary

All 🔴 critical criteria are met. Two 🟡 medium and two 🔵 low items found. The security backstop (RLS) prevents actual data breaches, but the 🟡 items should be fixed for correctness and defense-in-depth.

### Coder Revision Report

**Date:** 2026-05-27
**Status:** All 🟡 and 🔵 findings resolved — build passes (0 TypeScript errors)

#### Fixes Applied

**🟡 Fix: Application-layer auth check in `acceptAccessRequest`**
Added an explicit org admin check before any writes:
```ts
const { data: callerMembership } = await supabase
  .from("organization_members")
  .select("role")
  .eq("organization_id", orgId)
  .eq("user_id", user.id)
  .maybeSingle();
const isCallerAdmin = callerMembership?.role === "owner" || callerMembership?.role === "admin";
if (!isCallerAdmin) return { error: "Not authorized" };
```
This fails fast with a meaningful error rather than leaking RLS errors. RLS remains as the backstop.

**🔵 Fix: Removed unused `guestPendingComponentIds` Set**
Removed the variable declaration and the `.add()` call. The render path uses only `userComponentRequestMap`, which is still correctly populated.

**🔵 Fix: Added `revalidatePath` for the event page in `acceptAccessRequest`**
Now fetches the event `slug` alongside `organization_id` and calls `revalidatePath(`/events/${eventSlug}`)` after a successful accept, so the guest immediately sees their updated access on the next page visit.

**Build:** `npm run build` — compiled successfully, 0 TypeScript errors, all 14 routes generated.

### Documentation Report

**Date:** 2026-05-27

README.md contains only the Next.js boilerplate template and does not document project features — no update required. The authoritative project documentation is `CLAUDE.md`, which covers architecture, patterns, and known issues. CLAUDE.md does not need updating for this feature — the patterns used (Server Components fetching Supabase data, `"use client"` components calling server actions, RLS-enforced access) are already documented.

PRD status updated from `New` → `In Review`.

No new documentation files created.

### Coordinator Summary

**Date:** 2026-05-27
**Final Status:** All acceptance criteria met. Build passes. No outstanding issues.

#### Final Acceptance Criteria Verification

| # | Criterion | Result |
|---|-----------|--------|
| AC1 | Event guest sees ALL component names | PASS — existing ISSUE-004 RLS handles this; page query returns all active components |
| AC2 | Locked components show "Request Access" button | PASS — `LockedComponentCard` (existing `"use client"` component) renders the button with `useTransition` |
| AC3 | Pending state shown correctly ("Pending" badge, cancel available) | PASS — `userComponentRequestMap` populated from guest pending query; `LockedComponentCard` renders pending state |
| AC4 | Guests can submit access requests (RLS INSERT) | PASS — migration replaced `car_insert` to allow event guest inserts |
| AC5 | `acceptAccessRequest` routes correctly: guest→`event_member_components`, org member→`component_leads` | PASS — both org membership and event membership checks implemented |
| AC6 | Org admins see guest requests in settings | PASS — `getPendingAccessRequests` unchanged; fetches all pending for all org components; `car_select` policy allows admins to see all |
| AC7 | TypeScript correct throughout | PASS — `npm run build` passes with 0 errors after all stages |
| AC8 | No security gaps | PASS — RLS is the primary backstop; Stage C added application-layer org-admin check in `acceptAccessRequest` |

#### Files Changed

- `supabase/migrations/20260527000003_component_access_requests_for_guests.sql` — new migration (applied); replaces `car_insert` policy to include event guests
- `src/app/actions/component-access-requests.ts` — `acceptAccessRequest` updated with: org/event membership branching, application-layer admin check, event page revalidation
- `src/app/(dashboard)/events/[eventSlug]/page.tsx` — event guest detection (`isEventGuest`, `guestGrantedComponentIds`), grants/pending fetches, locked-card rendering for guests

#### Constraints Verified

- `getPendingAccessRequests` signature and response shape unchanged
- `denyAccessRequest` not modified
- Event page `page.tsx` remains a Server Component
- "Request Access" functionality delivered via existing `LockedComponentCard` (`"use client"` with `useTransition`)
- Component card layout not refactored — only locked overlay state added

### PR Feedback Summary
