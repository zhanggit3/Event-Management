-- ISSUE-011 follow-up (user testing):
--  1. add a free-text `projects` field to clients
--  2. allow the client's creator (not just org admins) to update/delete it,
--     so a member who added a client can manage their own entry.

alter table public.clients
  add column if not exists projects text;

-- Update: admins OR the creator.
drop policy if exists "Org members can update clients" on public.clients;
create policy "Admins or creator can update clients"
  on public.clients for update
  using (public.is_org_admin(organization_id) or created_by = auth.uid());

-- Delete: admins OR the creator.
drop policy if exists "Org admins can delete clients" on public.clients;
create policy "Admins or creator can delete clients"
  on public.clients for delete
  using (public.is_org_admin(organization_id) or created_by = auth.uid());
