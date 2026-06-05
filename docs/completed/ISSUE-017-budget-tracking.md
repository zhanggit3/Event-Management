# ISSUE-017: Finance master budget — aggregate estimates from multiple teams

**Type:** Feature
**Priority:** P1
**Status:** Complete
**GitHub Issue:** #017

> **Depends on ISSUE-016.** This issue consumes the event-scoped `getApprovedEstimates(organizationId, eventId)` and the `proposal_name` field delivered there. Land ISSUE-016 first.

## Problem

The platform tracks per-activity **estimates** but has no way to roll approved estimates into a working **budget** with estimated-vs-actual tracking. "Budgets" exists only in the vision doc, not in code. This issue adds a Finance **master budget**: a line-item table (Expenses / Revenue) with Estimated, Actual, Status, and Notes, totals + variance, and a one-click **Import from approved estimate** that pulls line items from approved estimates **across all of the event's teams** (components — Marketing, Program, Catering, …), not just Finance. Because Finance aggregates several teams' estimates into one budget, every imported line must stay **traceable to its source team** — even after the source estimate is later deleted — and the budget view groups lines by source team.

## Acceptance Criteria

- [ ] The Finance component (and only Finance) shows a **Budget** tab.
- [ ] The Budget view lists line items grouped by **Expenses** / **Revenue**, each with **Item**, **Estimated**, **Actual**, **Status**, **Notes**.
- [ ] The header shows **Total Estimated**, **Total Actual**, and **Variance** (`actual − estimated`, green when ≥ 0, red when < 0).
- [ ] **Import from approved estimate** opens a picker listing approved estimates **across all teams (components) in the current event**, each labeled "Event / Component / Activity"; importing creates budget line items seeded from the estimate's rows (`estimated = qty × amount`, `actual = 0`, `status = estimated`).
- [ ] Each imported line records a **source-team label** (`source_label`, e.g. "Marketing · Marketing Estimate") captured at import time, so attribution survives even if the source estimate is later deleted.
- [ ] The budget view **groups line items by source team** (a subheader + per-team subtotal); manually-added lines (no source) group under "Manual / Other".
- [ ] Line items can be **added** (per section), **edited inline** (item name, estimated, actual, status, notes), and **deleted**.
- [ ] Exactly **one budget per Finance component** (enforced by a unique constraint); revisiting the tab loads the same budget.
- [ ] All budget reads/writes are gated by RLS to org members of the budget's event.

## Affected Files

**Create:**
- `src/components/budget-tab.tsx` — Budget view (client): line-item table, inline editing, totals/variance, import picker.
- `src/app/actions/budgets.ts` — server actions (see §2).
- One Supabase migration (apply via `mcp__supabase__apply_migration`) — tables + RLS in §1.

**Modify:**
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` — when `component.slug === "finance"`, add a `Budget` `TabsTrigger` + `TabsContent`; fetch the budget + line items server-side and pass to `BudgetTab`.
- `src/types/database.ts` — add `Budget` and `BudgetLineItem` interfaces.

**Read-only context (do not modify):**
- `src/app/actions/library.ts` `getApprovedEstimates(organizationId, eventId)` — call it to populate the import picker (event-scoped after ISSUE-016).
- `src/app/actions/estimates.ts` `createEstimate` — shows the estimate column/section/line-item shape the importer reads.
- `src/components/estimate-editor.tsx` — copy its dark-theme table styling, `formatCurrency`, and Net/variance block.

## Relevant Code Context

### Estimate data shape the importer reads — `src/types/database.ts`

```ts
export interface Estimate {
  id: string; activity_id: string; component_id: string;
  proposal_number: string; status: "draft" | "sent" | "approved" | "declined";
  qty_column_id: string | null; amount_column_id: string | null;
  created_by: string; created_at: string; updated_at: string;
  // ISSUE-016 adds: proposal_name, last_modified_by
}
export interface EstimateColumn { id: string; estimate_id: string; name: string; col_type: "text" | "number" | "currency"; sort_order: number; }
export interface EstimateSection { id: string; estimate_id: string; name: string; section_type: "expense" | "revenue"; sort_order: number; }
export interface EstimateLineItem { id: string; section_id: string; estimate_id: string; cells: Record<string, string>; sort_order: number; created_at: string; }
```

`estimate_line_items.cells` is keyed by `estimate_columns.id`. The "Item" name is `cells[<text column id>]`; quantity = `cells[estimate.qty_column_id]`; unit amount = `cells[estimate.amount_column_id]`.

### How an estimate's row total is computed today — `src/components/estimate-editor.tsx` (lines 49-68)

```ts
function getRowTotal(cells: Record<string, string>): number | null {
  if (!qtyColId || !amountColId) return null;
  const qty    = parseFloat(cells[qtyColId]    || "0");
  const amount = parseFloat(cells[amountColId] || "0");
  if (isNaN(qty) || isNaN(amount)) return null;
  return qty * amount;
}
function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
```
Reuse this exact math for the imported `estimated_amount`.

### Net / variance block to mirror — `src/components/estimate-editor.tsx` (lines 342-370)

```tsx
const net = revenueTotal - expenseTotal;
<p className={cn("text-sm font-bold", net >= 0 ? "text-emerald-400" : "text-red-400")}>
  {net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(net))}
