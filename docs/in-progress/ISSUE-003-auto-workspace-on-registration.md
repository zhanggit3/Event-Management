# ISSUE-003: Auto-workspace creation on registration

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #3

## Problem

Workspace and Organization are currently the same concept in the DB (`organizations` table), but they serve different purposes. A **workspace** is a personal container auto-created for every user on signup — it is always theirs, always exists, and is where they create their own events. An **organization** is a team entity a user joins or creates to collaborate with others. Today there is no distinction between the two, the Skip button lets users complete onboarding with no workspace at all, and invite-token users bypass workspace creation entirely.

## Design

```
Workspace  — personal, auto-created, mandatory, is_workspace = true
             one per user, never joinable by others
             visible in sidebar as "My Workspace"

Organization — team entity, optional, is_workspace = false
               user can create one during onboarding step 4 OR later from dashboard
               user can be in multiple orgs (via join request or invite)
               visible in sidebar separately from workspace
```

Both types live in the existing `organizations` table, distinguished by the new `is_workspace boolean` column. Events can belong to either. RLS is unchanged — membership rules apply to both.

## Acceptance Criteria

- [ ] `organizations` table has a new column `is_workspace boolean not null default false`
- [ ] Every user who completes onboarding has a workspace row in `organizations` (with `is_workspace = true`) and is `owner` in `organization_members`
- [ ] Onboarding is 4 steps: Name → Role → Workspace → Organization
- [ ] Step 3 (Workspace) has no Skip option; workspace name is required (defaults to `"FirstName's Workspace"`, user can edit)
- [ ] Step 4 (Organization) is optional — user can create an org (`is_workspace = false`) or skip it entirely
- [ ] Users arriving via a pending invite token: step 3 creates the workspace; step 4 is replaced by "Join Workspace" (consumes the token)
- [ ] The sidebar header label reads "My Workspace" for the user's personal workspace org, not the generic "Workspace" label it currently shows for any org
- [ ] A "Create Organization" entry point exists in the dashboard or settings page for users who skipped step 4

## Affected Files

**Create (migration):**
- `supabase/migrations/20260527000000_add_is_workspace_to_organizations.sql` — adds `is_workspace` column

**Modify:**
- `src/app/actions/organizations.ts` — add `createWorkspace` action; keep `createOrganization` unchanged
- `src/app/onboarding/profile/page.tsx` — add step 4, make step 3 mandatory, split workspace/org creation
- `src/components/sidebar.tsx` — update label + data shape to distinguish workspace from org
- `src/app/(dashboard)/layout.tsx` — pass workspace separately from orgs to sidebar
- `src/app/(dashboard)/settings/page.tsx` — add "Create Organization" button for post-onboarding org creation

**Read-only context (do not modify):**
- `src/app/actions/invites.ts` — `consumeInviteToken` function
- `src/app/actions/organizations.ts:createOrganization` — existing org creation (do not change; `createWorkspace` is a new separate function)

## Relevant Code Context

### Current `createOrganization` (organizations.ts lines 7–34)

```ts
export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  if (!name?.trim()) return { error: "Name is required" };

  const slug = slugify(name);

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: name.trim(), slug })  // is_workspace defaults to false
    .select()
    .single();

  if (orgError) return { error: orgError.message };

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: org.id, user_id: user.id, role: "owner" });

  if (memberError) return { error: memberError.message };

  revalidatePath("/");
  return { success: true };
}
```

### Current `handleSubmit` in onboarding (lines 74–105)

```ts
function handleSubmit(createOrg: boolean) {
  startTransition(async () => {
    // 1. Save profile
    const profileResult = await updateProfile(fd);

    // 2. If invite token → consume and redirect (SKIPS workspace creation entirely — BUG)
    if (pendingInviteToken) { ... return; }

    // 3. Create org only if createOrg=true and orgName non-empty
    if (createOrg && orgName.trim()) {
      await createOrganization(orgFd);
    }

    window.location.href = "/";
  });
}
```

### Current Skip button (lines 269–277)

```tsx
{step === 3 && !pendingInviteToken && (
  <button onClick={handleSkip} ...>Skip</button>
)}
```

