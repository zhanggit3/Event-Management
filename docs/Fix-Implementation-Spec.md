# Fix Implementation Specification
**Project:** Event Management Platform (Next.js 16 + Supabase)
**Prepared for:** Developer implementing bug fixes
**Source reviews:** QA Engineer, Security Auditor, Code Reviewer

---

## HOW TO READ THIS DOCUMENT

Each fix has a unique ID, severity, the exact file(s) to change, plain-English instructions for what to do, and acceptance criteria. Work top-to-bottom: MUST FIX items first, then SHOULD FIX, then NICE TO FIX.

A "DEVOPS REQUIRED" section at the end flags items that need database or infrastructure changes outside this implementation pass.

---

## MUST FIX (Critical / High)

---

### FIX-001
**Title:** Prevent XSS via `javascript:` URIs in comment link rendering
**Severity:** Critical (XSS)
**File:** `src/components/task-detail-panel.tsx` — `renderBody` function, lines 80–91

**What to do:**

The `renderBody` function renders Markdown-style links from comment text. It extracts the href from `match[2]` and renders it directly into an `<a>` tag with no URL validation. A comment containing `[click me](javascript:alert(1))` will execute arbitrary JavaScript when a user clicks the link.

Before rendering the `<a>` tag, validate the URL by parsing it and checking the protocol. The logic should be:

1. Attempt to parse `match[2]` as a URL using the `URL` constructor, catching any parse error.
2. If parsing fails or if the resulting protocol is not `"https:"` or `"http:"`, do NOT render an `<a>` tag. Instead, render the match as plain text — for example, render the display text with the raw URL in parentheses as a plain `<span>`.
3. Only render the `<a href={...}>` when the protocol is `"http:"` or `"https:"`.

This fix also covers what would come through from FIX-002 (the link insertion popover). Even after FIX-002 adds client-side validation in the popover, the `renderBody` function must remain the final, authoritative safety gate because stored comments could contain anything.

**Acceptance criteria:**
- A comment containing `[test](javascript:alert(document.cookie))` renders the text without an `<a>` tag — no link, no clickable element, no script execution.
- A comment containing `[Google](https://google.com)` renders a normal clickable link.
- A comment containing `[Bad](ftp://example.com)` is rendered as plain text (no link), since `ftp:` is not in the allowlist.

---

### FIX-002
**Title:** Validate URL scheme in the link insertion popover before appending to comment body
**Severity:** High
**File:** `src/components/task-detail-panel.tsx` — `insertLink` function, lines 304–309

**What to do:**

The `insertLink` function takes the user-typed URL from `linkUrl` state and appends it directly to `commentBody` with no validation. This feeds malformed or malicious URLs into the comment text, which is then parsed by `renderBody` (see FIX-001).

Add a validation step at the top of `insertLink`, before the `setCommentBody` call:

1. Trim `linkUrl` and attempt to parse it with the `URL` constructor in a try/catch.
2. If parsing fails, or if the resulting protocol is not `"https:"` or `"http:"`, call `setError` (add a local `linkError` state string, similar to the existing `error` state in the dialog) and return without appending to `commentBody`. Display the error message near the Insert button inside the link popover — something like "URL must start with https:// or http://".
3. If validation passes, proceed with the existing `setCommentBody` call.

**Acceptance criteria:**
- Typing `javascript:alert(1)` in the URL field and clicking Insert shows an error message and does not append anything to the comment body.
- Typing `https://example.com` works as before.
- The error message clears when the user modifies the URL field.

---

### FIX-003
**Title:** Restrict `updateComponent` to an explicit allowlist of columns
**Severity:** High (data integrity / authorization bypass)
**File:** `src/app/actions/components.ts` — `updateComponent` function, lines 149–168

**What to do:**

`updateComponent` accepts an `updates` object typed as `{ name?, icon?, color?, is_active?, sort_order? }` and passes it directly to Supabase `.update(updates)`. TypeScript types are only enforced at compile time; a crafted server action call can pass additional columns like `event_id` to move a component to a different event (and therefore a different organization).

Fix this by building a new, explicit object inside the server action from only the allowed fields. Do not pass the `updates` parameter directly to Supabase. Instead:

