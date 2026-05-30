-- =============================================================================
-- RLS MANUAL TEST SCRIPT — Event Management Platform
-- Paste entire file into the Supabase SQL editor and run.
--
-- Setup strategy:
--   - postgres has BYPASSRLS=true but Supabase does not honour it for
--     organization_members in the SQL editor. A temporary permissive INSERT
--     policy (_test_insert_bypass) is created for setup and dropped before tests.
--   - session_replication_role = replica → attempts to disable FK triggers, but
--     Supabase SQL editor does not honour it consistently (same quirk as BYPASSRLS).
--   - profiles_id_fkey and organization_members_user_id_fkey dropped transiently
--     (DDL inside transaction = auto-revert on ROLLBACK) to allow fake UUIDs.
--   - Identity is simulated via set_config('request.jwt.claim.sub', UUID, true).
--     Supabase's auth.uid() reads that GUC first (before the full JWT JSON), so
--     no JSON encoding is needed and the SQL editor honours it reliably.
--   - All setup inserts use ON CONFLICT … DO NOTHING for idempotency.
--   - expected-error tests: wrapped in SAVEPOINT/ROLLBACK TO SAVEPOINT so the
--     script continues after the expected 42501.
-- =============================================================================

begin;

-- ── Pre-flight: remove any bypass policy left by a previous aborted run ────────
drop policy if exists "_test_insert_bypass" on public.organization_members;

-- ── Bypass FK triggers and drop FK constraints ────────────────────────────────
-- session_replication_role = replica disables ENABLE-class FK triggers, but
-- Supabase SQL editor does not honour it for all tables (same quirk as BYPASSRLS).
-- Belt-and-suspenders: also explicitly drop the FK constraints that reference
-- auth.users or profiles, so fake test UUIDs are never rejected.
-- All DROPs are DDL inside this transaction → auto-restored on ROLLBACK.
set session_replication_role = 'replica';
alter table public.profiles           drop constraint if exists profiles_id_fkey;
alter table public.organization_members drop constraint if exists organization_members_user_id_fkey;

-- ── organization_members RLS bypass ───────────────────────────────────────────
-- Supabase doesn't honour BYPASSRLS for postgres on this table in the SQL editor.
-- Adding a permissive policy (WITH CHECK true) satisfies OR-logic so the setup
-- inserts pass. The policy is dropped before the test phase.
-- (DDL is transactional: if the script errors before the DROP, the CREATE is also
-- rolled back on connection close — no leftover state between runs.)
create policy "_test_insert_bypass"
  on public.organization_members
  for insert
  to authenticated
  with check (true);

-- =====================================================================
-- SETUP — profiles (no INSERT policy; postgres inserts directly)
-- =====================================================================
insert into public.profiles (id, full_name, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Owner A',  'owner_a@test.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Admin A',  'admin_a@test.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Member A', 'member_a@test.com'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Owner B',  'owner_b@test.com'),
  ('cccccccc-0000-0000-0000-000000000001', 'Stranger', 'stranger@test.com')
on conflict (id) do update
  set full_name = excluded.full_name,
      email     = excluded.email;

-- =====================================================================
-- SETUP — organizations
-- =====================================================================
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'Org Alpha', 'org-alpha'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Org Beta',  'org-beta')
on conflict (id) do update
  set name = excluded.name,
      slug = excluded.slug;

-- =====================================================================
-- SETUP — organization_members
-- ON CONFLICT … DO NOTHING (not DO UPDATE) is intentional:
--   PostgreSQL evaluates both INSERT and UPDATE WITH CHECK policies for
--   ON CONFLICT DO UPDATE statements even when no conflict occurs.
--   _test_insert_bypass only covers INSERT; DO UPDATE would also require
--   the UPDATE policy (is_org_admin) to pass — which fails because no
--   members exist yet.  DO NOTHING avoids the UPDATE policy check entirely.
--   Since every run is inside BEGIN…ROLLBACK there is never an actual
--   conflict, so DO NOTHING is behaviourally identical.
-- JWT claims are set per-org so the normal INSERT policies are also satisfied:
--   • bootstrap policy:  user_id = auth.uid() AND role = 'owner' AND no
--                        existing members for that org (first insert only)
--   • is_org_admin:      owner is already in the table, covers subsequent rows
-- =====================================================================

-- Org Alpha — JWT = owner_a so bootstrap passes for the first insert,
-- then is_org_admin(org_alpha) returns true for the remaining two.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

insert into public.organization_members (id, organization_id, user_id, role) values
  ('aaaaaaaa-2000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000001', 'owner')
on conflict (id) do nothing;

-- owner_a is now owner of Org Alpha; is_org_admin(org_alpha) = true for owner_a.
insert into public.organization_members (id, organization_id, user_id, role) values
  ('aaaaaaaa-2000-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000002', 'admin'),
  ('aaaaaaaa-2000-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000003', 'member')
on conflict (id) do nothing;

-- Org Beta — JWT = owner_b. Bootstrap would work here once migration
-- 20260520000001 is applied; until then _test_insert_bypass covers this row.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);

insert into public.organization_members (id, organization_id, user_id, role) values
  ('bbbbbbbb-2000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000',
   'bbbbbbbb-0000-0000-0000-000000000001', 'owner')
