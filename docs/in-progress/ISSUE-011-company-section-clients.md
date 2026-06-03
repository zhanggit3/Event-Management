# ISSUE-011: Company section + Collaborators › Clients

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #011

> **Umbrella note:** "Company" spans four issues. [[ISSUE-014]] (build FIRST) owns the **sidebar redesign**: the Company rail icon AND the contextual second-panel nav (Collaborators › Clients; Library › Templates, My Items). This issue (011) builds the **Clients** content at `/company`. [[ISSUE-012]] adds Templates; [[ISSUE-013]] adds My Items.
>
> **Changed by [[ISSUE-014]]:** 011 no longer edits `sidebar.tsx` and no longer renders an in-page section nav — the section nav is the sidebar's contextual panel (built in 014). The `/company` page just renders the Clients view in the main content area.

> **Layout (verified against the reference screenshot — Houzz Pro `/settings/clients`):** Left **icon rail** with the Company building icon active and a **secondary panel** headed "Company" listing **Collaborators** (Clients) and **Library** (Templates, My Items) — **both the rail icon and that panel are built in [[ISSUE-014]], not here.** This issue builds only the **main content area**: title "Clients" at top-left; at top-right an **"Add Client"** button (dark/solid); directly under the title a **search box**; below that the **table** with sortable column headers. Render in the app's existing dark theme (the screenshot is light/Houzz — match arrangement, not its colors).
>
> Deliberately **excluded** (per product decision, may come later): the "Leads" column, the "Type / All Clients" filter dropdowns, the "Categories" Library item, the "Actions" bulk menu, and row checkboxes / multi-select.

## Problem

There is no company-level home in the app. Users need a top-level "Company" section, reachable from the sidebar at any time, that holds org-wide collaborators and a library. This issue delivers the section shell and its first feature: a **Clients** directory — a table of the organization's clients with name, company, email, phone, projects, and date added, plus an "Add Client" action.

## Acceptance Criteria

- [ ] `/company` renders inside the authenticated dashboard layout (the rail + Company panel from [[ISSUE-014]] are visible). Unauthenticated users are redirected to `/login`. (The Company rail icon and the Collaborators/Library panel nav are NOT built here — they belong to [[ISSUE-014]].)
- [ ] The `/company` route renders the **Clients** view as its main content (Clients is the default Company landing).
- [ ] The Clients view shows a table with exactly these columns, in order: **Client Name, Company Name, Email, Phone, Projects, Date Added**. (No "Leads" column — deferred.)
- [ ] Each column header is **sortable** (click to toggle asc/desc, client-side over the loaded rows).
- [ ] A **search box** sits under the "Clients" title and filters the loaded rows client-side by Client Name, Company Name, and Email (case-insensitive substring).
- [ ] An **Add Client** button sits at the top-right of the Clients view. Clicking it opens a dialog with fields: Client Name (required), Company Name, Email, Phone.
- [ ] Submitting the dialog inserts a client scoped to the current organization and the new row appears in the table without a full reload.
- [ ] The "Date Added" cell shows the formatted `created_at` (e.g. "Aug 8, 2025"). The "Projects" cell shows a placeholder (`—`) — event linkage is deferred to a later issue.
- [ ] Each client row has a delete affordance (org admins only) that removes the client after a confirmation.
- [ ] When the org has no clients, the table area shows an empty state with a call to add the first client.

## Affected Files

**Create:**
- `src/app/(dashboard)/company/page.tsx` — server component: resolve the active org, fetch clients, render the Clients view directly.
- `src/app/(dashboard)/company/clients-view.tsx` — `"use client"` component: the clients table + local state (search/sort/rows).
- `src/components/add-client-dialog.tsx` — `"use client"` dialog/form to add a client (mirrors `add-member-dialog.tsx`).
- `src/app/actions/clients.ts` — server actions: `addClient`, `deleteClient` (+ exported `getClients` query helper if preferred).
- `supabase/migrations/20260603000000_clients.sql` — `clients` table + RLS.

> **Do NOT edit `sidebar.tsx`** and do NOT create a `company-shell.tsx` section-nav component — the Company rail icon and the Collaborators/Library panel nav are owned by [[ISSUE-014]]. If 011 is implemented before 014 merges, a temporary `company/page.tsx` placeholder may already exist from 014; replace it with the real Clients view.