1. Declare a new object (e.g., `const safeUpdates: Record<string, unknown> = {}`).
2. For each allowed field (`name`, `icon`, `color`, `is_active`, `sort_order`), check if the field is present in `updates` using `Object.prototype.hasOwnProperty` or an `"in"` check, and if so, copy only that field into `safeUpdates`.
3. Pass `safeUpdates` to `.update(safeUpdates)`.

This ensures that even if a caller somehow passes `event_id`, `organization_id`, or any other column, it is silently ignored.

Also address the `color` and `sort_order` field constraints per FIX-010 and FIX-011 below (those are lower severity, but since you are already in this function, apply them together).

**Acceptance criteria:**
- The function signature for `updates` remains the same for TypeScript callers.
- Only `name`, `icon`, `color`, `is_active`, and `sort_order` can ever appear in the Supabase `.update()` call, regardless of what is passed at runtime.
- Passing an extra key like `event_id` in the updates object has no effect on the database.

---

### FIX-004
**Title:** Verify server auth before writing to `component_templates` in `saveComponentAsTemplate`
**Severity:** High (authorization bypass)
**File:** `src/app/actions/components.ts` — `saveComponentAsTemplate` function, lines 109–147

**What to do:**

`saveComponentAsTemplate` reads `organizationId` from `formData` with no auth check. There is nothing preventing an authenticated user from passing any arbitrary `organization_id` and saving a template into another organization's library.

Add an authorization check immediately after the `supabase` client is created (at the very top of the function, before reading any form fields):

1. Call `supabase.auth.getUser()` and destructure the `user`.
2. If `user` is null, return `{ error: "Unauthorized" }` immediately.
3. After reading `componentId` from `formData`, verify that the authenticated user is actually a member of the organization that owns this component. Do this by querying `organization_members` filtered to the user's ID and the `organization_id` from the form, checking for any row. If no row is found, return `{ error: "Unauthorized" }`.

Step 3 is the critical guard. Without it, any logged-in user can write to any org's template library simply by supplying a different `organization_id`.

**Acceptance criteria:**
- A logged-in user who does not belong to the organization corresponding to the submitted `organization_id` receives `{ error: "Unauthorized" }` and nothing is inserted into `component_templates`.
- A logged-in user who does belong to the correct organization can save templates normally.
- An unauthenticated call (which should not be reachable due to middleware, but must be defended in depth) returns `{ error: "Unauthorized" }`.

---

### FIX-005
**Title:** Await server response in `handleSave` before updating parent UI state; show error on failure
**Severity:** High
**File:** `src/components/task-detail-panel.tsx` — `handleSave` function, lines 207–223

**What to do:**

Currently `handleSave` calls `props.onTaskUpdate(updates)` on line 220 before `await updateTask(...)` on line 221. This means the parent component's UI is mutated with the new values before the server has confirmed success. If the server call fails, the UI is left in a permanently incorrect state with no way to recover.

Rewrite `handleSave` so that:

1. The `await updateTask(...)` call happens first.
2. The return value of `updateTask` is captured (call it `result`).
3. If `result?.error` is truthy, display an error to the user. Add a new state variable `saveError` (a `string | null`, similar to `createError` which already exists in this file). Set `saveError` to `result.error` and return — do not call `props.onTaskUpdate`.
4. Only if the result does not have an error, call `props.onTaskUpdate(updates)`. Then set `saveError` to `null`.
5. Render the `saveError` message in the JSX in the same style as the existing `createError` block (the red border div at lines 429–433).

Also address FIX-007 (post-save feedback) while you are here — see the SHOULD FIX section.

Also address the `Record<string, any>` type (FIX-014, NICE TO FIX) while in this function — change the type of `updates` to `Partial<Task>` and remove the eslint-disable comment.

**Acceptance criteria:**
- If `updateTask` returns `{ error: "..." }`, the error text is visible in the panel, and `props.onTaskUpdate` is NOT called — the parent state is unchanged.
- If `updateTask` succeeds, the parent state is updated as before.
- The Save button is disabled while the request is in flight (already handled by `saving` state).

---

