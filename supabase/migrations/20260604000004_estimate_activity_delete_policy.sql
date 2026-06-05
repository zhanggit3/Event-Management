-- ISSUE-016: allow org members to delete their estimate-template activities.
-- Activity DELETE is otherwise admin-only ("Org admins can delete activities"), but estimate
-- activities are created by any org member via the "Estimates" template, so members must be able
-- to delete them. Deleting the activity cascades to the estimate (estimates_activity_id_fkey is
-- ON DELETE CASCADE), which cascades to its columns/sections/line items.
create policy "Org members can delete estimate activities"
  on public.activities for delete
  using (public.is_org_member_for_component(component_id) and template_type = 'estimate');