### Current `SidebarProps` (sidebar.tsx lines 10–15)

```ts
interface SidebarProps {
  organization: { id: string; name: string; slug: string } | null;
  events: Pick<Event, "id" | "name" | "slug" | "status">[];
  userInitials: string;
  userEmail: string;
}
```

The sidebar renders `organization.name` with a hardcoded label `"Workspace"` beneath it (line 33), regardless of whether that org is a personal workspace or a team org. After this change, the label should only say "My Workspace" for `is_workspace = true` orgs.

### Dashboard layout — current org fetch (for reference)

The layout fetches the user's org via `organization_members` and passes it to Sidebar. After this change it should also pass `is_workspace` so the sidebar can render the correct label.

## Implementation Steps

### Step 1 — Migration

```sql
-- supabase/migrations/20260527000000_add_is_workspace_to_organizations.sql
alter table public.organizations
  add column is_workspace boolean not null default false;
```

No RLS changes needed — workspace orgs behave identically to regular orgs from a permissions standpoint.

### Step 2 — New `createWorkspace` server action

Add to `src/app/actions/organizations.ts`:

```ts
export async function createWorkspace(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  if (!name?.trim()) return { error: "Workspace name is required" };

  // Prevent creating a second workspace
  const { count } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("is_workspace", true)
    .in("id",
      supabase.from("organization_members").select("organization_id").eq("user_id", user.id)
    );
  if ((count ?? 0) > 0) return { error: "You already have a personal workspace" };

  const slug = slugify(name) + "-" + user.id.slice(0, 8);  // suffix prevents slug collision

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: name.trim(), slug, is_workspace: true })
    .select()
    .single();

  if (orgError) return { error: orgError.message };

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: org.id, user_id: user.id, role: "owner" });

  if (memberError) return { error: memberError.message };

  revalidatePath("/");
  return { success: true };
}
```

### Step 3 — Onboarding page: 4 steps

In `src/app/onboarding/profile/page.tsx`:

**Change state:**
```ts
type Step = 1 | 2 | 3 | 4;

const [workspaceName, setWorkspaceName] = useState("");  // step 3
const [orgName, setOrgName] = useState("");              // step 4 (optional)
```

**Change STEPS constant:**
```ts
const STEPS = [
  { label: "Profile", icon: User2 },
  { label: "Role", icon: Briefcase },
  { label: "Workspace", icon: Building2 },
  { label: "Organization", icon: Building2 },
];
```

