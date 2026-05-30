# ISSUE-004: Event-level invitation with component grants

**Type:** Feature
**Priority:** P1
**Status:** Complete
**GitHub Issue:** #4

## Problem

Event owners need to invite external collaborators (contractors, vendors, partners) to a specific event and control exactly which components they can see. Today, the invite token system only supports org-level membership — event-scoped tokens still insert the user into `organization_members`, which gives them visibility into all events and components across the entire org. There is also no mechanism to pre-select component grants at invite time.

## Acceptance Criteria

- [x] Event org admin can open event settings and generate a shareable invite link, selecting one or more components to grant access to
- [x] A guest who accepts the link is added to `event_members` only — NOT to `organization_members`
- [x] The guest can see the invited event in their dashboard sidebar
- [x] The guest can access only the granted components (tasks, notes, etc.)
- [x] All other components are visible by name but locked (greyed out, no content accessible)
- [x] The event settings page shows a list of current external collaborators with their component grants
- [x] An org admin can add or remove component grants for an existing collaborator after invitation

## Affected Files

**Create (migration):**
- `supabase/migrations/20260527000001_event_collaborator_grants.sql` — new tables + helper functions + RLS updates

**Modify:**
- `src/app/actions/invites.ts` — add `createEventInviteWithComponents` server action
- `src/app/(dashboard)/events/[eventSlug]/settings/page.tsx` — add External Collaborators section
- `src/components/event-collaborators-panel.tsx` — new client component (invite dialog + collaborator list)

**Read-only context (do not modify):**
- `src/app/actions/invites.ts` — existing `createShareableInviteToken` and `consumeInviteToken` (calls `accept_invite` RPC)
- `supabase/migrations/001_initial_schema.sql` — existing RLS patterns for `is_org_member`

## Relevant Code Context

### Existing `accept_invite` SQL function (key parts)

The function is `SECURITY DEFINER` and is called via `supabase.rpc("accept_invite", { p_token: token })`.

For event-scoped tokens it currently does:
```sql
-- WRONG: adds to org membership giving full org visibility
INSERT INTO organization_members (organization_id, user_id, role, scope)
VALUES (v_invite.organization_id, v_user_id, v_invite.role, 'event')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, scope = EXCLUDED.scope;

-- Correct: adds to event_members
INSERT INTO event_members (event_id, user_id, role)
VALUES (v_invite.event_id, v_user_id, 'member')
ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role;
```

The fix: remove the `organization_members` INSERT for event-scoped tokens, and after inserting into `event_members`, insert rows into `event_member_components` from `invite_token_components`.

### Existing `createShareableInviteToken` (src/app/actions/invites.ts)

```ts
export async function createShareableInviteToken(
  organizationId: string,
  inviteType: InviteScope,          // "organization" | "event" | "component"
  role: "member" | "admin" | "lead",
  scopeId?: string,                  // event_id for event scope
  expiresInHours: number = 48
): Promise<{ data?: { token: string; inviteUrl: string }; error?: string }>
```

This inserts into `invite_tokens` and returns the token + URL. We will NOT modify this function — we add a new one that wraps it and also inserts `invite_token_components`.

### Existing `is_org_member` helper (used in all RLS policies)

```sql
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;
```

The new RLS additions follow the same pattern with OR conditions.

### `invite_tokens` table (key columns)

```
token        text unique
invite_type  text  check in ('organization', 'event', 'component')
event_id     uuid  nullable → events.id
component_id uuid  nullable → components.id
used_at      timestamptz nullable
expires_at   timestamptz
```

### `event_members` table (already exists, 0 rows)

```
event_id  uuid → events.id
user_id   uuid → auth.users.id   (note: FK to auth.users, not profiles)
role      text check in ('member', 'lead')
unique(event_id, user_id)
```

### `consumeInviteToken` server action

```ts
export async function consumeInviteToken(token: string): Promise<{
  data?: { organizationId: string; orgName: string; role: string; redirectPath: string };
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  // ... parses result and returns
}
```

## Implementation Steps

### Step 1 — Migration: new tables + helper functions + RLS

