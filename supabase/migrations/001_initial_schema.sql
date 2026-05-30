-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null default '',
  email text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  created_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

create table public.events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  event_date date,
  status text not null check (status in ('draft', 'active', 'completed', 'archived')) default 'draft',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.components (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  slug text not null,
  icon text,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(event_id, slug)
);

create table public.component_leads (
  id uuid primary key default uuid_generate_v4(),
  component_id uuid not null references public.components(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('lead', 'co-lead', 'member')) default 'member',
  created_at timestamptz not null default now(),
  unique(component_id, user_id)
);

create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  component_id uuid not null references public.components(id) on delete cascade,
  title text not null,
  description text,
  status text not null check (status in ('todo', 'in_progress', 'done')) default 'todo',
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')) default 'medium',
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default uuid_generate_v4(),
  component_id uuid not null references public.components(id) on delete cascade,
  content text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index on public.organization_members(organization_id);
create index on public.organization_members(user_id);
create index on public.events(organization_id);
create index on public.events(slug);
create index on public.components(event_id);
create index on public.component_leads(component_id);
create index on public.tasks(component_id);
create index on public.tasks(assigned_to);
create index on public.notes(component_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.events enable row level security;
alter table public.components enable row level security;
alter table public.component_leads enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;

-- Helper function: check if user is member of an org
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

-- Helper function: check if user is admin/owner of an org
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- PROFILES
create policy "Users can view their own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles for update
  using (id = auth.uid());

create policy "Org members can view each other's profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.organization_members om1
      join public.organization_members om2 on om1.organization_id = om2.organization_id
      where om1.user_id = auth.uid() and om2.user_id = profiles.id
    )
  );

-- ORGANIZATIONS
create policy "Org members can view their org"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "Any authenticated user can create an org"
  on public.organizations for insert
  with check (auth.uid() is not null);

create policy "Org admins can update their org"
  on public.organizations for update
  using (public.is_org_admin(id));

-- ORGANIZATION MEMBERS
create policy "Org members can view members"
  on public.organization_members for select
  using (public.is_org_member(organization_id));

create policy "Org admins can manage members"
  on public.organization_members for insert
  with check (public.is_org_admin(organization_id));

create policy "Org admins can update members"
  on public.organization_members for update
  using (public.is_org_admin(organization_id));

create policy "Org admins can remove members"
  on public.organization_members for delete
  using (public.is_org_admin(organization_id) or user_id = auth.uid());

create policy "Allow first owner insert during org creation"
  on public.organization_members for insert
  with check (
    user_id = auth.uid() and role = 'owner' and
    not exists (select 1 from public.organization_members where organization_id = organization_members.organization_id)
  );

-- EVENTS
create policy "Org members can view events"
  on public.events for select
  using (public.is_org_member(organization_id));

create policy "Org admins can create events"
  on public.events for insert
  with check (public.is_org_admin(organization_id));

create policy "Org admins can update events"
  on public.events for update
  using (public.is_org_admin(organization_id));

create policy "Org admins can delete events"
  on public.events for delete
  using (public.is_org_admin(organization_id));

-- COMPONENTS
create policy "Org members can view components"
  on public.components for select
  using (
    exists (
      select 1 from public.events e
      where e.id = components.event_id and public.is_org_member(e.organization_id)
    )
  );

create policy "Org admins can manage components"
  on public.components for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = components.event_id and public.is_org_admin(e.organization_id)
    )
  );

create policy "Org admins can update components"
  on public.components for update
  using (
    exists (
      select 1 from public.events e
      where e.id = components.event_id and public.is_org_admin(e.organization_id)
    )
  );

create policy "Org admins can delete components"
  on public.components for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = components.event_id and public.is_org_admin(e.organization_id)
    )
  );

-- COMPONENT LEADS
create policy "Org members can view component leads"
  on public.component_leads for select
  using (
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = component_leads.component_id and public.is_org_member(e.organization_id)
    )
  );

create policy "Org admins can manage component leads"
  on public.component_leads for all
  using (
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = component_leads.component_id and public.is_org_admin(e.organization_id)
    )
  );

-- TASKS
create policy "Org members can view tasks"
  on public.tasks for select
  using (
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = tasks.component_id and public.is_org_member(e.organization_id)
    )
  );

create policy "Org members can create tasks"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = tasks.component_id and public.is_org_member(e.organization_id)
    )
  );

create policy "Task creators and admins can update tasks"
  on public.tasks for update
  using (
    created_by = auth.uid() or
    assigned_to = auth.uid() or
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = tasks.component_id and public.is_org_admin(e.organization_id)
    )
  );

create policy "Task creators and admins can delete tasks"
  on public.tasks for delete
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = tasks.component_id and public.is_org_admin(e.organization_id)
    )
  );

-- NOTES
create policy "Org members can view notes"
  on public.notes for select
  using (
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = notes.component_id and public.is_org_member(e.organization_id)
    )
  );

create policy "Org members can create notes"
  on public.notes for insert
  with check (
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = notes.component_id and public.is_org_member(e.organization_id)
    )
  );

create policy "Note authors and admins can update notes"
  on public.notes for update
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = notes.component_id and public.is_org_admin(e.organization_id)
    )
  );

create policy "Note authors and admins can delete notes"
  on public.notes for delete
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.components c
      join public.events e on e.id = c.event_id
      where c.id = notes.component_id and public.is_org_admin(e.organization_id)
    )
  );
