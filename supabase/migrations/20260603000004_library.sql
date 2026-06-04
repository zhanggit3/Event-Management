-- ISSUE-013: org-level "My Items" document library.
-- Tables + the private `library-files` bucket + storage.objects RLS.
-- Storage key convention: {organizationId}/{folderId|root}/{timestamp}_{name}
-- so the FIRST path segment is the org id — storage policies gate on it,
-- mirroring how component-files / task-attachments policies work.

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
  storage_key text not null,
  file_size bigint,
  mime_type text,
  source_type text not null default 'upload'
    check (source_type in ('upload','task_attachment','estimate_snapshot')),
  source_ref uuid,
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

-- Private bucket, 50 MB per-file upload limit (52428800 bytes).
insert into storage.buckets (id, name, public, file_size_limit)
values ('library-files', 'library-files', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Storage object RLS — gate on the org id (first path segment).
create policy "Org members read library objects" on storage.objects
  for select to authenticated
  using (bucket_id = 'library-files' and public.is_org_member((split_part(name, '/', 1))::uuid));

create policy "Org members upload library objects" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library-files' and public.is_org_member((split_part(name, '/', 1))::uuid));

create policy "Org members delete library objects" on storage.objects
  for delete to authenticated
  using (bucket_id = 'library-files' and public.is_org_member((split_part(name, '/', 1))::uuid));