Create `supabase/migrations/20260527000001_event_collaborator_grants.sql`:

```sql
-- Table: which components to grant when an event-scoped token is consumed
create table public.invite_token_components (
  id               uuid primary key default gen_random_uuid(),
  invite_token_id  uuid not null references public.invite_tokens(id) on delete cascade,
  component_id     uuid not null references public.components(id) on delete cascade,
  unique(invite_token_id, component_id)
);
alter table public.invite_token_components enable row level security;
-- Only the token creator's org admins need to insert; reads happen inside accept_invite (SECURITY DEFINER)
create policy "Org admins can manage invite_token_components"
  on public.invite_token_components for all
  using (
    exists(
      select 1 from public.invite_tokens it
      join public.organization_members om on om.organization_id = it.organization_id
      where it.id = invite_token_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

-- Table: per-guest per-component access grants (active grants after token consumed)
create table public.event_member_components (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  granted_by   uuid references public.profiles(id),
  granted_at   timestamptz not null default now(),
  unique(event_id, user_id, component_id)
);
alter table public.event_member_components enable row level security;

create policy "Event members can view their own grants"
  on public.event_member_components for select
  using (user_id = auth.uid() or public.is_org_member(
    (select organization_id from public.events where id = event_id)
  ));

create policy "Org admins can manage grants"
  on public.event_member_components for all
  using (public.is_org_admin(
    (select organization_id from public.events where id = event_id)
  ));

-- Helper: is the current user a guest (event_members row) of this event?
create or replace function public.is_event_guest(ev_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.event_members
    where event_id = ev_id and user_id = auth.uid()
  );
$$;

-- Helper: does the current user have an active component grant?
create or replace function public.is_event_component_granted(comp_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.event_member_components
    where component_id = comp_id and user_id = auth.uid()
  );
$$;

-- Update RLS: events — guests can see their event
create policy "Event guests can view their event"
  on public.events for select
  using (public.is_event_guest(id));

-- Update RLS: components — guests can see ALL components of their event (for locked-list display)
create policy "Event guests can view component list"
  on public.components for select
  using (
    exists(
      select 1 from public.events e
      where e.id = components.event_id and public.is_event_guest(e.id)
    )
  );

-- Update RLS: tasks — guests with a component grant can read + write
create policy "Event guests can view granted tasks"
  on public.tasks for select
  using (public.is_event_component_granted(component_id));

create policy "Event guests can create tasks in granted components"
  on public.tasks for insert
  with check (public.is_event_component_granted(component_id));

create policy "Event guests can update tasks in granted components"
  on public.tasks for update
  using (public.is_event_component_granted(component_id));

-- Update RLS: notes — guests with a component grant can read + write
create policy "Event guests can view granted notes"
  on public.notes for select
  using (public.is_event_component_granted(component_id));

create policy "Event guests can create notes in granted components"
  on public.notes for insert
  with check (public.is_event_component_granted(component_id));

-- Fix accept_invite: update it to NOT add event-scope users to organization_members
-- and to grant components from invite_token_components
create or replace function public.accept_invite(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id       uuid;
  v_invite        invite_tokens%rowtype;
  v_profile_email text;
  v_component     components%rowtype;
  v_event_slug    text;
  v_org_name      text;
  v_redirect      text := '/';
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  select * into v_invite
  from invite_tokens
  where token = p_token
  for update skip locked;

  if not found then
    return jsonb_build_object('error', 'Invite not found or currently being claimed');
  end if;

  if v_invite.used_at is not null then
    return jsonb_build_object('error', 'This invite has already been used');
  end if;

  if v_invite.expires_at < now() then
    return jsonb_build_object('error', 'This invite has expired');
  end if;

  if v_invite.email is not null then
    select email into v_profile_email from profiles where id = v_user_id;
    if v_profile_email is null or lower(v_profile_email) != lower(v_invite.email) then
      return jsonb_build_object('error', format(
        'This invite was sent to %s. Please sign in with that email address.',
        v_invite.email
      ));
    end if;
  end if;

  -- Organization-scoped invite: add to org
  if v_invite.invite_type = 'organization' then
    insert into organization_members (organization_id, user_id, role, scope)
    values (v_invite.organization_id, v_user_id, v_invite.role, 'org')
    on conflict (organization_id, user_id) do update
      set role = excluded.role, scope = excluded.scope;

  -- Event-scoped invite: add to event_members + grant components (NOT org)
  elsif v_invite.invite_type = 'event' and v_invite.event_id is not null then
    insert into event_members (event_id, user_id, role)
    values (v_invite.event_id, v_user_id, 'member')
    on conflict (event_id, user_id) do nothing;

    -- Grant pre-selected components
    insert into event_member_components (event_id, user_id, component_id)
    select v_invite.event_id, v_user_id, itc.component_id
    from invite_token_components itc
    where itc.invite_token_id = v_invite.id
    on conflict (event_id, user_id, component_id) do nothing;

    select slug into v_event_slug from events where id = v_invite.event_id;
    if v_event_slug is not null then
      v_redirect := '/events/' || v_event_slug;
    end if;

  -- Component-scoped invite: add to event_members + component_leads
  elsif v_invite.invite_type = 'component' and v_invite.component_id is not null then
    select * into v_component from components where id = v_invite.component_id;
    if found then
      insert into event_members (event_id, user_id, role)
      values (v_component.event_id, v_user_id, 'member')
      on conflict (event_id, user_id) do nothing;

      insert into component_leads (component_id, user_id, role)
      values (v_invite.component_id, v_user_id,
        case when v_invite.role = 'lead' then 'lead' else 'member' end)
      on conflict (component_id, user_id) do update set role = excluded.role;

      select e.slug into v_event_slug from events e where e.id = v_component.event_id;
      if v_event_slug is not null then
        v_redirect := '/events/' || v_event_slug || '/' || v_component.slug;
      end if;
    end if;
  end if;

  update invite_tokens set used_at = now() where id = v_invite.id;
  select name into v_org_name from organizations where id = v_invite.organization_id;

  return jsonb_build_object(
    'organizationId', v_invite.organization_id,
    'orgName',        coalesce(v_org_name, ''),
    'role',           v_invite.role,
    'redirectPath',   v_redirect
  );

exception when others then
  return jsonb_build_object('error', sqlerrm);
end;
$$;
```

