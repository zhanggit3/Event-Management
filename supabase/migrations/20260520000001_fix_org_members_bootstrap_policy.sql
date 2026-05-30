-- Fix the bootstrap INSERT policy on organization_members.
--
-- Bug: the NOT EXISTS subquery compared the table alias to itself
--   (organization_members_1.organization_id = organization_members_1.organization_id)
-- which is always TRUE, making NOT EXISTS always FALSE once any row exists.
--
-- Fix: compare the aliased existing rows to the NEW row's organization_id.
-- In a WITH CHECK expression, the unaliased table name refers to the row
-- being inserted (equivalent to NEW in a trigger).

drop policy if exists "Allow first owner insert during org creation"
  on public.organization_members;

create policy "Allow first owner insert during org creation"
  on public.organization_members
  for insert
  with check (
    (user_id = auth.uid())
    and (role = 'owner')
    and (not exists (
      select 1
      from public.organization_members existing
      where existing.organization_id = organization_members.organization_id
    ))
  );
