# CLAUDE.md — Event Platform

Project documentation for AI coding assistants. Read this before touching any code.

---

## 1. Project Overview

A multi-tenant event management platform for nonprofits and event organizers. Organizations create events; each event is broken into **components** (Finance, Marketing, Volunteer, etc.). Each component has its own task board (kanban), notes, team member roster, shared file folder, calendar, and resource link board. The app is pre-auth-gated for demo purposes — unauthenticated visitors see hardcoded dev fixture data rather than being redirected.

---

## 2. Tech Stack

| Layer | Library / Version | Notes |
|---|---|---|
| Framework | Next.js 16.2.6 | App Router only — no Pages Router |
| React | 19.2.4 | Server Components default; hooks require `"use client"` |
| Language | TypeScript 5 | Strict mode assumed |
| Styling | Tailwind CSS 4 + tw-animate-css | `@tailwindcss/postcss` adapter |
| UI components | shadcn (Radix UI primitives) | Components live in `src/components/ui/` |
| Database / Auth | Supabase (`@supabase/supabase-js` 2, `@supabase/ssr` 0.10) | SSR cookie-based sessions |
| Calendar | FullCalendar 6.1.x (`@fullcalendar/react`, daygrid, timegrid, interaction) | Must be rendered client-side only |
| DnD | `@hello-pangea/dnd` 18 | Used for component reordering |
| Icons | lucide-react 1.14 | |

---

## 3. Key Commands

```bash
npm run dev      # start dev server (port 3000)
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint
```

No test runner is configured.

---

## 4. Architecture

### App Router structure

```
src/app/
  (auth)/          # unauthenticated layout — centered card, no sidebar
    login/         # "use client", calls Supabase browser client directly
    signup/
  (dashboard)/     # authenticated layout — sidebar + main
    page.tsx                               # dashboard / event list
    settings/page.tsx                      # org member management
    events/
      new/                                 # create event form
      [eventSlug]/page.tsx                 # event overview + master calendar
      [eventSlug]/settings/page.tsx        # edit event, manage components
      [eventSlug]/[componentSlug]/page.tsx # component detail (tabs)
  actions/         # ALL server actions live here
  api/auth/callback/route.ts   # OAuth code exchange
```

### Server vs client conventions

- **Server Components** (default): layout files, all `page.tsx` files. Fetch from Supabase server client, pass data as props.
- **Client Components** (`"use client"`): anything with state, FullCalendar, dialogs, forms with optimistic updates. Files: `sidebar.tsx`, `note-section.tsx`, `files-tab.tsx`, `component-calendar.tsx`, `event-master-calendar.tsx`, `add-component-dialog.tsx`, `component-list-manager.tsx`, `task-card.tsx`, `task-form.tsx`, `team-member-list.tsx`, all `resources/` components.
- **Server Actions** (`"use server"`): all files under `src/app/actions/`. Called from client components via direct import. Always call `revalidatePath()` on success.

### Server Actions pattern

Every action follows this shape:

```ts
"use server";
export async function doThing(formData: FormData) {
  const supabase = await createClient();
  // ... operate on DB
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };   // or { data: ... }
}
```

Client components call the action, inspect `result.error` / `result.data`, update local state immediately (optimistic), then `revalidatePath` causes the server to re-render on next navigation.

---

## 5. Database

All tables live in the Supabase `public` schema. TypeScript types are in `src/types/database.ts`.

### Tables