**Read-only context (do not modify):**
- `src/app/(dashboard)/settings/page.tsx` — the canonical "resolve the current org for an org-level page" pattern (copied below).
- `src/components/add-member-dialog.tsx` — the dialog + form + `router.refresh()` pattern (copied below).
- `src/types/database.ts` — add a `Client` type here (see below).

## Relevant Code Context

### Org resolution for an org-level page (from `settings/page.tsx`)

The Company page is org-scoped. Resolve the org exactly like Settings does — prefer a real (non-workspace) org, fall back to the personal workspace org:

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");

const { data: memberships } = await supabase
  .from("organization_members")
  .select("organization_id, role, organizations(id, name, slug, is_workspace)")
  .eq("user_id", user.id)
  .order("created_at", { ascending: true });

if (!memberships || memberships.length === 0) redirect("/");

const nonWorkspaceMembership = memberships.find(
  (m) => (m.organizations as unknown as { is_workspace: boolean })?.is_workspace === false
);
const firstMembership = nonWorkspaceMembership ?? memberships[0];
const organization = firstMembership.organizations as unknown as { id: string; name: string; slug: string; is_workspace: boolean };
const isAdmin = firstMembership.role === "owner" || firstMembership.role === "admin";
```

### Dialog + form pattern (from `add-member-dialog.tsx`)

Reuse these exact shared classes and structure for `add-client-dialog.tsx`:

```tsx
const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";
```

```tsx
// state → FormData → action → router.refresh()
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!clientName.trim()) return;
  setLoading(true);
  setError(null);
  const formData = new FormData();
  formData.set("organization_id", organizationId);
  formData.set("client_name", clientName.trim());
  formData.set("company_name", companyName.trim());
  formData.set("email", email.trim());
  formData.set("phone", phone.trim());
  const result = await addClient(formData);
  if (result?.error) setError(result.error);
  else { handleClose(); router.refresh(); }
  setLoading(false);
}
```

The primary button styling used across the app:
```tsx
className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
```

### Server action pattern (canonical, from `tasks.ts`)

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addClient(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // ... insert ...
  if (error) return { error: error.message };
  revalidatePath("/company");
  return { data };
}
```

### `formatDate` helper

`formatDate` already exists in `@/lib/utils` and is used elsewhere for `created_at`. Use it for the "Date Added" cell.

### RLS helpers (already defined in earlier migrations — do NOT redefine)

`public.is_org_member(org_id uuid)` and `public.is_org_admin(org_id uuid)` are `security definer` functions that check `organization_members`. Reuse them.

## Implementation Steps

1. **Migration** `supabase/migrations/20260603000000_clients.sql`:

   ```sql
   create table public.clients (
     id uuid primary key default gen_random_uuid(),
     organization_id uuid not null references public.organizations(id) on delete cascade,
     client_name text not null,
     company_name text,
     email text,
     phone text,
     created_by uuid references public.profiles(id) on delete set null,
     created_at timestamptz not null default now()
   );

   create index clients_org_idx on public.clients(organization_id, created_at desc);

   alter table public.clients enable row level security;

   create policy "Org members can view clients"
     on public.clients for select
     using (public.is_org_member(organization_id));

   create policy "Org members can insert clients"
     on public.clients for insert
     with check (public.is_org_member(organization_id));

   create policy "Org members can update clients"
     on public.clients for update
     using (public.is_org_member(organization_id));

   create policy "Org admins can delete clients"
     on public.clients for delete
     using (public.is_org_admin(organization_id));
   ```

2. **Type** — add to `src/types/database.ts`:

   ```ts
   export interface Client {
     id: string;
     organization_id: string;
     client_name: string;
     company_name: string | null;
     email: string | null;
     phone: string | null;
     created_by: string | null;
     created_at: string;
   }
   ```

3. **Server actions** `src/app/actions/clients.ts`:
   - `addClient(formData)`: read `organization_id`, `client_name`, `company_name`, `email`, `phone`. Validate `client_name` non-empty. **Re-verify membership server-side** (`organization_members` row for `user.id` + `organization_id`) — never trust the client-supplied org id. Insert `{ organization_id, client_name, company_name || null, email || null, phone || null, created_by: user.id }`, `.select().single()`. `revalidatePath("/company")`. Return `{ data }`.
   - `deleteClient(clientId)`: delete by id (RLS enforces admin-only). `revalidatePath("/company")`. Return `{ success: true }` or `{ error }`.

