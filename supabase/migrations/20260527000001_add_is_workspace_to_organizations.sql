alter table public.organizations
  add column is_workspace boolean not null default false;