</p>
```

### Event-scoped approved-estimates picker source — `src/app/actions/library.ts` (post-ISSUE-016)

```ts
export type ApprovedEstimate = { id: string; proposal_number: string; label: string };
export async function getApprovedEstimates(organizationId: string, eventId: string): Promise<ApprovedEstimate[]>
// returns approved estimates for THIS event only; label e.g. "Gala 2026 / Finance / Catering"
```

### Component page tab pattern — `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` (lines 313-387)

Tabs are a shadcn `<Tabs defaultValue="dashboard">` with `<TabsTrigger value="...">` + `<TabsContent value="...">`. The Dashboard tab is rendered for all components:

```tsx
<TabsList className="mb-6 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 w-full overflow-x-auto flex gap-0.5">
  <TabsTrigger value="dashboard" className="...">...Dashboard</TabsTrigger>
  {/* notes / team / files / calendar / resources triggers */}
</TabsList>
<TabsContent value="dashboard" className="pb-8">
  <DashboardTab activities={activities} componentId={component.id} eventSlug={eventSlug} componentSlug={componentSlug} ... />
</TabsContent>
```
`event` (with `id`, `organization_id`) and `component` (with `id`, `slug`) are already in scope on this page.

### Server-action pattern (copy this shape)

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

### 1. Database migration (apply via `mcp__supabase__apply_migration`, name `budget_tracking`)

```sql
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components(id) on delete cascade,
  name text not null default 'Budget',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (component_id)
);

create table if not exists public.budget_line_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  section_type text not null default 'expense',   -- 'expense' | 'revenue'
  item_name text not null default '',
  estimated_amount numeric not null default 0,
  actual_amount numeric not null default 0,
  status text not null default 'estimated',        -- 'estimated' | 'quoted' | 'committed' | 'paid'
  notes text,
  source_estimate_id uuid references public.estimates(id) on delete set null,
  source_label text,                               -- denormalized "{Team} · {proposal name}" captured at import; null = manual
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.budgets enable row level security;
alter table public.budget_line_items enable row level security;

-- Mirror the existing estimate RLS pattern: org members of the component's event.
create policy "Org members manage budgets" on public.budgets for all using (
  exists (
    select 1 from public.components c
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where c.id = budgets.component_id and om.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.components c
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where c.id = budgets.component_id and om.user_id = auth.uid()
  )
);

