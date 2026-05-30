-- Grant event guests (contractors) read/write access to content inside their granted components.
-- ISSUE-004 covered tasks and notes; this migration covers the remaining 7 content tables.

-- activities
create policy "Event guests can view granted activities"
  on public.activities for select
  using (public.is_event_component_granted(component_id));

create policy "Event guests can create activities in granted components"
  on public.activities for insert
  with check (public.is_event_component_granted(component_id));

-- task_comments (no direct component_id — join via tasks)
create policy "Event guests can view task comments in granted components"
  on public.task_comments for select
  using (
    exists(
      select 1 from public.tasks t
      where t.id = task_id
        and public.is_event_component_granted(t.component_id)
    )
  );

create policy "Event guests can create task comments in granted components"
  on public.task_comments for insert
  with check (
    exists(
      select 1 from public.tasks t
      where t.id = task_id
        and public.is_event_component_granted(t.component_id)
    )
  );

-- task_attachments (no direct component_id — join via tasks)
create policy "Event guests can view task attachments in granted components"
  on public.task_attachments for select
  using (
    exists(
      select 1 from public.tasks t
      where t.id = task_id
        and public.is_event_component_granted(t.component_id)
    )
  );

-- calendar_events
create policy "Event guests can view calendar events in granted components"
  on public.calendar_events for select
  using (public.is_event_component_granted(component_id));

-- resource_links
create policy "Event guests can view resource links in granted components"
  on public.resource_links for select
  using (public.is_event_component_granted(component_id));

-- component_folders
create policy "Event guests can view component folders in granted components"
  on public.component_folders for select
  using (public.is_event_component_granted(component_id));

-- component_files
create policy "Event guests can view component files in granted components"
  on public.component_files for select
  using (public.is_event_component_granted(component_id));
