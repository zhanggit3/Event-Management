# ISSUE-015: "My Work" — personal task table

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #015

## Problem

There is no single place for a user to see every task they care about. Tasks assigned to a user, or reported/created by them, are scattered across component boards inside individual events. We need a "My Work" view — reachable from the secondary sidebar under "Overview" — that lists those tasks in one sortable table so the user can focus on and track their own work.

## Acceptance Criteria

- [ ] A "My Work" nav item appears in the secondary sidebar directly under "Overview" (when the Dashboard section is active), with its own icon and the title "My Work", linking to `/my-work`.
- [ ] Visiting `/my-work` while the Dashboard rail icon and the "My Work" sidebar item both render as active.
- [ ] `/my-work` shows a table of every task where the current user is the **assignee** (`assigned_to`), the **reporter** (`reporter_id`), or the **creator** (`created_by`). No other user's tasks appear.
- [ ] The table has these columns in order: checkbox, Item name, Chat (comment indicator), Status, Created, Due Date, Last Modified, Priority, Assignee, Reporter, Event.
- [ ] The Chat column shows a comment-count badge when the task (or any of its direct subtasks) has at least one comment, and shows nothing when there are zero comments.
- [ ] "Last Modified" reflects the most recent of: the task's own last edit (status/priority/assignee/title/etc.), the newest comment on the task or its subtasks, and the newest attachment on the task or its subtasks.
- [ ] Clicking any column header sorts the table by that column; clicking the same header again reverses the sort direction. The active sort column shows an up/down caret.
- [ ] The checkbox toggles the task's completion: checking marks it `done`, unchecking returns it to `todo`. The Status column updates to match, and the change persists (survives a page reload).
- [ ] An empty state ("No tasks assigned to or reported by you yet") renders when the user has zero matching tasks.

## Affected Files

**Modify:**
- `src/components/sidebar.tsx` — add the "My Work" link under "Overview" in the `activeSection === "dashboard"` block; extend `activeSection` so `/my-work` counts as the `"dashboard"` section.
- `src/types/database.ts` — no shape change needed for `Task` (already declares `updated_at`); add the new return type `MyWorkRow` (see below) if you prefer it typed centrally — otherwise define it next to the table component.

**Create:**
- `supabase/migrations/20260604000001_add_tasks_updated_at.sql` — add `tasks.updated_at` + a `BEFORE UPDATE` trigger that bumps it. (The column is referenced by the existing `Task` TypeScript type but does **not** exist in the live DB — this also fixes a latent bug.)
- `src/app/(dashboard)/my-work/page.tsx` — server component: auth, fetch the user's tasks + derived comment counts / last-modified, render the table client component.
- `src/components/my-work-table.tsx` — `"use client"` component: renders the sortable table, manages sort state, and calls the completion-toggle action.
- `src/app/actions/my-work.ts` — `"use server"` action `toggleTaskDone(taskId, done)` used by the checkbox.

**Read-only context (do not modify):**
- `src/lib/supabase/server.ts` — the `await createClient()` server helper.
- `src/components/dashboard-tab.tsx` — source of the status-icon / priority-color conventions to reuse.
- `src/app/(dashboard)/company/my-items/page.tsx` — the canonical "personal page" pattern (auth → fetch → client component).

## Relevant Code Context

### Live `tasks` schema (authoritative — migrations are stale)

```
id              uuid    PK default uuid_generate_v4()
component_id    uuid    NOT NULL  FK → components(id)
title           text    NOT NULL
description     text    NULL
status          text    NOT NULL default 'todo'    CHECK in ('todo','in_progress','done')
priority        text    NOT NULL default 'medium'  CHECK in ('low','medium','high','urgent')
assigned_to     uuid    NULL      FK → profiles(id)   -- ASSIGNEE
due_date        date    NULL
created_by      uuid    NOT NULL  FK → profiles(id)   -- creator
created_at      timestamptz NOT NULL default now()
parent_task_id  uuid    NULL      FK → tasks(id)      -- subtask linkage
activity_id     uuid    NOT NULL  FK → activities(id)
reporter_id     uuid    NULL      FK → profiles(id)   -- REPORTER
-- NOTE: updated_at does NOT exist yet. This issue adds it.
```

**Three FKs from `tasks` → `profiles`** (`assigned_to`, `created_by`, `reporter_id`). PostgREST **cannot** resolve `tasks → profiles` nested selects — it errors or silently returns null. **Do not** write `assignee:assigned_to(...)` style joins. Fetch profiles in a separate `.in("id", ids)` query and merge in JS. (See CLAUDE.md "FK join ambiguity".)