**Change auto-fill effect — now targets workspaceName at step 3:**
```ts
useEffect(() => {
  if (step === 3 && !workspaceName && fullName.trim()) {
    const firstName = fullName.trim().split(" ")[0];
    setWorkspaceName(`${firstName}'s Workspace`);
  }
}, [step, fullName, workspaceName]);
```

**Change `handleContinue` — validate workspace name at step 3:**
```ts
function handleContinue() {
  setError(null);
  if (step === 1 && !fullName.trim()) { setError("Please enter your name."); return; }
  if (step === 3 && !workspaceName.trim()) { setError("Please enter a workspace name."); return; }
  if (step < 4) {
    setStep((s) => (s + 1) as Step);
  } else {
    handleSubmit();
  }
}
```

**Rewrite `handleSubmit` — no createOrg param:**
```ts
function handleSubmit(createOrg = true) {
  startTransition(async () => {
    // 1. Save profile
    const fd = new FormData();
    fd.set("full_name", fullName.trim());
    roles.forEach((r) => fd.append("job_titles", r));
    const profileResult = await updateProfile(fd);
    if (profileResult?.error) { setError(profileResult.error); return; }

    // 2. Always create personal workspace
    const wsFd = new FormData();
    wsFd.set("name", workspaceName.trim());
    const wsResult = await createWorkspace(wsFd);
    if (wsResult?.error) { setError(wsResult.error); return; }

    // 3. If invite token: consume it instead of creating org
    if (pendingInviteToken) {
      localStorage.removeItem("pending_invite_token");
      localStorage.removeItem("pending_invite_org");
      const result = await consumeInviteToken(pendingInviteToken);
      window.location.href = result.data?.redirectPath ?? "/";
      return;
    }

    // 4. If org name provided: create org (optional, step 4)
    if (createOrg && orgName.trim()) {
      const orgFd = new FormData();
      orgFd.set("name", orgName.trim());
      const orgResult = await createOrganization(orgFd);
      if (orgResult?.error) { setError(orgResult.error); return; }
    }

    window.location.href = "/";
  });
}
```

**Step 3 JSX — no Skip button:**
```tsx
{step === 3 && (
  <div>
    <h2 className="text-2xl font-bold text-white mb-1">Set up your workspace</h2>
    <p className="text-sm text-white/40 mb-7">
      Your personal space for events and tasks. You can join or create a team organization next.
    </p>
    <input
      type="text"
      placeholder="Jane's Workspace"
      value={workspaceName}
      onChange={(e) => setWorkspaceName(e.target.value)}
      autoFocus
      className="w-full h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white text-base placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
    />
  </div>
)}
```

**Step 4 JSX — Skip button present, invite token path:**
```tsx
{step === 4 && (
  <div>
    <h2 className="text-2xl font-bold text-white mb-1">
      {pendingInviteToken ? "Almost there!" : "Create an organization"}
    </h2>
    <p className="text-sm text-white/40 mb-7">
      {pendingInviteToken
        ? `You'll be added to ${pendingInviteOrg ?? "your team"}.`
        : "Optional — create a team org to collaborate with others. You can do this later too."}
    </p>
    {!pendingInviteToken && (
      <input
        type="text"
        placeholder="Acme Events"
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        autoFocus
        className="w-full h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white text-base placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
      />
    )}
  </div>
)}
```

**Actions row for step 4 — Skip button:**
```tsx
<div className="mt-7 flex items-center gap-3">
  <button onClick={handleContinue} ...>
    {pendingInviteToken ? "Join workspace →" : orgName.trim() ? "Create & continue →" : "Continue →"}
  </button>
  {step === 4 && !pendingInviteToken && (
    <button onClick={() => handleSubmit(false)} className="text-sm text-white/30 hover:text-white/50 transition-colors">
      Skip
    </button>
  )}
</div>
```

### Step 4 — Sidebar: show "My Workspace" label correctly

Update `SidebarProps` in `sidebar.tsx`:

```ts
interface SidebarProps {
  organization: { id: string; name: string; slug: string; is_workspace: boolean } | null;
  // ... rest unchanged
}
```

Change the label in the sidebar header:
```tsx
<p className="text-[10px] text-white/40 truncate leading-tight mt-0.5 font-mono uppercase tracking-wider">
  {organization?.is_workspace ? "My Workspace" : "Organization"}
