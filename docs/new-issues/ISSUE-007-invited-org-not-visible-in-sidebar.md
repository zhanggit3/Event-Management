# ISSUE-007: Accepted org invitation not visible in sidebar

**Type:** Bug
**Priority:** P1
**Status:** Superseded by ISSUE-008
**GitHub Issue:** #7

## Problem

After accepting an organization invitation, the invitee cannot see the newly joined organization in the sidebar. The dashboard layout hard-selects the first (oldest) non-workspace org by `created_at ASC`, so any subsequent org memberships are silently ignored. There is also no org switcher, so users with multiple memberships have no mechanism to navigate between them.

## Acceptance Criteria

- [ ] After accepting an org invite and being redirected, the invitee immediately sees the newly joined org in the sidebar (name + events)
- [ ] Users who belong to multiple non-workspace orgs can switch between them from the sidebar
- [ ] Org selection persists across page navigations (cookie-backed)
- [ ] Accepting a new invite always lands the user on the newly joined org's context
- [ ] Users with only a personal workspace continue to see their workspace (no regression)

## Affected Files

**Modify:**
- `src/app/(dashboard)/layout.tsx` — read `active_org_id` cookie to select org; pass all memberships to Sidebar
- `src/components/sidebar.tsx` — add org switcher UI; accept `organizations` list prop; call `setActiveOrg` on switch
- `src/app/actions/invites.ts` — after successful `consumeInviteToken`, set the `active_org_id` cookie to the newly joined org

**Create:**
- `src/app/actions/org-context.ts` — single server action `setActiveOrg(orgId: string)` that writes the cookie

**Read-only context (do not modify):**
- `src/types/database.ts` — `Organization`, `OrganizationMember` types

## Relevant Code Context

### Dashboard layout — current org selection (the bug)

```ts
// src/app/(dashboard)/layout.tsx
const { data: memberships } = await supabase
  .from("organization_members")
  .select("organization_id, role, organizations(id, name, slug, is_workspace)")
  .eq("user_id", user.id)
  .order("created_at", { ascending: true });   // ← oldest first

const nonWorkspaceMembership = memberships.find(
  (m) => (m.organizations as unknown as OrgShape)?.is_workspace === false
);
const selectedMembership = nonWorkspaceMembership ?? memberships[0];
// ↑ always the oldest non-workspace org; newly joined org is never selected
```

### Sidebar props — currently receives one org

```ts
// src/components/sidebar.tsx
interface SidebarProps {
  organization: { id: string; name: string; slug: string; is_workspace: boolean } | null;
  events: Pick<Event, "id" | "name" | "slug" | "status">[];
  userInitials: string;
  userEmail: string;
}
```

### Invite acceptance redirect

```ts
// src/app/invite/[token]/invite-valid.tsx
async function handleAccept() {
  setAccepting(true);
  const result = await consumeInviteToken(token);
  if (result.error) { ... return; }
  window.location.href = result.data?.redirectPath ?? "/";
  // ↑ redirectPath is "/" — no org context carried forward
}
```

### consumeInviteToken (abbreviated)

```ts
// src/app/actions/invites.ts
export async function consumeInviteToken(token: string) {
  // ... calls supabase.rpc("accept_invite", { p_token: token })
  revalidatePath("/");
  revalidatePath("/settings");
  return {
    data: {
      organizationId: result.organizationId ?? "",
      orgName: result.orgName ?? "",
      role: result.role ?? "member",
      redirectPath: result.redirectPath ?? "/",
    },
  };
  // ↑ organizationId is available here but never used to set org context
}
```

### Cookie pattern used by Supabase SSR (how to read/write)

```ts
import { cookies } from "next/headers";

// Reading (in server component / layout):
const cookieStore = await cookies();
const activeOrgId = cookieStore.get("active_org_id")?.value;

// Writing (in server action):
const cookieStore = await cookies();
cookieStore.set("active_org_id", orgId, {
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
  httpOnly: false,            // needs to be readable client-side for the switcher
});
```

## Implementation Steps

### 1. Create `src/app/actions/org-context.ts`

```ts
"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setActiveOrg(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set("active_org_id", orgId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/");
}
```

### 2. Update `src/app/(dashboard)/layout.tsx`

a. Read the `active_org_id` cookie.

b. Change the org-selection logic: prefer the cookie-matched org, then fall back to first non-workspace, then workspace.

c. Pass the full `organizations` array to `Sidebar` (needed for the switcher).

New layout snippet:

```ts
import { cookies } from "next/headers";

// inside DashboardLayout, after fetching memberships:
const cookieStore = await cookies();
const activeOrgId = cookieStore.get("active_org_id")?.value;

type OrgShape = { id: string; name: string; slug: string; is_workspace: boolean };

const allOrgs = (memberships ?? []).map(
  (m) => m.organizations as unknown as OrgShape
).filter(Boolean);

let selectedOrg: OrgShape | null = null;

if (activeOrgId) {
  selectedOrg = allOrgs.find((o) => o.id === activeOrgId) ?? null;
}
if (!selectedOrg) {
  selectedOrg = allOrgs.find((o) => !o.is_workspace) ?? allOrgs[0] ?? null;
}

organization = selectedOrg;
// fetch events for selectedOrg as before

// Pass allOrgs to Sidebar:
<Sidebar
  organization={organization}
  organizations={allOrgs}
  events={events}
  userInitials={getInitials(displayName)}
  userEmail={userEmail}
/>
```

