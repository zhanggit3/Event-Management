# ISSUE-013: Library › My Items (org file library + imports)

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #013

> **Depends on [[ISSUE-014]]** for the sidebar Company panel (the Library › My Items nav link points at `/company/my-items`, which 014 renders as a placeholder). This issue replaces that placeholder with the real My Items library.

## Problem

There is no organization-wide place to keep documents. Files today are component-scoped (`component_files` / `task_attachments`), so documents from past events are scattered and disappear when components/tasks are removed. "My Items" is an org-level document library where users create/customize folders, move items, upload files, and **download** anything. It must also let users pull in (a) attachments from tasks/subtasks and (b) approved estimates, as persistent, downloadable items.

## Design decisions (settled)

- **My Items is a new org-level store** — new tables `library_folders` + `library_files` and a new Storage bucket `library-files`. It is separate from `component_files` (component-scoped).
- **Task/subtask attachments:** provide BOTH (1) a read-only **"From Tasks"** view that aggregates every `task_attachment` across the org's events (grouped by event → component → task), each downloadable; AND (2) a **"Save to My Items"** action on any of them that **copies** the underlying storage object into `library-files` and creates a `library_files` row in a chosen folder — so it persists even if the task/event is later deleted.
- **Estimates:** a user can add an estimate to My Items **only when its `status = 'approved'`**. On add, the estimate is **snapshotted to a CSV** and stored as a `library_files` row (frozen, downloadable). The deeper "approved estimate → event expense table" integration is OUT OF SCOPE (separate future issue).

## Acceptance Criteria

- [ ] `/company/my-items` shows the org's library: a folder tree (nestable) and the files in the selected folder.
- [ ] User can **create**, **rename**, and **delete** folders, including nested folders (a folder may have a `parent_folder_id`).
- [ ] User can **upload** one or more files into the selected folder; they appear in the list with name, size, and uploaded date.
- [ ] User can **move** a file from one folder to another.
- [ ] User can **download** any file in My Items via a working signed URL.
- [ ] A **"From Tasks"** view lists every task/subtask attachment across the current org's events, grouped by event → component → task, each with a **Download** button.
- [ ] Each "From Tasks" attachment has a **"Save to My Items"** action that copies the file into a chosen library folder; the copy is then downloadable from My Items and survives deletion of the source task.
- [ ] Estimates can be added to My Items only when `status = 'approved'`; adding produces a downloadable CSV snapshot file in a chosen folder. Non-approved estimates are not offerable.
- [ ] All library data is scoped to the current organization and enforced by RLS.

## Affected Files

**Create:**
- `src/app/(dashboard)/company/my-items/page.tsx` — server: resolve org, fetch folders/files, render.
- `src/app/(dashboard)/company/my-items/my-items-client.tsx` — `"use client"`: folder tree + file list + upload + move + download.
- `src/app/(dashboard)/company/my-items/from-tasks-panel.tsx` — `"use client"`: aggregated task-attachment browser + download + Save to My Items.
- `src/app/actions/library.ts` — server actions for folders/files/import/estimate-snapshot (detailed below).
- `supabase/migrations/20260603000002_library.sql` — tables + bucket + RLS.

**Modify:**
- `src/types/database.ts` — add `LibraryFolder`, `LibraryFile` types.

> No sidebar/nav edits — the Library › My Items link lives in the sidebar Company panel from [[ISSUE-014]]. This issue only replaces the `/company/my-items` placeholder page with the real library.

**Read-only context (do not modify):**
- `src/app/actions/files.ts` — folder/file/upload/signed-URL patterns (copied below).
- `src/app/actions/task-attachments.ts` — `task-attachments` bucket + signed URL pattern (copied below).
- `src/app/actions/estimates.ts` — estimate data shape for the CSV snapshot (copied below).

## Relevant Code Context

### Existing file patterns (from `files.ts`) — mirror these

