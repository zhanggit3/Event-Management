-- ISSUE-005: Extend component_access_requests RLS to allow event guests to submit requests.
--
-- Existing policies:
--   car_insert  (INSERT) — only org members
--   car_select  (SELECT) — own requests + org admins + component leads
--   car_delete  (DELETE) — own requests (no status filter)
--   car_update  (UPDATE) — own requests + org admins + component leads
--
-- Change: replace car_insert to also allow event guests (users in event_members
-- for the component's event but NOT necessarily org members).
--
-- car_select already covers "requester_id = auth.uid()" so event guests can see
-- their own requests without any change.
-- car_delete already covers "requester_id = auth.uid()" so guests can cancel.
-- No other policy changes needed.

drop policy if exists "car_insert" on public.component_access_requests;

create policy "car_insert"
  on public.component_access_requests for insert
  with check (
    requester_id = auth.uid()
    and (
      -- Org member for this component's org
      public.is_org_member_for_component(component_id)
      -- OR an event guest (user in event_members for this component's event)
      or exists(
        select 1
        from public.components c
        join public.event_members em on em.event_id = c.event_id
        where c.id = component_id
          and em.user_id = auth.uid()
      )
    )
  );
