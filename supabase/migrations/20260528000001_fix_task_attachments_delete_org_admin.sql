drop policy "Uploader can delete task attachments" on public.task_attachments;

create policy "Uploader or org admin can delete task attachments"
  on public.task_attachments for delete
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.tasks t
      join public.components c on c.id = t.component_id
      join public.events e on e.id = c.event_id
      where t.id = task_attachments.task_id
        and public.is_org_admin(e.organization_id)
    )
  );