### FIX-006
**Title:** Await delete confirmation from server before closing panel and notifying parent
**Severity:** High
**File:** `src/components/task-detail-panel.tsx` — `handleDeleteTask` function, lines 357–363

**What to do:**

Currently `handleDeleteTask` calls `props.onTaskDelete(taskId)` and `props.onClose()` before `await deleteTask(...)`. If the server delete fails, the panel has already closed and the task has already been removed from the parent's UI state — with no recovery path.

Rewrite `handleDeleteTask` so that:

1. `await deleteTask(taskId, props.eventSlug, props.componentSlug)` is called first and the return value captured as `result`.
2. If `result?.error` is truthy, display the error (use the `saveError` state introduced in FIX-005, or add a separate `deleteError` state — either is acceptable). Return without closing.
3. Only if the delete succeeds, call `props.onTaskDelete(taskId)` and then `props.onClose()`.

**Acceptance criteria:**
- If `deleteTask` returns an error, the panel remains open and the error is shown. The parent's task list is not modified.
- If `deleteTask` succeeds, the panel closes and the task is removed from the parent's list, same as before.

---

### FIX-007
**Title:** Wrap `JSON.parse` in `createComponentFromTemplate` in a try/catch with shape validation
**Severity:** High
**File:** `src/app/actions/components.ts` — `createComponentFromTemplate` function, lines 86–99

**What to do:**

On line 87, `JSON.parse(tasksJson)` has no error handling. If `tasksJson` is malformed (empty string, truncated, or crafted invalid JSON), this throws an unhandled exception that will surface as a 500 error to the client.

Wrap the `JSON.parse` call in a try/catch:

1. Place `JSON.parse(tasksJson)` inside a `try` block.
2. In the `catch` block, return `{ error: "Invalid template data" }`.
3. After parsing succeeds, add a basic shape check: verify that the result is an `Array`. If it is not, return `{ error: "Invalid template data" }`.
4. Optionally (but recommended), filter the parsed array to only include items that have a non-empty `title` string, discarding any malformed entries, rather than failing the whole operation.

**Acceptance criteria:**
- Passing invalid JSON as `tasks_json` returns `{ error: "Invalid template data" }` and does not throw.
- Passing a valid JSON array of task objects creates the component and tasks as expected.
- Passing a JSON non-array (e.g., `"null"` or `"{}"`) returns `{ error: "Invalid template data" }`.

---

## SHOULD FIX (Medium)

---

### FIX-008
**Title:** Detect and surface errors in `reorderComponents`
**Severity:** Medium
**File:** `src/app/actions/components.ts` — `reorderComponents` function, lines 185–200

**What to do:**

`reorderComponents` fires N individual `.update()` Supabase calls via `Promise.all`, discards all results, and unconditionally returns `{ success: true }`. If any update fails (e.g., network error, RLS denial), it is silently ignored.

Change the function as follows:

1. Capture the array of results from `Promise.all`: `const results = await Promise.all(updates)`.
2. Check each result for an error. Collect all error messages into an array.
3. If any errors are present, return `{ error: "Some components failed to reorder. Please refresh." }` (or include the specific error messages if useful).
4. Only if all results have no error, proceed with `revalidatePath` and return `{ success: true }`.

Additionally, address the batch upsert suggestion from the Code Reviewer (FIX-015) here: instead of N individual updates, use a single `.upsert()` call with the array of `{ id, sort_order }` objects. Supabase supports bulk upsert. This reduces N round-trips to 1 and makes the error handling simpler — there is only one result to check. If batch upsert is not feasible right now, at minimum implement the error-checking described above.

**Acceptance criteria:**
- If any individual update fails, the function returns an error object instead of `{ success: true }`.
- The caller (the drag-and-drop reorder handler in `component-list-manager.tsx`) must handle this returned error — display a toast or error message to the user. Verify that the caller checks for `result.error`.

---

### FIX-009
**Title:** Show error to user when comment posting fails in `handlePostComment`
**Severity:** Medium
**File:** `src/components/task-detail-panel.tsx` — `handlePostComment` function, lines 311–320

**What to do:**