4. **Page** `src/app/(dashboard)/company/page.tsx` (server): resolve org (snippet above); fetch `clients` for `organization.id` ordered `created_at desc`; render `<ClientsView organizationId={...} isAdmin={...} clients={...} />` directly. Header wrapper styling should match other pages (e.g. `px-8 py-8`).

5. **Clients view** `clients-view.tsx` (client): holds `useState` copy of `clients`, plus `search` string and `sort` state (`{ key, dir }`). Header row: title "Clients" + `<AddClientDialog organizationId=... onAdded={(c) => setClients(prev => [c, ...prev])} />` at top-right. Under the title, a search `<input>` (uses the shared `inputClass`) bound to `search`. Render an HTML `<table>` styled with Tailwind (there is **no** shadcn Table primitive — build a plain table). Columns: Client Name, Company Name, Email, Phone, Projects (`—`), Date Added (`formatDate(created_at)`). Empty cells render `—`. Derive the displayed rows by filtering on `search` (case-insensitive substring over client_name/company_name/email) then sorting by `sort` — do not mutate the source array. Each column header is a button that toggles `sort` (asc/desc) and shows a chevron indicator. If `isAdmin`, each row shows a trash button calling `deleteClient` then removing the row from local state. Empty state when there are no clients; "no results" state when the search filters everything out.

6. **Add Client dialog** `src/components/add-client-dialog.tsx`: clone `add-member-dialog.tsx` structure; fields Client Name (required, autoFocus), Company Name, Email (type email), Phone. On success, call `onAdded(result.data)` and close (use the returned row rather than only `router.refresh()` so the table updates instantly).

## Test Scenarios

**Happy path:**
- Navigate to `/company` (via the Company rail icon from [[ISSUE-014]]) → Clients table renders (or empty state). Click Add Client, enter "Acme Corp" / "Acme Inc" / email / phone → submit → row appears at top with today's date in Date Added and `—` under Projects.

**Edge cases:**
- Add Client with only Client Name filled → succeeds; Company/Email/Phone cells show `—`.
- Org with zero clients → empty state with "Add your first client" affordance.
- Type text in the search box that matches no client → "no results" state; clearing the box restores all rows.
- Click the "Client Name" header → rows sort A→Z; click again → Z→A; the indicator chevron flips. Sorting and searching compose (filter then sort).
- Long company names / many rows → table scrolls without breaking the layout.

**Error cases:**
- Submit with blank Client Name → dialog blocks submit (button disabled) and does not call the action.
- Action returns an error → red error banner inside the dialog; dialog stays open.

**RLS:**
- An org member CAN view and insert clients for their org.
- A user who is NOT a member of the org CANNOT read or insert that org's clients (membership re-checked server-side in `addClient`; SELECT/INSERT gated by `is_org_member`).
- A non-admin member CANNOT delete clients (delete gated by `is_org_admin`); the delete affordance is hidden for them.

## Constraints

- Do NOT add event linkage or compute the Projects count in this issue — render `—`. (Deferred per product decision.)
- Do NOT add a "Leads" column, the "Type / All Clients" filter dropdowns, a "Categories" Library item, an "Actions" bulk menu, or row checkboxes / multi-select. These appear in the reference screenshot but are explicitly out of scope for this issue.
- Search and sort are **client-side only** over the already-loaded rows — do not add server-side query params or pagination.
- Do NOT create `src/middleware.ts`. Auth redirects are handled by `src/proxy.ts`.
- Do NOT build a generic shadcn Table primitive; use a plain styled `<table>`.
- Follow the existing dark theme tokens (`bg-white/[0.06]`, `border-white/10`, indigo/violet accents). Do not reintroduce old brutalist classes.
- Re-derive/verify the organization server-side in `addClient`; never trust a client-supplied `organization_id` for authorization.
- Keep the page server component thin; put all interactivity in the `"use client"` children.

## Technical Notes

