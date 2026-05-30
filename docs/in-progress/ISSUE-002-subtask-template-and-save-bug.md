# ISSUE-002: Sub-tasks — full task template + save-to-DB bug

**Type:** Bug + Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #2

## Problem

Two related problems with sub-tasks in `TaskDetailPanel`:

1. **Not saving to DB.** `createSubTask` inserts a row without `activity_id`. The DB has a NOT NULL constraint on `activity_id` (evidenced by `createTask` returning `{ error: "Task must belong to an activity" }` when it is missing). The insert silently fails; the optimistic UI entry is removed without surfacing any error to the user.

2. **No full task template.** Sub-tasks are created via a plain inline text input (title only). They should use the same fields as a regular task: title, description, status, priority, assignee, due date, and activity — i.e., the full `TaskDetailPanel` create form.

## Acceptance Criteria

- [ ] Clicking "Add" in the sub-tasks section opens `TaskDetailPanel` in create mode, pre-configured as a sub-task.
- [ ] The create panel for a sub-task shows the same fields as a regular task (title, description, status, priority, assignee, due date, activity).
- [ ] The panel header reads "New sub-task" instead of "New task".
- [ ] The sub-tasks section is hidden in the create-sub-task panel (no nesting).
- [ ] On submit, the sub-task is saved to the database with `parent_task_id` set to the parent task's ID.
- [ ] `activity_id` is inherited from the parent task and pre-selected in the activity dropdown; it can be changed by the user.
- [ ] If the DB insert fails, the error is surfaced to the user (not silently swallowed).
- [ ] After a sub-task is created, it appears in the parent task's sub-tasks list.

## Affected Files

