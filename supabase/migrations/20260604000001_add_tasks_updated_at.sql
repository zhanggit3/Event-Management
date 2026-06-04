-- ISSUE-015: add tasks.updated_at + trigger to power the "My Work" Last Modified column.
-- The Task TypeScript type already declared updated_at, but the column was missing in the DB.

alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_tasks_updated_at();