- `gen_random_uuid()` is available (used by `20260529000001_notifications.sql`); no `uuid-ossp` needed.
- A solo user with only a personal workspace will scope clients to their workspace org — acceptable. The Company section is per-org; multi-org switching is out of scope here (resolve one org as Settings does).
- The page reads via the anon key under RLS (no service-role key in this project).

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `supabase/migrations/20260603000000_clients.sql` — `clients` table + 4 RLS policies (member view/insert/update, admin delete). **Applied to the live DB** via `apply_migration` (verified `clients` didn't exist and `is_org_member`/`is_org_admin` do).
- `src/app/actions/clients.ts` — `addClient` (validates name, re-verifies org membership server-side, inserts with `created_by`, returns the row) and `deleteClient` (RLS-gated admin delete).
- `src/app/(dashboard)/company/clients-view.tsx` — `"use client"` table: local `useState` rows, client-side search (name/company/email), client-side sortable headers, admin-only two-click delete, empty + no-results states.
- `src/components/add-client-dialog.tsx` — `"use client"` dialog (Client Name required + autofocus, Company Name, Email, Phone); on success calls `onAdded(row)` for instant insert.

**Files modified:**
- `src/types/database.ts` — added `Client` interface.
- `src/app/(dashboard)/company/page.tsx` — replaced the ISSUE-014 "Coming soon" placeholder with the real server page (resolves org Settings-style, fetches clients, renders `<ClientsView>`).
- `src/app/(dashboard)/company/templates/template-editor.tsx` — **fix unrelated to 011's scope but required for a green build:** a latent type error from ISSUE-012 (`"error" in result && result.error` didn't narrow `result` to the success type) surfaced once the new files forced a fuller TS recheck. Changed the guard to `if ("error" in result)`, which narrows cleanly. (Was masked by incremental TS caching during 012.)

**What was implemented:** the Company › Clients directory per the PRD — table with the 6 specified columns, search, sortable headers, Add Client dialog, admin delete, empty/no-results states; all org-scoped with RLS.

**Decisions not fully specified by the PRD:**
1. **"Projects" header is not a sort button.** It's a deferred placeholder rendering `—` for every row, so sorting it is a visible no-op; I render it as a plain header and made the 5 data-backed columns sortable. (AC says "each column header is sortable" — flagging this as a deliberate, minor deviation since there's no underlying field.)
2. **Delete uses a two-click inline confirm** (Delete/Cancel) in a trailing actions cell shown only to admins — consistent with the templates manager pattern; the 6 data columns are unchanged.
3. Org resolution is Settings-style (prefer non-workspace, fall back to workspace) exactly as the PRD specifies. Note: this can resolve to a different org than the user's active workspace if they belong to multiple orgs (same single-org limitation discussed for the Company section). Display + Add use the same resolved org, so they're always consistent.

**Verification (no test runner — gate is types/build/lint, as with ISSUE-012/014):**
- `npx tsc --noEmit` → **exit 0, clean**.
- `npm run build` → **✓ Compiled, ✓ Finished TypeScript, ✓ all 18 pages generated**; `/company` builds.
- `npm run lint` → all authored/edited files **clean** (pre-existing baseline in untouched files unchanged).
- Dev server: `/company` compiles and auth-gates (unauth → `/login`).
- Behavioral Test Scenarios documented for manual verification.

**Concerns/assumptions:** migration applied to live project `sljvlxipnlkqruxlqdsf` (additive new table, reversible via `drop table`). The template-editor fix touches a file outside 011's Affected Files but was necessary to unbreak the build (latent 012 defect).

### Evaluator Report

### Coder Revision Report

The evaluator found **0 Critical, 0 Medium** — verdict "ship it." No required fixes. All findings were 🔵 Low, several of which the evaluator itself confirmed as non-issues (correct `colSpan`, correct ISO-string date sort, correct empty-vs-no-results gating, intentional `onAdded` over `router.refresh`).

**Low items reviewed:**
- **Redundant delete guard** (`"error" in result && result.error`): attempted the evaluator's suggested simplification to `if ("error" in result)`, but it reintroduced a TS narrowing error (`string | undefined` not assignable to `setError`). The `&& result.error` is load-bearing for the type checker here, so I **kept the original form** — it is correct and compiles.
- **`created_at` sort via `localeCompare` on the ISO string** — left as-is; ISO-8601 sorts lexicographically equal to chronological order, so it's correct. Not worth a date-parse rewrite.
- **Dialog omits `router.refresh()`** — intentional per the PRD (uses the returned row for instant insert; the action still `revalidatePath`s). No change.

**Test results after revisions:** `npx tsc --noEmit` → exit 0; `npm run build` → ✓ Compiled, ✓ Finished TypeScript; `npm run lint` → touched files clean.

### Documentation Report

**No doc changes needed.** No new environment variables, commands, or setup steps (`npm run dev/build/start/lint` unchanged). README is the stock Next.js template with no feature/route docs to update. Per the Documenter rules, README/CLAUDE.md/other docs were left untouched.

