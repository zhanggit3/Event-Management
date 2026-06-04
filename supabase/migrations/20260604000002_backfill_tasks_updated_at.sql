-- ISSUE-015 follow-up: the previous migration added tasks.updated_at with
-- `default now()`, which backfilled every existing row to the migration run time,
-- making "Last Modified" uniform and uninformative until each task is next edited.
-- Seed it from created_at instead. The BEFORE UPDATE trigger would otherwise rewrite
-- updated_at back to now(), so disable it for the one-time backfill.

alter table public.tasks disable trigger trg_tasks_updated_at;

update public.tasks set updated_at = created_at where updated_at <> created_at;

alter table public.tasks enable trigger trg_tasks_updated_at;
