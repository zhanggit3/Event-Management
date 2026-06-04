-- ISSUE-011: org-level Clients directory (Company › Collaborators › Clients).
-- RLS helpers is_org_member / is_org_admin already exist from earlier migrations.

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