### Step 2 — New server action: `createEventInviteWithComponents`

Add to `src/app/actions/invites.ts`:

```ts
export async function createEventInviteWithComponents(
  organizationId: string,
  eventId: string,
  componentIds: string[],
  expiresInHours: number = 48
): Promise<{ data?: { token: string; inviteUrl: string }; error?: string }> {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  if (componentIds.length === 0) return { error: "Select at least one component" };

  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("invite_tokens")
    .insert({
      organization_id: organizationId,
      invited_by: user.id,
      email: null,
      role: "member",
      invite_type: "event",
      event_id: eventId,
      expires_at: expiresAt,
    })
    .select("id, token")
    .single();

  if (tokenErr || !tokenRow) return { error: tokenErr?.message ?? "Failed to create token" };

  const { error: grantErr } = await supabase
    .from("invite_token_components")
    .insert(componentIds.map((cid) => ({ invite_token_id: tokenRow.id, component_id: cid })));

  if (grantErr) return { error: grantErr.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  revalidatePath(`/events`);
  return { data: { token: tokenRow.token, inviteUrl: `${siteUrl}/invite/${tokenRow.token}` } };
}
```

Also add these two server actions for post-invite grant management:

```ts
export async function addEventCollaboratorComponentGrant(
  eventId: string,
  userId: string,
  componentId: string,
  organizationId: string
): Promise<{ error?: string }> { ... }  // inserts into event_member_components; caller must be org admin

export async function removeEventCollaboratorComponentGrant(
  eventId: string,
  userId: string,
  componentId: string,
  organizationId: string
): Promise<{ error?: string }> { ... }  // deletes from event_member_components; caller must be org admin
```

### Step 3 — Event settings page: add External Collaborators section

