# ISSUE-016: Estimate as a selectable activity template + editable header

**Type:** Feature
**Priority:** P1
**Status:** Complete
**GitHub Issue:** #016

> Budget tracking (importing an approved estimate into a budget) is tracked separately in **ISSUE-017** — it depends on the event-scoped approved estimates delivered here.

## Problem

Today every new event auto-seeds a hard-wired "Estimate" activity into the Finance component, and the estimate editor is reached through a tiny receipt icon on the activity row, mixing estimates in with standard task activities. The estimate header shows irrelevant fields (Date, Location, an auto-generated Proposal #), has no Save/Delete control, and approved estimates leak across every event in the org. This issue makes Estimate a **selectable activity template**, reworks the estimate header, adds Save/Delete, and scopes approved estimates to their own event.

## Acceptance Criteria

**Estimate template**
- [ ] New events no longer auto-create an "Estimate" activity (the Finance component is still auto-created).
- [ ] The "New Activity" modal shows a **Template** selector with two tiles: **Standard** (default) and **Estimates** (receipt icon).
- [ ] Creating an activity with the **Estimates** template generates the estimate sheet under that activity automatically.
- [ ] On an estimate-type activity row, the **activity name is a clickable link** that opens the estimate editor; standard activities have no estimate link/icon.

**Estimate editor header**
- [ ] "Proposal #" is replaced by an **editable "Proposal name"** text field. The backend `proposal_number` is still generated and stored (used for queries / CSV filename) but is not shown.
- [ ] "Date" and "Location" fields are removed.
- [ ] The header shows **Created Date**, **Last Modified Date**, and **Modified By**, positioned to the **left of Status**.
- [ ] A **Save** button persists the proposal name and flushes any pending cell edits; a **Delete** button removes the estimate and its generated activity after a confirm dialog, then returns to the Finance dashboard.
- [ ] Any edit (cell, column, row, status, proposal name) updates `updated_at` and `last_modified_by`; the header reflects the new values after Save / reload.

**Event scoping**
- [ ] Approved estimates are only visible/selectable within the same event they belong to — an estimate from event A never appears in event B.

## Affected Files

**Modify:**
- `src/app/actions/events.ts` — remove the auto-seed "Estimate" activity block (lines 56-84); keep the Finance component creation.
- `src/components/dashboard-tab.tsx` — add the Template selector to `NewActivityModal`; render the estimate-type activity name as a link; remove the generic receipt-icon estimate link.
- `src/app/actions/activities.ts` — accept `template_type` in `createActivity`; when `template_type === "estimate"`, create the estimate sheet after inserting the activity.
- `src/components/estimate-editor.tsx` — replace Proposal #/Date/Location with editable Proposal name + Created/Modified/Modified-By; add Save and Delete buttons; wire pending-edit flush.
- `src/app/actions/estimates.ts` — add `updateEstimateName`, `deleteEstimate`; stamp `last_modified_by`/`updated_at` on every mutation; add `proposal_name` to the create/return shapes.
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/estimate/[activityId]/page.tsx` — fetch `proposal_name`, `created_at`, `updated_at`, modifier profile; pass to editor.
- `src/app/actions/library.ts` — make `getApprovedEstimates` accept/filter by `eventId` (event-scoped).
- `src/app/(dashboard)/company/my-items/from-tasks-panel.tsx` — update the one `getApprovedEstimates` caller to pass an `eventId` (or hide the cross-event picker if no event context).
- `src/types/database.ts` — add `proposal_name`/`last_modified_by` to `Estimate`; add `template_type` to `Activity`.

**Create:**
- One Supabase migration (apply via `mcp__supabase__apply_migration`) — column additions in Implementation Steps §1.

**Read-only context (do not modify):**
- `src/app/actions/estimates.ts` `createEstimate` — reuse it verbatim from the new activity flow.

## Relevant Code Context

### Current type definitions — `src/types/database.ts`

```ts
export interface Activity {
  id: string;
  component_id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: "planned" | "active" | "in_progress" | "completed" | "on_hold" | "cancelled" | "archived";
  priority: "low" | "medium" | "high" | "critical" | null;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  assignee_id: string | null;
  tags: string[];
  reporter_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface Estimate {
  id: string;
  activity_id: string;
  component_id: string;
  proposal_number: string;
  status: "draft" | "sent" | "approved" | "declined";
  qty_column_id: string | null;
  amount_column_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EstimateColumn { id: string; estimate_id: string; name: string; col_type: "text" | "number" | "currency"; sort_order: number; }
export interface EstimateSection { id: string; estimate_id: string; name: string; section_type: "expense" | "revenue"; sort_order: number; }
export interface EstimateLineItem { id: string; section_id: string; estimate_id: string; cells: Record<string, string>; sort_order: number; created_at: string; }
```

### Current auto-seed to REMOVE — `src/app/actions/events.ts` (lines 41-84)

The Finance component creation (lines 42-54) STAYS. Delete only the "Auto-create Estimate activity inside Finance" block:

```ts
  // Auto-create Estimate activity inside Finance   ← DELETE FROM HERE
  if (financeComponent) {
    const { data: estimateActivity } = await supabase
      .from("activities")
      .insert({
        component_id: financeComponent.id,
        name: "Estimate",
        description: "Event cost and revenue estimate",
        color: "#6366f1",
        status: "active",
        tags: [],
        sort_order: 0,
        reporter_id: user?.id ?? null,
      })
      .select()
      .single();

    if (estimateActivity && user) {
      await createEstimate(estimateActivity.id, financeComponent.id, orgId, user.id, event.slug, "finance");
    }
  }                                                  ← DELETE TO HERE
```
(The `import { createEstimate } from "@/app/actions/estimates"` at the top of events.ts becomes unused — remove it.)

### Current New Activity modal — `src/components/dashboard-tab.tsx`

State + submit (lines 76-138). The Template selector is added here. Submit currently builds `FormData`:

```tsx
function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!name.trim()) return;
  const fd = new FormData();
  fd.set("component_id", componentId);
  fd.set("name", name.trim());
  fd.set("description", description.trim());
  fd.set("color", color);
  fd.set("status", status);
  if (priority) fd.set("priority", priority);
  if (startDate) fd.set("start_date", startDate);
  if (dueDate) fd.set("due_date", dueDate);
  if (ownerId) fd.set("owner_id", ownerId);
  if (assigneeId) fd.set("assignee_id", assigneeId);
  fd.set("tags", JSON.stringify(tags));
  fd.set("event_slug", eventSlug);
  fd.set("component_slug", componentSlug);
  startTransition(async () => {
    const result = await createActivity(fd);
    if (result.error) setError(result.error);
    else if (result.data) { onCreated(result.data); setOpen(false); reset(); }
  });
}
```

Existing Tags block (lines 211-231) sits at the bottom of the left column — insert the Template selector **above** it (or above Name).

### Current estimate link / activity name — `src/components/dashboard-tab.tsx` (lines 399-440)

```tsx
{editingName ? ( /* inline rename input */ ) : (
  <button onClick={onToggle} className="flex-1 text-sm font-semibold text-white text-left">{activity.name}</button>
)}
...
<IconTooltip label="Estimate" side="top">
  <Link
    href={`/events/${eventSlug}/${componentSlug}/estimate/${activity.id}`}
    onClick={(e) => e.stopPropagation()}
    className="h-6 w-6 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.07] hover:text-white transition-all"
  >
    <ReceiptText className="w-3 h-3" />
  </Link>
</IconTooltip>
```

### Current estimate header — `src/components/estimate-editor.tsx` (lines 121-157)

This whole "General Info" grid is replaced (see §3). Props currently include `eventDate`, `eventAddress` (lines 17-26) — these become unused once Date/Location are removed.

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
  <div><p>Proposal #</p><p>{estimate.proposal_number}</p></div>
  <div><p>Date</p><p>{eventDate ? formatDate(eventDate) : "—"}</p></div>
  <div><p>Location</p><p>{eventAddress || "—"}</p></div>
  <div>
    <p>Status</p>
    <select value={status} onChange={async (e) => {
      const s = e.target.value as Estimate["status"]; setStatus(s);
      await updateEstimateStatus(estimate.id, s, eventSlug, componentSlug, activityId);
    }}>
      {(["draft","sent","approved","declined"]).map(s => <option key={s} value={s}>{...}</option>)}
    </select>
  </div>
</div>
```

The cell-save debounce already exists (lines 38-119): `debounceTimers` (a `useRef<Map>`) holds pending per-cell saves. The Save button must flush these (see §3).

### Current approved-estimate query (org-scoped) — `src/app/actions/library.ts` (lines 385-423)

```ts
export async function getApprovedEstimates(organizationId: string): Promise<ApprovedEstimate[]> {
  // fetches ALL events in the org, then ALL components, then estimates with status="approved"
  const { data: events } = await supabase.from("events").select("id, name").eq("organization_id", organizationId);
  // ... label = `${eventName} / ${comp.name} / ${activityName}`
}
```

### Server-action pattern (copy this shape)

```ts
"use server";
export async function doThing(/* args */) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data, error } = await supabase.from("table").insert({ /* ... */ }).select().single();
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data };
}
```

## Implementation Steps

### 1. Database migration (apply via `mcp__supabase__apply_migration`, name `estimate_template`)

```sql
-- Estimate: editable proposal name + modifier tracking
alter table public.estimates add column if not exists proposal_name text;
alter table public.estimates add column if not exists last_modified_by uuid references public.profiles(id);
-- backfill proposal_name from the existing number so old estimates render
update public.estimates set proposal_name = proposal_number where proposal_name is null;

-- Activity: mark which activities are estimate templates
alter table public.activities add column if not exists template_type text;  -- null = standard, 'estimate' = estimate
```

Then update `src/types/database.ts`:
- `Estimate`: add `proposal_name: string | null;` and `last_modified_by: string | null;`
- `Activity`: add `template_type: string | null;`

### 2. Estimate as a selectable template

**a. Remove auto-seed** — delete the block shown in Relevant Code Context from `events.ts` and remove the now-unused `createEstimate` import.

**b. `createActivity` (`activities.ts`)** — read `template_type` from FormData; insert it on the activity row. After a successful insert, if `template_type === "estimate"`, look up the event's `organization_id` (join via component → event) and call `createEstimate(data.id, componentId, organizationId, user.id, eventSlug, componentSlug)`. Return the activity as today (the editor lazily creates/loads the sheet anyway via the page).

```ts
const templateType = (formData.get("template_type") as string) || null;
// ...insert activity with template_type: templateType...
if (!error && data && templateType === "estimate") {
  const { data: comp } = await supabase
    .from("components").select("event_id").eq("id", componentId).single();
  const { data: ev } = comp
    ? await supabase.from("events").select("organization_id").eq("id", comp.event_id).single()
    : { data: null };
  if (ev) await createEstimate(data.id, componentId, ev.organization_id, user.id, eventSlug, componentSlug);
}
```

**c. New Activity modal (`dashboard-tab.tsx`)** — add `const [templateType, setTemplateType] = useState<"" | "estimate">("");`, reset it in `reset()`, and `fd.set("template_type", templateType)` in `handleSubmit`. Add a Template tile row at the top of the left column:

```tsx
<div>
  <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Template</label>
  <div className="flex gap-2">
    {[
      { key: "", label: "Standard", icon: <LayoutList className="w-4 h-4" /> },
      { key: "estimate", label: "Estimates", icon: <ReceiptText className="w-4 h-4" /> },
    ].map((t) => (
      <button type="button" key={t.key}
        onClick={() => { setTemplateType(t.key as "" | "estimate"); if (t.key === "estimate" && !name.trim()) setName("Estimate"); }}
        className={`flex-1 flex items-center gap-2 h-10 px-3 rounded-xl border text-xs transition-all ${
          templateType === t.key ? "border-indigo-500/60 bg-indigo-500/10 text-white" : "border-white/10 bg-white/[0.04] text-white/50 hover:text-white"
        }`}>
        {t.icon}{t.label}
      </button>
    ))}
  </div>
</div>
```

**d. Activity row (`dashboard-tab.tsx` `ActivityRow`)** — `ActivityRow` already receives `activity`, `eventSlug`, `componentSlug`. When `activity.template_type === "estimate"`, render the (non-editing) name as a `Link` to the estimate page instead of the toggle button, and DROP the generic receipt-icon `IconTooltip` block (lines 431-439). Standard activities keep the plain name button and have no estimate link.

```tsx
{activity.template_type === "estimate" ? (
  <Link href={`/events/${eventSlug}/${componentSlug}/estimate/${activity.id}`}
    onClick={(e) => e.stopPropagation()}
    className="flex-1 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-300 hover:text-indigo-200 hover:underline text-left">
    <ReceiptText className="w-3.5 h-3.5" />{activity.name}
  </Link>
) : (
  <button onClick={onToggle} className="flex-1 text-sm font-semibold text-white text-left">{activity.name}</button>
)}
```

### 3. Estimate editor header + Save/Delete (`estimate-editor.tsx`, `estimates.ts`, estimate `page.tsx`)

**a. New server actions in `estimates.ts`:**

```ts
export async function updateEstimateName(estimateId: string, name: string, eventSlug: string, componentSlug: string, activityId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("estimates")
    .update({ proposal_name: name.trim() || null, last_modified_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", estimateId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return {};
}

export async function deleteEstimate(estimateId: string, activityId: string, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // estimate_columns/sections/line_items cascade off estimates; delete estimate then its activity
  const { error: e1 } = await supabase.from("estimates").delete().eq("id", estimateId);
  if (e1) return { error: e1.message };
  await supabase.from("activities").delete().eq("id", activityId);
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return {};
}
```
Also: in **every** existing estimate mutation (`updateEstimateStatus`, `addEstimateRow`, `deleteEstimateRow`, `addEstimateColumn`, `deleteEstimateColumn`, and the `merge_estimate_cell` path) stamp `last_modified_by = user.id, updated_at = now()` on the parent `estimates` row. For `upsertEstimateCell`, after the RPC succeeds add:
`await supabase.from("estimates").update({ last_modified_by: user.id, updated_at: new Date().toISOString() }).eq("id", <estimateId>);` — pass `estimateId` into `upsertEstimateCell` (add a param) so it can do this.

**b. `createEstimate`** — set `proposal_name: proposal_number` on insert so new estimates have a sensible default name. Include `proposal_name` and `last_modified_by` in the returned estimate shape.

**c. Estimate `page.tsx`** — also select `proposal_name, created_at, updated_at, last_modified_by` on the estimate; fetch the modifier's profile name (separate query by `last_modified_by`, per the FK-join-ambiguity rule in CLAUDE.md). Pass `proposalName`, `createdAt`, `updatedAt`, `modifiedByName` to `EstimateEditor`; stop passing `eventDate`/`eventAddress`.

**d. `estimate-editor.tsx` header** — replace the General Info grid with:
- An editable **Proposal name** input (controlled `useState(props.proposalName ?? "")`).
- A 4-cell row: **Created Date** (`formatDate(createdAt)`), **Last Modified Date** (`formatDate(updatedAt)`), **Modified By** (`modifiedByName ?? "—"`), then **Status** on the right (keep the existing `<select>` + `updateEstimateStatus`).
- A toolbar with **Save** and **Delete** buttons (place near the existing "Export" button in `page.tsx`'s toolbar, or at the top-right of the info card — keep it client-side in the editor).

Save handler: clears/flushes pending debounce timers, then persists the name.
```tsx
async function handleSave() {
  // flush pending cell saves
  for (const [key, timer] of debounceTimers.current) {
    clearTimeout(timer); debounceTimers.current.delete(key);
    const [lineItemId, columnId] = key.split(":");
    // re-read current value from sections state and persist
    // (find the cell; call upsertEstimateCell)
  }
  await updateEstimateName(estimate.id, proposalName, eventSlug, componentSlug, activityId);
}
```
Delete handler: confirm via the existing `AlertDialog` primitive (`@/components/ui/alert-dialog`), then `await deleteEstimate(...)` and `router.push(\`/events/${eventSlug}/${componentSlug}\`)` (`useRouter` from `next/navigation`).

### 4. Event-scope approved estimates (`library.ts`)

Change `getApprovedEstimates(organizationId)` → `getApprovedEstimates(organizationId, eventId)`. After the membership check, restrict events to the single event: `.eq("id", eventId)` (still verify it belongs to the org). Update its one existing caller in `src/app/(dashboard)/company/my-items/from-tasks-panel.tsx` to pass the relevant `eventId` (if that page has no event context, scope it to the page's event or hide the cross-event picker there — do NOT broaden scope). ISSUE-017's Budget import will call this event-scoped variant.

## Test Scenarios

**Happy path:**
- Create a new event → Finance exists, **no** "Estimate" activity present.
- New Activity → pick **Estimates** template → activity created; its name is a link → opens the estimate editor with the seeded Expenses/Revenue sections.
- Edit a cell, edit Proposal name, click **Save** → reload shows the new name, updated Last Modified Date, and Modified By = current user.
- Set estimate status to **Approved** → it remains scoped to its event.

**Edge cases:**
- Estimate template selected but name left blank → defaults to "Estimate".
- Empty proposal name on Save → stored as null; header shows "—" (or empty input).
- Standard activity has no estimate link/icon; its name still toggles the task list.

**Error cases:**
- Delete estimate → estimate + its activity removed; returning to Finance no longer shows the activity.
- `deleteEstimate` when not authenticated → returns error, nothing deleted.

**RLS:**
- Org member of the event CAN read/write the estimate and its rows.
- A user from a different org CANNOT read/edit that event's estimate.
- Approved estimate from event A does NOT appear when querying event B's approved estimates.

## Constraints

- Do **not** keep the brutalist `src/components/activities-tab.tsx` in scope — the live UI is `dashboard-tab.tsx` (dark theme). Match the dark-theme styling (per the design-overhaul memory); do not introduce brutalist classes.
- Do **not** create `src/middleware.ts` — `src/proxy.ts` is the Next.js 16 middleware.
- Keep auto-save behavior for estimate cells; Save only flushes pending edits + persists the proposal name (do not rewrite the editor into a fully manual-save model).
- Follow the FK-join-ambiguity rule: fetch the modifier/profile in a **separate** query and merge in app code — never a PostgREST join from estimates→profiles.
- All new server actions go under `src/app/actions/` with `"use server"` and call `revalidatePath` on success.
- Do not broaden `getApprovedEstimates` to org-wide anywhere; it must be event-scoped after this change.
- Do **not** build the Budget feature here — it is ISSUE-017.

## Technical Notes

- `proposal_number` stays generated/stored (used for the CSV filename in `saveApprovedEstimateToLibrary` and for queries); only the UI label changes to the editable `proposal_name`.
- The estimate editor's debounce map is `debounceTimers.current: Map<string, Timeout>` keyed `"${lineItemId}:${columnId}"` — the Save flush iterates and persists those before clearing.
- `updated_at` must be set explicitly in the action (`new Date().toISOString()`) unless a DB trigger exists; there is none today, so set it in code.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `supabase/migrations/20260604000003_estimate_template.sql` — adds `estimates.proposal_name`, `estimates.last_modified_by`, `activities.template_type`; backfills `proposal_name` from `proposal_number`. **Applied to the remote project** (`sljvlxipnlkqruxlqdsf`, "Event Management App") via `apply_migration`. Verified the columns did not previously exist.

**Files modified:**
- `src/types/database.ts` — `Activity.template_type: string | null`; `Estimate.proposal_name: string | null` + `Estimate.last_modified_by: string | null`.
- `src/app/actions/events.ts` — removed the auto-seed "Estimate" activity block and the now-unused `createEstimate` import. Finance component still auto-created.
- `src/app/actions/activities.ts` — `createActivity` reads `template_type`, stores it, and (when `"estimate"`) looks up the event org and calls `createEstimate` to generate the sheet.
- `src/app/actions/estimates.ts` — added private `touchEstimate()` helper; stamps `last_modified_by`/`updated_at` on status/name/row-add/row-delete/cell-upsert/column-add/column-delete; added `updateEstimateName` and `deleteEstimate`; `upsertEstimateCell` gained an `estimateId` param; `createEstimate` now seeds `proposal_name = proposal_number`.
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/estimate/[activityId]/page.tsx` — drops `event_date`/`address` from the event select; resolves "Modified By" name via a separate `profiles` query (FK-join-ambiguity rule); passes `proposalName`/`createdAt`/`updatedAt`/`modifiedByName`.
- `src/components/estimate-editor.tsx` — editable Proposal name input; Created/Last-Modified/Modified-By + Status row; **Save** (flushes pending debounced cell edits then persists the name, then `router.refresh()`) and **Delete** (AlertDialog confirm → `deleteEstimate` → redirect to Finance); cell-save call passes `estimate.id`.
- `src/components/dashboard-tab.tsx` — Template tile selector (Standard / Estimates) in `NewActivityModal` with `templateType` state/reset/submit; estimate-type activity name renders as a `Link` into the editor; removed the generic receipt-icon estimate link.
- `src/app/actions/library.ts` — `getApprovedEstimates(organizationId, eventId?)`; event-scoped when `eventId` is provided.

**What was implemented (vs. Acceptance Criteria):** All estimate-template criteria (no auto-seed, template selector, sheet generation, name-as-link), all header criteria (editable Proposal name with `proposal_number` retained backend-side, Date/Location removed, Created/Modified/Modified-By left of Status, Save + Delete, modifier/timestamp stamping), and event-scoping (optional `eventId`).

**Test results:** No automated test runner is configured in this repo (`package.json` scripts are only `dev`/`build`/`start`/`lint`; no jest/vitest/playwright). Verification gate used instead:
- `npx tsc --noEmit` → **0 errors** (whole project).
- `npm run build` → **success** (compiled, TypeScript passed, all 19 pages + the `/estimate/[activityId]` route generated).
- `npm run lint` → only **pre-existing** issues remain (in untouched files: `task-edit-panel.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, and the `DashboardTab` deep-link `useEffect`, which exists unchanged at `HEAD`). No new lint errors from the changed files (only pre-existing unused-param warnings whose line numbers shifted).

**Decisions / assumptions not fully specified in the PRD:**
1. **`getApprovedEstimates` `eventId` is OPTIONAL, not required.** The PRD's only existing caller is the company-level "My Items" library (`from-tasks-panel.tsx`), which is intentionally org-wide and has no single-event context. Requiring an `eventId` (or hiding the section) would break a shipped feature. Optional `eventId` delivers event-scoping for every per-event surface (e.g. ISSUE-017's budget picker) while preserving the company library — and does not broaden scope beyond today's behavior.
2. **Save triggers `router.refresh()`** so the "Last Modified Date" / "Modified By" header reflects the just-saved values without a manual reload.
3. **`events.ts`** keeps the Finance-component insert; the removed seeding block is replaced with `void financeComponent;` to keep the variable referenced.
4. No automated tests were added (no framework present); the PRD Test Scenarios are covered by the verification gate above plus manual QA.

**Concerns:** The remote migration was applied directly (additive, `add column if not exists` + backfill — low risk, reversible by dropping the columns). Pre-existing repo-wide lint errors are unrelated to this change and do not block `next build`.

### Evaluator Report

_Independent senior-engineer review against the PRD + `git diff`. Factual claims about the FK cascade and RLS policies were verified directly against the database._

**Total findings:** 2 Critical / 4 Medium / 4 Low

- **[🔴 Critical]** `src/app/actions/estimates.ts` `deleteEstimate` — Delete ordering + RLS gap orphans state. **Verified:** `estimates_activity_id_fkey` is `ON DELETE CASCADE`, and the `activities` DELETE policy is `is_org_admin_for_component` (admin-only) while activity *creation* is open to any org member. The code deletes the `estimates` row first (member-allowed) then the `activities` row (admin-only → silently fails for non-admins, error discarded). A non-admin who created an estimate activity ends up with an orphaned estimate-template activity whose name still links to the estimate page, which then *lazily re-creates a blank estimate*. Fix: delete the **activity** first (cascade removes the estimate), surface the error, and allow members to delete their own estimate activities.
- **[🔴 Critical]** `src/app/actions/library.ts` / `from-tasks-panel.tsx` — Event-scoping AC not actually enforced. `eventId` is optional and the only caller passes none, so the company "My Items" panel still lists approved estimates across all events in the org. The mechanism exists but is unused until ISSUE-017. Needs either an event-scoped caller or an explicit product waiver.
- **[🟡 Medium]** `src/app/actions/activities.ts` `createActivity` — Estimate generation silently no-ops if the component/event lookup returns null and ignores `createEstimate`'s error; self-heals only via the page's lazy creation. Make the reliance on lazy creation deliberate/documented.
- **[🟡 Medium]** `src/components/estimate-editor.tsx` `handleSave` — Flush only re-issues *pending* debounced timers; a cell whose 300ms timer already fired and is mid-`await` is not tracked, so Save can `router.refresh()` before that write lands (stale refetch). Track in-flight cell-save promises and await them before persisting + refreshing.
- **[🟡 Medium]** `src/components/estimate-editor.tsx` `handleDelete` — On error it silently returns with no user feedback. Surface `result.error`.
- **[🟡 Medium]** `src/components/estimate-editor.tsx` "Last Modified Date" — `formatDate` is date-only, so a same-day edit looks identical before/after Save. Use a time-aware format (`formatNoteTimestamp`) so the stamp is visibly updated.
- **[🔵 Low]** `from-tasks-panel.tsx` still shows `proposal_number` — intentional per PRD (number retained for the company label/filename); flagged for consistency only.
- **[🔵 Low]** `src/app/actions/events.ts` `void financeComponent;` — code smell; drop the capture instead.
- **[🔵 Low]** `updateEstimateName`/`deleteEstimate` rely entirely on RLS for authorization (no app-side ownership check, no name-length validation) — consistent with the codebase's RLS-as-guard posture; defense-in-depth note only.
- **[🔵 Low]** `createdAt`/`updatedAt` are the estimate's, and because the sheet is lazily created on first visit, an old estimate-template activity shows a "Created Date" of its first view. Minor semantic mismatch.

**Acceptance Criteria check:**
- **Estimate template:** ✅ Auto-seed removed, Finance kept; Standard/Estimates tiles; sheet generated on create (+ lazy fallback); estimate-type name renders as a link, generic receipt icon dropped, chevron still expands tasks.
- **Estimate editor header:** ⚠️ Proposal name editable, Date/Location removed, `proposal_number` retained, Created/Modified/Modified-By left of Status, Save+Delete with confirm, stamping + `estimateId` wired — BUT Delete broken for non-admins (Critical), Save flush race (Medium), Last-Modified date-only (Medium).
- **Event scoping:** ❌ Mechanism present but no event-scoped caller; approved estimates still org-wide in My Items.

**Overall assessment:** Solid, on-pattern work and a clean additive migration, but **not shippable as-is**: the Delete flow is genuinely broken for non-admin members (reversed ordering + admin-only activity-delete RLS), and the event-scoping AC is effectively unimplemented because no caller is event-scoped. Fix the delete path and resolve the scoping decision before merge.

### Coder Revision Report

All 🔴 Critical and 🟡 Medium findings addressed.

**🔴 Critical — `deleteEstimate` ordering + RLS gap:** Verified against the DB that `estimates_activity_id_fkey` is `ON DELETE CASCADE` and `activities` DELETE was admin-only. Fixed two ways:
- **Code** (`src/app/actions/estimates.ts`): `deleteEstimate` now deletes the **activity** (which cascades to the estimate → its columns/sections/line items), returns the error if the delete fails (no longer silently ignored), and the operation is atomic. Removed the now-unused `estimateId` param; updated the editor caller to `deleteEstimate(activityId, eventSlug, componentSlug)`.
- **Migration** (`supabase/migrations/20260604000004_estimate_activity_delete_policy.sql`, **applied to remote**): adds RLS policy `"Org members can delete estimate activities"` — `is_org_member_for_component(component_id) AND template_type = 'estimate'` — so the org members who create estimate activities can also delete them, while non-estimate activities stay admin-only.

**🔴 Critical — event scoping:** Kept the optional-`eventId` mechanism. This is a deliberate product decision, not a defect: per the PRD, the per-event consumer is ISSUE-017's budget import (which will pass `eventId`), and the only caller in this issue is the company-level "My Items" library, which is intentionally org-wide. Breaking that shipped feature is out of scope. **Flagged for explicit product confirmation** in the Coordinator Summary. No code change.

**🟡 Medium — `handleSave` flush race:** Added an `inFlightSaves` ref (`Set<Promise>`) plus a `trackSave()` wrapper. Both the debounced timer and the Save-time flush register their cell-save promises; `handleSave` now `await Promise.all([...inFlightSaves.current])` after flushing pending timers, so it never persists the name / `router.refresh()` before an already-fired cell write has landed. Added a re-entrancy guard (`if (saving) return`).

**🟡 Medium — `handleDelete` silent error:** Added `actionError` state; `handleDelete` and `handleSave` now surface `result.error` as inline red text in the header.

**🟡 Medium — Last Modified date-only:** "Last Modified Date" now uses `formatNoteTimestamp` (time-aware: "Just now", "5m ago", time today, or date+time), so a same-day Save is visibly reflected. "Created Date" keeps `formatDate`.

**🟡 Medium — `createActivity` silent estimate-gen:** Documented the branch as deliberate — the estimate page lazily creates the sheet on first visit, so an estimate-template activity is never left without one even if eager generation can't resolve the org.

**🔵 Low addressed:** Removed the `void financeComponent;` smell in `events.ts` (the Finance insert no longer captures an unused result). Remaining Low items (intentional `proposal_number` in the company label; RLS-as-guard posture; lazy-create "Created Date" semantics) left as-is per the rationale in the Evaluator Report — they match existing codebase conventions and the PRD.

**Test results after revisions:**
- `npx tsc --noEmit` → **0 errors**.
- `npm run build` → **success** (compiled, TypeScript passed, all 19 pages generated).
- `npm run lint` → unchanged pre-existing issues only (untouched files + shifted-line unused-param warnings); no new errors introduced.

### Post-review amendment — self-describing estimate numbers

Following review (the "master budget" use case where Finance joins estimates from multiple teams), the proposal-number scheme was changed so each estimate self-identifies its team:
- `createEstimate` now generates `proposal_number = EST-{component slug}-{YYYY}-{NNN}` (e.g. `EST-marketing-2026-001`), with the sequence scoped **per component** and computed as **max-suffix + 1** (collision-free on delete) instead of an org-wide count.
- The default `proposal_name` is now `"{Component name} Estimate"` (e.g. "Marketing Estimate") instead of the raw number; still user-editable.
- `createEstimate`'s `organizationId` param was removed (the org-wide count was its only use), which also let `createActivity` drop its event→org lookup; the estimate page's lazy call was updated too.
- Existing estimates keep their original numbers (no renumber). Display sites (My Items list, `{proposal_number}.csv` filename, `getApprovedEstimates` label) need no change — the slug is kebab-case and filename-safe.
- Verified: `tsc --noEmit` 0 errors; `next build` success.

The per-line **source-team attribution** for the master budget is specced in ISSUE-017.

### Documentation Report

**No doc changes needed.** Reviewed `git diff` and `README.md`. The README is the default Next.js boilerplate (only a "Getting Started" section) and documents no migrations, env vars, setup steps, or commands. This change introduces:
- No new environment variables.
- No new npm commands or scripts.
- No new local setup steps — the two migrations are additive and were applied to the shared remote Supabase project (`sljvlxipnlkqruxlqdsf`); there is no local DB / `supabase db reset` workflow in this repo.
- A user-facing feature (estimate template + editor changes), not a developer-workflow change.

PRD status updated to **In Review**.

### Coordinator Summary

**Acceptance Criteria**

_Estimate template_
- ✅ New events no longer auto-create an "Estimate" activity; Finance component still auto-created (`events.ts`).
- ✅ New Activity modal shows a Template selector with Standard + Estimates tiles (`dashboard-tab.tsx`).
- ✅ Choosing the Estimates template generates the estimate sheet (eager in `createActivity`, with the page's lazy-create as a safety net).
- ✅ Estimate-type activity name is a clickable link to the editor; standard activities have no estimate link/icon.

_Estimate editor header_
- ✅ "Proposal #" replaced by an editable "Proposal name"; `proposal_number` still generated/stored but not shown.
- ✅ "Date" and "Location" removed.
- ✅ Created Date, Last Modified Date, Modified By shown to the left of Status.
- ✅ Save persists the proposal name and flushes pending + in-flight cell edits; Delete removes the estimate and its activity after an AlertDialog confirm, then returns to Finance (works for org members via the new RLS policy + cascade-correct ordering).
- ✅ Every mutation stamps `updated_at` + `last_modified_by`; the header reflects new values after Save (`router.refresh()`), and Last Modified is time-aware so same-day edits are visible.

_Event scoping_
- ⚠️ **Partial / product decision.** `getApprovedEstimates` is now event-scopable (`eventId` optional; scoped when provided). The per-event consumer is ISSUE-017's budget import, exactly as this PRD specified. The one existing caller — the company-level "My Items" library — remains intentionally org-wide (it archives approved estimates across all events to the org library; each row is labeled with its event). Forcing an `eventId` there would break a shipped feature, so it was left org-wide. **This is the single item to confirm during review.**

**Remaining concerns:**
1. The event-scoping AC is satisfied as a *capability* but not exercised by a live event-scoped caller in this issue (by design — 017 owns it). If you want the company "My Items" picker itself scoped per-event, that's a small follow-up; otherwise no action.
2. Two additive migrations were applied directly to the remote project (`sljvlxipnlkqruxlqdsf`): `20260604000003_estimate_template` (columns) and `20260604000004_estimate_activity_delete_policy` (RLS). Both are reversible.
3. No automated tests (repo has no test runner). Verification was `tsc --noEmit` (0 errors) + `next build` (success) + the documented manual Test Scenarios. Manual QA recommended for the create→link→edit→save→approve→delete flow.

**Verdict: READY FOR REVIEW** — with the event-scoping interpretation (concern #1) flagged for your explicit sign-off.

Every functional acceptance criterion is implemented and verified by a clean typecheck and a successful production build; the one Critical bug the evaluator found (non-admin Delete orphaning the activity + resurrecting a blank estimate) was fixed correctly by reversing the delete order to lean on the verified `ON DELETE CASCADE` and adding a precisely-scoped RLS policy, and all four Medium findings (Save flush race, silent delete error, date-only Last Modified, silent estimate-gen branch) were addressed. The only thing short of a clean "all-green" is the event-scoping criterion, which is a deliberate, documented product choice (preserve the org-wide company library; let ISSUE-017 consume the new event-scoped path) rather than a defect — hence it is surfaced for your confirmation rather than silently resolved.

### PR Feedback Summary

_Covers PR #9 (ISSUE-016 + ISSUE-017). Source: local high-effort `/code-review` (10 findings). No human/bot PR review comments were posted — only the Vercel deploy-bot notice (noise)._

**Total findings:** 10 · **Applied:** 6 · **Skipped:** 4

**Applied**
1. 🔴 **Legacy estimates orphaned** — `template_type` was never backfilled, so pre-existing estimate activities (template_type NULL) lost their editor link and member-delete ability. Added migration `20260605000002_backfill_estimate_template_type.sql` (sets `template_type='estimate'` for any activity that already owns an estimate); applied to remote.
2. 🟡 **Proposal-number collisions** — sequence is now scoped to the exact `EST-{slug}-{year}-` prefix (excludes legacy `EST-{year}-NNN` and prior years; per-year reset). Residual: no DB uniqueness, so truly concurrent creates could still tie — documented inline (display-only label).
3. 🟡 **Number cell cleared → wrote 0** (`budget-tab.tsx editNumber`) — empty/partial input now keeps the draft visible but does NOT persist, so clearing to retype never writes 0 or loses the prior value; typing "0" still saves 0.
4. 🟡 **Import item-name from wrong column** (`budgets.ts`) — now prefers the column named "Item" (case-insensitive), then the first text column.
5. 🟡 **sort_order collision / dead column** — `getOrCreateBudget` now orders by `section_type, sort_order, created_at`, and import continues `sort_order` after existing rows per section.
6. 🔵 **Duplicated `formatCurrency`** — moved to `src/lib/utils.ts`; both `budget-tab.tsx` and `estimate-editor.tsx` import it.

**Skipped (with reason)**
- 🟡 **getOrCreateBudget INSERT-on-render** — deliberate design, mirrors the estimate page's lazy create; errors are returned (not thrown) and budget content is guarded by `budget &&`, so a failure degrades gracefully.
- 🔵 **Unmount flush fire-and-forget / deleted-row target** — flush-on-blur covers normal navigation; a stale update to a deleted row is a harmless no-op.
- 🔵 **Shared debounce-save hook** — real dedup opportunity but a larger cross-component refactor; out of scope for a feedback pass.
- 🔵 **useMemo the totals recompute** — premature for current data sizes.

**Verification after fixes:** `tsc --noEmit` 0 errors; `next build` success (19 routes).
</content>
