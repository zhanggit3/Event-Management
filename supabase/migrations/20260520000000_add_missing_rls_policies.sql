-- ============================================================
-- Add RLS policies for tables missing coverage
-- Tables: component_members, component_folders, component_files,
--         calendar_events, resource_links, component_templates
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Return the organization_id that owns a given component
-- (walks component → event → organization)
create or replace function public.org_id_for_component(comp_id uuid)
returns uuid
language sql
security definer
stable
as $$
  select e.organization_id
  from public.components c
  join public.events e on e.id = c.event_id
  where c.id = comp_id
  limit 1;
$$;

-- Check whether the calling user is a member of the org that owns a component
create or replace function public.is_org_member_for_component(comp_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_org_member(public.org_id_for_component(comp_id));
$$;

-- Check whether the calling user is an admin/owner of the org that owns a component
create or replace function public.is_org_admin_for_component(comp_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_org_admin(public.org_id_for_component(comp_id));
$$;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.component_members   enable row level security;
alter table public.component_folders   enable row level security;
alter table public.component_files     enable row level security;
alter table public.calendar_events     enable row level security;
alter table public.resource_links      enable row level security;
alter table public.component_templates enable row level security;

-- ============================================================
-- COMPONENT_MEMBERS
-- Freeform (non-auth) team member records attached to a component
-- ============================================================

create policy "Org members can view component_members"
  on public.component_members for select
  using (public.is_org_member_for_component(component_id));

create policy "Org members can add component_members"
  on public.component_members for insert
  with check (public.is_org_member_for_component(component_id));

create policy "Org members can update component_members"
  on public.component_members for update
  using (public.is_org_member_for_component(component_id));

create policy "Org admins can delete component_members"
  on public.component_members for delete
  using (public.is_org_admin_for_component(component_id));

-- ============================================================
-- COMPONENT_FOLDERS
-- File-organization folders belonging to a component
-- ============================================================

create policy "Org members can view component_folders"
  on public.component_folders for select
  using (public.is_org_member_for_component(component_id));

create policy "Org members can create component_folders"
  on public.component_folders for insert
  with check (public.is_org_member_for_component(component_id));

create policy "Org members can update component_folders"
  on public.component_folders for update
  using (public.is_org_member_for_component(component_id));

create policy "Org admins can delete component_folders"
  on public.component_folders for delete
  using (public.is_org_admin_for_component(component_id));

-- ============================================================
-- COMPONENT_FILES
-- File metadata for uploads stored in Supabase Storage
-- ============================================================

create policy "Org members can view component_files"
  on public.component_files for select
  using (public.is_org_member_for_component(component_id));

create policy "Org members can upload component_files"
  on public.component_files for insert
  with check (public.is_org_member_for_component(component_id));

create policy "Org members can update component_files"
  on public.component_files for update
  using (public.is_org_member_for_component(component_id));

create policy "Org admins can delete component_files"
  on public.component_files for delete
  using (public.is_org_admin_for_component(component_id));

-- ============================================================
-- CALENDAR_EVENTS
-- Scheduled items per component
-- ============================================================

create policy "Org members can view calendar_events"
  on public.calendar_events for select
  using (public.is_org_member_for_component(component_id));

create policy "Org members can create calendar_events"
  on public.calendar_events for insert
  with check (public.is_org_member_for_component(component_id));

create policy "Calendar event creators and admins can update"
  on public.calendar_events for update
  using (
    created_by = auth.uid() or
    public.is_org_admin_for_component(component_id)
  );

create policy "Calendar event creators and admins can delete"
  on public.calendar_events for delete
  using (
    created_by = auth.uid() or
    public.is_org_admin_for_component(component_id)
  );

-- ============================================================
-- RESOURCE_LINKS
-- Pinned URLs per component
-- ============================================================

create policy "Org members can view resource_links"
  on public.resource_links for select
  using (public.is_org_member_for_component(component_id));

create policy "Org members can add resource_links"
  on public.resource_links for insert
  with check (public.is_org_member_for_component(component_id));

create policy "Resource link adders and admins can update"
  on public.resource_links for update
  using (
    added_by = auth.uid() or
    public.is_org_admin_for_component(component_id)
  );

create policy "Resource link adders and admins can delete"
  on public.resource_links for delete
  using (
    added_by = auth.uid() or
    public.is_org_admin_for_component(component_id)
  );

-- ============================================================
-- COMPONENT_TEMPLATES
-- Reusable component presets owned by an org
-- ============================================================

create policy "Org members can view component_templates"
  on public.component_templates for select
  using (public.is_org_member(organization_id));

create policy "Org admins can create component_templates"
  on public.component_templates for insert
  with check (public.is_org_admin(organization_id));

create policy "Org admins can update component_templates"
  on public.component_templates for update
  using (public.is_org_admin(organization_id));

create policy "Org admins can delete component_templates"
  on public.component_templates for delete
  using (public.is_org_admin(organization_id));

-- ============================================================
-- EXISTING POLICY AUDIT — no changes needed
--
-- profiles:
--   SELECT: own row + org co-members (correct)
--   UPDATE: own row (correct)
--   INSERT: handled by handle_new_user() trigger (no RLS insert
--           policy needed; trigger runs as security definer)
--
-- organizations:
--   SELECT: org members (correct)
--   INSERT: any authenticated user (correct — creates new org)
--   UPDATE: org admins (correct)
--   DELETE: no policy (intentional — no delete-org UI or workflow)
--
-- organization_members:
--   SELECT: org members (correct)
--   INSERT: two policies — org admins OR first-owner bootstrap (correct)
--   UPDATE: org admins (correct)
--   DELETE: org admins or self-removal (correct)
--
-- events:
--   SELECT: org members (correct)
--   INSERT: org admins (correct)
--   UPDATE: org admins (correct)
--   DELETE: org admins (correct)
--
-- components:
--   SELECT: org members via event join (correct)
--   INSERT/UPDATE/DELETE: org admins via event join (correct)
--
-- component_leads:
--   SELECT: org members via component→event join (correct)
--   ALL (insert/update/delete): org admins via component→event join (correct)
--
-- tasks:
--   SELECT: org members (correct)
--   INSERT: org members (correct)
--   UPDATE: creator, assignee, or org admin (correct)
--   DELETE: creator or org admin (correct)
--
-- notes:
--   SELECT: org members (correct)
--   INSERT: org members (correct)
--   UPDATE: author or org admin (correct)
--   DELETE: author or org admin (correct)
-- ============================================================