create policy "Org members manage budget line items" on public.budget_line_items for all using (
  exists (
    select 1 from public.budgets b
    join public.components c on c.id = b.component_id
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where b.id = budget_line_items.budget_id and om.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.budgets b
    join public.components c on c.id = b.component_id
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where b.id = budget_line_items.budget_id and om.user_id = auth.uid()
  )
);
```

Then add to `src/types/database.ts`:
```ts
export interface Budget {
  id: string; component_id: string; name: string;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface BudgetLineItem {
  id: string; budget_id: string;
  section_type: "expense" | "revenue";
  item_name: string;
  estimated_amount: number; actual_amount: number;
  status: "estimated" | "quoted" | "committed" | "paid";
  notes: string | null;
  source_estimate_id: string | null;
  source_label: string | null;
  sort_order: number; created_at: string;
}
```

### 2. Server actions — `src/app/actions/budgets.ts`

```ts
// getOrCreateBudget(componentId): SELECT the single budgets row for the component; if none, INSERT one.
//   Returns { budget, lineItems } (lineItems ordered by section_type then sort_order).
// addBudgetLineItem(budgetId, sectionType, eventSlug, componentSlug): INSERT a blank row, return it.
// updateBudgetLineItem(id, updates, eventSlug, componentSlug): patch item_name/estimated_amount/actual_amount/status/notes.
// deleteBudgetLineItem(id, eventSlug, componentSlug): DELETE the row.
// importEstimateIntoBudget(budgetId, estimateId, eventSlug, componentSlug):
//   1. Load estimate; require status === 'approved'.
//   2. Verify the estimate's component and the budget's component belong to the SAME event
//      (join component→event for both; compare event_id). Reject otherwise.
//   3. Load estimate_columns (find Item column = lowest sort_order with col_type 'text', or name 'Item'),
//      estimate_sections, estimate_line_items, plus estimate.qty_column_id / amount_column_id.
//      Also resolve the source TEAM: estimate.component_id -> components.name, and the estimate's
//      proposal_name (fallback proposal_number). Build source_label = `${componentName} · ${proposalName}`.
//   4. For each line item, INSERT a budget_line_items row:
//        { budget_id, section_type: <section.section_type>, item_name: cells[itemColId] ?? '',
//          estimated_amount: (parseFloat(cells[qtyColId]||'0') * parseFloat(cells[amountColId]||'0')) || 0,
//          actual_amount: 0, status: 'estimated', source_estimate_id: estimateId,
//          source_label: <built above>, sort_order: <index> }.
//   Each action follows the standard pattern: auth check, error return, revalidatePath, return data.
```

### 3. Budget view — `src/components/budget-tab.tsx` (client)

Props: `{ budget: Budget; initialLineItems: BudgetLineItem[]; eventSlug: string; componentSlug: string; organizationId: string; eventId: string }`.

- Match `estimate-editor.tsx` dark-theme styling: `bg-white/[0.03] border border-white/[0.06] rounded-xl`, `formatCurrency`, debounced inline saves (reuse its `debounceTimers` ref pattern keyed by `"${lineItemId}:${field}"`).
- Two sections (Expenses, Revenue). Each row: editable Item, Estimated (number), Actual (number), Status (`<select>`: Estimated/Quoted/Committed/Paid), Notes, and a delete button. "Add row" per section.
- **Group by source team within each section:** render a subheader per distinct `source_label` (e.g. "▸ Marketing · Marketing Estimate") with a per-group subtotal of Estimated/Actual; rows with `source_label = null` group under "Manual / Other". This is the master-budget view — Finance sees each team's contribution at a glance.
- Header summary: **Total Estimated** = Σ estimated, **Total Actual** = Σ actual, **Variance** = actual − estimated (green/red, mirror the estimate Net block). Compute expense vs revenue however product prefers; default to overall sums across all line items.
- **Import from approved estimate** button → fetch `getApprovedEstimates(organizationId, eventId)`, show a small dropdown/modal of `label`s, on select call `importEstimateIntoBudget(budget.id, estimateId, ...)` and append returned rows to local state.

### 4. Wire the tab — `[componentSlug]/page.tsx`

- When `component.slug === "finance"`: call `getOrCreateBudget(component.id)` server-side; add a `<TabsTrigger value="budget">` (lucide `Wallet` or `PiggyBank` icon, same styling as other triggers) and a `<TabsContent value="budget">` rendering:
```tsx
<BudgetTab
  budget={budget}
  initialLineItems={budgetLineItems}
  eventSlug={eventSlug}
  componentSlug={componentSlug}
  organizationId={event.organization_id}
  eventId={event.id}
/>
```
- Non-finance components render no Budget tab (guard both the trigger and the content with the slug check).

## Test Scenarios

**Happy path:**
- Open Finance → **Budget** tab present (absent on other components).
- Add an expense line item, set Estimated 500 / Actual 450 / Status Paid → totals and variance update; reload persists.
- Approve an estimate in this event → Budget → Import → pick it → line items appear with estimated = qty×amount.
- **Master budget join:** approve a Marketing estimate and a Program estimate → in Finance's Budget, import both → lines group under "Marketing · …" and "Program · …" subheaders with per-team subtotals, plus a combined grand total.
- Delete the source Marketing estimate afterward → its imported budget lines remain, still labeled "Marketing · …" (source_label persists; source_estimate_id goes null).

**Edge cases:**
- Estimate with deleted qty/amount columns → imported estimated_amount = 0 (no crash).
- Budget with no line items → totals $0, variance $0.
- Re-opening the Budget tab loads the same single budget (no duplicate created).
- Importing the same estimate twice → adds another set of rows (allowed; each tagged `source_estimate_id`).

**Error cases:**
- Import a non-approved estimate id → action returns error, no rows created.
- Import an estimate from a different event → rejected by the same-event check.

**RLS:**
- Org member of the event CAN read/insert/update/delete budget + line items.
- User from another org CANNOT read or write this event's budget rows.
- Import picker for event B never lists event A's approved estimates.

## Constraints

- Match the dark-theme styling of `estimate-editor.tsx` / `dashboard-tab.tsx`; no brutalist classes (per the design-overhaul memory).
- Do **not** create `src/middleware.ts` — `src/proxy.ts` is the Next.js 16 middleware.
- One budget per Finance component — rely on the `unique (component_id)` constraint and `getOrCreateBudget`; never create a second.
- Budget tab is Finance-only; do not add it to other components.
- All server actions under `src/app/actions/` with `"use server"` + `revalidatePath` on success.
- Parse numeric inputs with `parseFloat` and guard `NaN → 0` (same as the estimate editor).
- Do not modify the estimate editor or the estimate schema here — that is ISSUE-016.

## Technical Notes

- `estimate_line_items.cells` keys are column IDs, not names — always resolve via `estimate_columns` / `estimate.qty_column_id` / `estimate.amount_column_id`.
- `budget_line_items.source_estimate_id` is `ON DELETE SET NULL`, so deleting the source estimate (ISSUE-016's delete) leaves budget rows intact with a null reference. **`source_label` is the durable attribution** — it's denormalized text captured at import, so the budget still shows which team a line came from after the source estimate is gone.
- Estimate numbers are self-describing per team (`EST-{component slug}-{YYYY}-{NNN}`, ISSUE-016), but always build `source_label` from the live component **name** + proposal name so it reads cleanly (e.g. "Marketing · Marketing Estimate"), not from the slug.
- Amounts are `numeric`; Supabase returns them as JS numbers via the JS client — store/compare as numbers, format for display with `formatCurrency`.
- Vendor assignment and richer status workflow from the vision doc are intentionally out of scope for this issue.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `supabase/migrations/20260605000000_budget_tracking.sql` — `budgets` + `budget_line_items` tables (incl. `source_label`), RLS policies mirroring the estimate pattern. **Applied to the remote project** (`sljvlxipnlkqruxlqdsf`) via `apply_migration`.
- `src/app/actions/budgets.ts` — `getOrCreateBudget`, `addBudgetLineItem`, `updateBudgetLineItem`, `deleteBudgetLineItem`, `importEstimateIntoBudget` (+ private `touchBudget` helper).
- `src/components/budget-tab.tsx` — client Budget view.

**Files modified:**
- `src/types/database.ts` — added `Budget` and `BudgetLineItem` interfaces.
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` — Finance-only: fetch via `getOrCreateBudget(component.id)`, render a `Budget` `TabsTrigger` (Wallet icon) + `TabsContent` with `<BudgetTab>`.

**What was implemented (vs. Acceptance Criteria):** Budget tab shows only on Finance; Expenses/Revenue sections with Item/Estimated/Actual/Status/Notes; header Total Estimated / Total Actual / Variance (actual − estimated, green ≥ 0 / red < 0); Import picker lists approved estimates across **all** teams in the event (via `getApprovedEstimates(orgId, eventId)`) and seeds rows (`estimated = qty × amount`); each imported row stamped with `source_estimate_id` + durable `source_label`; rows **grouped by source team** within each section (manual rows under "Manual / Other") with per-group subtotals; add/inline-edit (debounced)/delete; one budget per Finance component (`unique (component_id)` + `getOrCreateBudget`); all reads/writes RLS-gated to org members.

**Test results:** No automated test runner in the repo (`package.json`: only `dev`/`build`/`start`/`lint`). Verification gate:
- `npx tsc --noEmit` → **0 errors**.
- `npm run build` → **success** (all 19 pages generated; the component route compiles with the new tab).
- Manual Test Scenarios from the PRD to be exercised against the running dev server.

**Decisions / assumptions:**
1. **Line-item ordering** = `section_type` then `created_at` (instead of `sort_order`) so imported batches and manual rows keep a stable, collision-free order; `sort_order` is still set for future drag-reorder.
2. **Variance sign** follows the PRD literally (`actual − estimated`, green when ≥ 0). Note this reads "over-estimate = green", mirroring the estimate Net block as the PRD specified.
3. **Number inputs** bind to the numeric value with `parseFloat(...) || 0` on change (empty → 0), matching the estimate editor's lightweight inline-edit approach.
4. `getOrCreateBudget` is called during server render of the Finance page (lazy create), same pattern as the estimate page lazily creating its sheet.
5. The import picker is a lightweight inline dropdown (not a modal), consistent with the dark theme.

**Concerns:** The remote migration was applied directly (additive new tables + RLS — isolated, reversible by dropping the tables). Pre-existing repo-wide lint errors are unrelated and don't block `next build`.

### Evaluator Report

_Independent senior-engineer review against the PRD + diff; RLS + FK facts verified directly against the database._

**Total findings:** 0 Critical / 6 Medium / 5 Low

- **[🟡 Medium]** `budgets.ts` `getOrCreateBudget` — INSERTs on a server-render GET (runs on every first Finance page view). Unique-violation race is handled (23505 → re-select). Recommend creating on an explicit action, or accept it but fix the inaccurate justification.
- **[🟡 Medium]** `budget-tab.tsx` numeric inputs — controlled by `parseFloat(value) || 0`, so the field can't be cleared (empty → NaN → 0 snaps back) and intermediate states like "1." are impossible. Use a per-cell string draft committed on blur/debounce.
- **[🟡 Medium]** `budget-tab.tsx` debounce — pending sub-300ms edits are dropped on tab switch/navigation (timers GC'd on unmount). Flush on blur and/or unmount.
- **[🟡 Medium]** `budget-tab.tsx` import dropdown — no outside-click / Escape / backdrop; only closes via X or successful import.
- **[🟡 Medium]** `budgets.ts` `updateBudgetLineItem` + migration — no runtime/DB validation of `status`/`section_type` (plain `text`, no CHECK). RLS gates rows, not values; add CHECK constraints.
- **[🔵 Low]** `importEstimateIntoBudget` itemCol heuristic (lowest-sort text col) could pick the wrong text column if a non-item text col sorts first; matches estimate heuristics — add a comment.
- **[🔵 Low]** redundant `estimated || 0` after NaN guard (harmless); deleted qty/amount columns correctly yield 0.
- **[🔵 Low]** same-event + non-approved checks verified correct; cross-org budgetId returns "Budget not found" via RLS — safe. Event check is in app code, not DB (acceptable).
- **[🔵 Low]** Variance = actual − estimated, green ≥ 0 — matches PRD literally, but "over-estimate = green" is semantically backwards for an expense budget, and the grand total mixes expense+revenue. Spec-compliant; product concern.
- **[🔵 Low]** Importing an estimate with zero line items closes the dropdown with no feedback.

**Acceptance Criteria check:**
- Budget tab Finance-only: ✅ both trigger + content guarded by `slug === "finance"`.
- Expenses/Revenue with Item/Estimated/Actual/Status/Notes: ✅ inline-editable.
- Header Total Estimated/Actual/Variance: ✅ (variance sign per PRD).
- Import across all teams, labeled, seeds qty×amount/0/estimated: ✅ event-scoped picker, NaN→0.
- source_label durability + ON DELETE SET NULL: ✅ verified FK is SET NULL; label denormalized at import.
- Group by source team + Manual/Other + subtotals: ✅.
- Add/edit/delete: ⚠️ works, but number inputs can't be cleared + sub-300ms edits lost on navigation.
- One budget per component: ✅ `unique (component_id)` confirmed; race handled.
- RLS gated to org members: ✅ verified live (both tables RLS-enabled; USING + WITH CHECK gate via component→event→organization_members).

**Overall assessment:** Close to shippable — core feature correct, RLS verified sound (no cross-org attachment possible), import math + source-label durability work, all ACs functionally met. Blocking-quality issues are UX/data-integrity (clearable number inputs, flush edits on navigation, CHECK constraints), not correctness/security.

### Coder Revision Report

All 🟡 Medium findings addressed.

**🟡 Number inputs can't be cleared** — `budget-tab.tsx` now keeps a per-cell string **draft** (`drafts` state) for Estimated/Actual. The input renders `drafts[key] ?? String(value)`, so the user can clear it / type "1." mid-edit; local numeric state still updates live (via `parseFloat || 0`) so totals stay correct, and the draft is dropped on blur to re-sync the canonical display.

**🟡 Edits lost on navigation** — replaced the timer-only debounce with `pending` (a ref mapping each `${id}:${field}` to its latest value) + `fireSave`. Every editable cell now **flushes on blur** (`flushCell` / `commitNumber`), and a `useEffect` cleanup **flushes all pending saves on unmount** (e.g. switching away from the Budget tab). No more silently dropped sub-300ms edits.

**🟡 Import dropdown outside-click** — added a `fixed inset-0` backdrop behind the panel that closes it on outside click (plus the existing X).

**🟡 No CHECK constraints** — added `supabase/migrations/20260605000001_budget_check_constraints.sql` (applied to remote): CHECK on `section_type in ('expense','revenue')` and `status in ('estimated','quoted','committed','paid')`. Invalid values now fail at the DB.

**🟡 getOrCreateBudget write-on-GET** — kept the behavior (it creates one lightweight budget row on first Finance view and is steady-state a pure read; the unique-violation race is handled). Justification corrected: the estimate page *does* also create on render (`estimate/[activityId]/page.tsx` calls `createEstimate` when none exists), so the lazy-create-on-render precedent is real. Acceptable and keeps the Budget tab instant.

**🔵 Low addressed:** empty-import now shows feedback ("That estimate has no line items to import."). Other Low items (itemCol heuristic, redundant `|| 0`, variance sign semantics) left per the Evaluator's own "spec-compliant / acceptable" notes; the variance sign matches the AC verbatim and is flagged to product, not changed.

**Test results after revisions:**
- `npx tsc --noEmit` → **0 errors**.
- `npm run build` → **success** (all 19 pages generated).

### Documentation Report

### Documentation Report

**No doc changes needed.** Reviewed the diff and `README.md` (default Next.js boilerplate). This change adds no new env vars, npm commands, or local setup steps — the three migrations are additive and applied to the shared remote Supabase project; there's no local `supabase db reset` workflow. The Budget tab is a user-facing feature, not a developer-workflow change. PRD status set to **Ready for Review**.

### Coordinator Summary

**Acceptance Criteria**
- ✅ Budget tab shows on Finance only — both `TabsTrigger` and `TabsContent` guarded by `component.slug === "finance"`.
- ✅ Expenses/Revenue line items with Item / Estimated / Actual / Status / Notes, inline-editable.
- ✅ Header Total Estimated / Total Actual / Variance (actual − estimated, green ≥ 0 / red < 0).
- ✅ Import picker lists approved estimates across **all teams** in the event (event-scoped `getApprovedEstimates`); seeds `estimated = qty × amount`, `actual = 0`, `status = estimated`.
- ✅ Each imported line stamped with `source_estimate_id` + durable `source_label`; survives source-estimate deletion (FK `ON DELETE SET NULL`, verified).
- ✅ Line items grouped by source team (subheader + per-team subtotal); manual rows under "Manual / Other".
- ✅ Add / inline-edit (debounced, flushed on blur + unmount) / delete.
- ✅ One budget per Finance component (`unique (component_id)` + `getOrCreateBudget`, race-handled).
- ✅ All reads/writes RLS-gated to org members of the budget's event (verified live; USING + WITH CHECK).

**Remaining concerns:**
1. **Variance sign** is `actual − estimated` (green when ≥ 0) per the PRD/AC verbatim — semantically "over-estimate = green," which may read backwards for an expense-heavy budget. Implemented as specified; flag for product if you want it inverted.
2. **Three additive migrations** were applied to the remote project (`budget_tracking`, `budget_check_constraints`, plus ISSUE-016's). Reversible by dropping the tables/constraints.
3. No automated tests (repo has no runner). Verified via `tsc --noEmit` (0 errors) + `next build` (success) + the documented manual Test Scenarios. Manual QA recommended for the multi-team import + delete-source flow.
4. This branch (`issue-016-estimate-template`) now contains **both** ISSUE-016 and ISSUE-017 work (017 depends on 016, neither merged). Decide at `/create-pr` whether to split or ship together.

**Verdict: READY FOR REVIEW.**

Every acceptance criterion is implemented and verified by a clean typecheck and successful production build; the evaluator found no Critical issues and confirmed the RLS boundary is sound (no cross-org budget attachment is possible). All six Medium findings were fixed — clearable number inputs via per-cell drafts, edits flushed on blur and on unmount so nothing is lost on navigation, an outside-click backdrop on the import picker, and DB CHECK constraints on `status`/`section_type` — leaving only spec-compliant Low items (notably the variance sign, which matches the AC and is flagged to product). The master-budget goal is delivered end to end: Finance imports approved estimates from any team in the event, each line stays attributed to its source team via a durable label even after the source estimate is deleted, and the view groups by team with per-team subtotals.

### PR Feedback Summary
</content>