on conflict (id) do nothing;

-- Return to postgres for all remaining setup inserts.
reset role;

-- =====================================================================
-- SETUP — remaining tables (postgres BYPASSRLS handles all RLS)
-- =====================================================================
insert into public.events (id, organization_id, name, slug, status, created_by) values
  ('aaaaaaaa-3000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000',
   'Alpha Gala', 'alpha-gala', 'active', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-3000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000',
   'Beta Fest',  'beta-fest',  'draft',  'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set name = excluded.name;

insert into public.components (id, event_id, name, slug, sort_order) values
  ('aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001',
   'Finance',   'finance',   1),
  ('bbbbbbbb-4000-0000-0000-000000000001', 'bbbbbbbb-3000-0000-0000-000000000001',
   'Marketing', 'marketing', 1)
on conflict (id) do update set name = excluded.name;

insert into public.component_leads (id, component_id, user_id, role) values
  ('aaaaaaaa-5000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'lead'),
  ('bbbbbbbb-5000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'lead')
on conflict (id) do update set role = excluded.role;

insert into public.tasks (id, component_id, title, status, priority, created_by) values
  ('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Budget review',  'todo', 'high',   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-6000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Audit invoices', 'todo', 'medium', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-6000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'Design flyer',   'todo', 'low',    'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set title = excluded.title;

insert into public.notes (id, component_id, content, created_by) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Check Q1 numbers', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Admin note',       'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-7000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'Beta note',        'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set content = excluded.content;

insert into public.component_members (id, component_id, name, email, role) values
  ('aaaaaaaa-8000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Alice External', 'alice@ext.com', 'volunteer'),
  ('bbbbbbbb-8000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'Bob External',   'bob@ext.com',   'staff')
on conflict (id) do update set name = excluded.name;

insert into public.component_folders (id, component_id, name, created_by) values
  ('aaaaaaaa-9000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Receipts',  'aaaaaaaa-0000-0000-0000-000000000003'),
  ('bbbbbbbb-9000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'Creatives', 'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set name = excluded.name;

insert into public.component_files
    (id, folder_id, component_id, name, storage_key, uploaded_by) values
  ('aaaaaaaa-a000-0000-0000-000000000001',
   'aaaaaaaa-9000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'receipt.pdf', 'comp-a/folder-a/receipt.pdf', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('bbbbbbbb-a000-0000-0000-000000000001',
   'bbbbbbbb-9000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'banner.png',  'comp-b/folder-b/banner.png',  'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set name = excluded.name;

insert into public.calendar_events
    (id, component_id, event_id, title, start_time, is_all_day, created_by) values
  ('aaaaaaaa-b000-0000-0000-000000000001',
   'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001',
   'Kickoff meeting', now() + interval '7 days',  false,
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-b000-0000-0000-000000000002',
   'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001',
   'Admin deadline',  now() + interval '14 days', true,
   'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-b000-0000-0000-000000000001',
   'bbbbbbbb-4000-0000-0000-000000000001', 'bbbbbbbb-3000-0000-0000-000000000001',
   'Beta launch',     now() + interval '30 days', false,
   'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set title = excluded.title;

insert into public.resource_links
    (id, component_id, title, url, category, added_by) values
  ('aaaaaaaa-c000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Budget Sheet', 'https://docs.google.com/a', 'spreadsheet',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-c000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001',
   'Design Brief', 'https://docs.google.com/b', 'document',
   'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-c000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001',
   'Beta Guide',   'https://docs.google.com/c', 'document',
   'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do update set title = excluded.title;

insert into public.component_templates (id, organization_id, name, slug, icon, color) values
  ('aaaaaaaa-d000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000',
   'Finance Template',   'finance-tmpl',   '💰', '#22c55e'),
  ('bbbbbbbb-d000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000',
   'Marketing Template', 'marketing-tmpl', '📣', '#3b82f6')
on conflict (id) do update set name = excluded.name;

-- ── Remove bypass policy and restore FK triggers before the test phase ────────
drop policy "_test_insert_bypass" on public.organization_members;
set session_replication_role = 'origin';


-- =====================================================================
-- TEST 1 — PROFILES
-- =====================================================================

-- [T1-01] member_a can see own profile
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select id, full_name from public.profiles
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
-- EXPECT: 1 row — Member A

-- [T1-02] member_a can see co-org member admin_a
select id, full_name from public.profiles
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
-- EXPECT: 1 row — Admin A

-- [T1-03] member_a cannot see owner_b (different org)
select id, full_name from public.profiles
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- EXPECT: 0 rows

-- [T1-04] anon cannot see profiles
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select count(*) from public.profiles;
-- EXPECT: 0

-- [T1-05] member_a can update own profile
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
update public.profiles set full_name = 'Member A Updated'
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
-- EXPECT: UPDATE 1

-- [T1-06] member_a cannot update owner_a profile
update public.profiles set full_name = 'Hacked'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- EXPECT: UPDATE 0
reset role;
select full_name from public.profiles
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- EXPECT: 'Owner A'


-- =====================================================================
-- TEST 2 — ORGANIZATIONS
-- =====================================================================

-- [T2-01] member_a can see Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select id, name from public.organizations
  where id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1 row

-- [T2-02] member_a cannot see Org Beta
select id, name from public.organizations
  where id = 'bbbbbbbb-1111-0000-0000-000000000000';
-- EXPECT: 0 rows

-- [T2-03] any authenticated user can create an org
insert into public.organizations (id, name, slug)
  values ('cccccccc-1111-0000-0000-000000000000', 'Org Gamma', 'org-gamma');
-- EXPECT: INSERT 1

-- [T2-04] anon cannot create an org
reset role;
set local role anon;
savepoint t2_04;
insert into public.organizations (name, slug) values ('Bad Org', 'bad-org');
-- EXPECT: ERROR 42501
rollback to savepoint t2_04; release savepoint t2_04;

-- [T2-05] admin_a can update Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
update public.organizations set name = 'Org Alpha v2'
  where id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: UPDATE 1

-- [T2-06] plain member cannot update Org Alpha
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
update public.organizations set name = 'Hacked'
  where id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: UPDATE 0
reset role;
select name from public.organizations
  where id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 'Org Alpha v2'


-- =====================================================================
-- TEST 3 — ORGANIZATION_MEMBERS
-- =====================================================================

-- [T3-01] member_a sees all 3 Org Alpha members
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.organization_members
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 3

-- [T3-02] member_a cannot see Org Beta members
select count(*) from public.organization_members
  where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000';
-- EXPECT: 0

-- [T3-03] plain member cannot add a new member
savepoint t3_03;
insert into public.organization_members (organization_id, user_id, role)
  values ('aaaaaaaa-1111-0000-0000-000000000000',
          'bbbbbbbb-0000-0000-0000-000000000001', 'member');
-- EXPECT: ERROR 42501
rollback to savepoint t3_03; release savepoint t3_03;

-- [T3-04] admin_a can add a new member
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
insert into public.organization_members (organization_id, user_id, role)
  values ('aaaaaaaa-1111-0000-0000-000000000000',
          'cccccccc-0000-0000-0000-000000000001', 'member');
-- EXPECT: INSERT 1

-- [T3-05] member can self-remove
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
delete from public.organization_members
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'cccccccc-0000-0000-0000-000000000001';
-- EXPECT: DELETE 1

-- [T3-06] plain member cannot delete another member
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.organization_members
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.organization_members
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
-- EXPECT: 1


-- =====================================================================
-- TEST 4 — EVENTS
-- =====================================================================

-- [T4-01] member_a sees Org Alpha events
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.events
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1

-- [T4-02] member_a cannot see Org Beta events
select count(*) from public.events
  where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000';
-- EXPECT: 0

-- [T4-03] plain member cannot create an event
savepoint t4_03;
insert into public.events (organization_id, name, slug, status, created_by)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'Bad Event', 'bad-event',
          'draft', 'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: ERROR 42501
rollback to savepoint t4_03; release savepoint t4_03;

-- [T4-04] admin_a can create and delete an event
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
insert into public.events (id, organization_id, name, slug, status, created_by)
  values ('aaaaaaaa-3000-0000-0000-000000000099',
          'aaaaaaaa-1111-0000-0000-000000000000',
          'Admin Event', 'admin-event-99', 'draft',
          'aaaaaaaa-0000-0000-0000-000000000002');
-- EXPECT: INSERT 1
delete from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T4-05] plain member cannot delete an event
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000001';
-- EXPECT: 1

-- [T4-06] owner_b cannot insert event into Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
savepoint t4_06;
insert into public.events (organization_id, name, slug, status, created_by)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'Cross-org event', 'cross-org',
          'draft', 'bbbbbbbb-0000-0000-0000-000000000001');
-- EXPECT: ERROR 42501
rollback to savepoint t4_06; release savepoint t4_06;


-- =====================================================================
-- TEST 5 — COMPONENTS
-- =====================================================================

-- [T5-01] member_a sees Finance component
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.components
  where event_id = 'aaaaaaaa-3000-0000-0000-000000000001';
-- EXPECT: 1

-- [T5-02] member_a cannot see Org Beta components
select count(*) from public.components
  where event_id = 'bbbbbbbb-3000-0000-0000-000000000001';
-- EXPECT: 0

-- [T5-03] plain member cannot insert a component
savepoint t5_03;
insert into public.components (event_id, name, slug, sort_order)
  values ('aaaaaaaa-3000-0000-0000-000000000001', 'Volunteer', 'volunteer', 2);
-- EXPECT: ERROR 42501
rollback to savepoint t5_03; release savepoint t5_03;

-- [T5-04] admin_a can insert and delete a component
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
insert into public.components (id, event_id, name, slug, sort_order)
  values ('aaaaaaaa-4000-0000-0000-000000000099',
          'aaaaaaaa-3000-0000-0000-000000000001', 'Logistics', 'logistics-99', 2);
-- EXPECT: INSERT 1
delete from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T5-05] plain member cannot delete Finance component
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 1


-- =====================================================================
-- TEST 6 — COMPONENT_LEADS
-- =====================================================================

-- [T6-01] member_a sees Finance lead
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.component_leads
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 1

-- [T6-02] member_a cannot see Org Beta leads
select count(*) from public.component_leads
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T6-03] plain member cannot insert a lead
savepoint t6_03;
insert into public.component_leads (component_id, user_id, role)
  values ('aaaaaaaa-4000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 'co-lead');
-- EXPECT: ERROR 42501
rollback to savepoint t6_03; release savepoint t6_03;

-- [T6-04] admin_a can insert and delete a lead
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
insert into public.component_leads (id, component_id, user_id, role)
  values ('aaaaaaaa-5000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 'co-lead');
-- EXPECT: INSERT 1
delete from public.component_leads where id = 'aaaaaaaa-5000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T6-05] plain member cannot delete a lead
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.component_leads where id = 'aaaaaaaa-5000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.component_leads
  where id = 'aaaaaaaa-5000-0000-0000-000000000001';
-- EXPECT: 1


-- =====================================================================
-- TEST 7 — TASKS
-- =====================================================================

-- [T7-01] member_a sees both Finance tasks
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.tasks
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 2

-- [T7-02] member_a cannot see Org Beta tasks
select count(*) from public.tasks
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T7-03] member_a can create a task
insert into public.tasks (id, component_id, title, status, priority, created_by)
  values ('aaaaaaaa-6000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'Test task', 'todo', 'low', 'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: INSERT 1

-- [T7-04] member_a (creator) can update own task
update public.tasks set title = 'Test task updated'
  where id = 'aaaaaaaa-6000-0000-0000-000000000099';
-- EXPECT: UPDATE 1

-- [T7-05] member_a cannot update admin_a's task
update public.tasks set title = 'Hacked'
  where id = 'aaaaaaaa-6000-0000-0000-000000000002';
-- EXPECT: UPDATE 0
reset role;
select title from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002';
-- EXPECT: 'Audit invoices'

-- [T7-06] admin_a can update any task
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
update public.tasks set priority = 'urgent'
  where id = 'aaaaaaaa-6000-0000-0000-000000000001';
-- EXPECT: UPDATE 1

-- [T7-07] member_a can delete own task
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T7-08] member_a cannot delete admin_a's task
delete from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002';
-- EXPECT: 1

-- [T7-09] owner_b cannot insert into Org Alpha component
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
savepoint t7_09;
insert into public.tasks (component_id, title, status, priority, created_by)
  values ('aaaaaaaa-4000-0000-0000-000000000001', 'Cross-org task',
          'todo', 'low', 'bbbbbbbb-0000-0000-0000-000000000001');
-- EXPECT: ERROR 42501
rollback to savepoint t7_09; release savepoint t7_09;


-- =====================================================================
-- TEST 8 — NOTES
-- =====================================================================

-- [T8-01] member_a sees both Finance notes
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.notes
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 2

-- [T8-02] member_a cannot see Org Beta notes
select count(*) from public.notes
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T8-03] member_a can create a note
insert into public.notes (id, component_id, content, created_by)
  values ('aaaaaaaa-7000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'Test note', 'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: INSERT 1

-- [T8-04] member_a (author) can update own note
update public.notes set content = 'Test note updated'
  where id = 'aaaaaaaa-7000-0000-0000-000000000099';
-- EXPECT: UPDATE 1

-- [T8-05] member_a cannot update admin_a's note
update public.notes set content = 'Hacked'
  where id = 'aaaaaaaa-7000-0000-0000-000000000002';
-- EXPECT: UPDATE 0
reset role;
select content from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002';
-- EXPECT: 'Admin note'

-- [T8-06] admin_a can update any note
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
update public.notes set content = 'Admin edited this'
  where id = 'aaaaaaaa-7000-0000-0000-000000000001';
-- EXPECT: UPDATE 1

-- [T8-07] member_a can delete own note
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T8-08] member_a cannot delete admin_a's note
delete from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002';
-- EXPECT: 1

-- [T8-09] anon cannot insert a note
reset role;
set local role anon;
savepoint t8_09;
insert into public.notes (component_id, content, created_by)
  values ('aaaaaaaa-4000-0000-0000-000000000001', 'Anon note',
          'aaaaaaaa-0000-0000-0000-000000000001');
-- EXPECT: ERROR 42501
rollback to savepoint t8_09; release savepoint t8_09;


-- =====================================================================
-- TEST 9 — COMPONENT_MEMBERS
-- =====================================================================

-- [T9-01] member_a sees Alice External
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.component_members
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 1

-- [T9-02] member_a cannot see Org Beta component_members
select count(*) from public.component_members
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T9-03] member_a can insert a component_member
insert into public.component_members (id, component_id, name, email, role)
  values ('aaaaaaaa-8000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'Charlie Temp', 'charlie@ext.com', 'helper');
-- EXPECT: INSERT 1

-- [T9-04] member_a cannot delete a component_member (admin-only)
delete from public.component_members
  where id = 'aaaaaaaa-8000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.component_members
  where id = 'aaaaaaaa-8000-0000-0000-000000000001';
-- EXPECT: 1

-- [T9-05] admin_a can delete a component_member
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
delete from public.component_members
  where id = 'aaaaaaaa-8000-0000-0000-000000000099';
-- EXPECT: DELETE 1


-- =====================================================================
-- TEST 10 — COMPONENT_FOLDERS
-- =====================================================================

-- [T10-01] member_a sees Receipts folder
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.component_folders
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 1

-- [T10-02] member_a cannot see Org Beta folders
select count(*) from public.component_folders
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T10-03] member_a can create a folder
insert into public.component_folders (id, component_id, name, created_by)
  values ('aaaaaaaa-9000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'Invoices', 'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: INSERT 1

-- [T10-04] member_a cannot delete a folder (admin-only)
delete from public.component_folders
  where id = 'aaaaaaaa-9000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.component_folders
  where id = 'aaaaaaaa-9000-0000-0000-000000000001';
-- EXPECT: 1

-- [T10-05] admin_a can delete a folder
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
delete from public.component_folders
  where id = 'aaaaaaaa-9000-0000-0000-000000000099';
-- EXPECT: DELETE 1


-- =====================================================================
-- TEST 11 — COMPONENT_FILES
-- =====================================================================

-- [T11-01] member_a sees receipt.pdf
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.component_files
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 1

-- [T11-02] member_a cannot see Org Beta files
select count(*) from public.component_files
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T11-03] member_a can upload a file
insert into public.component_files
    (id, folder_id, component_id, name, storage_key, uploaded_by)
  values ('aaaaaaaa-a000-0000-0000-000000000099',
          'aaaaaaaa-9000-0000-0000-000000000001',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'contract.pdf', 'comp-a/folder-a/contract.pdf',
          'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: INSERT 1

-- [T11-04] member_a cannot delete a file (admin-only)
delete from public.component_files
  where id = 'aaaaaaaa-a000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.component_files
  where id = 'aaaaaaaa-a000-0000-0000-000000000001';
-- EXPECT: 1

-- [T11-05] admin_a can delete a file
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
delete from public.component_files
  where id = 'aaaaaaaa-a000-0000-0000-000000000099';
-- EXPECT: DELETE 1


-- =====================================================================
-- TEST 12 — CALENDAR_EVENTS
-- =====================================================================

-- [T12-01] member_a sees both Finance calendar events
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.calendar_events
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 2

-- [T12-02] member_a cannot see Org Beta calendar events
select count(*) from public.calendar_events
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T12-03] member_a can create a calendar event
insert into public.calendar_events
    (id, component_id, event_id, title, start_time, is_all_day, created_by)
  values ('aaaaaaaa-b000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'aaaaaaaa-3000-0000-0000-000000000001',
          'Planning session', now() + interval '2 days', false,
          'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: INSERT 1

-- [T12-04] member_a (creator) can update own calendar event
update public.calendar_events set title = 'Planning session updated'
  where id = 'aaaaaaaa-b000-0000-0000-000000000099';
-- EXPECT: UPDATE 1

-- [T12-05] member_a cannot update admin_a's calendar event
update public.calendar_events set title = 'Hacked'
  where id = 'aaaaaaaa-b000-0000-0000-000000000002';
-- EXPECT: UPDATE 0
reset role;
select title from public.calendar_events
  where id = 'aaaaaaaa-b000-0000-0000-000000000002';
-- EXPECT: 'Admin deadline'

-- [T12-06] admin_a can update any calendar event
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
update public.calendar_events set title = 'Kickoff meeting revised'
  where id = 'aaaaaaaa-b000-0000-0000-000000000001';
-- EXPECT: UPDATE 1

-- [T12-07] member_a (creator) can delete own event
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T12-08] member_a cannot delete admin_a's calendar event
delete from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000002';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.calendar_events
  where id = 'aaaaaaaa-b000-0000-0000-000000000002';
-- EXPECT: 1


-- =====================================================================
-- TEST 13 — RESOURCE_LINKS
-- =====================================================================

-- [T13-01] member_a sees both Finance resource links
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.resource_links
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 2

-- [T13-02] member_a cannot see Org Beta resource links
select count(*) from public.resource_links
  where component_id = 'bbbbbbbb-4000-0000-0000-000000000001';
-- EXPECT: 0

-- [T13-03] member_a can add a resource link
insert into public.resource_links (id, component_id, title, url, category, added_by)
  values ('aaaaaaaa-c000-0000-0000-000000000099',
          'aaaaaaaa-4000-0000-0000-000000000001',
          'Vendor Contact', 'https://example.com', 'other',
          'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: INSERT 1

-- [T13-04] member_a (adder) can update own resource link
update public.resource_links set title = 'Vendor Contact 2'
  where id = 'aaaaaaaa-c000-0000-0000-000000000099';
-- EXPECT: UPDATE 1

-- [T13-05] member_a cannot update admin_a's resource link
update public.resource_links set title = 'Hacked'
  where id = 'aaaaaaaa-c000-0000-0000-000000000002';
-- EXPECT: UPDATE 0
reset role;
select title from public.resource_links
  where id = 'aaaaaaaa-c000-0000-0000-000000000002';
-- EXPECT: 'Design Brief'

-- [T13-06] admin_a can update any resource link
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
update public.resource_links set title = 'Budget Sheet v2'
  where id = 'aaaaaaaa-c000-0000-0000-000000000001';
-- EXPECT: UPDATE 1

-- [T13-07] member_a (adder) can delete own resource link
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T13-08] member_a cannot delete admin_a's resource link
delete from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000002';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.resource_links
  where id = 'aaaaaaaa-c000-0000-0000-000000000002';
-- EXPECT: 1


-- =====================================================================
-- TEST 14 — COMPONENT_TEMPLATES
-- =====================================================================

-- [T14-01] member_a sees Org Alpha template
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.component_templates
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1

-- [T14-02] member_a cannot see Org Beta templates
select count(*) from public.component_templates
  where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000';
-- EXPECT: 0

-- [T14-03] plain member cannot create a template
savepoint t14_03;
insert into public.component_templates (organization_id, name, slug)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'Member Template', 'member-tmpl');
-- EXPECT: ERROR 42501
rollback to savepoint t14_03; release savepoint t14_03;

-- [T14-04] admin_a can create a template
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
insert into public.component_templates (id, organization_id, name, slug)
  values ('aaaaaaaa-d000-0000-0000-000000000099',
          'aaaaaaaa-1111-0000-0000-000000000000',
          'Volunteer Tmpl', 'volunteer-tmpl-99');
-- EXPECT: INSERT 1

-- [T14-05] admin_a can update a template
update public.component_templates set name = 'Finance Tmpl v2'
  where id = 'aaaaaaaa-d000-0000-0000-000000000001';
-- EXPECT: UPDATE 1

-- [T14-06] plain member cannot update a template
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
update public.component_templates set name = 'Hacked Template'
  where id = 'aaaaaaaa-d000-0000-0000-000000000001';
-- EXPECT: UPDATE 0
reset role;
select name from public.component_templates
  where id = 'aaaaaaaa-d000-0000-0000-000000000001';
-- EXPECT: 'Finance Tmpl v2'

-- [T14-07] admin_a can delete a template
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
delete from public.component_templates where id = 'aaaaaaaa-d000-0000-0000-000000000099';
-- EXPECT: DELETE 1

-- [T14-08] plain member cannot delete a template
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.component_templates where id = 'aaaaaaaa-d000-0000-0000-000000000001';
-- EXPECT: DELETE 0
reset role;
select count(*) from public.component_templates
  where id = 'aaaaaaaa-d000-0000-0000-000000000001';
-- EXPECT: 1


-- =====================================================================
-- TEST 15 — BOUNDARY / CROSS-CUTTING
-- =====================================================================

-- [T15-01] Helper functions resolve correctly
reset role;
select public.org_id_for_component('aaaaaaaa-4000-0000-0000-000000000001');
-- EXPECT: aaaaaaaa-1111-0000-0000-000000000000
select public.org_id_for_component('bbbbbbbb-4000-0000-0000-000000000001');
-- EXPECT: bbbbbbbb-1111-0000-0000-000000000000

-- [T15-02] is_org_member returns correct values
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select public.is_org_member('aaaaaaaa-1111-0000-0000-000000000000');
-- EXPECT: true
select public.is_org_member('bbbbbbbb-1111-0000-0000-000000000000');
-- EXPECT: false

-- [T15-03] is_org_admin returns correct values
select public.is_org_admin('aaaaaaaa-1111-0000-0000-000000000000');
-- EXPECT: false (member_a is role=member)
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select public.is_org_admin('aaaaaaaa-1111-0000-0000-000000000000');
-- EXPECT: true

-- [T15-04] Multi-org: add owner_a to Beta (inserted as owner_b who is the admin)
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
insert into public.organization_members (organization_id, user_id, role)
  values ('bbbbbbbb-1111-0000-0000-000000000000',
          'aaaaaaaa-0000-0000-0000-000000000001', 'member');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select count(*) from public.organizations;
-- EXPECT: 2 (Alpha + Beta)

-- [T15-05] Revoked membership: remove owner_a from Beta (deleted as owner_b admin)
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
delete from public.organization_members
  where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select count(*) from public.organizations;
-- EXPECT: 1 (only Alpha)
select count(*) from public.events
  where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000';
-- EXPECT: 0

-- [T15-06] Role downgrade: demote admin_a to member, confirm INSERT blocked
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
update public.organization_members set role = 'member'
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
savepoint t15_06;
insert into public.components (event_id, name, slug, sort_order)
  values ('aaaaaaaa-3000-0000-0000-000000000001', 'Sponsorship', 'sponsorship-99', 3);
-- EXPECT: ERROR 42501
rollback to savepoint t15_06; release savepoint t15_06;

-- Restore admin_a
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
update public.organization_members set role = 'admin'
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- [T15-07] Cross-org reads: owner_b sees nothing in Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
select count(*) from public.events
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0
select count(*) from public.components
  where event_id = 'aaaaaaaa-3000-0000-0000-000000000001';
-- EXPECT: 0
select count(*) from public.tasks
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 0
select count(*) from public.notes
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 0
select count(*) from public.calendar_events
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 0
select count(*) from public.resource_links
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 0
select count(*) from public.component_files
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 0
select count(*) from public.component_folders
  where component_id = 'aaaaaaaa-4000-0000-0000-000000000001';
-- EXPECT: 0

-- Cross-org writes: owner_b blocked from Org Alpha
savepoint t15_07a;
insert into public.tasks (component_id, title, status, priority, created_by)
  values ('aaaaaaaa-4000-0000-0000-000000000001', 'X', 'todo', 'low',
          'bbbbbbbb-0000-0000-0000-000000000001');
-- EXPECT: ERROR 42501
rollback to savepoint t15_07a; release savepoint t15_07a;

savepoint t15_07b;
insert into public.notes (component_id, content, created_by)
  values ('aaaaaaaa-4000-0000-0000-000000000001', 'X',
          'bbbbbbbb-0000-0000-0000-000000000001');
-- EXPECT: ERROR 42501
rollback to savepoint t15_07b; release savepoint t15_07b;


-- =====================================================================
-- [T16] INVITE TOKENS, JOIN REQUESTS, BLOCKED USERS
-- New tables added in the invite/onboarding flow:
--   invite_tokens  — created by admins, consumed once by invitee
--   join_requests  — user-submitted, approved/denied by admins
--   blocked_users  — set by admins, can be unblocked
-- =====================================================================

-- ── Setup for T16 ────────────────────────────────────────────────────
-- Insert a pending join request from Stranger → Org Alpha
insert into public.join_requests (id, user_id, org_id, status) values
  ('dddddddd-5000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000000',
   'pending')
on conflict do nothing;

-- Insert a blocked_users entry: Owner A blocked Stranger from Org Alpha
insert into public.blocked_users (id, user_id, org_id, blocked_by) values
  ('dddddddd-6000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000001')
on conflict do nothing;

-- Insert an invite token for Org Alpha (created by Owner A, for member_a@test.com)
insert into public.invite_tokens
  (id, token, organization_id, invited_by, email, role, expires_at) values
  ('eeeeeeee-7000-0000-0000-000000000001',
   'test-invite-token-alpha-001',
   'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'member_a@test.com',
   'member',
   now() + interval '48 hours')
on conflict do nothing;

-- ── Drop + re-create bypass for join_requests and blocked_users ───────
drop policy if exists "_test_insert_bypass_jr" on public.join_requests;
drop policy if exists "_test_insert_bypass_bu" on public.blocked_users;
drop policy if exists "_test_insert_bypass_it" on public.invite_tokens;
create policy "_test_insert_bypass_jr" on public.join_requests for insert to authenticated with check (true);
create policy "_test_insert_bypass_bu" on public.blocked_users  for insert to authenticated with check (true);
create policy "_test_insert_bypass_it" on public.invite_tokens  for insert to authenticated with check (true);


-- ── [T16-01] invite_tokens: only org admins can read ─────────────────
-- Owner A (admin of Org Alpha) can read the token
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select count(*) from public.invite_tokens
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1

-- Member A (non-admin) cannot read invite tokens
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.invite_tokens
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0

-- Stranger cannot read invite tokens for any org
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
select count(*) from public.invite_tokens;
-- EXPECT: 0

-- Owner B cannot read Org Alpha's tokens
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
select count(*) from public.invite_tokens
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0


-- ── [T16-02] invite_tokens: only org admins can INSERT ───────────────
-- Owner A (admin) can create an invite token for Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into public.invite_tokens
  (token, organization_id, invited_by, email, role, expires_at)
values
  ('admin-created-token-002',
   'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'new_person@test.com',
   'member',
   now() + interval '48 hours');
-- EXPECT: success

-- Member A cannot create invite tokens
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
savepoint t16_02a;
insert into public.invite_tokens
  (token, organization_id, invited_by, email, role, expires_at)
values
  ('member-cannot-invite-001',
   'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'other@test.com',
   'member',
   now() + interval '48 hours');
-- EXPECT: ERROR 42501
rollback to savepoint t16_02a; release savepoint t16_02a;

-- Stranger cannot create invite tokens
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
savepoint t16_02b;
insert into public.invite_tokens
  (token, organization_id, invited_by, email, role, expires_at)
values
  ('stranger-cannot-invite-001',
   'aaaaaaaa-1111-0000-0000-000000000000',
   'cccccccc-0000-0000-0000-000000000001',
   'someone@test.com',
   'member',
   now() + interval '48 hours');
-- EXPECT: ERROR 42501
rollback to savepoint t16_02b; release savepoint t16_02b;


-- ── [T16-03] invite_tokens: org admin can UPDATE (mark used) ─────────
-- Owner A can mark their own token as used
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
update public.invite_tokens
  set used_at = now()
  where token = 'test-invite-token-alpha-001';
-- EXPECT: 1 row updated

-- Member A cannot update invite tokens
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
savepoint t16_03a;
update public.invite_tokens
  set used_at = now()
  where token = 'test-invite-token-alpha-001';
-- EXPECT: 0 rows (RLS hides it) or ERROR 42501
rollback to savepoint t16_03a; release savepoint t16_03a;


-- ── [T16-04] join_requests: user can see own requests ────────────────
-- Stranger can see their own pending request
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
select count(*) from public.join_requests
  where user_id = 'cccccccc-0000-0000-0000-000000000001';
-- EXPECT: 1

-- Member A cannot see Stranger's join request
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.join_requests
  where user_id = 'cccccccc-0000-0000-0000-000000000001';
-- EXPECT: 0 (can't see other users' requests unless admin)

-- Owner A (admin) can see all join requests for Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select count(*) from public.join_requests
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1

-- Owner B cannot see Org Alpha's join requests
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
select count(*) from public.join_requests
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0


-- ── [T16-05] join_requests: any authenticated user can INSERT own request ──
-- Owner B submits a join request to Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
insert into public.join_requests (user_id, org_id, status)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-1111-0000-0000-000000000000',
        'pending');
-- EXPECT: success

-- Member A cannot insert a join request on behalf of Stranger
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
savepoint t16_05a;
insert into public.join_requests (user_id, org_id, status)
values ('cccccccc-0000-0000-0000-000000000001',
        'bbbbbbbb-1111-0000-0000-000000000000',
        'pending');
-- EXPECT: ERROR 42501 (user_id must match auth.uid())
rollback to savepoint t16_05a; release savepoint t16_05a;


-- ── [T16-06] join_requests: user can UPDATE own pending→cancelled ─────
-- Stranger can re-submit (update status) on own request
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
update public.join_requests
  set status = 'pending'
  where user_id = 'cccccccc-0000-0000-0000-000000000001'
    and org_id  = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1 row updated

-- Member A cannot update Stranger's join request
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
savepoint t16_06a;
update public.join_requests
  set status = 'denied'
  where user_id = 'cccccccc-0000-0000-0000-000000000001';
-- EXPECT: 0 rows (not admin, RLS hides the row)
rollback to savepoint t16_06a; release savepoint t16_06a;

-- Owner A (admin) can approve Stranger's request
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
update public.join_requests
  set status = 'approved', resolved_by = 'aaaaaaaa-0000-0000-0000-000000000001', resolved_at = now()
  where user_id = 'cccccccc-0000-0000-0000-000000000001'
    and org_id  = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1 row updated


-- ── [T16-07] blocked_users: org admin can read all blocks for their org ──
-- Owner A sees the block on Stranger
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select count(*) from public.blocked_users
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1

-- Admin A can also see blocks for Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select count(*) from public.blocked_users
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1

-- Member A cannot see blocked_users for Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select count(*) from public.blocked_users
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0


-- ── [T16-08] blocked_users: Stranger can read own block status ────────
-- Stranger can see their own blocked_users entry
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
select count(*) from public.blocked_users
  where user_id = 'cccccccc-0000-0000-0000-000000000001';
-- EXPECT: 1

-- Owner B cannot see Stranger's block status in Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
select count(*) from public.blocked_users
  where user_id = 'cccccccc-0000-0000-0000-000000000001';
-- EXPECT: 0


-- ── [T16-09] blocked_users: only org admins can INSERT/DELETE blocks ──
-- Owner A can block Owner B
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into public.blocked_users (user_id, org_id, blocked_by)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-1111-0000-0000-000000000000',
        'aaaaaaaa-0000-0000-0000-000000000001');
-- EXPECT: success

-- Member A cannot block anyone
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
savepoint t16_09a;
insert into public.blocked_users (user_id, org_id, blocked_by)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-1111-0000-0000-000000000000',
        'aaaaaaaa-0000-0000-0000-000000000003');
