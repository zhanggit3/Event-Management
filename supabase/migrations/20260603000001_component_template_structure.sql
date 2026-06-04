-- ISSUE-012: capture the full component → activities → tasks → subtasks structure in templates.
-- Additive only: two nullable columns. `tasks_json` is retained for backward compat with the
-- existing AddComponentDialog "Library" tab. RLS on component_templates already exists
-- (members read; org admins insert/update/delete) — no policy changes needed.

alter table public.component_templates
  add column if not exists structure_json jsonb not null default '[]'::jsonb,
  add column if not exists source_event_name text;