The `handlePostComment` function calls `createTaskComment` and checks `result?.data` to add the comment to state, but has no `else` branch for when posting fails (no error displayed, comment text stays in the textarea with no feedback).

Add an `else` branch after the `if (result?.data)` block:

1. If `result?.error` is truthy (or if `result?.data` is absent), display an error message. Reuse or add a `commentError` state string. Render it near the Post button in the JSX.
2. On success, clear `commentError` (set it to `null`).
3. The comment body text should remain in the textarea on failure so the user can retry without retyping.

**Acceptance criteria:**
- When `createTaskComment` returns an error, an error message is visible to the user in the comment area.
- The comment text is not cleared on failure.
- On success, the comment appears in the list and the textarea is cleared as before.

---

### FIX-010
**Title:** Inspect errors from `loadComments` and `loadAttachments`
**Severity:** Medium
**File:** `src/components/task-detail-panel.tsx` — `loadComments` and `loadAttachments` functions, lines 161–170

**What to do:**

Both `loadComments` and `loadAttachments` call their respective server actions and set state from the result, but neither inspects whether the action returned an error. If the server action fails, the state is set to the empty default and the user sees an empty list with no indication that loading failed.

Check how `getTaskComments` and `getTaskAttachments` are defined to confirm their return shape. If they return `{ data, error }`, inspect the error field. If they simply return the data array directly (and throw or return empty on error), add try/catch wrappers.

For both functions:

1. If the action signals an error (either via a returned error field or a thrown exception), set a `loadError` state string (add one if not present) so the user sees something like "Failed to load comments. Please try again."
2. If successful, clear `loadError`.

Render the `loadError` in the panel body above the comments/attachments section.

**Acceptance criteria:**
- If `getTaskComments` fails, the user sees an error message instead of a silent empty list.
- If `getTaskAttachments` fails, similarly.
- On success, no error message is shown.

---

### FIX-011
**Title:** Fix timezone-sensitive date calculation in `addOneDay`
**Severity:** Medium
**File:** `src/components/calendar/component-calendar.tsx` — `addOneDay` function, lines 92–96

**What to do:**

`addOneDay` constructs a Date using `new Date(dateStr + "T00:00:00")` (local midnight) then calls `.toISOString()` to get the date string for FullCalendar. In UTC-negative timezones (e.g., UTC-5), local midnight on 2026-05-10 is 2026-05-10T00:00:00 local time, which is 2026-05-10T05:00:00Z. After adding one day and calling `.toISOString()`, the result is `2026-05-11T05:00:00.000Z`, and `.slice(0, 10)` yields `2026-05-11` — which is correct in this case. However, in UTC-12, local midnight on the 10th is UTC noon on the 10th, and after +1 day and slice it becomes `2026-05-11` — still correct.

The real problem is that if `dateStr` does not have the `T00:00:00` suffix appended and the `Date` constructor interprets it as UTC midnight (which happens when you pass an ISO date string like `"2026-05-10"` without the time suffix — the spec treats bare date strings as UTC), then the local offset shifts the effective date.

The safest fix: do the addition entirely in the date string domain without using the `Date` object:

1. Split `dateStr` on `"-"` to get `[year, month, day]` as numbers.
2. Create a `Date` object with `new Date(year, month - 1, day + 1)` — this uses the local calendar.
3. Return the resulting date formatted as `"YYYY-MM-DD"` using `.getFullYear()`, `.getMonth() + 1`, and `.getDate()`, padding month and day with leading zeros as needed.

This avoids UTC/local conversion entirely.

**Acceptance criteria:**
- `addOneDay("2026-05-10")` returns `"2026-05-11"` regardless of the user's timezone.
- `addOneDay("2026-12-31")` returns `"2027-01-01"`.
- Multi-day activity ranges still display correctly on the calendar (the end date for FullCalendar exclusive end is correctly one day past the `due_date`).

---

### FIX-012
**Title:** Check `createComponentFromTemplate` task bulk-insert result for errors
**Severity:** Medium
**File:** `src/app/actions/components.ts` — `createComponentFromTemplate` function, lines 86–99

**What to do:**