**`tasks → components → events` is safe** — each hop has exactly one FK — so the nested select `component:component_id(name, event:event_id(id, name, slug))` works.

### `Task` type (already in `src/types/database.ts`)

```ts
export interface Task {
  id: string;
  component_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  reporter_id: string | null;
  due_date: string | null;
  parent_task_id: string | null;
  activity_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;   // declared but column is missing in DB — the migration adds it
}
```

### `task_comments` and `task_attachments` (live)

```
task_comments:    id, task_id (FK→tasks), author_id, body, mentions text[], created_at, updated_at (nullable)
task_attachments: id, task_id (FK→tasks), uploaded_by, file_name, storage_key, file_size, mime_type, created_at
```

### Server auth + "current org/page" pattern (from `my-items/page.tsx`)

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
const me = user.id;
```

### Status icon + priority colors to reuse (from `dashboard-tab.tsx`)

```tsx
// Priority text color
const PRIORITY_COLOR: Record<string, string> = {
  low: "text-white/30", medium: "text-blue-400", high: "text-orange-400", urgent: "text-red-400",
};
// Status pill colors (match the app's existing scheme)
const STATUS_STYLE: Record<string, string> = {
  todo:        "bg-white/[0.06] text-white/50",
  in_progress: "bg-blue-500/15 text-blue-400",
  done:        "bg-emerald-500/15 text-emerald-400",
};
// Status circle/check icons (lucide): Circle (todo), Loader2 (in_progress, animate-spin), Check (done)
```

### Secondary-sidebar "Overview" block to extend (`sidebar.tsx` lines ~241-254)

```tsx
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
    {/* ADD "My Work" link here */}
  </>
)}
```

### `activeSection` derivation to extend (`sidebar.tsx` lines ~67-73)

```tsx
const activeSection: "dashboard" | "events" | "company" | "other" = pathname.startsWith("/company")
  ? "company"
  : pathname.startsWith("/events")
    ? "events"
    : pathname === "/"
      ? "dashboard"
      : "other";
```

The active-state styling on a sidebar link is `bg-indigo-500/15 text-indigo-300` when active, and `text-white/50 hover:text-white/80 hover:bg-white/[0.04]` when not (see `CompanyNavItem`).

## Implementation Steps

### 1. Migration — add `tasks.updated_at` + trigger

Create `supabase/migrations/20260604000001_add_tasks_updated_at.sql`:

```sql
alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_tasks_updated_at();
```

Apply it via the Supabase MCP `apply_migration` (project `sljvlxipnlkqruxlqdsf`). After this, `updated_at` bumps on any task UPDATE — covering status/priority/assignee/title edits for "Last Modified".

### 2. Sidebar (`sidebar.tsx`)

- Import an icon for "My Work" from `lucide-react` (use `Briefcase`).
- Change `activeSection` so the Dashboard section also matches `/my-work`:
  ```tsx
  : (pathname === "/" || pathname.startsWith("/my-work"))
      ? "dashboard"
  ```
- Inside the `activeSection === "dashboard"` block, after the Overview `<Link>`, add:
  ```tsx
  <Link
    href="/my-work"
    className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors font-medium",
      pathname.startsWith("/my-work")
        ? "bg-indigo-500/15 text-indigo-300"
        : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]",
    )}
  >
    <Briefcase className={cn("w-3.5 h-3.5 shrink-0", pathname.startsWith("/my-work") ? "text-indigo-400" : "text-white/30")} />
    <span className="flex-1 truncate">My Work</span>
  </Link>
  ```
  (The Dashboard rail icon already lights for the whole `"dashboard"` section, so it activates on `/my-work` automatically.)

### 3. Server page (`src/app/(dashboard)/my-work/page.tsx`)

Auth, then fetch and derive. Key queries:

```ts
// (a) the user's tasks — assignee OR reporter OR creator; component+event via safe nested select
const { data: rawTasks } = await supabase
  .from("tasks")
  .select(
    "id, title, status, priority, assigned_to, reporter_id, created_by, due_date, created_at, updated_at, " +
    "component:component_id(name, event:event_id(id, name, slug))",
  )
  .or(`assigned_to.eq.${me},reporter_id.eq.${me},created_by.eq.${me}`);

const tasks = rawTasks ?? [];
const taskIds = tasks.map((t) => t.id);

// (b) profiles for assignee + reporter (separate query — 3 FKs make joins ambiguous)
const profileIds = [
  ...new Set(
    tasks.flatMap((t) => [t.assigned_to, t.reporter_id ?? t.created_by]).filter(Boolean),
  ),
] as string[];
const { data: profiles } = profileIds.length
  ? await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", profileIds)
  : { data: [] };