**Operational note:** the migration `supabase/migrations/20260603000000_clients.sql` (new `clients` table + RLS) was applied to the live project `sljvlxipnlkqruxlqdsf` during implementation; a fresh environment picks it up via the normal migration flow. Additive and reversible (`drop table public.clients`).

PRD status updated to **In Review**.

### Coordinator Summary

**Acceptance Criteria:**
- ✅ `/company` renders ClientsView in the dashboard layout; unauth → `/login` (gated by `proxy.ts` + page redirect).
- ✅ Renders Clients as the default Company content.
- ✅ Exact 6 columns in order: Client Name, Company Name, Email, Phone, Projects, Date Added.
- ✅ Column headers sortable client-side (the 5 data-backed columns; Projects is a `—` placeholder rendered as a plain header — documented deviation).
- ✅ Search box filters name/company/email (case-insensitive substring).
- ✅ Add Client dialog with Client Name (required), Company Name, Email, Phone.
- ✅ Insert appears without a full reload (returned row prepended to local state).
- ✅ Date Added formatted; Projects = `—`.
- ✅ Admin-only delete with two-click confirm; hidden for non-admins (UI) + RLS-enforced.
- ✅ Empty state (no clients) + separate no-results state (search matches nothing).

**Evaluator findings:** 0 Critical, 0 Medium, several Low (most confirmed non-issues). Nothing required fixing; one Low cleanup was attempted and reverted because it broke TS narrowing.

**Tests / verification:** No test runner exists; gate is `tsc --noEmit` (exit 0), `next build` (✓ compiled, ✓ TypeScript, all 18 pages, `/company` builds), `npm run lint` (touched files clean). Live RLS policies verified by the evaluator (member view/insert/update, admin delete; cross-org access blocked). Dev server confirms `/company` compiles and is auth-gated.

**Remaining concerns:**
1. Behavioral scenarios are verified by code + build, not an automated runtime test — a quick manual pass is recommended (add/search/sort/delete).
2. "Projects" is a deferred `—` placeholder and its header isn't sortable (no backing field) — a minor, documented deviation from "every column sortable."
3. Single-org resolution (Settings-style) — clients scope to one resolved org; display + add use the same org so they're consistent, but a multi-org user has no org switcher (out of scope, matches the PRD).
4. A latent ISSUE-012 type error in `template-editor.tsx` was fixed here (one-line guard) to keep the build green — verified correct by the evaluator.

**Verdict: READY FOR REVIEW.**

All ten Acceptance Criteria are met, the evaluator found zero Critical/Medium issues and explicitly endorsed shipping, and the build/type-check/lint are all green with the new `clients` table + RLS verified live. The implementation faithfully follows the PRD and the established `add-member-dialog`/Settings patterns, keeps the server component thin, re-verifies org membership server-side, and respects every constraint (no sidebar/middleware edits, plain table, client-side search/sort, dark theme). The only thing before "done" is a human manual pass, expected for a UI feature with no test harness.

### PR Feedback Summary

**Post-implementation adjustments (manual testing):**

1. **Add a "Projects" value** — per user request, Projects is now a simple free-text field (not deferred). Added `clients.projects text` (migration `20260603000003`), added it to the add/edit dialog and the table cell (`projects || "—"`). `addClient`/`updateClient` persist it.
2. **Search bar icon overlap** — removed the magnifying-glass icon and changed the placeholder to "Search Clients" (`clients-view.tsx`).
3. **Couldn't edit/delete a client** — root cause: the page resolves to the user's non-workspace org (Settings-style), where the user (admin_a) is only a *member*, so the admin-only delete was hidden/blocked and there was no edit UI. Fixes:
   - Added an **Edit** dialog (refactored the dialog into a controlled `client-dialog.tsx` supporting add + edit; removed `add-client-dialog.tsx`).
   - Changed the UPDATE/DELETE RLS to `is_org_admin(organization_id) OR created_by = auth.uid()` so a **creator can manage their own client** even as a non-admin member. UI now gates edit/delete on `canManage = isAdmin || created_by === currentUserId` (page passes `currentUserId`).
   - Added `updateClient` server action.

Verified: `tsc --noEmit` clean, `next build` ✓, touched files lint-clean; live policies confirmed (`UPDATE`/`DELETE` now admin-or-creator) and `clients.projects` column present.

**Note (unchanged behavior):** the page still resolves a single org (Settings-style, prefers non-workspace). For a user who owns their workspace but is a member of another org, clients land in that other org. Creator-based management mitigates the impact; a per-org switcher remains out of scope.
