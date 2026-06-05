-- ISSUE-016 fix: estimates created before the template feature have activities with
-- template_type = NULL, which makes their estimate sheets unreachable (the activity name
-- only links to the editor when template_type = 'estimate') and undeletable by members.
-- Backfill any activity that already owns an estimate.
update public.activities a
set template_type = 'estimate'
where a.template_type is null
  and exists (select 1 from public.estimates e where e.activity_id = a.id);