</p>
```

Update the dashboard layout to include `is_workspace` in the org select.

### Step 5 — "Create Organization" post-onboarding entry point

In `src/app/(dashboard)/settings/page.tsx`, add a "Create Organization" section visible only when the user has no non-workspace org membership:

```tsx
{!hasOrg && (
  <div className="...">
    <h3>Create an Organization</h3>
    <p>Start collaborating with a team by creating an organization.</p>
    <CreateOrganizationForm />  {/* simple form calling createOrganization */}
  </div>
)}
```

`hasOrg` is derived server-side by checking if the user has any `organization_members` row where the org's `is_workspace = false`.

## Test Scenarios

**Happy path:**
- New user completes steps 1–3, skips step 4 → workspace row exists (`is_workspace = true`), no org row (`is_workspace = false`), redirected to `/`, sidebar shows "My Workspace"
- New user completes all 4 steps with an org name → workspace + org both created, sidebar shows "My Workspace" for personal space
- User who skipped step 4 goes to settings → "Create Organization" section is visible → fills org name → org created with `is_workspace = false`

**Invite token path:**
- User accepts invite link, registers → completes steps 1–3 (workspace created), step 4 shows "Join workspace" for the org → clicking it creates workspace first, then consumes invite token → redirected to the event

**Edge cases:**
- User submits step 3 with empty workspace name → error shown, stays on step 3
- User submits step 4 with empty org name → treated as Skip (no org created)
- `createWorkspace` called twice for same user → second call returns "You already have a personal workspace" error

**RLS:**
- Workspace org behaves identically to regular org for all existing RLS checks — no policy changes needed
- `is_workspace = true` orgs are not joinable via the join-request flow (enforced in `submitJoinRequest`: add a check that the target org's `is_workspace = false`)

## Constraints

- Do not modify `createOrganization` — `createWorkspace` is a separate new function
- Do not change any RLS policies — `is_workspace` is purely a UI/data distinction
- The multi-org sidebar (showing workspace events separately from org events) is out of scope — that requires the events query to be split and is tracked separately
- Do not gate existing features on `is_workspace` — all org features (events, components, members) work the same for both types

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Date:** 2026-05-27  
**Status:** Complete — build passes (0 TypeScript errors)

#### What was implemented

**Step 1 — Migration**
- Applied `alter table public.organizations add column is_workspace boolean not null default false` to Supabase project `sljvlxipnlkqruxlqdsf` via MCP tool.
- Created local migration file: `supabase/migrations/20260527000001_add_is_workspace_to_organizations.sql`

**Step 2 — `createWorkspace` server action**
- Added `createWorkspace` export to `src/app/actions/organizations.ts`.
- Duplicate-workspace guard: fetches existing org membership IDs first, then checks for `is_workspace = true` among them (subquery builder approach rejected by TS; two-step fetch used instead).
- `createOrganization` left completely unchanged.

**Step 3 — TypeScript types**
- Added `is_workspace: boolean` to the `Organization` interface in `src/types/database.ts`.

**Step 4 — Onboarding page (4 steps)**
- Rewrote `src/app/onboarding/profile/page.tsx` with `type Step = 1 | 2 | 3 | 4`.
- Added `workspaceName` state (step 3) separate from `orgName` (step 4).
- Auto-fill effect now targets `workspaceName` at step 3.
- `handleContinue` validates `workspaceName` at step 3 (blocks progress if empty).
- Step 3 JSX has no Skip button (mandatory).
- Step 4 JSX shows organization creation (optional) or invite-token join message.
- `handleSubmit` always calls `createWorkspace` first, then optionally `createOrganization`.
- Imports `createWorkspace` alongside existing imports.

**Step 5 — Sidebar**
- Updated `SidebarProps.organization` to include `is_workspace: boolean`.
- Label now reads `"My Workspace"` for `is_workspace = true`, `"Organization"` otherwise.

**Step 6 — Dashboard layout**
- Updated org select query to include `is_workspace` in `organizations(id, name, slug, is_workspace)`.
- Updated `DEV_ORG` constant to include `is_workspace: false`.
- Updated local `organization` type annotation to include `is_workspace`.

**Step 7 — Settings page**
- Replaced single `membership` fetch with a multi-membership fetch.
- Finds non-workspace org preferentially; falls back to workspace org.
- Computes `hasNonWorkspaceOrg` boolean.
- Passes `hasNonWorkspaceOrg` and `createOrganization` action to `SettingsClient`.

**Step 8 — Settings client**
- Added `hasNonWorkspaceOrg: boolean` to `Props`.
- Added `createOrganization` to `Actions` interface.
- Added `Plus` to icon imports.
- Added `newOrgName`, `createOrgError`, `createOrgSuccess` state.
- Added `handleCreateOrg` function.
- Added "Create Organization" card visible when `!hasNonWorkspaceOrg`.

**Pre-existing bug fixed**
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` line 167: query used `job_title` (old column name) but `Profile` type requires `job_titles` — fixed to `job_titles`.

### Evaluator Report

**Date:** 2026-05-27