-- EXPECT: ERROR 42501
rollback to savepoint t16_09a; release savepoint t16_09a;

-- Owner A can unblock (DELETE) their block on Stranger
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
delete from public.blocked_users
  where user_id = 'cccccccc-0000-0000-0000-000000000001'
    and org_id  = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 1 row deleted

-- Member A cannot delete any block
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
savepoint t16_09b;
delete from public.blocked_users
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0 rows (RLS hides them) or ERROR 42501
rollback to savepoint t16_09b; release savepoint t16_09b;


-- ── [T16-10] Cross-org isolation: Owner B blocked from Org Alpha admin ops ──
-- Owner B cannot insert a block in Org Alpha (not an admin there)
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
savepoint t16_10a;
insert into public.blocked_users (user_id, org_id, blocked_by)
values ('aaaaaaaa-0000-0000-0000-000000000003',
        'aaaaaaaa-1111-0000-0000-000000000000',
        'bbbbbbbb-0000-0000-0000-000000000001');
-- EXPECT: ERROR 42501
rollback to savepoint t16_10a; release savepoint t16_10a;

-- Owner B cannot update join requests in Org Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
savepoint t16_10b;
update public.join_requests
  set status = 'denied'
  where org_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0 rows (RLS hides them)
rollback to savepoint t16_10b; release savepoint t16_10b;

-- Owner B cannot read Org Alpha's invite tokens
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
select count(*) from public.invite_tokens
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000';
-- EXPECT: 0

-- Drop temp bypass policies for new tables
drop policy if exists "_test_insert_bypass_jr" on public.join_requests;
drop policy if exists "_test_insert_bypass_bu" on public.blocked_users;
drop policy if exists "_test_insert_bypass_it" on public.invite_tokens;


-- =====================================================================
-- CLEANUP — roll back all test data; production data is untouched
-- =====================================================================
rollback;
