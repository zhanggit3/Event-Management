-- ISSUE-012 follow-up: templates are owned by the user who saved them.
-- The Company › Templates manager shows only the caller's own saved templates
-- (across any org they belong to). The AddComponentDialog "Library" tab still
-- shows all org templates (org-scoped), so this column does not affect it.

alter table public.component_templates
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Backfill existing (seed) templates to their org's earliest owner so nothing is orphaned.
update public.component_templates ct
set created_by = sub.user_id
from (
  select distinct on (organization_id) organization_id, user_id
  from public.organization_members
  where role = 'owner'
  order by organization_id, created_at asc
) sub
where ct.created_by is null and ct.organization_id = sub.organization_id;