```ts
// upload
const storageKey = `${componentId}/${folderId}/${Date.now()}_${file.name}`;
const { error: uploadError } = await supabase.storage
  .from("component-files").upload(storageKey, file, { contentType: file.type });
// db row
await supabase.from("component_files").insert({
  folder_id, component_id, name: file.name, storage_key: storageKey,
  file_size: file.size, mime_type: file.type, uploaded_by: user?.id ?? null,
}).select().single();
// download
const { data } = await supabase.storage.from("component-files").createSignedUrl(storageKey, 3600);
return { url: data.signedUrl };
// delete: remove storage object(s) THEN delete db row(s)
await supabase.storage.from("component-files").remove([storageKey]);
```

### Task attachment shape (from `database.ts` + `task-attachments.ts`)

```ts
export interface TaskAttachment {
  id: string; task_id: string; uploaded_by: string | null;
  file_name: string; storage_key: string;   // key in the `task-attachments` bucket
  file_size: number | null; mime_type: string | null; created_at: string;
}
// signed url:
const { data } = await supabase.storage.from("task-attachments").createSignedUrl(storageKey, 3600);
```

### Estimate shape (from `estimates.ts`) — for CSV snapshot

```ts
type EstimateWithDetails = {
  estimate: Estimate;                 // has status: "draft" | "sent" | "approved" | "declined", proposal_number
  columns: EstimateColumn[];          // { id, name, col_type, sort_order }
  sections: (EstimateSection & { lineItems: EstimateLineItem[] })[]; // section: { name, section_type }, lineItem.cells: Record<columnId, string>
};
```
A line item's `cells` is a JSONB map keyed by `column_id`. To render a CSV row, read `cells[column.id]` for each column ordered by `sort_order`.

### Org-scoped traversal pattern (from `estimates.ts`)

To gather all of an org's task attachments, walk org → events → components → tasks → attachments:
```ts
const { data: orgEvents } = await supabase.from("events").select("id, name").eq("organization_id", organizationId);
const eventIds = (orgEvents ?? []).map(e => e.id);
const { data: comps } = await supabase.from("components").select("id, name, event_id").in("event_id", eventIds);
const compIds = (comps ?? []).map(c => c.id);
const { data: tasks } = await supabase.from("tasks").select("id, title, component_id").in("component_id", compIds);
const taskIds = (tasks ?? []).map(t => t.id);
const { data: atts } = await supabase.from("task_attachments").select("*").in("task_id", taskIds);
// then group atts by task → component → event in app code
```

### RLS helpers (already defined) — reuse, do not redefine

`public.is_org_member(org_id uuid)`, `public.is_org_admin(org_id uuid)`.

### Org resolution

Same snippet as [[ISSUE-011]] (prefer non-workspace org, fall back to workspace).

## Implementation Steps

1. **Migration** `20260603000002_library.sql`:

   ```sql
   create table public.library_folders (
     id uuid primary key default gen_random_uuid(),
     organization_id uuid not null references public.organizations(id) on delete cascade,
     name text not null,
     parent_folder_id uuid references public.library_folders(id) on delete cascade,
     created_by uuid references public.profiles(id) on delete set null,
     created_at timestamptz not null default now()
   );

   create table public.library_files (
     id uuid primary key default gen_random_uuid(),
     organization_id uuid not null references public.organizations(id) on delete cascade,
     folder_id uuid references public.library_folders(id) on delete set null,
     name text not null,
     storage_key text not null,            -- path in the `library-files` bucket
     file_size bigint,
     mime_type text,
     source_type text not null default 'upload'
       check (source_type in ('upload','task_attachment','estimate_snapshot')),
     source_ref uuid,                       -- original task_attachment.id or estimate.id (nullable)
     created_by uuid references public.profiles(id) on delete set null,
     created_at timestamptz not null default now()
   );

   create index library_folders_org_idx on public.library_folders(organization_id);
   create index library_files_org_idx on public.library_files(organization_id, folder_id);

   alter table public.library_folders enable row level security;
   alter table public.library_files enable row level security;

   create policy "Org members manage library folders" on public.library_folders
     for all using (public.is_org_member(organization_id))
     with check (public.is_org_member(organization_id));

   create policy "Org members manage library files" on public.library_files
     for all using (public.is_org_member(organization_id))
     with check (public.is_org_member(organization_id));

   -- Storage bucket (private)
   insert into storage.buckets (id, name, public)
   values ('library-files', 'library-files', false)
   on conflict (id) do nothing;
   ```
   > If `insert into storage.buckets` is not permitted in this project's migration flow, create the **`library-files`** bucket (private) via the Supabase dashboard instead and note it in the PR. Match how `component-files` / `task-attachments` were created.

