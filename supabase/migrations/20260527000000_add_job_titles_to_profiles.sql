alter table public.profiles
  add column if not exists job_titles text[] default '{}';