const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

// (c) direct subtasks of these tasks (for comment rollup + last-modified)
const { data: subtasks } = taskIds.length
  ? await supabase.from("tasks").select("id, parent_task_id, updated_at").in("parent_task_id", taskIds)
  : { data: [] };
const childIdsByParent = new Map<string, string[]>();
for (const s of subtasks ?? []) {
  const arr = childIdsByParent.get(s.parent_task_id!) ?? [];
  arr.push(s.id);
  childIdsByParent.set(s.parent_task_id!, arr);
}
const allIds = [...taskIds, ...(subtasks ?? []).map((s) => s.id)];

// (d) comments + attachments across tasks AND their subtasks
const { data: comments } = allIds.length
  ? await supabase.from("task_comments").select("task_id, created_at, updated_at").in("task_id", allIds)
  : { data: [] };
const { data: attachments } = allIds.length
  ? await supabase.from("task_attachments").select("task_id, created_at").in("task_id", allIds)
  : { data: [] };
```

Then build one row per top-level **and** subtask-less task — i.e. one row per element of `tasks` (do not filter out subtasks; if a subtask is assigned to the user it should appear as its own row). For each task `t`, compute:

- `relevantIds = [t.id, ...(childIdsByParent.get(t.id) ?? [])]`
- `commentCount` = number of `comments` whose `task_id ∈ relevantIds`
- `lastModified` = max ISO timestamp among:
  - `t.updated_at`
  - each child's `updated_at`
  - `created_at` / `updated_at` of every comment in `relevantIds`
  - `created_at` of every attachment in `relevantIds`
- `assignee` = `profileMap.get(t.assigned_to)` (or null)
- `reporter` = `profileMap.get(t.reporter_id ?? t.created_by)` (or null)
- `event` = `t.component?.event` (name + slug)

Pass the assembled rows to `<MyWorkTable rows={rows} />`. Wrap in the same page chrome as `my-items/page.tsx` (`<div className="min-h-full"><div className="px-8 py-8 ...">`), with an `<h1>` titled "My Work".

Define the row type (next to the component or in `database.ts`):

```ts
export type MyWorkRow = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  dueDate: string | null;
  lastModified: string;
  commentCount: number;
  assignee: { full_name: string; email: string; avatar_url: string | null } | null;
  reporter: { full_name: string; email: string; avatar_url: string | null } | null;
  event: { name: string; slug: string } | null;
};
```

### 4. Client table (`src/components/my-work-table.tsx`)

- `"use client"`. Props: `{ rows: MyWorkRow[] }`. Hold a local `useState` copy of `rows` so the checkbox toggle updates instantly (optimistic).
- Sort state: `const [sortBy, setSortBy] = useState<keyof SortableCols>("dueDate"); const [sortAsc, setSortAsc] = useState(true);`
- Header cells are `<button>`s that set `sortBy` (and flip `sortAsc` if already active). Render a `ChevronUp`/`ChevronDown` (lucide) on the active column.
- Sort comparator: strings via `localeCompare`; dates by ISO string compare with nulls last; priority by rank `{ low:0, medium:1, high:2, urgent:3 }`; status by rank `{ todo:0, in_progress:1, done:2 }`; commentCount numerically.
- Columns / rendering:
  - **checkbox**: a button toggling done; checked when `status === "done"`. On click call `toggleTaskDone(id, !done)`, optimistically set local `status` to `done`/`todo`. Reuse the Circle/Check visual from `dashboard-tab.tsx`.
  - **Item name**: `title`, strike-through + `text-white/30` when `done`.
  - **Chat**: when `commentCount > 0`, a `MessageSquare` icon + the count in a small pill; otherwise empty.
  - **Status**: pill using `STATUS_STYLE` with label (`in_progress` → "In Progress").
  - **Created / Due / Last Modified**: format with `formatDate` from `src/lib/utils.ts`; Due renders "—" when null.
  - **Priority**: text using `PRIORITY_COLOR`.
  - **Assignee / Reporter**: initials avatar (reuse the `getInitials` util + the `bg-indigo-500/20 ... text-indigo-300` round badge from `team-member-list.tsx`) with name; "—" when null.
  - **Event**: `event.name` linking to `/events/${event.slug}` (or plain text if you prefer no link).
- Use the table styling idiom already in `dashboard-tab.tsx` (flex rows with `border-b border-white/[0.04]`, `hover:bg-white/[0.03]`, header row `bg-white/[0.02] text-white/30`). A real `<table>` is acceptable too — there is no shadcn `Table` primitive in this repo; match the dark theme either way.
- Empty state: when `rows.length === 0`, render the "No tasks assigned to or reported by you yet" message instead of the table.

### 5. Toggle action (`src/app/actions/my-work.ts`)

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleTaskDone(taskId: string, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo" })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/my-work");
  return { success: true };
}
```

