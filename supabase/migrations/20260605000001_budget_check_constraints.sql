-- ISSUE-017 revision: enforce valid enum values at the DB layer (RLS gates which rows
-- you can write, not the values). Mirrors the CHECK pattern used on estimate tables.
alter table public.budget_line_items
  add constraint budget_line_items_section_type_check
  check (section_type in ('expense', 'revenue'));

alter table public.budget_line_items
  add constraint budget_line_items_status_check
  check (status in ('estimated', 'quoted', 'committed', 'paid'));