On line 89, the `await supabase.from("tasks").insert(...)` result is discarded. If the bulk insert fails (e.g., constraint violation, network error), the component is already created but the template tasks are silently lost, and the function still returns `{ success: true }`.

Capture the result of the insert. If the `error` field is non-null, log a warning (or return a partial success indicator). At minimum, do not silently discard the failure. A reasonable behavior is to return `{ success: true, warning: "Component created but some tasks failed to import" }` so the caller can optionally surface this to the user.

**Acceptance criteria:**
- If the task bulk insert fails, the function does not return `{ success: true }` without any indication of the partial failure.
- The component is still created (the task insert failure should not roll back the component).

---

### FIX-013
**Title:** Revalidate component-level path after `updateComponent`
**Severity:** Medium
**File:** `src/app/actions/components.ts` — `updateComponent` function, lines 165–167

**What to do:**

`updateComponent` calls `revalidatePath` for the event dashboard and the event settings page, but not for the component detail page itself. If a user edits a component's name, icon, or color from the component detail page, the component page header (which shows name, icon, and color) continues to show stale data until the user navigates away and back.

Add a third `revalidatePath` call inside `updateComponent`. The path should be the component detail page: `/events/${eventSlug}/${componentSlug}`.

The function currently receives `componentId` and `eventSlug` but not `componentSlug`. Add `componentSlug: string` as a third parameter to `updateComponent`. Update the function signature, update the call inside `edit-component-dialog.tsx` (which calls `updateComponent`) to pass `componentSlug`, and add the `revalidatePath` call.

**Acceptance criteria:**
- After saving changes in the Edit Component dialog, the component page header reflects the new name/icon/color without requiring a manual page reload.
- `revalidatePath` is called for all three paths: event dashboard, event settings, and the component detail page.

---

## NICE TO FIX (Low / Nitpick)

The following are low-priority polish items. Brief instructions only.

---

### FIX-014
**Title:** Skip `router.refresh()` in `EditComponentDialog` when no changes were made
**Severity:** Low
**File:** `src/components/edit-component-dialog.tsx` — `handleSubmit`, line 77

**What to do:** The `router.refresh()` call at line 77 is outside the `if (Object.keys(updates).length > 0)` block. Move it inside that block so it only fires when an actual update was submitted.

---

### FIX-015
**Title:** Type `updates` in `handleSave` as `Partial<Task>` instead of `Record<string, any>`
**Severity:** Low (already addressed as part of FIX-005)
**File:** `src/components/task-detail-panel.tsx` — `handleSave`, line 210

**What to do:** Remove the `eslint-disable` comment and change the type annotation of `updates` to `Partial<Task>`. The `Task` type is already imported on line 12.

---

### FIX-016
**Title:** Remove `void templateId` dead code from `createComponentFromTemplate`
**Severity:** Low
**File:** `src/app/actions/components.ts` — line 102

**What to do:** Delete the line `void templateId; // reserved for future analytics`. If analytics tracking is genuinely planned, track it at this point with a real call; if not, just remove the variable read entirely. Note that `templateId` is still declared and read from `formData` above — that declaration should remain if there is a real future use case; otherwise remove it too.

---

### FIX-017
**Title:** Remove dead `else` (DEV fallback) branches from page files
**Severity:** Low
**Files:**
- `src/app/(dashboard)/events/[eventSlug]/page.tsx` — the `else` block at line 121
- `src/app/(dashboard)/events/[eventSlug]/[componentSlug]/page.tsx` — the corresponding `else` block

**What to do:** Since middleware (`proxy.ts`) guarantees that no unauthenticated user reaches these pages, the `else { event = DEV_EVENTS... }` branches are unreachable dead code. Remove the `else` blocks and the `DEV_EVENTS`, `DEV_COMPONENTS`, `DEV_TASKS`, and `DEV_MEMBERS` constants at the top of each file. After removal, the `if (user)` guard can be removed too and the block contents promoted to top-level. Do this only after confirming that removing dev fallback data does not break any other code path (search for references to `DEV_EVENTS` etc. before deleting).

---

### FIX-018
**Title:** Move `getCountdown` to module scope in the event dashboard page
**Severity:** Low
**File:** `src/app/(dashboard)/events/[eventSlug]/page.tsx` — `getCountdown` defined inside the render function at line 129