RLS already governs task updates; no extra auth check is needed beyond the existing policies (the action runs as the signed-in user via the cookie-bound client).

## Test Scenarios

**Happy path:**
- User is assignee of 3 tasks and reporter of 2 others → all 5 appear as rows, deduped (a task where they are both assignee and reporter appears once).
- Clicking the "Due Date" header sorts ascending with nulls last; clicking again sorts descending.
- A task with 2 comments and 1 comment on a subtask shows a Chat badge of "3".
- Checking a task's checkbox flips Status to "done" and the change survives a reload.

**Edge cases:**
- User has zero matching tasks → empty state renders, no table, no crash.
- A task with `assigned_to = null` and `reporter_id = null` but `created_by = me` still appears (creator counts as reporter); Assignee shows "—".
- A task with no comments and no attachments → Chat column empty; Last Modified equals the task's `updated_at` (or `created_at` if never edited).
- A task whose assignee/reporter profile was deleted → avatar/name shows "—" rather than throwing.

**Error cases:**
- `toggleTaskDone` returns `{ error }` (e.g. RLS denies) → the optimistic checkbox state reverts and the row keeps its prior status.

**RLS:**
- The `.or(assigned_to/reporter_id/created_by = me)` filter plus existing task RLS means a user can only ever see tasks within orgs/components they belong to — confirm a user in Org A does NOT see Org B's tasks even if `created_by` somehow matched (it cannot cross orgs, but verify the RLS read still gates the list).

## Constraints

- **Do NOT** join `tasks → profiles` in a PostgREST select (three FKs → ambiguous). Always fetch profiles separately and merge in JS.
- **Do NOT** create `src/middleware.ts` — `src/proxy.ts` is the Next.js 16 middleware. Do not touch it.
- **Do NOT** refactor the sidebar's rail/panel layout — only add the one "My Work" link and extend the `activeSection` condition.
- Follow the existing **server-action + `revalidatePath` + local optimistic state** pattern (CLAUDE.md §8). Server Components fetch; client components hold state.
- Match the dark theme: use the existing `PRIORITY_COLOR` / status-pill / avatar idioms — do not introduce new color tokens or a UI library table.
- Keep all new server actions under `src/app/actions/`.

## Technical Notes

- **`updated_at` is a real latent bug**: the `Task` TS type declares it but the column is absent in the live DB (`sljvlxipnlkqruxlqdsf`). Any current code selecting `updated_at` would error — the step-1 migration is required before the page's `select(... updated_at ...)` will succeed.
- **Reporter semantics**: "reported by me" = `reporter_id = me`, falling back to `created_by` when `reporter_id` is null (legacy tasks predate `reporter_id`). The display Reporter is `reporter_id ?? created_by`.
- **Comment rollup** intentionally covers a task plus its *direct* subtasks only (one level). Deep nesting isn't used in the product today.
- **Timezones**: `due_date` is a `date` (no time); `created_at` / `updated_at` are `timestamptz`. Use the existing `formatDate` helper for consistent display.
- All four batched queries use `.in(...)` to avoid N+1; guard each with a length check (Supabase `.in("col", [])` should be skipped to avoid empty-array quirks).

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `src/app/(dashboard)/my-work/page.tsx` — server component (auth → fetch tasks/profiles/subtasks/comments/attachments → derive rows → render).
- `src/components/my-work-table.tsx` — `"use client"` sortable table + optimistic completion checkbox.
- `src/app/actions/my-work.ts` — `toggleTaskDone(taskId, done)` server action.

**Files modified:**
- `src/components/sidebar.tsx` — imported `Briefcase`; extended `activeSection` so `/my-work` counts as `"dashboard"`; added the "My Work" link under Overview; made the existing Overview link's active styling conditional on `pathname === "/"` (it was previously hard-coded active, which would have left Overview falsely highlighted while on `/my-work`).
- `src/types/database.ts` — added the `MyWorkRow` type (placed centrally, just above `Activity`).

