# ISSUE-018 — Manual Review Checklist

Run `npm run dev` (port 3000). Use a desktop browser; do one mobile-width pass for the tooltip/sidebar items.

## Preconditions / accounts
- [ ] You can create a **brand-new** account (needed for #1 — a user with a fresh workspace and zero events). Use a throwaway email.
- [ ] You have access to an existing populated account (e.g. `admin_a@test.com`) with at least one org, one event, and ≥1 saved component template (for #5/#6).
- [ ] Build sanity already passed: `npx tsc --noEmit` (0 errors) and `npm run build` (19 routes). Re-run if you pulled changes.

---

## #1 — Post-onboarding lands in the workspace (no loop)
- [ ] Sign up as a new user → you are taken to `/onboarding/profile`.
- [ ] Complete step 1 (name), step 2 (role or skip), step 3 (workspace name), step 4 → **Skip** the org step.
- [ ] You are redirected to `/` and see **"{FirstName}'s Workspace"** with a **"Create your first event"** button.
- [ ] You do **NOT** see "You don't have a workspace yet" (`NoOrgPrompt`).
- [ ] You do **NOT** see the guest copy "You have not been invited to any events yet" (the create button must be present).
- [ ] Reload `/` — still the workspace dashboard (no flip-flop, no loop).
- [ ] Regression: a user who **creates an org** during onboarding still lands on a normal dashboard.
- [ ] Regression: an existing user with events still sees their event cards/stats.

## #2 — Skip button visibility (onboarding)
- [ ] On step 4 (Create an organization), the **"Skip for now"** button is clearly legible (visible secondary button, not faint grey text) and obviously clickable.
- [ ] On step 2 (Role), the **Skip** button is equally legible (only shows when no role is selected).
- [ ] Clicking Skip on step 4 still completes onboarding (profile + workspace created, no org).

## #3 — Post-create event redirect
- [ ] From the dashboard, click **New Event** → fill name (+ optional description/address/date) → **Create Event**.
- [ ] You land on `/events/{slug}` (the **event overview**), NOT `/events/{slug}/settings`.
- [ ] The auto-created **Finance** component is visible on that page.
- [ ] Error path: trigger a failure (e.g. duplicate slug) → error shows, you stay on the form, the button re-enables.

## #4 — Tooltip not clipped
- [ ] On an event's component page (dashboard tab), hover an **activity row** → the **Edit** and **Delete** icon tooltips appear **fully**, above the icons, not cut off by the card edge.
- [ ] Hover the **sidebar** rail icons → their tooltips still appear to the right and are fully visible.
- [ ] Scroll the activity list and hover near the top/bottom — tooltip still readable (not clipped by the scroll frame).
- [ ] Keyboard: tab to an activity action button → tooltip appears on focus (a11y).
- [ ] Mobile width: sidebar tooltips don't break layout.

## #5 — Full activity edit (not just name)
- [ ] On the component dashboard tab, click the **pencil (Edit)** on an activity → a modal opens **pre-filled** with the activity's values.
- [ ] The editor exposes: **name, description, color, status, priority, start date, due date, owner, assignee, tags**.
- [ ] Change several fields (e.g. status, priority, due date, color, add a tag, set assignee) → **Save Changes**.
- [ ] The activity row reflects the changes **immediately** (no full reload needed).
- [ ] Reload the page → changes **persisted**.
- [ ] Clearing a field: blank description / dates / priority saves as empty (no crash); removing all tags saves an empty list.
- [ ] Regression: **New Activity** (create) still works with the same full field set.
- [ ] Cancel / close (✕) discards edits.

## #6 — Functional component templates on Create Event
- [ ] Precondition: the event's org has ≥1 saved component template (save one via a component's **Save as Template**, or check `/company/templates`).
- [ ] On **New Event**, the bottom section lists the **org's real saved templates** (not the old hardcoded Festival/Conference/etc. examples).
- [ ] Select 2 templates → Create Event → on the event page you see **Finance + those 2 components**, each with its activities/tasks/subtasks instantiated.
- [ ] Create an event with **no** templates selected → only **Finance** is created (unchanged behavior).
- [ ] Org with **zero** templates → the section shows a helpful empty state linking to `/company/templates` (no hardcoded examples); event still creates.
- [ ] Two templates whose names collide (or collide with `finance`) → component slugs are deduped, no insert error, all components created.
- [ ] The `no-org` demo path (unauthenticated/no real org) shows **no** template picker.

## #7 — Dark theme (no brutalist)
- [ ] **Delete confirmations** (AlertDialog) — delete an activity (or any item using the confirm dialog): the dialog is **dark** (`#0D0D1C` panel, blurred backdrop), the destructive button is **red**, Cancel is a subtle grey secondary. No black borders / offset shadows / mono-uppercase.
- [ ] **Edit Component dialog** — on a component page, click **Edit**: trigger button, inputs, emoji icon picker, color swatches, and Save/Cancel are all **dark-themed** (indigo/violet accents, rounded). No `#00CC66` green chrome, no thick black borders, no `#FFF8F0` cream background.
- [ ] General sweep of the component page, settings, and dialogs — nothing renders in the old brutalist style.
- [ ] (Optional) Confirm deleted screens are truly gone: there should be no route/link that rendered the old `task-board`, `activities-tab`, or `create-organization-form` (they were unused — nothing should 404 or break).

---

## Sign-off
- [x] All boxes above checked, or deviations noted below.
- [x] No console errors during the flows.

**Notes / deviations:** Everything passed manual review (2026-06-09). No deviations.