2. **Types** — add to `database.ts`:
   ```ts
   export interface LibraryFolder {
     id: string; organization_id: string; name: string;
     parent_folder_id: string | null; created_by: string | null; created_at: string;
   }
   export interface LibraryFile {
     id: string; organization_id: string; folder_id: string | null; name: string;
     storage_key: string; file_size: number | null; mime_type: string | null;
     source_type: "upload" | "task_attachment" | "estimate_snapshot";
     source_ref: string | null; created_by: string | null; created_at: string;
   }
   ```

3. **Server actions** `src/app/actions/library.ts` (`"use server"`). Every action: get user, **verify org membership server-side** before mutating. Storage key convention: `${organizationId}/${folderId ?? "root"}/${Date.now()}_${fileName}`.
   - `createLibraryFolder(organizationId, name, parentFolderId | null)`
   - `renameLibraryFolder(folderId, name)`
   - `deleteLibraryFolder(folderId)` — remove contained files from storage first (gather `storage_key`s), then delete (FK cascade handles rows / nested folders).
   - `uploadLibraryFile(formData)` — fields: `organization_id`, `folder_id`, `file`. Upload to `library-files`, insert row with `source_type: 'upload'`. On db error, remove the uploaded object (mirror `files.ts`).
   - `moveLibraryFile(fileId, targetFolderId | null)` — update `folder_id` only.
   - `deleteLibraryFile(fileId, storageKey)` — remove object then row.
   - `getLibrarySignedUrl(storageKey)` — `createSignedUrl(storageKey, 3600)` on `library-files`.
   - `getOrgTaskAttachments(organizationId)` — traversal above; return grouped `{ event, component, task, attachment }[]` (or nested). Verify membership.
   - `getTaskAttachmentDownloadUrl(storageKey)` — signed URL on the **`task-attachments`** bucket (read-only browse/download).
   - `saveTaskAttachmentToLibrary(attachmentId, targetFolderId | null, organizationId)` — verify membership AND that the attachment belongs to a task within this org (re-run the traversal/guard). Then **copy across buckets**: `const { data: blob } = await supabase.storage.from("task-attachments").download(att.storage_key);` build a new `library-files` key, `upload(newKey, blob, { contentType: att.mime_type ?? undefined })`, insert `library_files` row with `source_type: 'task_attachment'`, `source_ref: attachmentId`, name = `att.file_name`.
   - `saveApprovedEstimateToLibrary(estimateId, targetFolderId | null, organizationId)` — verify membership + that the estimate is in this org. **Guard `estimate.status === 'approved'`** (else return `{ error: "Estimate must be approved" }`). Fetch columns/sections/line items; build a CSV string (see below); `upload` it as a `Blob`/`File` (`type: 'text/csv'`) to `library-files`; insert `library_files` row `source_type: 'estimate_snapshot'`, `source_ref: estimateId`, name = `${estimate.proposal_number}.csv`.

   **CSV build:** header = columns ordered by `sort_order` (`name`); then for each section, a section-name row, followed by one row per line item where each cell = `cells[column.id] ?? ""`. Escape values containing `,`/`"`/newline by wrapping in quotes and doubling inner quotes.

4. **My Items page** (server): resolve org; fetch `library_folders` and `library_files` for the org; render `<MyItemsClient organizationId folders files />`.

5. **My Items client**: folder tree (nested via `parent_folder_id`) on the left; file list for the selected folder on the right. Toolbar: New Folder, Upload, and tabs/toggle for **My Files** vs **From Tasks**. File rows: name, size (format bytes), date, a Download button (calls `getLibrarySignedUrl` then `window.open(url)`), a Move control (select target folder), Delete. Reuse dark tokens from `add-member-dialog.tsx`.