### 3. Update `src/components/sidebar.tsx`

a. Add `organizations` to `SidebarProps`.

b. In the org header section (currently lines 90–97), render an org switcher when `organizations.length > 1`. Clicking an org item calls `setActiveOrg(org.id)` and navigates to `"/"` via `window.location.href = "/"`.

New org header section:

```tsx
import { setActiveOrg } from "@/app/actions/org-context";

interface SidebarProps {
  organization: { id: string; name: string; slug: string; is_workspace: boolean } | null;
  organizations: { id: string; name: string; slug: string; is_workspace: boolean }[];
  events: Pick<Event, "id" | "name" | "slug" | "status">[];
  userInitials: string;
  userEmail: string;
}

// In the org header area, replace the static div with:
{organizations.length > 1 ? (
  <OrgSwitcher
    current={organization}
    organizations={organizations}
  />
) : (
  <div className="flex flex-col justify-center px-3 h-14 border-b border-white/[0.06] shrink-0">
    <p className="text-sm font-semibold text-white truncate leading-tight">
      {organization?.name ?? "Event Platform"}
    </p>
    <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5 font-mono uppercase tracking-wider">
      {organization?.is_workspace ? "My Workspace" : "Organization"}
    </p>
  </div>
)}
```

`OrgSwitcher` is a small inline component (same file) that renders a dropdown (use a `<details>` element or Radix `DropdownMenu`) listing all orgs. On click:

```tsx
async function handleSwitch(orgId: string) {
  await setActiveOrg(orgId);
  window.location.href = "/";
}
```

Keep the switcher visually consistent: same height (h-14), same px-3 padding, same border-b. Show a small chevron icon next to the org name when multiple orgs exist.

### 4. Update `src/app/actions/invites.ts` — `consumeInviteToken`

After the successful `revalidatePath` calls, set the active org cookie so the redirect lands on the new org:

```ts
import { cookies } from "next/headers";

// inside consumeInviteToken, after revalidatePath calls:
if (result.organizationId) {
  const cookieStore = await cookies();
  cookieStore.set("active_org_id", result.organizationId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
```

## Test Scenarios

**Happy path — new user accepts org invite:**
- New user signs up via invite link → completes onboarding → arrives at dashboard
- Sidebar shows the invited org name and its events (not the personal workspace)

**Happy path — existing user accepts org invite:**
- Existing user (already member of org A) opens invite link for org B
- Clicks "Accept & Join" → redirected to `/`
- Sidebar shows org B name
- Chevron/dropdown on org name shows both org A and org B
- Clicking org A in the dropdown switches to org A's context

**Org switching:**
- User in org B clicks org A in the dropdown
- Page reloads with org A's name and events in sidebar
- Cookie now holds org A's ID
- Refreshing the page still shows org A

**Single-org user (no switcher shown):**
- User with only personal workspace sees no dropdown, no chevron
- Sidebar shows workspace name as before — no regression

**Cookie stale / org removed:**
- `active_org_id` cookie points to an org the user is no longer a member of
- Layout falls back to first non-workspace org (the `find()` fallback)
- No crash, no blank sidebar

**RLS:**
- Calling `setActiveOrg` with an org ID the user doesn't belong to should not grant access — the layout only shows orgs from the user's real membership query, so the cookie value is ignored if it doesn't match a membership row

## Constraints

- Do NOT restructure routing to be org-slug-based (e.g., `/org/[orgSlug]/...`) — that is a much larger refactor
- Do NOT use `router.push()` for the org switch — use `window.location.href = "/"` for a full reload so the server re-renders with the updated cookie (consistent with auth pattern in this codebase)
- Do NOT modify `proxy.ts` (middleware)
- Do NOT modify any event or component pages — changes are limited to the dashboard layout, sidebar, invites action, and the new org-context action
- The `OrgSwitcher` sub-component should be declared inline in `sidebar.tsx` (no new file)
- Use `ChevronDown` from `lucide-react` for the dropdown indicator

## Technical Notes

- `cookies()` from `next/headers` is async in Next.js 16 — always `await cookies()`
- The Supabase SSR client also calls `cookies()` internally; calling `await cookies()` again in the same server action is fine — Next.js deduplicates the `cookies()` call
- `setActiveOrg` must call `revalidatePath("/")` so the dashboard layout re-renders server-side on next navigation after a switch
- The cookie does NOT need to be `httpOnly: true` since it only holds a non-sensitive org ID (UUID), but the layout never trusts it for access — it only uses it for display preference

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

### Evaluator Report

### Coder Revision Report

### Documentation Report

### Coordinator Summary

### PR Feedback Summary