**Modify:**
- `src/components/task-detail-panel.tsx` — add `parentTaskId` and `defaultActivityId` wiring; replace inline sub-task input with opening a nested `TaskDetailPanel`; add error display when sub-task creation fails
- `src/app/actions/tasks.ts` — update `createTask` to accept optional `parent_task_id` from formData; relax the `activity_id` NOT NULL check when `parent_task_id` is present (sub-tasks may inherit the parent's activity)

**Read-only context (do not modify):**
- `src/types/database.ts` — `Task` type, `Activity` type
- `src/components/task-form.tsx` — existing simple task form (do NOT change; it is used elsewhere on the task board)

## Relevant Code Context

### Current sub-task create flow (task-detail-panel.tsx:243–268)

```tsx
// Current: opens inline text input, calls createSubTask
function handleAddSubTask() {
  setAddingSubTask(true);
  setTimeout(() => subTaskInputRef.current?.focus(), 50);
}

function handleSubTaskSubmit() {
  const t = subTaskInput.trim();
  setAddingSubTask(false);
  setSubTaskInput("");
  if (!t || !taskId) return;
  const optimistic: SubTask = { ... };
  setSubTasks((prev) => [...prev, optimistic]);
  startSubTransition(async () => {
    const res = await createSubTask(taskId, props.task!.component_id, t, props.eventSlug, props.componentSlug);
    if (res?.data) {
      setSubTasks((prev) => prev.map((s) => s.id === optimistic.id ? (res.data as SubTask) : s));
    } else {
      // ← error silently swallowed; optimistic item removed
      setSubTasks((prev) => prev.filter((s) => s.id !== optimistic.id));
    }
  });
}
```

### Bug in createSubTask (tasks.ts:76–105)

```ts
export async function createSubTask(
  parentTaskId: string,
  componentId: string,
  title: string,
  eventSlug: string,
  componentSlug: string,
) {
  // ...
  const { data, error } = await supabase.from("tasks").insert({
    component_id: componentId,
    parent_task_id: parentTaskId,
    title: title.trim(),
    priority: "medium",
    status: "todo",
    created_by: user.id,
    // ← activity_id is missing; DB requires NOT NULL → insert fails
  }).select().single();
```

### createTask gating on activity_id (tasks.ts:22–23)

```ts
if (!activityId) return { error: "Task must belong to an activity" };
```

This check must be relaxed for sub-tasks — when `parent_task_id` is present, `activity_id` is optional (inherited).

### TaskDetailPanel create-mode props (task-detail-panel.tsx:35–48)

```ts
interface CreateModeProps {
  mode: "create";
  task?: never;
  componentId: string;
  defaultActivityId?: string;   // ← already exists, use this for inheritance
  activities?: Activity[];
  members: Profile[];
  eventSlug: string;
  componentSlug: string;
  onClose: () => void;
  onTaskCreated: (task: TaskWithAssignee) => void;
  onTaskUpdate?: never;
  onTaskDelete?: never;
}
```

### Task type (database.ts:117–131)

```ts
export interface Task {
  id: string;
  component_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  due_date: string | null;
  parent_task_id: string | null;  // ← used to mark sub-tasks
  activity_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
```

## Implementation Steps

### 1. Update `createTask` to accept `parent_task_id` and relax `activity_id` validation

In `src/app/actions/tasks.ts`, inside `createTask`:

```ts
const parentTaskId = formData.get("parent_task_id") as string | null;

// Relax activity_id requirement for sub-tasks
if (!activityId && !parentTaskId) return { error: "Task must belong to an activity" };
```

Add `parent_task_id` to the insert payload:

```ts
const { data, error } = await supabase.from("tasks").insert({
  component_id: componentId,
  parent_task_id: parentTaskId || null,  // ← add this
  title: title.trim(),
  description: description || null,
  priority,
  assigned_to: assignedTo || null,
  due_date: dueDate || null,
  activity_id: activityId || null,
  created_by: user.id,
  status: "todo",
}).select().single();
```

After this change, `createSubTask` in `tasks.ts` is no longer needed for the new flow (keep it for now, do not delete it — it may be called elsewhere).

### 2. Add `parentTaskId` and `subTaskError` state to `TaskDetailPanel`

Add two new state variables and a new prop at the top of `TaskDetailPanel`:

```tsx
// In CreateModeProps, add:
parentTaskId?: string;   // when set, creates a sub-task instead of a top-level task

// State:
const [creatingSubTask, setCreatingSubTask] = useState(false);
const [subTaskError, setSubTaskError] = useState<string | null>(null);
```

In `handleCreate`, add `parent_task_id` to formData when it exists:

```tsx
if (props.parentTaskId) formData.set("parent_task_id", props.parentTaskId);
```

### 3. Replace inline sub-task input with a nested `TaskDetailPanel`

Replace `addingSubTask` inline input and `handleAddSubTask`/`handleSubTaskSubmit` logic with:

```tsx
// New state
const [creatingSubTask, setCreatingSubTask] = useState(false);
const [subTaskError, setSubTaskError] = useState<string | null>(null);
```

Replace the "Add" button's `onClick`:

```tsx
<button onClick={() => setCreatingSubTask(true)} ...>
  <Plus className="w-3 h-3" />Add
</button>
```

When `creatingSubTask` is true, render a nested `TaskDetailPanel`:

```tsx
{creatingSubTask && (
  <TaskDetailPanel
    mode="create"
    componentId={props.task!.component_id}
    defaultActivityId={props.task!.activity_id ?? undefined}
    activities={props.activities}
    members={props.members}
    eventSlug={props.eventSlug}
    componentSlug={props.componentSlug}
    parentTaskId={taskId!}
    onClose={() => setCreatingSubTask(false)}
    onTaskCreated={(newSub) => {
      setSubTasks((prev) => [...prev, newSub as SubTask]);
      setCreatingSubTask(false);
    }}
  />
)}
```

### 4. Hide sub-tasks section when panel is rendering in sub-task mode

In the sub-tasks section render block:

```tsx
{/* Sub-tasks — edit mode only, and not shown when this is a sub-task create panel */}
{!isCreate && !props.parentTaskId && (
  // ... existing sub-tasks section
)}
```

Also update the header label:

```tsx
<span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
  {isCreate ? (props.parentTaskId ? "New sub-task" : "New task") : "Task detail"}
</span>
```

### 5. Remove old inline sub-task input state and handlers

Remove these (they are replaced in steps 3–4):
- `addingSubTask` state
- `subTaskInput` state
- `subTaskInputRef`
- `handleAddSubTask` function
- `handleSubTaskSubmit` function
- The `{addingSubTask && ...}` JSX block
- The `startSubTransition` / `useTransition` import if no longer used

Keep `createSubTask` import only if it's still used somewhere; if not, remove that import too.

### 6. Load sub-tasks on edit mode open

Currently `subTasks` starts as `[]` and is never loaded from the DB. Add a load call in the `useEffect` that runs when the task is opened in edit mode:

```tsx
useEffect(() => {
  if (!isCreate && props.task) {
    // ... existing setters
    loadComments();
    loadAttachments();
    loadSubTasks();   // ← add this
  }
}, [isCreate ? null : props.task?.id]);

async function loadSubTasks() {
  if (!taskId) return;
  const supabase = createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", taskId)
    .order("created_at", { ascending: true });
  setSubTasks((data as SubTask[]) ?? []);
}
```

## Test Scenarios

**Happy path:**
- Open an existing task in edit mode → click "Add" in Sub-tasks section → `TaskDetailPanel` opens as "New sub-task" → fill in title + fields → click "Create task" → sub-task appears in list → DB row has `parent_task_id` = parent task UUID and `activity_id` = inherited value

**Pre-selected activity:**
- Parent task has an `activity_id` → opening the sub-task create panel shows that activity pre-selected in the Activity dropdown

**Change activity on sub-task:**
- User changes the activity in the sub-task panel → saved sub-task uses the overridden value, not the parent's

**Sub-task of sub-task:**
- Opening a sub-task in edit mode → sub-tasks section is NOT rendered (no nesting)

**Error case:**
- DB constraint violation on sub-task insert → error message is displayed in the sub-task create panel (not silently swallowed)

**Edit mode loads existing sub-tasks:**
- Open a parent task that already has sub-tasks in the DB → sub-tasks appear in the list immediately

**No activity on parent task:**
- Parent task has `activity_id = null` → sub-task create panel opens with "No activity" pre-selected → sub-task can be saved with or without an activity

## Constraints

- Do NOT modify `src/components/task-form.tsx` — it is a separate form used on the task board and is not related to this issue.
- Do NOT add sub-tasks-of-sub-tasks. When `parentTaskId` is set on `TaskDetailPanel`, omit the sub-tasks section entirely.
- Do NOT refactor the comment or attachment sections.
- Do NOT delete `createSubTask` from `tasks.ts` without checking if it is imported elsewhere.
- Follow the existing optimistic-update pattern: update `subTasks` state on `onTaskCreated`, no reload needed.
- The nested `TaskDetailPanel` renders as its own modal (backdrop + centered panel) — this is acceptable, it's the same component re-used.

## Technical Notes

- `defaultActivityId` prop already exists on `CreateModeProps` and is wired to the `activityId` initial state — no new prop is needed, just pass the parent task's `activity_id` as `defaultActivityId`.
- `loadSubTasks` uses the browser Supabase client (`createClient` from `@/lib/supabase/client`), consistent with `loadComments` and `loadAttachments` in the same file.
- The `createClient` import from `@/lib/supabase/client` is already present in `task-detail-panel.tsx` (used for file uploads) — reuse it.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files modified:**
- `src/app/actions/tasks.ts` — accepts `parent_task_id` from FormData; relaxes `activity_id` validation when `parent_task_id` is present; passes `parent_task_id` to DB insert
- `src/components/task-detail-panel.tsx` — added `parentTaskId?: string` to `CreateModeProps` and `parentTaskId?: never` to `EditModeProps`; replaced inline subtask input state/handlers with `creatingSubTask` + `subTaskError` state; added `loadSubTasks()` (Supabase client query by `parent_task_id`); wires `loadSubTasks()` into the edit-mode `useEffect`; renders a nested `TaskDetailPanel` in create mode when `creatingSubTask` is true; updated sub-tasks section guard from `!isCreate` to `!isCreate && !props.task?.parent_task_id` to suppress the section when editing a sub-task; updated header label to show "New sub-task" when `props.parentTaskId` is set; updated create-mode hint to only show for non-sub-task creates

**What was implemented:**
1. Sub-task save bug fixed — `createTask` now accepts `parent_task_id` and skips the `activity_id` NOT NULL guard for sub-tasks
2. Full task template for sub-tasks — clicking "Add" in the sub-tasks section opens a second `TaskDetailPanel` in create mode with `parentTaskId` and `defaultActivityId` inherited from the parent task
3. Sub-tasks loaded from DB when a parent task is opened in edit mode (previously always empty)
4. Sub-tasks section hidden when editing a task that is itself a sub-task (no nesting)
5. Removed unused `createSubTask` import and `useTransition`, `subTaskInputRef`, inline input state

**Test results:** No test runner configured in this project (confirmed in CLAUDE.md). TypeScript type-check passes for all modified files — only 1 pre-existing error in `page.tsx` (unrelated, existed before this change).

**Decisions not specified in PRD:**
- The sub-tasks section is now hidden based on `props.task?.parent_task_id` (edit mode) rather than `props.parentTaskId` (create mode). This correctly handles the "editing a sub-task should not show nested sub-tasks" requirement from the Test Scenarios section.
- `subTaskError` state is declared but not yet actively set by the nested panel (the nested panel's own `createError` handles display). The `subTaskError` div is rendered in the parent but only triggers if set manually — left as a display slot for future use.
- `createSubTask` function in `tasks.ts` is left in place (not deleted) as the PRD instructed.

**Concerns:**
- The backdrop `z-index` layering: the parent panel is at `z-50`, and the nested sub-task panel renders inside the same React tree with its own `z-40` backdrop and `z-50` panel. Since the nested panel is rendered BEFORE the parent panel div in the JSX, it will render behind the parent. I've placed the nested panel render BEFORE the `{/* Panel */}` div so it appears on top. This works because CSS stacking order within the same stacking context is last-in-wins — need to verify visually.

### Evaluator Report

**Summary:** 1 Critical, 1 Medium, 1 Low. All acceptance criteria are functionally correct except the critical z-index bug which would prevent users from seeing the nested panel at all.

**Findings:**

🔴 **Critical — `task-detail-panel.tsx:400-416` — Nested panel rendered before parent panel, hidden behind it**
The nested `TaskDetailPanel` is inserted before the parent panel `<div>` (line 420). Both use `z-50`. In CSS, when `position: fixed` elements share the same z-index, DOM order determines stacking — the element appearing LATER wins. The parent panel `<div>` appears after the nested panel in the DOM, so it covers the nested panel entirely. Users will see the parent panel with the nested panel invisible behind it.
Fix: Move the nested `TaskDetailPanel` block to after the parent panel's closing `</div>` (and inside the `<>` fragment's closing `</>`). With the nested panel's z-50 panel appearing after the parent's z-50 panel in the DOM, it will correctly stack on top.

🟡 **Medium — `task-detail-panel.tsx:123,574-576` — `subTaskError` state declared but never set**
`subTaskError` is initialized, a display block renders it, but nothing ever calls `setSubTaskError`. The nested panel handles its own error display via `createError` state internally. This is dead state/dead JSX.
Fix: Remove `subTaskError` state and the `{subTaskError && <p>...}` render block.

🔵 **Low — `tasks.ts:37` — `status` field hardcoded to `"todo"` in `createTask` regardless of form selection**
The create form renders a Status dropdown, but `createTask` always inserts `status: "todo"`. This is pre-existing behavior (not introduced by this PR) and out of scope. Noted for awareness.

**Overall assessment:** One click away from shippable — the logic, DB fix, and template wiring are all correct. The critical z-index bug would make the sub-task create panel completely invisible to users and must be fixed before this ships.

### Coder Revision Report

**🔴 Critical — z-index stacking bug — Fixed**
Moved the nested `TaskDetailPanel` block from before the parent panel `<div>` to after its closing `</div>`. Now both panels are `z-50` but the nested panel appears later in DOM order, so it correctly renders on top of the parent panel.

**🟡 Medium — Dead `subTaskError` state — Fixed**
Removed `subTaskError` state declaration, removed `setSubTaskError(null)` call from the "Add" button handler, and removed the dead `{subTaskError && ...}` display block. The nested panel handles its own error display internally via `createError`.

**🔵 Low — Status hardcoded in `createTask` — Intentionally skipped**
Pre-existing behavior, out of scope for this issue.

**Test results after revisions:** TypeScript type-check passes for all modified files — only 1 pre-existing error in `page.tsx` (unrelated). No test runner in project.

**Remaining Low items:** Status field ignored in create mode (pre-existing, noted above).

### Documentation Report

No doc changes needed. The changes are entirely internal (bug fix + UI behavior change in an existing component). No new environment variables, setup steps, commands, or developer-facing API changes were introduced.

### Coordinator Summary

**Acceptance Criteria Check:**
- ✅ Clicking "Add" opens `TaskDetailPanel` in create mode for sub-tasks
- ✅ Create panel shows all fields (title, description, status, priority, assignee, due date, activity)
- ✅ Header reads "New sub-task" when `parentTaskId` is set
- ✅ Sub-tasks section hidden in create-sub-task panel (guarded by `!isCreate` already; and when editing a sub-task, guarded by `!props.task?.parent_task_id`)
- ✅ Sub-task saved to DB with `parent_task_id` set (`createTask` accepts and inserts it)
- ✅ `activity_id` inherited from parent via `defaultActivityId` prop; user can override
- ✅ DB errors surfaced to user (nested panel's own `createError` state displays the error)
- ✅ Created sub-task appears in parent list (`onTaskCreated` appends to `subTasks` state)

**Critical/Medium findings addressed:**
- ✅ z-index stacking bug fixed (nested panel moved to after parent panel in DOM)
- ✅ Dead `subTaskError` state removed

**Tests:** No test runner in this project; TypeScript check passes for all modified files.

**Docs:** No updates needed.

**Remaining concerns:** None that block shipping. The pre-existing `status` field being ignored in create mode is unrelated to this issue.

**Verdict: READY FOR REVIEW**

Both bugs are resolved with clean, minimal changes to exactly two files. The save bug is fixed by relaxing the `activity_id` guard in `createTask` when `parent_task_id` is present and threading `parent_task_id` through the form. The template bug is fixed by reusing the existing `TaskDetailPanel` component in create mode, inheriting the parent task's activity, and rendering the nested panel after the parent in the DOM for correct z-stacking. The implementation adds no new abstractions, touches no unrelated code, and leaves the existing `createSubTask` action intact.

### PR Feedback Summary