6. **From Tasks panel** (client): calls `getOrgTaskAttachments`; renders grouped event → component → task → attachment; each attachment has **Download** (`getTaskAttachmentDownloadUrl` → open) and **Save to My Items** (pick a folder → `saveTaskAttachmentToLibrary`). Also surface a "Add approved estimate" entry point that lists approved estimates and calls `saveApprovedEstimateToLibrary`.

7. **Replace placeholder**: `/company/my-items/page.tsx` (a "Coming soon" placeholder created in [[ISSUE-014]]) is replaced with the real library. The sidebar Company panel already links here — no nav edits needed.

## Test Scenarios

**Happy path:**
- Create folder "2025 Gala", upload a PDF into it, download it → file opens via signed URL. Move it to another folder → it appears there.
- Open From Tasks → see an attachment from a past event's task → Download works → Save to My Items into "2025 Gala" → it appears in My Items and still downloads after the original task is deleted.
- Approve an estimate, then Add approved estimate → a `EST-2026-001.csv` appears in My Items and downloads with the section/line-item data.

**Edge cases:**
- Nested folders 3 levels deep render and navigate correctly.
- Delete a folder containing files → storage objects removed, rows gone, nested subfolders gone (cascade).
- Org with no task attachments → From Tasks shows an empty state.
- File with a comma in its name / estimate cell with a comma → CSV stays valid (quoted).

**Error cases:**
- Add a non-approved (draft/sent/declined) estimate → blocked with "Estimate must be approved"; no file created.
- Upload with no file selected → "No file selected".
- Cross-bucket copy where `download` fails → return the error; do not insert a dangling row.

**RLS:**
- An org member CAN create folders, upload, move, delete, and read signed URLs for their org's library.
- A non-member CANNOT read or write another org's folders/files (policies use `is_org_member`); `saveTaskAttachmentToLibrary` / `saveApprovedEstimateToLibrary` additionally re-verify the source belongs to the caller's org before copying.

## Constraints

- Keep My Items org-scoped and SEPARATE from `component_files` — do not reuse the `component-files` bucket or `component_folders` table.
- Do NOT implement the "approved estimate → event expense table" integration here — only the CSV snapshot into My Items. (Deferred to a future issue.)
- For task attachments use **copy** semantics (download from `task-attachments`, re-upload to `library-files`) so the library item is independent — do not just store a reference to the original key.
- Always remove the storage object before (or alongside) deleting its DB row, per the existing `files.ts` pattern.
- Re-verify org membership and source ownership server-side in every action; never trust client-supplied `organization_id`.
- Do NOT create `src/middleware.ts`. Follow dark theme tokens.

## Technical Notes