**What was implemented (per step):**
- **Step 2 (sidebar):** `Briefcase` icon import; `activeSection` now matches `pathname === "/" || pathname.startsWith("/my-work")`; "My Work" link added directly under Overview using the active/inactive class idiom from `CompanyNavItem`. The Dashboard rail icon already lights for the whole `"dashboard"` section, so it activates on `/my-work` automatically.
- **Step 3 (server page):** Auth via `createClient()` + `getUser()`; query (a) tasks with `.or(assigned_to/reporter_id/created_by = me)` and safe nested `component:component_id(name, event:event_id(...))` select; (b) profiles fetched separately by id and merged in JS (no `tasks→profiles` join); (c) direct subtasks by `parent_task_id`; (d) comments + attachments across task + subtask ids via guarded `.in(...)`. Each row computes `commentCount`, `lastModified` (max of task/child `updated_at`, comment `created_at`/`updated_at`, attachment `created_at`), `assignee`, `reporter = reporter_id ?? created_by`, and `event`. Page chrome matches `my-items/page.tsx` (`min-h-full` → `px-8 py-8 max-w-7xl mx-auto`) with an `<h1>My Work</h1>`.
- **Step 4 (client table):** Local `useState` copy of rows for optimistic toggle; sort state defaults to `dueDate`/asc; clickable header buttons with `ChevronUp`/`ChevronDown` on the active column; comparators per the PRD (localeCompare strings, ISO compare with nulls-last for dates, priority/status rank, numeric comment count). Columns in the specified order with the `Circle`/`Check` checkbox, strike-through done titles, `MessageSquare` chat badge, `STATUS_STYLE` pills, `formatDate` for dates ("—" for null due), `PRIORITY_COLOR` priority text, initials-avatar Assignee/Reporter (reusing `getInitials` + the `bg-indigo-500/20 … text-indigo-300` badge), and Event linking to `/events/{slug}`. Empty state renders the exact required message.
- **Step 5 (action):** Implemented verbatim per the PRD (`update status → revalidatePath("/my-work")`), with the optimistic toggle reverting on `{ error }`.

**Decisions made (not specified in the PRD):**
- Used `max-w-7xl` for the page container (the table is wide — 11 columns) rather than `max-w-5xl` from `my-items`; kept the surrounding chrome identical otherwise.
- The table is a flex-row layout (matching `dashboard-tab.tsx`) inside a horizontally scrollable `min-w-[1100px]` wrapper so the 11 columns don't crush on narrow viewports.
- Made the Overview sidebar link's active state conditional (see above) so exactly one of Overview / My Work highlights at a time. The PRD only mandated adding the My Work link, but leaving Overview hard-active alongside it would have violated the "both render as active" acceptance only for My Work — now Overview is active on `/`, My Work on `/my-work`, and the Dashboard rail on both.
- `RawTask`/`ProfileLite` local types + a single `as unknown as` cast on the nested-select result handle PostgREST's array-vs-object typing without `any`.