| Table | Purpose | Key columns / constraints |
|---|---|---|
| `profiles` | One row per auth user | `id` = `auth.users.id`; `email`, `full_name`, `avatar_url` |
| `organizations` | Top-level tenant | `id`, `name`, `slug` (unique) |
| `organization_members` | Org membership | `organization_id` FK → organizations; `user_id` FK → profiles; `role`: owner/admin/member |
| `events` | Events within an org | `organization_id` FK; `slug` (unique per org); `status`: draft/active/completed/archived; `created_by` FK → profiles |
| `components` | Modules within an event | `event_id` FK → events; `slug`; `sort_order` int; `is_active` bool; `icon` text (emoji); `color` hex string |
| `component_leads` | Auth-user-based component membership | `component_id` FK → components; `user_id` FK → profiles; `role`: lead/co-lead/member |
| `component_members` | Freeform (non-auth) team members | `component_id` FK; `name`, `email`, `role` — no FK to profiles |
| `tasks` | Kanban tasks per component | `component_id` FK; `assigned_to` FK → profiles (nullable); `status`: todo/in_progress/done; `priority`: low/medium/high/urgent |
| `notes` | Freeform notes per component | `component_id` FK; `content` text; `created_by` FK → profiles |
| `component_folders` | File organization | `component_id` FK; `parent_folder_id` self-referential FK (nullable) |
| `component_files` | File metadata | `folder_id` FK → component_folders; `component_id` FK; `storage_key` text (path in Storage bucket) |
| `calendar_events` | Scheduled items per component | `component_id` FK; `event_id` FK → events; `start_time`, `end_time` timestamptz; `is_all_day` bool |
| `resource_links` | Pinned URLs per component | `component_id` FK; `url`, `title`, `category` (document/spreadsheet/design/project_management/communication/other); `added_by` FK → profiles |
| `component_templates` | Reusable component presets per org | `organization_id` FK; `name`, `slug`, `icon`, `color`, `description` — used in AddComponentDialog "Library" tab |

### Schema drift — KNOWN ISSUE

**`component_leads` and `component_members` are two separate tables with overlapping intent.**

- `component_leads`: links platform users (has `user_id` FK → profiles). Added via email lookup against `profiles`.
- `component_members`: stores freeform strings (name/email), no FK to auth. Added directly.

The UI currently uses `component_members` for the "Team" tab. `component_leads` is still queried on the event dashboard page (`component_leads(id)` count). Both tables exist in the schema. This is unresolved debt.

### FK join ambiguity

Supabase PostgREST throws an error when joining `notes` or `tasks` to `profiles` via `created_by` if there are multiple FK paths. Workaround in use: **fetch the profile in a separate query** after insert/select, then merge in application code. See `createNote` in `src/app/actions/tasks.ts`.

---

## 6. Auth

### Session mechanism

- `@supabase/ssr` is used in both server and client contexts.
- Server: `src/lib/supabase/server.ts` — `createServerClient` with Next.js `cookies()` (read + write). Called `await createClient()`.
- Client: `src/lib/supabase/client.ts` — `createBrowserClient`. Used on login/signup pages only.
- OAuth callback: `src/app/api/auth/callback/route.ts` exchanges code for session via `exchangeCodeForSession`.

### After sign-in

Login page calls `supabase.auth.signInWithPassword` directly from the browser, then does `window.location.href = "/"` (hard redirect). Do NOT use `router.push()` or `router.refresh()` — the session cookie is not reliably picked up by the server without a full page reload.

### Middleware — ACTIVE

`src/proxy.ts` IS the middleware in Next.js 16. It is picked up automatically — no `middleware.ts` needed. The auth redirects are live:

- Unauthenticated users hitting any protected path (`/`, `/events/*`, `/settings`, `/onboarding`) are redirected to `/login`.
- Authenticated users hitting `/login` or `/signup` are redirected to `/`.

Do NOT create `src/middleware.ts` alongside `proxy.ts` — this causes a fatal conflict error in Next.js 16.

### DEV_SKIP_AUTH

`DEV_SKIP_AUTH` env var is no longer used in the codebase. The settings page previously used it to bypass auth in dev; that bypass has been removed. All pages now rely on the middleware redirect and standard `supabase.auth.getUser()` checks.

Other pages do not check this env var — they use the `if (user) { ... } else { /* DEV_EVENTS */ }` pattern instead.

---

## 7. File Structure

