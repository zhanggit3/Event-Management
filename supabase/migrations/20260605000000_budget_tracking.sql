-- ISSUE-017: Finance master budget — aggregate estimates from multiple teams

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components(id) on delete cascade,
  name text not null default 'Budget',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (component_id)
);

create table if not exists public.budget_line_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  section_type text not null default 'expense',   -- 'expense' | 'revenue'
  item_name text not null default '',
  estimated_amount numeric not null default 0,
  actual_amount numeric not null default 0,
  status text not null default 'estimated',        -- 'estimated' | 'quoted' | 'committed' | 'paid'
  notes text,
  source_estimate_id uuid references public.estimates(id) on delete set null,
  source_label text,                               -- denormalized "{Team} · {proposal name}" captured at import; null = manual
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.budgets enable row level security;
alter table public.budget_line_items enable row level security;

-- Mirror the existing estimate RLS pattern: org members of the component's event.
create policy "Org members manage budgets" on public.budgets for all using (
  exists (
    select 1 from public.components c
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where c.id = budgets.component_id and om.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.components c
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where c.id = budgets.component_id and om.user_id = auth.uid()
  )
);

create policy "Org members manage budget line items" on public.budget_line_items for all using (
  exists (
    select 1 from public.budgets b
    join public.components c on c.id = b.component_id
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where b.id = budget_line_items.budget_id and om.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.budgets b
    join public.components c on c.id = b.component_id
    join public.events e on e.id = c.event_id
    join public.organization_members om on om.organization_id = e.organization_id
    where b.id = budget_line_items.budget_id and om.user_id = auth.uid()
  )
);