**What to do:** Cut the `getCountdown` function out of the `EventDashboardPage` function body and paste it at module scope (above the `export default async function`). It has no dependencies on the function's closure variables.

---

### FIX-019
**Title:** Pre-build a component lookup Map in `EventMasterCalendar` instead of calling `.find()` inside `.map()`
**Severity:** Low
**File:** `src/components/calendar/event-master-calendar.tsx` — `taskEvents` mapping, line 60

**What to do:** Before the `.map()` call on `serverTasks`, build a `Map<string, ComponentInfo>` from the `components` array: `const componentMap = new Map(components.map(c => [c.id, c]))`. Then replace `components.find((c) => c.id === t.component_id)` with `componentMap.get(t.component_id)`. This changes O(n*m) to O(n+m).

---

### FIX-020
**Title:** Inline the five single-line wrapper handlers in `task-detail-panel.tsx`
**Severity:** Low (nitpick)
**File:** `src/components/task-detail-panel.tsx` — lines 367–371

**What to do:** The five functions `handleStatusChange`, `handlePriorityChange`, `handleAssigneeChange`, `handleDueDateChange`, and `handleActivityChange` each do nothing but call `setState`. Remove the wrappers and inline the `setState` call directly in the JSX `onChange` handlers where each wrapper is called.

---

### FIX-021
**Title:** Parallelize independent Supabase queries in the event dashboard page
**Severity:** Low (performance)
**File:** `src/app/(dashboard)/events/[eventSlug]/page.tsx` — inside the `if (user)` block, lines 73–119

**What to do:** Several queries in this block are independent of each other and run sequentially. Wrap the independent ones in `Promise.all`. The dependency chain is: `dbEvent` must resolve first (it is needed for `organization_id` and `id`). After `dbEvent` is available, these four queries are independent and can be parallelized: the `components` query, the `membership` query, the `templates` query, and the `otherEvents` query. After `components` resolves (needed for `componentIds`), the `tasks` query and the `masterCalendarEvents` query can run in parallel. Use two sequential `await Promise.all(...)` calls to express this.

---

## DEVOPS REQUIRED

The following issues were identified by the Security Auditor but require RLS policy changes, database schema changes, or Supabase storage bucket policy changes. These are out of scope for this implementation pass and must be coordinated with the platform/DevOps team.

**SEC-A: RLS policy — scope `component_templates` writes to org members only.**
`saveComponentAsTemplate` inserts into `component_templates` using `organization_id` from the client request. Even with FIX-004's application-layer check, an RLS policy on `component_templates` should enforce that the inserting user is a member of the target organization, as defense-in-depth.

**SEC-B: RLS policy — prevent cross-org component moves via `updateComponent`.**
`updateComponent` spreads the client `updates` object into Supabase `.update()`. FIX-003 adds an application-layer allowlist. As defense-in-depth, an RLS policy on the `components` table should prevent any authenticated user from updating `event_id` (a column that should never change after creation), so even if the allowlist is accidentally bypassed, the database rejects it.

**SEC-C: `color` field hex validation in `updateComponent`.**
The `color` column accepts any string. Add a CHECK constraint on `components.color` to enforce a `#RRGGBB` hex format pattern, or enforce it via RLS policy / database trigger. (The application-layer fix in FIX-003 can also add a regex check, but database enforcement is the correct final gate.)

**SEC-D: `role` field allowlist in `addComponentMember` and `addComponentLead`.**
The `role` column for both `component_members` and `component_leads` accepts arbitrary strings. Add a CHECK constraint on both tables to restrict `role` to a defined set of values (e.g., `"lead"`, `"co-lead"`, `"member"`). As an interim measure, the server actions can validate the value against a hardcoded allowlist string array before inserting.

**SEC-E: User enumeration in `addComponentLead`.**
The error message `"No user found with that email"` confirms whether an email address is registered. Changing it to a generic message (e.g., `"Invitation sent"`) requires a product decision about the intended UX flow, since it may affect legitimate "did I type the email wrong?" feedback. Flag for product review.

---

*End of specification.*