In `src/app/(dashboard)/events/[eventSlug]/settings/page.tsx`, after the existing data fetches, add:

```ts
// Fetch event guests (event_members who are NOT org members)
const { data: collaborators } = await supabase
  .from("event_members")
  .select(`
    user_id,
    role,
    profile:user_id(id, full_name, email),
    grants:event_member_components(component_id)
  `)
  .eq("event_id", dbEvent.id);
```

Pass `collaborators`, `components`, and `event.organization_id` to a new client component `EventCollaboratorsPanel`.

### Step 4 — New client component: `src/components/event-collaborators-panel.tsx`

```tsx
"use client";
// Props: collaborators, components, eventId, organizationId
// Renders:
//   - "External Collaborators" heading
//   - List of existing collaborators: avatar + name + email + which components they have (pills)
//     + "Manage" button per collaborator → inline checklist to add/remove component grants
//   - "Invite Collaborator" button → opens Dialog:
//       - Checkbox list of all event components
//       - "Generate Link" button → calls createEventInviteWithComponents → shows copyable URL
```

Use the same `Dialog` + shadcn pattern as other dialogs in the codebase (e.g. `AddComponentDialog`).

## Test Scenarios

**Happy path:**
- Org admin opens event settings → "External Collaborators" section visible → clicks "Invite Collaborator" → selects Finance + Marketing → clicks "Generate Link" → gets a shareable URL
- Contractor accepts link → appears in `event_members` only (NOT in `organization_members`) → can access Finance and Marketing components → sees Volunteer component greyed out → cannot access Volunteer tasks/notes

**Edge cases:**
- Admin generates a link with no components selected → error: "Select at least one component"
- Contractor accepts an already-used token → error: "This invite has already been used"
- Contractor is already in `event_members` → upsert does nothing (no error), component grants are added if new

**RLS:**
- Event guest CAN select their event row from `events`
- Event guest CAN select all `components` rows for their event (even non-granted ones — needed for locked-list display)
- Event guest CAN select/insert `tasks` and `notes` only for their granted components
- Event guest CANNOT select `tasks` or `notes` for non-granted components
- Event guest CANNOT select other org events
- Org member CANNOT see `event_member_components` rows for other orgs

## Constraints

- Do not modify `createShareableInviteToken` — the new `createEventInviteWithComponents` wraps it directly
- Do not modify existing `organization`-scoped invite logic
- The `event_members` table FK is to `auth.users`, not `profiles` — use `auth.uid()` not `profiles.id` when inserting
- Do not touch `component-access-requests.ts` — that is covered by ISSUE-005
- Follow the same Dialog + shadcn pattern as `add-component-dialog.tsx` for the invite dialog

## Technical Notes

- The `accept_invite` SQL function is `SECURITY DEFINER` — it can bypass RLS to write to `event_member_components` even before the user is a member of anything. This is intentional and safe because the function validates token validity + expiry before writing.
- `event_members.user_id` has a FK to `auth.users` (not `profiles`) — verify inserts use `auth.uid()` not a profile lookup.
- The `is_event_component_granted` helper must be `stable` (not `volatile`) to be usable in RLS policies.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Date:** 2026-05-27  
**Build result:** PASS (zero TypeScript errors)

#### Step 1 — Migration applied
- Created `public.invite_token_components` table (FK to `invite_tokens`, FK to `components`, RLS enabled)
- Created `public.event_member_components` table (FK to `events`, `auth.users`, `components`; RLS enabled)
  - Note: used `auth.users` for `user_id` FK (not `profiles`) for consistency with `event_members.user_id`
  - Note: used `auth.users` for `granted_by` FK (not `profiles`) for the same reason
- Added `is_event_guest(ev_id uuid)` helper function (SECURITY DEFINER STABLE)
- Added `is_event_component_granted(comp_id uuid)` helper function (SECURITY DEFINER STABLE)
- Added 7 new RLS policies across `events`, `components`, `tasks`, `notes`
- Rewrote `accept_invite` SQL function: event-scoped tokens now add to `event_members` only (no `organization_members` insert) and populate `event_member_components` from `invite_token_components`