**Concerns / assumptions:**
- `commentCount` counts every comment on the task + its direct subtasks (matches the "≥1 → badge, with count" criterion and the "3 across task+subtask" scenario).
- `reporter` display uses `reporter_id ?? created_by`; if that profile was deleted it falls back to "—" (no throw). Same for a null/deleted assignee.
- Relies on existing task RLS to gate cross-org reads (the `.or` filter alone can't cross orgs).

**Verification (no test runner exists in this project — there is no `test` script in package.json; verification was via lint + typecheck + build):**
- `npm run lint`: my files (`my-work/page.tsx`, `my-work-table.tsx`, `my-work.ts`, `sidebar.tsx`, `database.ts`) produce **0 errors/warnings**. The 22 errors / 11 warnings reported are all pre-existing in untouched files (`task-edit-panel.tsx`, `task-form.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, etc.) — not fixed, per instructions.
- `npx tsc --noEmit`: `TSC EXIT: 0` (no type errors).
- `npm run build`: `BUILD EXIT: 0`, `✓ Compiled successfully`; the `/my-work` route appears in the route table (ƒ dynamic, server-rendered).

### Evaluator Report

**Verification run by evaluator:** `npx tsc --noEmit` → exit 0. `npm run build` → exit 0, `✓ Compiled successfully`, `/my-work` present as a dynamic (ƒ) server-rendered route. Coder's lint/typecheck/build claims confirmed.

**Acceptance Criteria check (all 9):**
1. "My Work" nav under "Overview" when Dashboard active, own icon (`Briefcase`), title, links `/my-work` — ✅ (`sidebar.tsx:258-269`).
2. `/my-work` lights both the Dashboard rail and the "My Work" item as active — ✅ (`activeSection` matches `/my-work` at `sidebar.tsx:71`; rail keyed off `activeSection`; item keyed off `pathname.startsWith("/my-work")`). Coder also correctly de-hardcoded the Overview active state so exactly one item highlights.
3. Tasks where user is assignee/reporter/creator, no others — ✅ via `.or(...)` + RLS (`page.tsx:23`).
4. Column order matches spec — ✅ (`my-work-table.tsx:44-55`).
5. Chat badge when comment count ≥ 1, else empty — ✅ (`my-work-table.tsx:195`).
6. Last Modified = max(task/child updated_at, comment created/updated, attachment created) — ✅ (`page.tsx:105-120`).
7. Header click sorts; re-click reverses; caret on active — ✅ (`my-work-table.tsx:75-82, 295`).
8. Checkbox toggles done/todo, persists — ✅ (action + `revalidatePath`).
9. Empty state with exact copy — ✅ (`my-work-table.tsx:135-141`).

All acceptance criteria are met functionally.

**Findings by severity: 0 🔴 Critical · 3 🟡 Medium · 4 🔵 Low**

---

🟡 **Medium — `src/app/actions/my-work.ts:6-12` — server action does not call `getUser()`.**
Every other task mutation in `src/app/actions/tasks.ts` (e.g. `updateTask` at line 72) calls `supabase.auth.getUser()` before mutating. `toggleTaskDone` skips it and relies solely on RLS. RLS does gate the write, so this is not an exploitable hole, but it (a) breaks pattern consistency and (b) means an unauthenticated call hits the DB and returns a raw RLS error string instead of a clean early return. **Fix:** add `const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Not authenticated" };` at the top, matching `updateTask`.

🟡 **Medium — `src/components/my-work-table.tsx:61-66, 116-120` — descending date sort moves nulls to the TOP, contradicting "nulls last".**
`compareNullableString` puts nulls last in ascending order, but the direction toggle negates the whole comparator (`return sortAsc ? cmp : -cmp;` at line 132). When `dueDate` is sorted descending, tasks with a null due date sort to the front. The PRD specifies "nulls last" for the date sort. **Fix:** make the null-vs-non-null decision direction-independent — e.g. compute the null ranking outside the sign flip, or in the comparator return a fixed sign for null cases that isn't negated (split: if either is null, `return (!a ? 1 : -1)` applied after the asc flip is removed for that branch). Simplest: handle nulls before applying `sortAsc`.

🟡 **Medium — `src/components/my-work-table.tsx:84-96 / page.tsx:13` — checkbox toggle does not recompute `lastModified`, and the optimistic update can be silently lost on concurrent toggles.**
Two sub-issues: (1) After a successful toggle the row's `lastModified` is not bumped locally; it only refreshes on a full navigation (the `revalidatePath` invalidates the cache but the client copy is authoritative until then), so "Last Modified" lags the status change until reload. Minor UX. (2) `handleToggle` captures `prevStatus` from the row passed in, but rapid double-clicks both read the rendered row's status; the revert-on-error restores `prevStatus` which may be stale relative to an in-flight toggle. Low probability. **Fix:** acceptable to leave (1); for (2), derive `prevStatus` inside the `setData` updater or disable the button while `isPending`.

🔵 **Low — `src/components/my-work-table.tsx:98-133` — comment counts double-count across rows when a subtask is itself a top-level row.**
If task A (assigned to me) has subtask B (also assigned to me), B's comments are counted in A's badge (rollup) and again in B's own badge. This is exactly what the PRD's rollup semantics dictate (parent rolls up direct subtasks; subtasks also appear as own rows), so it is by-design, not a bug — flagging only so the reviser/reviewer is aware it's intentional. No fix needed.

🔵 **Low — `src/lib/utils.ts:16-22` (used at `my-work-table.tsx:215,219` for `dueDate`/`createdAt`) — date-only strings render in UTC and can show the prior day in negative-offset timezones.**
`due_date` is a `date` (no time); `new Date("2026-06-04")` is parsed as UTC midnight and may format as Jun 3 for US users. This is a pre-existing property of the shared `formatDate` helper and is used consistently across the app, so it's not introduced here. No fix required for this issue; noted for awareness.

🔵 **Low — `src/types/database.ts:147-148` vs `page.tsx:99` — `MyWorkRow.assignee.full_name` is typed non-nullable but profiles can have null `full_name`.**
`toRow` coalesces `full_name ?? email ?? ""`, so the type invariant holds at runtime — but it means a profile with no name and no email surfaces as an empty-string name and `getInitials("")` returns `""` (empty avatar). Cosmetic only; consider falling back to "Unknown" or the user id prefix. Not blocking.

🔵 **Low — `src/components/my-work-table.tsx:307 / page.tsx` — `avatar_url` is carried through `MyWorkRow` but never rendered.**
The `Person` component always renders initials and ignores `avatar_url`. Dead data on the wire (small). Either render the avatar image when present, or drop `avatar_url` from the select/type to slim the payload. Optional.

**Empty-array `.in()` guards:** Verified all four batched queries guard against empty arrays — `profileIds.length`, `taskIds.length`, `allIds.length` (twice). ✅ No `.in("col", [])` is ever issued.

**`.or()` duplicate-row / cross-org risk:** A single PostgREST query with an `.or()` returns each `tasks` row at most once regardless of how many disjuncts match, so a task where the user is both assignee and reporter appears once — no dedup needed, no duplicate rows. Cross-org leakage is prevented by task RLS (the `.or` filter alone can't cross orgs). ✅

**FK ambiguity:** `tasks→components` is a single FK (confirmed in `001_initial_schema.sql`), so the nested `component:component_id(name, event:event_id(...))` select is unambiguous and resolves. The 3-FK `tasks→profiles` ambiguity is correctly avoided via a separate `profiles.in("id", ...)` query merged in JS. ✅

**Profile merge / null handling:** Missing/deleted profiles → `profileMap.get` returns `undefined` → `toRow` returns `null` → `Person` renders "—". No throw. ✅

**Performance:** No N+1 — exactly 5 batched queries total (tasks, profiles, subtasks, comments, attachments), all `.in()`-batched. Indexing/grouping into Maps is O(n). ✅

**Overall assessment:** Close to shippable. There are **no critical issues** — typecheck and build pass, all acceptance criteria are functionally met, RLS/FK/empty-array concerns are handled correctly. The only changes I'd require before merge are the two functional 🟡 mediums: add the `getUser()` guard to `toggleTaskDone` (pattern + clean error path) and fix the descending-sort nulls-last regression. The rest are polish.

### Coder Revision Report

**Findings addressed:**

🟡 **Medium #1 — `getUser()` auth guard in `toggleTaskDone`.** Added `const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Not authenticated" };` at the top of `toggleTaskDone` in `src/app/actions/my-work.ts`, immediately after `createClient()` and before the update — matching the exact pattern in `updateTask` (`src/app/actions/tasks.ts:72-73`). Unauthenticated calls now return a clean early error instead of hitting the DB.

🟡 **Medium #2 — descending date sort nulls-last regression.** In `src/components/my-work-table.tsx` I split the old `compareNullableString` into two direction-independent helpers: `nullRank(a, b)` (returns a fixed sign so a present value always sorts before a null/empty one, or `null` when both are non-null) and `compareNonNullString(a, b)` (the real ISO ordering, subject to the sign flip). The sort callback now handles the three nullable date columns (`createdAt`, `dueDate`, `lastModified`) in a dedicated branch: it computes `nullRank` and returns it BEFORE the `sortAsc ? cmp : -cmp` sign flip, then applies the sign flip only to the non-null comparison. Result: null/empty dates always sort to the bottom in both ascending and descending directions.

🟡 **Medium #3 — hardened optimistic checkbox toggle (race fix + lastModified bump).** Reworked `handleToggle` to take `rowId` and derive `prevStatus`/`nextDone` INSIDE the `setData` updater function (reading live state) rather than from a captured `row` variable, eliminating the rapid-double-click stale-revert race. The error path reverts to the status observed at apply-time. Additionally the checkbox button is now `disabled={isPending}` (the `useTransition` flag is now consumed) to prevent overlapping toggles. Also optimistically bumps the row's local `lastModified` to `new Date().toISOString()` so "Last Modified" reflects the change immediately.

🔵 **Low #7 (applied) — render `avatar_url`.** The `Person` component now renders an `<img>` (with an eslint-disable for `@next/next/no-img-element`, matching the avatar-image idiom used elsewhere) when `avatar_url` is present, falling back to the initials badge otherwise.

**Intentionally skipped:**

- 🔵 **Low #6 (`MyWorkRow.assignee/reporter.full_name` empty-string tolerance)** — runtime is already safe: `personName` uses `p?.full_name || p?.email || ""` and `Person` uses `full_name || email || "—"`, so empty strings already fall through to email/dash. Widening the type to nullable is non-trivial (touches the page's `toRow` coalescing and the central type) and the Evaluator marked it cosmetic, so the type was left as-is.
- 🔵 **Low #4 (comment double-count)** — by-design per the PRD rollup semantics; no change.
- 🔵 **Low #5 (date-only UTC offset in `formatDate`)** — pre-existing shared-helper behavior used app-wide; out of scope.

**Verification after revision:**
- `npx tsc --noEmit` → **exit 0**.
- `npm run lint` → exit 1 overall, but **zero errors/warnings in the touched files** (`my-work-table.tsx`, `my-work/page.tsx`, `actions/my-work.ts`, `sidebar.tsx`, `database.ts`). The exit-1 is entirely from the same pre-existing errors in untouched files reported in the original Coder/Evaluator runs.
- `npm run build` → **exit 0**, `✓ Compiled successfully`, `/my-work` present as a dynamic (ƒ) server-rendered route.

**Remaining Low items not addressed:** #4 (intentional double-count, by design), #5 (pre-existing `formatDate` UTC behavior), #6 (type-only nullability of `full_name`; runtime already safe).

### Documentation Report

**No README/doc changes needed.**

Reviewed the working-tree diff (`sidebar.tsx`, `database.ts`, new `my-work/` page, `my-work-table.tsx`, `actions/my-work.ts`, migration). The feature introduces:
- No new environment variables (uses the existing `NEXT_PUBLIC_SUPABASE_*` vars).
- No new setup steps or commands (`npm run dev/build/lint` unchanged).
- No new developer-facing workflow — it's an end-user feature reachable from the existing sidebar.

The `tasks.updated_at` migration is a standard additive migration applied through the normal Supabase migration flow; it requires no documented action. `README.md` is the default create-next-app boilerplate and per the Documenter rules must not be rewritten for internal feature work. PRD status advanced to **In Review**.

### Coordinator Summary

**Acceptance Criteria**

- ✅ "My Work" nav item under "Overview" in the secondary sidebar, with `Briefcase` icon + "My Work" title, linking to `/my-work`. (`sidebar.tsx`)
- ✅ `/my-work` activates both the Dashboard rail icon and the My Work sidebar item; `activeSection` extended to treat `/my-work` as `"dashboard"`, and Overview's active style made conditional so exactly one item highlights.
- ✅ Table lists every task where the user is `assigned_to` OR `reporter_id` OR `created_by`, via a single `.or(...)` filter; RLS gates cross-org leakage. No other user's tasks appear.
- ✅ Columns in exact order: checkbox, Item, Chat, Status, Created, Due Date, Last Modified, Priority, Assignee, Reporter, Event.
- ✅ Chat column shows a comment-count badge only when count > 0, rolled up over the task + its direct subtasks.
- ✅ Last Modified = max of task `updated_at`, child `updated_at`, comment created/updated, attachment created (null-safe ISO compare). Backed by the new `tasks.updated_at` column + BEFORE UPDATE trigger (migration applied to live DB and committed to repo).
- ✅ Column headers sort on click; re-click reverses; active column shows an up/down caret; dates sort nulls-last in **both** directions (fixed in revision).
- ✅ Checkbox toggles completion (done ⇄ todo) via `toggleTaskDone`, optimistic with revert-on-error and a hardened double-click race fix; Status column reflects it and the change persists.
- ✅ Empty state renders when the user has zero matching tasks.

**Verification:** No test runner is configured in this project (no `test` script), so correctness was verified — independently by the Evaluator and again by the Coordinator — via `npx tsc --noEmit` (exit 0), `npm run build` (compiled successfully, `/my-work` registered as a dynamic route), and `npm run lint` (zero errors/warnings in the touched files; remaining lint errors are all pre-existing in untouched files).

**Evaluator findings:** 0 Critical, 3 Medium, 4 Low. All 3 Mediums fixed in the revision round (auth guard on the action; descending date sort nulls-last; optimistic-toggle race hardened). One Low applied (render `avatar_url`); the rest were intentionally deferred as by-design (comment rollup) or pre-existing app-wide behavior (`formatDate` UTC).

**Remaining concerns:** None blocking. Minor, non-blocking: `formatDate` renders date-only `due_date` in UTC (shared helper, pre-existing); a deleted assignee/reporter profile degrades gracefully to "—". The checkbox was implemented as a completion toggle (a PRD-documented decision, not a row-selector).

**Verdict: READY FOR REVIEW.** Every acceptance criterion is met and independently verified; the only schema change (`updated_at`) is additive, applied, and committed; all evaluator Critical/Medium findings are resolved; typecheck and build are green. The implementation follows the codebase's established patterns (server-component fetch + client optimistic state + `revalidatePath`, separate profile fetch to avoid the 3-FK `tasks→profiles` ambiguity, batched `.in()` queries with empty-array guards — no N+1). It is complete and shippable pending manual QA.

### PR Feedback Summary
