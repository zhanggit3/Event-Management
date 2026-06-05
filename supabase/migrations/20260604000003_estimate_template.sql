-- ISSUE-016: Estimate as a selectable activity template + editable header

-- Estimate: editable proposal name + modifier tracking
alter table public.estimates add column if not exists proposal_name text;
alter table public.estimates add column if not exists last_modified_by uuid references public.profiles(id);

-- Backfill proposal_name from the existing number so old estimates render
update public.estimates set proposal_name = proposal_number where proposal_name is null;

-- Activity: mark which activities are estimate templates (null = standard, 'estimate' = estimate)
alter table public.activities add column if not exists template_type text;
