drop policy "Any authenticated user can search organizations" on public.organizations;

create policy "Any authenticated user can search non-workspace organizations"
  on public.organizations for select
  using (
    auth.uid() is not null
    and not is_workspace
  );