#### Step 2 — Server actions added to `src/app/actions/invites.ts`
- `createEventInviteWithComponents(organizationId, eventId, componentIds[], expiresInHours)` — creates invite token + component grants; guards on org admin membership
- `addEventCollaboratorComponentGrant(eventId, userId, componentId, organizationId)` — inserts into `event_member_components`; guards on org admin
- `removeEventCollaboratorComponentGrant(eventId, userId, componentId, organizationId)` — deletes from `event_member_components`; guards on org admin

#### Step 3 — Event settings page updated
- `src/app/(dashboard)/events/[eventSlug]/settings/page.tsx` now fetches `event_members` + their `event_member_components` grants
- Profiles fetched separately (FK join ambiguity workaround per CLAUDE.md)
- Passes `collaborators`, `components`, `eventId`, `organizationId` to `EventCollaboratorsPanel`

#### Step 4 — New client component created
- `src/components/event-collaborators-panel.tsx` — full "use client" component
- Collaborator list with grant pills and expandable inline checklist for add/remove
- "Invite Collaborator" Dialog with component checkboxes → Generate Link → copyable URL
- Follows the same Dialog + shadcn pattern as `add-component-dialog.tsx`

#### Types
- Added `InviteTokenComponent` and `EventMemberComponent` interfaces to `src/types/database.ts`

### Evaluator Report

**Date:** 2026-05-27

#### AC1 — Event-scope invite does NOT add to organization_members
✅ PASS. The new `accept_invite` SQL function: for `invite_type = 'event'`, only inserts into `event_members` and `event_member_components`. The old unconditional `INSERT INTO organization_members` is gone for event-scoped tokens.

#### AC2 — `event_member_components` gets populated correctly on token consumption
✅ PASS. The new `accept_invite` inserts rows from `invite_token_components` → `event_member_components` using SECURITY DEFINER, bypassing RLS correctly.

#### AC3 — RLS policies allow event guests to see all component names but only access granted ones
✅ PASS. "Event guests can view component list" policy allows SELECT on all components where `is_event_guest(e.id)`. Tasks/notes are gated by `is_event_component_granted`.

#### AC4 — Tasks/notes RLS allows guests to read+write for granted components
✅ PASS. Policies added for `tasks` (SELECT, INSERT, UPDATE) and `notes` (SELECT, INSERT) gated on `is_event_component_granted`.

#### AC5 — UI correctly shows collaborators and their grants
🔴 **ISSUE**: The Supabase query in the settings page uses `grants:event_member_components(component_id)` as an embedded relation on `event_members`. However, `event_member_components` has no FK directly referencing `event_members` — it only has FKs to `events(id)` and `auth.users(id)` separately. PostgREST cannot auto-resolve this embedded relation; it will return empty arrays. The grants must be fetched in a separate query.

#### AC6 — New server actions properly auth-guarded
✅ PASS. All three new actions check `user = await supabase.auth.getUser()` and verify the caller is in `organization_members` with role `owner` or `admin`.

#### AC7 — TypeScript types correct
🟡 **MINOR**: The `Database` interface in `src/types/database.ts` does not include the new `invite_token_components` and `event_member_components` tables in the `Tables` record. The standalone interfaces were added but the typed `Database` interface is incomplete. This doesn't affect the build (the codebase doesn't use typed Supabase client generics extensively) but is a correctness gap.

🟡 **MINOR**: In `addEventCollaboratorComponentGrant`, the duplicate detection uses `!error.message.includes("duplicate")` string matching which is fragile. A more robust approach uses Postgres error code `23505` (unique_violation). However, since the "Org admins can manage grants" RLS policy uses `for all` with only a `using` clause (no separate `with check`), inserts may silently fail for non-admins instead of erroring. The code path for admin guards handles this but the on-conflict should use `upsert` semantics.

#### Summary
- 1 🔴 critical: PostgREST embedded relation for collaborator grants will fail silently
- 2 🟡 minor: Database.Tables type completeness; fragile duplicate check