- `supabase.storage.from(bucket).download(key)` returns a `Blob` in the server action and can be passed directly to `.upload()` on another bucket — this is the cross-bucket copy mechanism (`.copy()` only works within a single bucket).
- The `library-files` bucket is private; downloads use 1-hour signed URLs (consistent with the rest of the app). Bucket-level storage policies are a known project-wide gap (see CLAUDE.md §9); table RLS + signed URLs are the access control here.
- `file_size` is `bigint` in SQL but maps to `number` in TS — fine for typical file sizes.
- Build the CSV in the server action (no external dependency); the app has no CSV library and none should be added for this.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `supabase/migrations/20260603000004_library.sql` — `library_folders` + `library_files` tables + table RLS, the private `library-files` bucket, **and `storage.objects` RLS policies** (see decision #1). **Applied live**; verified bucket + 3 storage policies + 2 tables exist.
- `src/app/actions/library.ts` — all server actions: folder create/rename/delete, file upload/move/delete, `getLibrarySignedUrl`, `getOrgTaskAttachments`, `getTaskAttachmentDownloadUrl`, `saveTaskAttachmentToLibrary` (cross-bucket copy), `getApprovedEstimates`, `saveApprovedEstimateToLibrary` (CSV snapshot). Each mutating action re-verifies org membership server-side.
- `src/app/(dashboard)/company/my-items/page.tsx` — server page (resolves org, fetches folders + files).
- `src/app/(dashboard)/company/my-items/my-items-client.tsx` — folder tree (nested), file list, New Folder, rename/delete folder, upload (multi), move (select), download, delete; tab toggle to From Tasks.
- `src/app/(dashboard)/company/my-items/from-tasks-panel.tsx` — lazy-loads org task attachments (grouped event → component → task) + approved estimates; per-item Download + Save, shared "save into" folder selector.

**Files modified:**
- `src/types/database.ts` — added `LibraryFolder`, `LibraryFile`.

**What was implemented:** the full My Items library per the PRD — folders (nestable, CRUD), upload/move/download/delete, From Tasks browse + copy-to-library, and approved-estimate → CSV snapshot.

**Key decision #1 — storage.objects RLS (NOT in the PRD, but required):** I checked the live DB first and found the existing buckets (`component-files`, `task-attachments`) DO have `storage.objects` policies keyed on the first path segment. The PRD assumed "table RLS + signed URLs" suffice, but uploads/downloads/`createSignedUrl` via the anon key are gated by `storage.objects` RLS — without policies the bucket is unusable. I added SELECT/INSERT/DELETE policies on `library-files` gated by `is_org_member((split_part(name,'/',1))::uuid)` (the first path segment is the org id by my key convention). This is the difference between "works" and "every upload silently fails."

**Other decisions:**
- **Folder delete handles the SET NULL FK explicitly.** `library_files.folder_id` is `ON DELETE SET NULL` (per the PRD table def), so deleting a folder would orphan its files to root, not delete them. The PRD's AC wants files gone. `deleteLibraryFolder` computes the folder + all descendants, removes those files' storage objects, deletes the file rows, then deletes the folder (subfolders cascade). Local state mirrors this.
- **Org resolution is Settings-style** (prefer non-workspace), consistent with ISSUE-011 Clients — same single-org behavior.
- **From Tasks data is lazy-loaded** in the panel (on tab open) via the actions, not fetched on the page, to keep initial load light.
- **`company-placeholder.tsx`** (from ISSUE-014) is now unused (011/012/013 all replaced their placeholders) — left in place (harmless; removal is out of scope).

**Verification (no test runner — gate is types/build/lint):**
- `npx tsc --noEmit` → exit 0, clean.
- `npm run build` → ✓ Compiled, ✓ Finished TypeScript, `/company/my-items` builds.
- `npm run lint` → all authored/edited files clean.
- Dev server: route compiles and auth-gates (unauth → `/login`). A transient "module not found" appeared mid-write before `from-tasks-panel.tsx` existed; resolved (trailing `✓ Compiled`).

**Concerns/assumptions:** migration applied to live project `sljvlxipnlkqruxlqdsf` (new tables + bucket + storage policies; reversible). Runtime upload/download/copy/CSV paths are verified by build + schema reasoning, not an automated runtime test — needs a manual pass.

### Evaluator Report

### Coder Revision Report

Evaluator: 0 Critical, 2 Medium, 4 Low. Both Mediums fixed; cheap Lows fixed; L1/L3 addressed/accepted.

**🟡 M1 — `deleteLibraryFile` trusted a client-supplied storage key decoupled from the row** — FIXED.
`library.ts`: now fetches the row's OWN `storage_key` + `organization_id`, verifies membership, then removes that key. Dropped the second client arg; updated the caller in `my-items-client.tsx` to `deleteLibraryFile(file.id)`. No way to delete one file's object via another file's id.

**🟡 M2 — missing same-org checks on move/rename (per the PRD's "verify in every action")** — FIXED.
- `moveLibraryFile`: loads the file's org, verifies membership, and verifies the target folder (if any) shares that org — a multi-org user can no longer move a file into a folder in a different org.
- `renameLibraryFolder`: loads the folder's org and verifies membership.
- `createLibraryFolder`: also verifies the `parentFolderId` (if any) is in the same org (same bug class).

**🔵 Lows:**
- **L2** (`formatBytes(0)` → "—"): fixed — 0-byte files now show "0 B"; null/undefined still "—".
- **L4** (signed-URL getters had no auth guard): added a `getUser` check to `getTaskAttachmentDownloadUrl` and `getLibrarySignedUrl` (defense-in-depth on top of storage RLS).
- **L3** (raw PostgREST error on cross-org rename/move): now resolved — the explicit membership/org checks from M2 return clean "Not authorized" / "Invalid target folder" messages before hitting RLS.
- **L1** (estimate/attachment can be saved repeatedly → duplicate library files): **accepted** — harmless, and re-saving an updated attachment is arguably desirable. No dedupe added; left for a future polish.

**Test results after revisions:** `npx tsc --noEmit` → exit 0; `npm run build` → ✓ Compiled, ✓ Finished TypeScript; `npm run lint` → touched files clean.

### Documentation Report

**No doc changes needed.** No new environment variables, commands, or developer-workflow steps (`npm run dev/build/start/lint` unchanged). README is the stock Next.js template with no storage/feature docs to update. Per the Documenter rules, README/CLAUDE.md/other docs were left untouched.

**Operational note:** migration `supabase/migrations/20260603000004_library.sql` was applied to the live project `sljvlxipnlkqruxlqdsf` — it creates `library_folders` + `library_files`, the private **`library-files`** storage bucket, and `storage.objects` RLS policies for that bucket. A fresh environment picks this up via the normal migration flow; the bucket is created by the `insert into storage.buckets` in the migration. (CLAUDE.md §11 currently documents only the `component-files` bucket and is now slightly out of date — a maintainer may refresh it; not done here per the "do not update CLAUDE.md" rule.)

PRD status updated to **In Review**.

### Coordinator Summary

**Acceptance Criteria:**
- ✅ `/company/my-items` shows the library — folder tree + files in the selected folder.
- ✅ Create / rename / delete folders, including nested (`parent_folder_id`, recursive render).
- ✅ Upload one or more files into the selected folder (name, size, date shown).
- ✅ Move a file between folders (same-org enforced).
- ✅ Download any file via a signed URL.
- ✅ "From Tasks" view lists every org task/subtask attachment grouped event → component → task, each with Download.
- ✅ "Save to My Items" copies the attachment into a chosen folder (cross-bucket copy; survives source deletion).
- ✅ Approved-only estimates → downloadable CSV snapshot; non-approved blocked.
- ✅ All library data org-scoped, enforced by table RLS **and** `storage.objects` RLS.

**Evaluator findings:** 0 Critical, 2 Medium, 4 Low. Both Mediums fixed (client-supplied storage key decoupled from row; missing same-org checks on move/rename/create). Cheap Lows fixed (0-byte display, signed-URL auth guards); L1 (duplicate saves) accepted, L3 resolved by the M2 fixes. The evaluator independently verified the live storage + table RLS and the cross-bucket copy / CSV ownership checks, and confirmed cross-org reads/writes/copies are all blocked.

**Tests / verification:** No test runner; gate is `tsc --noEmit` (exit 0), `next build` (✓ compiled, ✓ TypeScript, `/company/my-items` builds), `npm run lint` (touched files clean). Live DB verified: bucket + 3 storage policies + 2 tables; `library_files.folder_id` is `ON DELETE SET NULL` (handled explicitly in folder delete). Dev server compiles and auth-gates the route.

**Remaining concerns:**
1. Runtime paths (upload, cross-bucket copy, CSV download, signed URLs) are verified by build + schema + RLS reasoning, **not** an automated runtime test — a manual pass is strongly recommended (this feature does real storage I/O).
2. Single-org resolution (Settings-style), consistent with Clients — the library scopes to one resolved org.
3. `company-placeholder.tsx` (from ISSUE-014) is now dead code (all three Company sub-pages replaced it) — left in place; trivial to remove later.
4. The coder added `storage.objects` RLS the PRD omitted — without it the bucket would be unusable; verified correct and live.

**Verdict: READY FOR REVIEW.**

All nine Acceptance Criteria are met, both Medium evaluator findings are fixed, and type-check/build/lint are green. The genuinely risky surfaces — tenant isolation across a new storage bucket, the cross-bucket copy, and the approved-estimate CSV export — were each verified against the live database (org-scoped storage + table RLS, server-side membership re-checks, and ownership guards on copy/snapshot), and the unprompted addition of `storage.objects` policies is what makes the bucket actually work and stay isolated. The only thing between this and "done" is a human manual pass of the file I/O, expected for a storage feature with no test harness.

### PR Feedback Summary

**Post-implementation redesign (user feedback): Google Drive-style My Files layout.**
Replaced the left folder-tree + right file-list with a Drive-like layout in `my-items-client.tsx`:
- Breadcrumb navigation (My Drive › … ›) — navigate *into* folders; crumbs jump back up. `currentFolderId` state replaces `selectedFolderId`; subfolders = `parent_folder_id === currentFolderId`, files = `folder_id === currentFolderId`.
- Folders & files rendered as tiles in a grid (separate "Folders" / "Files" sections); file cards have an icon preview.
- "+ New" dropdown (New folder / Upload files), acting in the current folder.
- Grid/list view toggle.
- Per-item "⋮" `DropdownMenu`: folders → Rename / Delete; files → Download / **Move to ▸** (submenu of folders + My Drive) / Delete.
- Per-folder empty state.

No server-action or data-model changes — purely the My Files view. The From Tasks panel is unchanged. Verified: `tsc` clean, `next build` ✓, `my-items-client.tsx` lint-clean, route compiles + auth-gates.

**Upload size limit (user feedback): 50 MB, enforced in 3 layers + clear error.**
- New `src/lib/limits.ts` (`MAX_LIBRARY_FILE_BYTES = 50MB`, `MAX_LIBRARY_FILE_LABEL = "50 MB"`).
- Client (`my-items-client.tsx`): rejects oversized files instantly with `"<name>" is <size> — over the 50 MB upload limit.` (no upload attempted).
- Server (`uploadLibraryFile`): returns `"<name>" is too large. The maximum upload size is 50 MB.`
- Bucket: `library-files.file_size_limit` set to 52428800 (live, and in the migration via `on conflict … do update`).

**Upload architecture fix (user hit "Body exceeded 1 MB limit"):** Server Actions cap the request body at 1 MB, so sending files *through* `uploadLibraryFile` failed for anything >1 MB. Replaced it with **direct-to-Storage upload from the browser** + a metadata-only server action:
- `library.ts`: removed the file-in-body `uploadLibraryFile`; added `libraryUploadKey` (builds the canonical key) and `recordLibraryFile` (verifies membership + key-prefix=org + folder-org, inserts the row; tiny body).
- `my-items-client.tsx`: `handleUpload` now uploads via the browser Supabase client (`createClient` from `@/lib/supabase/client`) straight to `library-files`, then calls `recordLibraryFile`. The storage RLS policies (added in this issue) authorize the direct client upload; the bucket `file_size_limit` + client/server checks still cap at 50 MB. No 50 MB-through-the-Next-server buffering.

**PR #3 review (`/fix-pr-feedback`):** 1 PR comment received — the Vercel deploy bot (noise). 0 actionable review comments, 0 inline code comments, no human/automated reviewer. All checks pass (both Vercel preview deployments `Ready`); PR is `MERGEABLE` / `CLEAN`. No code changes required.

**Local `/code-review ultra` fixes (pushed to `issue/company-section`):**
- **Cross-org folder corruption (integrity):** `saveTaskAttachmentToLibrary` and `saveApprovedEstimateToLibrary` now verify the target folder belongs to the org before filing (the same `targetFolderInOrg` check already used by `moveLibraryFile`/`recordLibraryFile`). A multi-org user can no longer drop an org-A file into an org-B folder.
- **Orphaned storage objects:** `recordLibraryFile` now removes the already-uploaded object on *every* rejection path (not-authorized / oversized / invalid-key / bad-folder / DB-error) via a `reject()` helper. Previously only the bad-folder and DB-error paths cleaned up.
- **O(org-size) validation → O(1):** `saveTaskAttachmentToLibrary` walked the entire org tree (`getOrgTaskAttachments`) just to find one attachment. It now validates that single attachment's chain (attachment → task → component → event → org) directly.
- **Removed `libraryUploadKey` round-trip:** the storage key is a pure string the client already has all inputs for. Extracted to `src/lib/library-keys.ts` (`libraryStorageKey`) and built client-side; the server reuses the same helper. `recordLibraryFile` still re-validates the key's org prefix.

Verified: `tsc --noEmit` clean; changed files lint-clean.