```
src/
  app/
    (auth)/                    # auth pages (login, signup)
    (dashboard)/               # main app shell
      events/[eventSlug]/
        [componentSlug]/       # component detail page (6 tabs)
        settings/              # event settings + component manager
    actions/                   # server actions (auth, events, components, tasks, files, calendar, resources, organizations)
    api/auth/callback/         # OAuth exchange route
    globals.css
    layout.tsx                 # root layout
  components/
    ui/                        # shadcn primitives (button, card, dialog, tabs, etc.)
    calendar/
      component-calendar.tsx   # per-component FullCalendar (client)
      event-master-calendar.tsx # all-event calendar on event dashboard (client)
      calendar-event-modal.tsx # create/edit modal
    resources/
      resource-link-board.tsx  # kanban-style resource list (client)
      resource-link-card.tsx
      resource-link-modal.tsx
    sidebar.tsx                # app sidebar (client — uses usePathname)
    add-component-dialog.tsx   # 3-tab dialog: library / clone / custom (client)
    component-list-manager.tsx # drag-to-reorder component list (client, @hello-pangea/dnd)
    files-tab.tsx              # folder/file manager (client)
    note-section.tsx           # note feed + form (client)
    task-card.tsx              # individual task (client)
    task-form.tsx              # create task dialog (client)
    team-member-list.tsx       # component_members list (client)
    add-member-dialog.tsx      # add member dialog (client)
  lib/
    supabase/
      client.ts                # browser client
      server.ts                # server client (async, uses cookies())
    queries/
      calendar-events.ts       # getCalendarEventsByComponent, getCalendarEventsByEvent
      resource-links.ts        # getResourceLinksByComponent
    utils.ts                   # cn(), slugify(), formatDate(), formatNoteTimestamp(), getInitials()
  types/
    database.ts                # all TypeScript types + Database interface
  proxy.ts                     # middleware logic (inert — not wired up)
```

---

## 8. Key Patterns

### Local state + revalidatePath (optimistic-ish updates)

Client components hold their own `useState` copy of server-fetched data. On mutation:
1. Call the server action.
2. On success, update local state immediately (e.g. `setNotes(prev => [newNote, ...prev])`).
3. The server action calls `revalidatePath(...)` so the Next.js cache is invalidated — next full navigation gets fresh data.

This avoids a loading flash but means the UI can temporarily show stale data if two clients are open.

### FK join ambiguity workaround

When PostgREST can't resolve which FK to use for a join (multiple paths between two tables), fetch the related record in a separate query and merge manually:

```ts
const { data: note } = await supabase.from("notes").insert(...).select().single();
const { data: author } = await supabase.from("profiles").select("*").eq("id", user.id).single();
return { data: { ...note, author } };
```

### FullCalendar SSR guard (isClient / useEffect)

FullCalendar uses browser APIs and cannot render on the server. Pattern used:

```ts
const [isClient, setIsClient] = useState(false);
useEffect(() => { setIsClient(true); }, []);
if (!isClient) return <div>Loading calendar…</div>;
```

Additionally, FullCalendar plugins are loaded via `require()` inside the client component body (not top-level import) to prevent SSR bundling issues.

### Dev fallback data

Pages check `if (user) { /* real DB fetch */ } else { /* DEV_EVENTS / DEV_COMPONENTS / DEV_TASKS */ }`. The fallback constants are defined inline at the top of each page file. This lets the UI be browsed without a Supabase account.

---

## 9. Known Issues / Production Gaps

- **component_leads / component_members schema debt.** Two tables serve overlapping purposes. The UI uses `component_members`; `component_leads` is only counted on the event dashboard. Should be consolidated.
- **parent_folder_id type risk.** `ComponentFolder.parent_folder_id` is `string | null` in TypeScript but the actual DB column type has not been verified. Nested folders are not implemented in the UI.
- **No email verification flow.** `signUp` returns `{ success: true }` after `supabase.auth.signUp()` but does not handle the email confirmation step.
- **No error boundary.** Unhandled action errors surface as raw error strings in the UI.
- **Slug uniqueness not enforced client-side.** Duplicate event or component slugs will cause DB errors that bubble up as generic error messages.
- **Dev fallback data still in place.** Pages use `if (user) { /* real DB */ } else { /* DEV_EVENTS */ }`. Since middleware enforces auth, the `else` branches are dead code but harmless. Clean up when convenient.
- **Supabase Storage bucket policies not yet scoped.** The `component-files` bucket does not have org-scoped storage policies. Download signed URLs are time-limited (1hr) but upload access is not RLS-gated at the storage layer.

---

## 10. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
No server-only secrets (service role key) are used — all DB access goes through the anon key + Supabase RLS (enforced).

---

## 11. Supabase Storage

**Bucket:** `component-files`

**Storage key naming pattern:**
```
{componentId}/{folderId}/{timestamp}_{originalFileName}
```
Example: `c1a2b3/f9e8d7/1716000000000_budget.pdf`

Files are **not public**. Downloads use signed URLs (1-hour expiry) generated by `getSignedUrl(storageKey)` in `src/app/actions/files.ts`. On folder delete, all contained files are removed from storage before the DB row is deleted.