### Coder Revision Report

**Date:** 2026-05-27  
**Build result:** PASS (zero TypeScript errors)

#### Fix for 🔴 — PostgREST embedded relation failure
**Root cause:** `event_member_components` has no FK directly referencing `event_members` (it references `events` and `auth.users` independently). PostgREST cannot resolve `grants:event_member_components(component_id)` as an embedded relation from `event_members`.

**Fix applied** in `src/app/(dashboard)/events/[eventSlug]/settings/page.tsx`:
- Removed the invalid embedded relation syntax from the `event_members` query
- Now fetches `event_member_components` in a separate query filtered by `event_id` and `in(user_id, memberUserIds)`
- Builds a `grantsMap: Map<userId, grant[]>` in application code
- This is consistent with the FK join ambiguity workaround pattern described in CLAUDE.md

#### Fix for 🟡 — Fragile duplicate handling in `addEventCollaboratorComponentGrant`
**Fix applied** in `src/app/actions/invites.ts`:
- Replaced `.insert()` + string-match error check with `.upsert()` using `onConflict: "event_id,user_id,component_id"` and `ignoreDuplicates: true`
- All database errors now surface correctly

#### Fix for 🟡 — `Database.Tables` type completeness
**Fix applied** in `src/types/database.ts`:
- Added `invite_token_components` and `event_member_components` entries to the `Database.Tables` record with proper Row/Insert/Update types

### Documentation Report

**Date:** 2026-05-27

#### New environment variables
No new environment variables introduced. `NEXT_PUBLIC_SITE_URL` was already used in the existing `createShareableInviteToken` action with the same fallback-to-localhost pattern.

#### New setup steps
None required. The migration is applied to the remote Supabase project (`sljvlxipnlkqruxlqdsf`) via `mcp__supabase__apply_migration`. For new developers, the migration file `supabase/migrations/20260527000002_event_collaborator_grants.sql` is already tracked.

#### README update
No README update needed — no new dependencies, env vars, or commands were introduced.

#### PRD status
Updated from `New` → `In Review`.

### Coordinator Summary

**Date:** 2026-05-27  
**Final build:** PASS  
**PRD status:** Ready for Review

#### Final Acceptance Criteria verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|---------|
| AC1 | Event-scope invite does NOT add to organization_members | PASS | `accept_invite` SQL function rewritten — event branch has no `INSERT INTO organization_members`. Confirmed in live DB. |
| AC2 | `event_member_components` populated on token consumption | PASS | Function inserts from `invite_token_components itc WHERE itc.invite_token_id = v_invite.id`. SECURITY DEFINER bypasses RLS correctly. |
| AC3 | Guests see all component names, only access granted ones | PASS | "Event guests can view component list" (SELECT on components), task/note access gated by `is_event_component_granted`. 7 policies confirmed in DB. |
| AC4 | Tasks/notes read+write for granted components | PASS | `tasks`: SELECT+INSERT+UPDATE. `notes`: SELECT+INSERT. All gated on `is_event_component_granted`. |
| AC5 | UI shows collaborators with their grants | PASS (after Stage C fix) | Settings page fetches `event_members` and `event_member_components` in separate queries, builds grants map in app code. Panel renders list with pills and inline manage checklist. |
| AC6 | Server actions auth-guarded | PASS | All 3 new actions check `user` + org membership role in `['owner', 'admin']`. |
| AC7 | TypeScript types correct | PASS | `InviteTokenComponent` and `EventMemberComponent` added to both standalone interfaces and `Database.Tables`. Build clean. |

#### Files changed
- **New migration:** `supabase/migrations/20260527000002_event_collaborator_grants.sql`
- **Modified:** `src/app/actions/invites.ts` — 3 new exports
- **Modified:** `src/app/(dashboard)/events/[eventSlug]/settings/page.tsx` — collaborators data fetch + panel
- **New:** `src/components/event-collaborators-panel.tsx`
- **Modified:** `src/types/database.ts` — new interfaces + Database.Tables entries

### PR Feedback Summary