#### Acceptance Criteria Review

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC1 | `is_workspace boolean not null default false` column | PASS | Migration applied; local file committed |
| AC2 | Every onboarding completion creates workspace row (`is_workspace = true`) + owner membership | PASS | `handleSubmit` always calls `createWorkspace` before any other step |
| AC3 | Onboarding is 4 steps: Name → Role → Workspace → Organization | PASS | `type Step = 1 \| 2 \| 3 \| 4`, STEPS array has 4 entries |
| AC4 | Step 3 has no Skip; workspace name is required | PASS | No skip button in step 3; `handleContinue` returns error if `workspaceName` is empty |
| AC5 | Step 4 is optional — skip or create org | PASS | Skip button present at step 4 only; empty `orgName` = no org created |
| AC6 | Invite-token path: step 3 creates workspace; step 4 shows "Join Workspace" | PASS | `handleSubmit` creates workspace then consumes token; step 4 shows invite org message when `pendingInviteToken` is set |
| AC7 | Sidebar label reads "My Workspace" for `is_workspace = true` | PASS | `organization?.is_workspace ? "My Workspace" : "Organization"` |
| AC8 | "Create Organization" entry point in settings for users who skipped step 4 | PASS | `!hasNonWorkspaceOrg` card with input + button |

#### Constraint Review

| Constraint | Status |
|------------|--------|
| `createOrganization` not modified | PASS |
| No RLS policy changes | PASS |
| Multi-org sidebar out of scope | PASS |
| No feature gating on `is_workspace` | PASS |

#### Findings

🔴 **Critical — `submitJoinRequest` allows joining workspace orgs**  
The PRD's Test Scenarios/RLS section explicitly states: "`is_workspace = true` orgs are not joinable via the join-request flow (enforced in `submitJoinRequest`: add a check that the target org's `is_workspace = false`)". This check was not implemented. A user could submit a join request to another user's personal workspace org via the `/join` page if they know the org ID. `submitJoinRequest` must guard against this.

🟡 **Medium — Settings page shows workspace org as the settings "subject" when user has no non-workspace org**  
When a workspace-only user visits `/settings`, the displayed org info card and invite link generator operate on their workspace org. The invite link generator would let the owner invite users to the workspace org, contradicting the design requirement that workspace orgs are "never joinable by others". This is partially mitigated by the `submitJoinRequest` fix above, but the settings page itself should not show invite functionality for a workspace-only user (or at least not for the workspace org).

🟡 **Medium — Dashboard layout falls back to first membership regardless of `is_workspace`**  
The dashboard layout (`src/app/(dashboard)/layout.tsx`) uses `.limit(1)` to get the first membership (ordered by `created_at`). This means a user who completed full onboarding (workspace first, then org) will see the workspace in the sidebar, not their team org. The sidebar would label it "My Workspace" which is correct, but events listed in the sidebar would be workspace events. This is actually correct per the current scope (multi-org sidebar is out of scope), but it means users with both a workspace and an org only see the workspace org in the dashboard. Consider fetching the non-workspace org preferentially, same as the settings page.

🔵 **Low — `handleSubmit` in onboarding calls `createWorkspace` even when user clicks "Skip" on step 4**  
This is correct per the PRD (workspace is always mandatory). Confirmed as working as designed.

🔵 **Low — Sidebar when `organization` is null shows "Organization" label**  
When a new user has no org at all (e.g. right after signup before onboarding), the sidebar falls back to the DEV_ORG which has `is_workspace: false`, showing "Organization". This is the DEV path — real users always have an org after onboarding. Acceptable.

🔵 **Low — Settings page `SettingsClient` `organization` prop type includes `is_workspace` but the settings-client `Props.organization` type was already updated**  
Confirmed correct.

### Coder Revision Report

**Date:** 2026-05-27  
**Status:** Complete — build passes (0 TypeScript errors)

#### Fixes Applied

**🔴 Fix — `submitJoinRequest` now blocks workspace org joins**  
Added a guard at the top of `submitJoinRequest` in `src/app/actions/join-requests.ts`:
- Fetches the target org's `is_workspace` column.
- Returns `{ error: "Personal workspaces cannot be joined" }` if `is_workspace = true`.

**🔴 Fix — `searchOrganizations` excludes workspace orgs from results**  
Added `.eq("is_workspace", false)` to the `organizations` query in `searchOrganizations`, so personal workspaces never appear in the `/join` search.

**🟡 Fix — Dashboard layout prefers non-workspace org**  
Rewrote the membership fetch in `src/app/(dashboard)/layout.tsx` to fetch all memberships (no `.limit(1)`) and select the non-workspace org preferentially, falling back to workspace. This ensures users who completed full onboarding (workspace + org) see their team org in the sidebar.

**🟡 Fix — Settings invite generator hidden for workspace orgs**  
Added `!organization.is_workspace` guard to the invite link generator section in `settings-client.tsx`. Workspace-only users see the "Create Organization" section instead, without the ability to invite others to their workspace.

#### Build Result
`npm run build` — TypeScript: 0 errors, all 14 pages generated successfully.

### Documentation Report

**Date:** 2026-05-27

#### README.md
No update needed. This feature introduces:
- No new environment variables (migration applied directly via MCP; no local env change required).
- No new setup commands.
- No new npm packages.

The README is a generic Next.js boilerplate file and does not document project features.

#### CLAUDE.md
The CLAUDE.md already documents the `organizations` table. The new `is_workspace` column is a schema extension. No update is required since the CLAUDE.md is intentionally kept at a high level and this change is captured in the migration file. An optional update would be to add `is_workspace boolean` to the organizations table row in the CLAUDE.md table, but this is not a blocking documentation gap.

#### PRD Status
Updated from `New` → `In Review`.

### Coordinator Summary

**Date:** 2026-05-27  
**Final Status:** Ready for Review  
**Build:** Passing (0 TypeScript errors)

#### Acceptance Criteria — Final Verification

| # | Criterion | Verified |
|---|-----------|---------|
| AC1 | `is_workspace boolean not null default false` column on `organizations` | YES — Migration applied to Supabase, local migration file created |
| AC2 | Every onboarding completion creates workspace row (`is_workspace = true`) | YES — `handleSubmit` unconditionally calls `createWorkspace` before any other step |
| AC3 | Onboarding is 4 steps: Name → Role → Workspace → Organization | YES — `type Step = 1 \| 2 \| 3 \| 4`, 4-entry STEPS array |
| AC4 | Step 3 has no Skip; workspace name required | YES — No Skip button in step 3 JSX; `handleContinue` blocks at step 3 if `workspaceName` empty |
| AC5 | Step 4 is optional | YES — Skip button at step 4 only; empty `orgName` → no org created |
| AC6 | Invite-token path: workspace created at step 3, step 4 shows join UI | YES — `handleSubmit` creates workspace then consumes token; step 4 shows org name from `pendingInviteOrg` |
| AC7 | Sidebar label "My Workspace" for `is_workspace = true` | YES — `organization?.is_workspace ? "My Workspace" : "Organization"` |
| AC8 | "Create Organization" entry in settings for workspace-only users | YES — Card shown when `!hasNonWorkspaceOrg` in `settings-client.tsx` |

#### Additional Security Improvements (not in original AC but added per PRD Test Scenarios)
- `submitJoinRequest`: blocks joining workspace orgs with `"Personal workspaces cannot be joined"` error.
- `searchOrganizations`: excludes `is_workspace = true` orgs from `/join` page search results.
- Settings invite generator: hidden when the displayed org is a workspace org.

#### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260527000001_add_is_workspace_to_organizations.sql` | Created — adds `is_workspace` column |
| `src/types/database.ts` | `Organization` interface gains `is_workspace: boolean` |
| `src/app/actions/organizations.ts` | New `createWorkspace` export added |
| `src/app/actions/join-requests.ts` | `submitJoinRequest` guards against workspace orgs; `searchOrganizations` excludes workspaces |
| `src/app/onboarding/profile/page.tsx` | 4-step wizard with mandatory workspace step |
| `src/components/sidebar.tsx` | `SidebarProps.organization` includes `is_workspace`; label logic updated |
| `src/app/(dashboard)/layout.tsx` | Org fetch prefers non-workspace org; includes `is_workspace` in select |
| `src/app/(dashboard)/settings/page.tsx` | Fetches all memberships; computes `hasNonWorkspaceOrg`; passes `createOrganization` |
| `src/app/(dashboard)/settings/settings-client.tsx` | Accepts `hasNonWorkspaceOrg`; shows Create Org card; hides invite generator for workspace orgs |
| `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` | Pre-existing bug fix: `job_title` → `job_titles` in profile select query |

### PR Feedback Summary
