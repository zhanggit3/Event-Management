-- =============================================================================
-- RLS POLICY TEST SUITE — Event Management Platform
-- Framework: pgTAP (https://pgtap.org/)
-- Run with: supabase test db   (requires local Supabase instance)
--           OR paste into psql against the remote DB as a superuser.
--
-- Total assertions: 163
--
-- Fixture layout
-- ─────────────────────────────────────────────────────────────────────────────
--  Org A  ─ owner_a   (aaaaaaaa-0000-0000-0000-000000000001)  role: owner
--         ─ admin_a   (aaaaaaaa-0000-0000-0000-000000000002)  role: admin
--         ─ member_a  (aaaaaaaa-0000-0000-0000-000000000003)  role: member
--  Org B  ─ owner_b   (bbbbbbbb-0000-0000-0000-000000000001)  role: owner
--
--  Event A is in Org A.  Component A is in Event A.
--  Tasks, notes, calendar_events, etc. are all under Component A.
-- =============================================================================

begin;

select plan(163);

-- =============================================================================
-- 0. EXTENSION + FIXTURES
-- =============================================================================

-- Ensure pgTAP is available; if not, this will error with a clear message.
-- If you see "function plan(integer) does not exist", install pgTAP first:
--   psql -c "create extension pgtap;" (requires superuser)

-- Disable the profile-auto-create trigger so we can insert auth.users
-- without needing the trigger to fire (we insert profiles manually).
alter table auth.users disable trigger on_auth_user_created;

-- ---------------------------------------------------------------------------
-- auth.users
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner_a@test.com',  now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'admin_a@test.com',  now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'member_a@test.com', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner_b@test.com',  now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000001', 'stranger@test.com', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, email)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Owner A',   'owner_a@test.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Admin A',   'admin_a@test.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Member A',  'member_a@test.com'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Owner B',   'owner_b@test.com'),
  ('cccccccc-0000-0000-0000-000000000001', 'Stranger',  'stranger@test.com');

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug)
values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'Org Alpha', 'org-alpha'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Org Beta',  'org-beta');

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
insert into public.organization_members (id, organization_id, user_id, role)
values
  ('aaaaaaaa-2000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-2000-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin'),
  ('aaaaaaaa-2000-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'member'),
  ('bbbbbbbb-2000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner');

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
insert into public.events (id, organization_id, name, slug, status, created_by)
values
  ('aaaaaaaa-3000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000', 'Alpha Gala', 'alpha-gala', 'active', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-3000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000', 'Beta Fest',  'beta-fest',  'draft',  'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- components
-- ---------------------------------------------------------------------------
insert into public.components (id, event_id, name, slug, sort_order)
values
  ('aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001', 'Finance',   'finance',   1),
  ('bbbbbbbb-4000-0000-0000-000000000001', 'bbbbbbbb-3000-0000-0000-000000000001', 'Marketing', 'marketing', 1);

-- ---------------------------------------------------------------------------
-- component_leads
-- ---------------------------------------------------------------------------
insert into public.component_leads (id, component_id, user_id, role)
values
  ('aaaaaaaa-5000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'lead'),
  ('bbbbbbbb-5000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'lead');

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
insert into public.tasks (id, component_id, title, status, priority, created_by)
values
  ('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'Budget review',   'todo', 'high',   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-6000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001', 'Audit invoices',  'todo', 'medium', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-6000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'Design flyer',    'todo', 'low',    'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
insert into public.notes (id, component_id, content, created_by)
values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'Check Q1 numbers', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001', 'Admin note',       'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-7000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'Beta note',        'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- component_members  (freeform — no FK to profiles)
-- ---------------------------------------------------------------------------
insert into public.component_members (id, component_id, name, email, role)
values
  ('aaaaaaaa-8000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'Alice External', 'alice@ext.com', 'volunteer'),
  ('bbbbbbbb-8000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'Bob External',   'bob@ext.com',   'staff');

-- ---------------------------------------------------------------------------
-- component_folders
-- ---------------------------------------------------------------------------
insert into public.component_folders (id, component_id, name, created_by)
values
  ('aaaaaaaa-9000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'Receipts',  'aaaaaaaa-0000-0000-0000-000000000003'),
  ('bbbbbbbb-9000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'Creatives', 'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- component_files
-- ---------------------------------------------------------------------------
insert into public.component_files (id, folder_id, component_id, name, storage_key, uploaded_by)
values
  ('aaaaaaaa-a000-0000-0000-000000000001', 'aaaaaaaa-9000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'receipt.pdf', 'comp-a/folder-a/receipt.pdf', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('bbbbbbbb-a000-0000-0000-000000000001', 'bbbbbbbb-9000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'banner.png',  'comp-b/folder-b/banner.png',  'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------
insert into public.calendar_events (id, component_id, event_id, title, start_time, is_all_day, created_by)
values
  ('aaaaaaaa-b000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001', 'Kickoff meeting', now() + interval '7 days', false, 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-b000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001', 'Admin deadline',  now() + interval '14 days', true, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-b000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'bbbbbbbb-3000-0000-0000-000000000001', 'Beta launch',     now() + interval '30 days', false, 'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- resource_links
-- ---------------------------------------------------------------------------
insert into public.resource_links (id, component_id, title, url, category, added_by)
values
  ('aaaaaaaa-c000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'Budget Sheet', 'https://docs.google.com/a', 'spreadsheet', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-c000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001', 'Design Brief', 'https://docs.google.com/b', 'document',    'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-c000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', 'Beta Guide',   'https://docs.google.com/c', 'document',    'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- component_templates
-- ---------------------------------------------------------------------------
insert into public.component_templates (id, organization_id, name, slug, icon, color)
values
  ('aaaaaaaa-d000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000', 'Finance Template',   'finance-tmpl',   '💰', '#22c55e'),
  ('bbbbbbbb-d000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000', 'Marketing Template', 'marketing-tmpl', '📣', '#3b82f6');

-- Re-enable the trigger now that fixtures are in place
alter table auth.users enable trigger on_auth_user_created;

-- =============================================================================
-- HELPER — switch authenticated session
-- =============================================================================
-- We use set_config to simulate the Supabase JWT claims that RLS reads via
-- auth.uid() / auth.role().  The `authenticated` role must already exist in
-- Postgres (Supabase always creates it).  We restore to the postgres superuser
-- role between sections using reset role + reset local configs.

-- Convenience wrapper: become a specific auth user
create or replace function tests.set_auth_user(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  set local role authenticated;
end;
$$;

-- Convenience wrapper: drop back to superuser
create or replace function tests.clear_auth()
returns void language plpgsql as $$
begin
  set local role postgres;
  perform set_config('request.jwt.claims', '', true);
end;
$$;


-- =============================================================================
-- 1. PROFILES
--    Policies:
--      SELECT: own row (id = auth.uid())
--      SELECT: co-member via shared org (om1.user_id = auth.uid() ∧ om2.user_id = profiles.id)
--      UPDATE: own row (id = auth.uid())
--    NOTE: no INSERT policy — handled by handle_new_user() trigger
--          no DELETE policy — intentional gap (no delete-user flow)
-- =============================================================================

-- ── 1a. Positive: user can see own profile ───────────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'profiles: owner_a can select own profile'
);

-- ── 1b. Positive: co-org member can see each other's profiles ────────────────
-- member_a is in Org A together with admin_a → should see admin_a's profile
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  1,
  'profiles: member_a can see admin_a profile via shared org membership'
);

-- ── 1c. Negative: cannot see profile of user in different org ────────────────
-- owner_b is ONLY in Org B; member_a is ONLY in Org A → no shared org
select is(
  (select count(*)::int from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  'profiles: member_a cannot see owner_b profile (different org)'
);

-- ── 1d. Negative: stranger (not in any org) cannot see anyone else ───────────
select tests.set_auth_user('cccccccc-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'profiles: stranger cannot see owner_a profile'
);

-- ── 1e. Negative: anon role cannot select profiles ───────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.profiles),
  0,
  'profiles: anon cannot select any profiles'
);

set local role postgres;

-- ── 1f. Positive: user can update own profile ────────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ update public.profiles set full_name = 'Member A Updated' where id = 'aaaaaaaa-0000-0000-0000-000000000003' $$,
  'profiles: member_a can update own profile'
);

-- ── 1g. Negative: user cannot update another user's profile ─────────────────
select throws_ok(
  $$ update public.profiles set full_name = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  null,
  'profiles: member_a blocked from updating owner_a profile (RLS filters row, 0 rows updated, no error raised)'
);
-- NOTE: RLS UPDATE blocks silently return 0 rows rather than raising an error.
-- We verify this by checking the row is unchanged.
select tests.clear_auth();
select is(
  (select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Owner A',
  'profiles: owner_a full_name unchanged after cross-user update attempt'
);


-- =============================================================================
-- 2. ORGANIZATIONS
--    Policies:
--      SELECT: is_org_member(id)
--      INSERT: auth.uid() is not null (any authenticated user)
--      UPDATE: is_org_admin(id)
--    NOTE: no DELETE policy (intentional)
-- =============================================================================

-- ── 2a. Positive: org member can see their org ───────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.organizations where id = 'aaaaaaaa-1111-0000-0000-000000000000'),
  1,
  'organizations: member_a can see Org Alpha'
);

-- ── 2b. Negative: cannot see org they are not a member of ────────────────────
select is(
  (select count(*)::int from public.organizations where id = 'bbbbbbbb-1111-0000-0000-000000000000'),
  0,
  'organizations: member_a cannot see Org Beta'
);

-- ── 2c. Positive: any authenticated user can INSERT a new org ────────────────
select lives_ok(
  $$ insert into public.organizations (id, name, slug)
     values ('cccccccc-1111-0000-0000-000000000000', 'Org Gamma', 'org-gamma') $$,
  'organizations: authenticated member_a can create a new org'
);

-- ── 2d. Negative: anon cannot INSERT an org ──────────────────────────────────
select tests.clear_auth();
set local role anon;

select throws_ok(
  $$ insert into public.organizations (name, slug) values ('Bad Org', 'bad-org') $$,
  '42501',
  'organizations: anon cannot insert an org'
);

set local role postgres;

-- ── 2e. Positive: org admin can UPDATE their org ─────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.organizations set name = 'Org Alpha Renamed' where id = 'aaaaaaaa-1111-0000-0000-000000000000' $$,
  'organizations: admin_a can update Org Alpha'
);

-- ── 2f. Negative: plain member cannot UPDATE their org ───────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ update public.organizations set name = 'Org Alpha Hacked' where id = 'aaaaaaaa-1111-0000-0000-000000000000' $$,
  'organizations: member_a update call executes without pg error (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select name from public.organizations where id = 'aaaaaaaa-1111-0000-0000-000000000000'),
  'Org Alpha Renamed',
  'organizations: name unchanged after member_a update attempt (RLS blocked it)'
);

-- ── 2g. Negative: org member from Org B cannot update Org A ─────────────────
select tests.set_auth_user('bbbbbbbb-0000-0000-0000-000000000001');

select lives_ok(
  $$ update public.organizations set name = 'Org Alpha From B' where id = 'aaaaaaaa-1111-0000-0000-000000000000' $$,
  'organizations: owner_b update on Org A executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select name from public.organizations where id = 'aaaaaaaa-1111-0000-0000-000000000000'),
  'Org Alpha Renamed',
  'organizations: Org Alpha name unchanged after owner_b cross-org update attempt'
);


-- =============================================================================
-- 3. ORGANIZATION_MEMBERS
--    Policies:
--      SELECT: is_org_member(organization_id)
--      INSERT: is_org_admin(organization_id)  [policy 1 — admin invites]
--      INSERT: user_id = auth.uid() AND role = 'owner' AND no existing members [policy 2 — bootstrap]
--      UPDATE: is_org_admin(organization_id)
--      DELETE: is_org_admin(organization_id) OR user_id = auth.uid() [self-remove]
-- =============================================================================

-- ── 3a. Positive: org member can view member list ────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.organization_members where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'),
  3,
  'organization_members: member_a sees all 3 Org Alpha members'
);

-- ── 3b. Negative: cannot see members of other org ────────────────────────────
select is(
  (select count(*)::int from public.organization_members where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000'),
  0,
  'organization_members: member_a cannot see Org Beta members'
);

-- ── 3c. Negative: anon cannot see members ────────────────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.organization_members),
  0,
  'organization_members: anon sees zero rows'
);

set local role postgres;

-- ── 3d. Positive: org admin can INSERT a new member ─────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.organization_members (organization_id, user_id, role)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000001', 'member') $$,
  'organization_members: admin_a can add stranger to Org Alpha'
);

-- ── 3e. Negative: plain member cannot INSERT a new member ────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.organization_members (organization_id, user_id, role)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'member') $$,
  '42501',
  'organization_members: member_a cannot add another user to Org Alpha'
);

-- ── 3f. Positive: org admin can UPDATE a member's role ───────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.organization_members set role = 'admin'
     where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
       and user_id = 'aaaaaaaa-0000-0000-0000-000000000003' $$,
  'organization_members: admin_a can promote member_a to admin'
);

-- revert so later tests work correctly
select tests.clear_auth();
update public.organization_members
  set role = 'member'
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- ── 3g. Negative: plain member cannot UPDATE another member's role ────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ update public.organization_members set role = 'admin'
     where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
       and user_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'organization_members: member_a update on admin_a executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select role from public.organization_members
   where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
     and user_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'admin',
  'organization_members: admin_a role unchanged after member_a update attempt'
);

-- ── 3h. Positive: member can DELETE (remove) themselves ──────────────────────
-- First: add stranger so we can remove them as stranger
select tests.set_auth_user('cccccccc-0000-0000-0000-000000000001');

select lives_ok(
  $$ delete from public.organization_members
     where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
       and user_id = 'cccccccc-0000-0000-0000-000000000001' $$,
  'organization_members: stranger can remove themselves from Org Alpha (self-remove)'
);

-- ── 3i. Negative: member cannot DELETE another member ────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.organization_members
     where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
       and user_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'organization_members: member_a delete of admin_a executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.organization_members
   where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
     and user_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  1,
  'organization_members: admin_a still present after member_a delete attempt'
);

-- ── 3j. Bootstrap INSERT: owner can self-insert into empty org ───────────────
-- Create a fresh org with no members yet, then let owner_b self-insert as owner
select tests.clear_auth();
insert into public.organizations (id, name, slug)
  values ('dddddddd-1111-0000-0000-000000000000', 'Org Delta', 'org-delta');

select tests.set_auth_user('bbbbbbbb-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into public.organization_members (organization_id, user_id, role)
     values ('dddddddd-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner') $$,
  'organization_members: owner can self-insert as owner into brand-new org (bootstrap policy)'
);


-- =============================================================================
-- 4. EVENTS
--    Policies:
--      SELECT: is_org_member(organization_id)
--      INSERT: is_org_admin(organization_id)
--      UPDATE: is_org_admin(organization_id)
--      DELETE: is_org_admin(organization_id)
-- =============================================================================

-- ── 4a. Positive: org member can SELECT events ───────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.events where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'),
  1,
  'events: member_a sees Org Alpha events'
);

-- ── 4b. Negative: cannot see events from another org ────────────────────────
select is(
  (select count(*)::int from public.events where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000'),
  0,
  'events: member_a cannot see Org Beta events'
);

-- ── 4c. Negative: anon cannot see events ─────────────────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.events),
  0,
  'events: anon sees zero events'
);

set local role postgres;

-- ── 4d. Negative: plain member cannot INSERT an event ────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.events (organization_id, name, slug, status, created_by)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'Member Event', 'member-event', 'draft', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  '42501',
  'events: plain member cannot create an event'
);

-- ── 4e. Positive: org admin can INSERT an event ──────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.events (id, organization_id, name, slug, status, created_by)
     values ('aaaaaaaa-3000-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000000', 'Admin Event', 'admin-event', 'draft', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'events: admin_a can create an event'
);

-- ── 4f. Positive: org admin can UPDATE an event ──────────────────────────────
select lives_ok(
  $$ update public.events set name = 'Alpha Gala Updated' where id = 'aaaaaaaa-3000-0000-0000-000000000001' $$,
  'events: admin_a can update an event'
);

-- ── 4g. Negative: plain member cannot UPDATE an event ────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ update public.events set name = 'Hacked Event' where id = 'aaaaaaaa-3000-0000-0000-000000000001' $$,
  'events: member_a update executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select name from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000001'),
  'Alpha Gala Updated',
  'events: event name unchanged after member_a update attempt'
);

-- ── 4h. Positive: org admin can DELETE an event ──────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000002' $$,
  'events: admin_a can delete an event they created'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000002'),
  0,
  'events: admin-created event was actually deleted'
);

-- ── 4i. Negative: plain member cannot DELETE an event ────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000001' $$,
  'events: member_a delete executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.events where id = 'aaaaaaaa-3000-0000-0000-000000000001'),
  1,
  'events: Alpha Gala still exists after member_a delete attempt'
);


-- =============================================================================
-- 5. COMPONENTS
--    Policies:
--      SELECT: is_org_member via event join
--      INSERT: is_org_admin via event join
--      UPDATE: is_org_admin via event join
--      DELETE: is_org_admin via event join
-- =============================================================================

-- ── 5a. Positive: org member can SELECT components ───────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.components where event_id = 'aaaaaaaa-3000-0000-0000-000000000001'),
  1,
  'components: member_a sees Finance component in Alpha Gala'
);

-- ── 5b. Negative: cannot see components from another org's event ─────────────
select is(
  (select count(*)::int from public.components where event_id = 'bbbbbbbb-3000-0000-0000-000000000001'),
  0,
  'components: member_a cannot see Org Beta components'
);

-- ── 5c. Negative: anon cannot SELECT components ──────────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.components),
  0,
  'components: anon sees zero components'
);

set local role postgres;

-- ── 5d. Negative: plain member cannot INSERT a component ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.components (event_id, name, slug, sort_order)
     values ('aaaaaaaa-3000-0000-0000-000000000001', 'Volunteer', 'volunteer', 2) $$,
  '42501',
  'components: plain member cannot insert a component'
);

-- ── 5e. Positive: org admin can INSERT a component ───────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.components (id, event_id, name, slug, sort_order)
     values ('aaaaaaaa-4000-0000-0000-000000000002', 'aaaaaaaa-3000-0000-0000-000000000001', 'Logistics', 'logistics', 2) $$,
  'components: admin_a can insert a component'
);

-- ── 5f. Positive: org admin can UPDATE a component ───────────────────────────
select lives_ok(
  $$ update public.components set name = 'Finance Updated' where id = 'aaaaaaaa-4000-0000-0000-000000000001' $$,
  'components: admin_a can update Finance component'
);
select tests.clear_auth();
update public.components set name = 'Finance' where id = 'aaaaaaaa-4000-0000-0000-000000000001';

-- ── 5g. Negative: plain member cannot UPDATE a component ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ update public.components set name = 'Hacked Component' where id = 'aaaaaaaa-4000-0000-0000-000000000001' $$,
  'components: member_a update executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select name from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  'Finance',
  'components: Finance name unchanged after member_a update attempt'
);

-- ── 5h. Positive: org admin can DELETE a component ───────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000002' $$,
  'components: admin_a can delete Logistics component'
);

-- ── 5i. Negative: plain member cannot DELETE a component ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000001' $$,
  'components: member_a delete executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.components where id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  1,
  'components: Finance component still exists after member_a delete attempt'
);


-- =============================================================================
-- 6. COMPONENT_LEADS
--    Policies:
--      SELECT: is_org_member via component→event join
--      ALL (INSERT/UPDATE/DELETE): is_org_admin via component→event join
-- =============================================================================

-- ── 6a. Positive: org member can SELECT component leads ──────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.component_leads where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  1,
  'component_leads: member_a sees leads for Finance component'
);

-- ── 6b. Negative: cannot see leads from another org ──────────────────────────
select is(
  (select count(*)::int from public.component_leads where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'component_leads: member_a cannot see Org Beta component leads'
);

-- ── 6c. Negative: anon cannot SELECT component leads ─────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.component_leads),
  0,
  'component_leads: anon sees zero component leads'
);

set local role postgres;

-- ── 6d. Negative: plain member cannot INSERT a component lead ────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.component_leads (component_id, user_id, role)
     values ('aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'co-lead') $$,
  '42501',
  'component_leads: plain member cannot insert a component lead'
);

-- ── 6e. Positive: org admin can INSERT a component lead ──────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.component_leads (id, component_id, user_id, role)
     values ('aaaaaaaa-5000-0000-0000-000000000002', 'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'co-lead') $$,
  'component_leads: admin_a can add themselves as co-lead'
);

-- ── 6f. Positive: org admin can DELETE a component lead ──────────────────────
select lives_ok(
  $$ delete from public.component_leads where id = 'aaaaaaaa-5000-0000-0000-000000000002' $$,
  'component_leads: admin_a can remove a component lead'
);

-- ── 6g. Negative: plain member cannot DELETE a component lead ────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.component_leads where id = 'aaaaaaaa-5000-0000-0000-000000000001' $$,
  'component_leads: member_a delete executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.component_leads where id = 'aaaaaaaa-5000-0000-0000-000000000001'),
  1,
  'component_leads: member_a lead row still exists after plain-member delete attempt'
);


-- =============================================================================
-- 7. TASKS
--    Policies:
--      SELECT: is_org_member via component→event join
--      INSERT: is_org_member via component→event join
--      UPDATE: created_by = uid OR assigned_to = uid OR is_org_admin
--      DELETE: created_by = uid OR is_org_admin
-- =============================================================================

-- ── 7a. Positive: org member can SELECT tasks ────────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.tasks where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  2,
  'tasks: member_a sees all Finance tasks'
);

-- ── 7b. Negative: cannot see tasks from another org ──────────────────────────
select is(
  (select count(*)::int from public.tasks where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'tasks: member_a cannot see Org Beta tasks'
);

-- ── 7c. Negative: anon cannot SELECT tasks ───────────────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.tasks),
  0,
  'tasks: anon sees zero tasks'
);

set local role postgres;

-- ── 7d. Positive: org member can INSERT a task ───────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.tasks (id, component_id, title, status, priority, created_by)
     values ('aaaaaaaa-6000-0000-0000-000000000010', 'aaaaaaaa-4000-0000-0000-000000000001', 'Test task', 'todo', 'low', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'tasks: member_a can create a task'
);

-- ── 7e. Positive: task creator can UPDATE their own task ─────────────────────
select lives_ok(
  $$ update public.tasks set title = 'Test task updated' where id = 'aaaaaaaa-6000-0000-0000-000000000010' $$,
  'tasks: member_a (creator) can update their own task'
);

-- ── 7f. Negative: non-creator non-admin cannot UPDATE another member's task ──
-- member_a (aaaaa-0003) tries to update admin_a (aaaaa-0002)'s task
select lives_ok(
  $$ update public.tasks set title = 'Hacked Title' where id = 'aaaaaaaa-6000-0000-0000-000000000002' $$,
  'tasks: member_a update on admin_a task executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select title from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002'),
  'Audit invoices',
  'tasks: admin_a task title unchanged after member_a cross-user update attempt'
);

-- ── 7g. Positive: org admin can UPDATE any task ──────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.tasks set priority = 'urgent' where id = 'aaaaaaaa-6000-0000-0000-000000000001' $$,
  'tasks: admin_a can update member_a task'
);

-- ── 7h. Positive: task creator can DELETE their own task ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000010' $$,
  'tasks: member_a (creator) can delete their own task'
);

-- ── 7i. Negative: non-creator non-admin cannot DELETE a task ─────────────────
-- member_a tries to delete admin_a's task
select lives_ok(
  $$ delete from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002' $$,
  'tasks: member_a delete of admin_a task executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002'),
  1,
  'tasks: admin_a task still present after member_a delete attempt'
);

-- ── 7j. Positive: org admin can DELETE any task ──────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.tasks where id = 'aaaaaaaa-6000-0000-0000-000000000002' $$,
  'tasks: admin_a can delete their own task'
);


-- =============================================================================
-- 8. NOTES
--    Policies:
--      SELECT: is_org_member via component→event join
--      INSERT: is_org_member via component→event join
--      UPDATE: created_by = uid OR is_org_admin
--      DELETE: created_by = uid OR is_org_admin
-- =============================================================================

-- ── 8a. Positive: org member can SELECT notes ────────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.notes where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  2,
  'notes: member_a sees both Finance notes'
);

-- ── 8b. Negative: cannot see notes from another org ──────────────────────────
select is(
  (select count(*)::int from public.notes where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'notes: member_a cannot see Org Beta notes'
);

-- ── 8c. Negative: anon cannot SELECT notes ───────────────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.notes),
  0,
  'notes: anon sees zero notes'
);

set local role postgres;

-- ── 8d. Positive: org member can INSERT a note ───────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.notes (id, component_id, content, created_by)
     values ('aaaaaaaa-7000-0000-0000-000000000010', 'aaaaaaaa-4000-0000-0000-000000000001', 'Test note', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'notes: member_a can create a note'
);

-- ── 8e. Positive: note author can UPDATE their own note ──────────────────────
select lives_ok(
  $$ update public.notes set content = 'Test note updated' where id = 'aaaaaaaa-7000-0000-0000-000000000010' $$,
  'notes: member_a (author) can update their own note'
);

-- ── 8f. Negative: non-author non-admin cannot UPDATE another's note ──────────
select lives_ok(
  $$ update public.notes set content = 'Hacked content' where id = 'aaaaaaaa-7000-0000-0000-000000000002' $$,
  'notes: member_a update on admin_a note executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select content from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002'),
  'Admin note',
  'notes: admin_a note content unchanged after member_a cross-user update attempt'
);

-- ── 8g. Positive: org admin can UPDATE any note ──────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.notes set content = 'Admin edited this' where id = 'aaaaaaaa-7000-0000-0000-000000000001' $$,
  'notes: admin_a can update member_a note'
);

-- ── 8h. Positive: note author can DELETE their own note ──────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000010' $$,
  'notes: member_a (author) can delete their own note'
);

-- ── 8i. Negative: non-author non-admin cannot DELETE a note ──────────────────
select lives_ok(
  $$ delete from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002' $$,
  'notes: member_a delete of admin_a note executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002'),
  1,
  'notes: admin_a note still present after member_a delete attempt'
);

-- ── 8j. Positive: org admin can DELETE any note ──────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.notes where id = 'aaaaaaaa-7000-0000-0000-000000000002' $$,
  'notes: admin_a can delete their own note'
);


-- =============================================================================
-- 9. COMPONENT_MEMBERS (freeform, no FK to auth.users)
--    Policies:
--      SELECT: is_org_member_for_component(component_id)
--      INSERT: is_org_member_for_component(component_id)
--      UPDATE: is_org_member_for_component(component_id)
--      DELETE: is_org_admin_for_component(component_id)
-- =============================================================================

-- ── 9a. Positive: org member can SELECT component_members ────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.component_members where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  1,
  'component_members: member_a sees Alice External in Finance'
);

-- ── 9b. Negative: cannot see component_members from another org ───────────────
select is(
  (select count(*)::int from public.component_members where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'component_members: member_a cannot see Org Beta component_members'
);

-- ── 9c. Negative: anon cannot SELECT component_members ───────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.component_members),
  0,
  'component_members: anon sees zero rows'
);

set local role postgres;

-- ── 9d. Positive: org member can INSERT a component_member ───────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.component_members (id, component_id, name, email, role)
     values ('aaaaaaaa-8000-0000-0000-000000000010', 'aaaaaaaa-4000-0000-0000-000000000001', 'Charlie Temp', 'charlie@ext.com', 'helper') $$,
  'component_members: member_a can add a freeform team member'
);

-- ── 9e. Positive: org member can UPDATE a component_member ───────────────────
select lives_ok(
  $$ update public.component_members set role = 'lead' where id = 'aaaaaaaa-8000-0000-0000-000000000010' $$,
  'component_members: member_a can update a freeform team member'
);

-- ── 9f. Negative: org member cannot DELETE a component_member (admin-only) ───
select lives_ok(
  $$ delete from public.component_members where id = 'aaaaaaaa-8000-0000-0000-000000000001' $$,
  'component_members: member_a delete executes (RLS silently blocks — admin-only)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.component_members where id = 'aaaaaaaa-8000-0000-0000-000000000001'),
  1,
  'component_members: Alice External row still present after member_a delete attempt'
);

-- ── 9g. Positive: org admin can DELETE a component_member ────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.component_members where id = 'aaaaaaaa-8000-0000-0000-000000000010' $$,
  'component_members: admin_a can delete Charlie Temp'
);


-- =============================================================================
-- 10. COMPONENT_FOLDERS
--     Policies:
--       SELECT: is_org_member_for_component(component_id)
--       INSERT: is_org_member_for_component(component_id)
--       UPDATE: is_org_member_for_component(component_id)
--       DELETE: is_org_admin_for_component(component_id)
-- =============================================================================

-- ── 10a. Positive: org member can SELECT component_folders ───────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.component_folders where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  1,
  'component_folders: member_a sees Receipts folder'
);

-- ── 10b. Negative: cannot see folders from another org ───────────────────────
select is(
  (select count(*)::int from public.component_folders where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'component_folders: member_a cannot see Org Beta folders'
);

-- ── 10c. Negative: anon cannot SELECT component_folders ──────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.component_folders),
  0,
  'component_folders: anon sees zero rows'
);

set local role postgres;

-- ── 10d. Positive: org member can INSERT a folder ────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.component_folders (id, component_id, name, created_by)
     values ('aaaaaaaa-9000-0000-0000-000000000010', 'aaaaaaaa-4000-0000-0000-000000000001', 'Invoices', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'component_folders: member_a can create a folder'
);

-- ── 10e. Positive: org member can UPDATE a folder ────────────────────────────
select lives_ok(
  $$ update public.component_folders set name = 'Old Invoices' where id = 'aaaaaaaa-9000-0000-0000-000000000010' $$,
  'component_folders: member_a can rename a folder'
);

-- ── 10f. Negative: org member cannot DELETE a folder ─────────────────────────
select lives_ok(
  $$ delete from public.component_folders where id = 'aaaaaaaa-9000-0000-0000-000000000001' $$,
  'component_folders: member_a delete executes (RLS silently blocks — admin-only)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.component_folders where id = 'aaaaaaaa-9000-0000-0000-000000000001'),
  1,
  'component_folders: Receipts folder still present after member_a delete attempt'
);

-- ── 10g. Positive: org admin can DELETE a folder ─────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.component_folders where id = 'aaaaaaaa-9000-0000-0000-000000000010' $$,
  'component_folders: admin_a can delete Invoices folder'
);


-- =============================================================================
-- 11. COMPONENT_FILES
--     Policies:
--       SELECT: is_org_member_for_component(component_id)
--       INSERT: is_org_member_for_component(component_id)
--       UPDATE: is_org_member_for_component(component_id)
--       DELETE: is_org_admin_for_component(component_id)
-- =============================================================================

-- ── 11a. Positive: org member can SELECT component_files ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.component_files where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  1,
  'component_files: member_a sees receipt.pdf'
);

-- ── 11b. Negative: cannot see files from another org ─────────────────────────
select is(
  (select count(*)::int from public.component_files where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'component_files: member_a cannot see Org Beta files'
);

-- ── 11c. Negative: anon cannot SELECT component_files ────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.component_files),
  0,
  'component_files: anon sees zero rows'
);

set local role postgres;

-- ── 11d. Positive: org member can INSERT (upload) a file ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.component_files (id, folder_id, component_id, name, storage_key, uploaded_by)
     values ('aaaaaaaa-a000-0000-0000-000000000010', 'aaaaaaaa-9000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', 'contract.pdf', 'comp-a/folder-a/contract.pdf', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'component_files: member_a can upload a file'
);

-- ── 11e. Positive: org member can UPDATE file metadata ───────────────────────
select lives_ok(
  $$ update public.component_files set name = 'contract_v2.pdf' where id = 'aaaaaaaa-a000-0000-0000-000000000010' $$,
  'component_files: member_a can update file name'
);

-- ── 11f. Negative: org member cannot DELETE a file (admin-only) ──────────────
select lives_ok(
  $$ delete from public.component_files where id = 'aaaaaaaa-a000-0000-0000-000000000001' $$,
  'component_files: member_a delete executes (RLS silently blocks — admin-only)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.component_files where id = 'aaaaaaaa-a000-0000-0000-000000000001'),
  1,
  'component_files: receipt.pdf still present after member_a delete attempt'
);

-- ── 11g. Positive: org admin can DELETE a file ───────────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.component_files where id = 'aaaaaaaa-a000-0000-0000-000000000010' $$,
  'component_files: admin_a can delete contract.pdf'
);


-- =============================================================================
-- 12. CALENDAR_EVENTS
--     Policies:
--       SELECT: is_org_member_for_component(component_id)
--       INSERT: is_org_member_for_component(component_id)
--       UPDATE: created_by = uid OR is_org_admin_for_component(component_id)
--       DELETE: created_by = uid OR is_org_admin_for_component(component_id)
-- =============================================================================

-- ── 12a. Positive: org member can SELECT calendar events ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.calendar_events where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  2,
  'calendar_events: member_a sees both Finance calendar events'
);

-- ── 12b. Negative: cannot see calendar events from another org ───────────────
select is(
  (select count(*)::int from public.calendar_events where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'calendar_events: member_a cannot see Org Beta calendar events'
);

-- ── 12c. Negative: anon cannot SELECT calendar events ────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.calendar_events),
  0,
  'calendar_events: anon sees zero rows'
);

set local role postgres;

-- ── 12d. Positive: org member can INSERT a calendar event ────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.calendar_events (id, component_id, event_id, title, start_time, is_all_day, created_by)
     values ('aaaaaaaa-b000-0000-0000-000000000010', 'aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001', 'Planning session', now() + interval '2 days', false, 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'calendar_events: member_a can create a calendar event'
);

-- ── 12e. Positive: calendar event creator can UPDATE their own event ──────────
select lives_ok(
  $$ update public.calendar_events set title = 'Planning session updated' where id = 'aaaaaaaa-b000-0000-0000-000000000010' $$,
  'calendar_events: member_a (creator) can update their own calendar event'
);

-- ── 12f. Negative: non-creator non-admin cannot UPDATE another's calendar event
select lives_ok(
  $$ update public.calendar_events set title = 'Hacked Event' where id = 'aaaaaaaa-b000-0000-0000-000000000002' $$,
  'calendar_events: member_a update on admin_a event executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select title from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000002'),
  'Admin deadline',
  'calendar_events: admin_a event title unchanged after member_a cross-user update'
);

-- ── 12g. Positive: org admin can UPDATE any calendar event ───────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.calendar_events set title = 'Kickoff meeting revised' where id = 'aaaaaaaa-b000-0000-0000-000000000001' $$,
  'calendar_events: admin_a can update member_a calendar event'
);

-- ── 12h. Positive: creator can DELETE their own calendar event ───────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000010' $$,
  'calendar_events: member_a (creator) can delete their own calendar event'
);

-- ── 12i. Negative: non-creator non-admin cannot DELETE another's event ────────
select lives_ok(
  $$ delete from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000002' $$,
  'calendar_events: member_a delete of admin_a event executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000002'),
  1,
  'calendar_events: admin_a event still present after member_a delete attempt'
);

-- ── 12j. Positive: org admin can DELETE any calendar event ───────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.calendar_events where id = 'aaaaaaaa-b000-0000-0000-000000000002' $$,
  'calendar_events: admin_a can delete their own calendar event'
);


-- =============================================================================
-- 13. RESOURCE_LINKS
--     Policies:
--       SELECT: is_org_member_for_component(component_id)
--       INSERT: is_org_member_for_component(component_id)
--       UPDATE: added_by = uid OR is_org_admin_for_component(component_id)
--       DELETE: added_by = uid OR is_org_admin_for_component(component_id)
-- =============================================================================

-- ── 13a. Positive: org member can SELECT resource_links ──────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.resource_links where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  2,
  'resource_links: member_a sees both Finance resource links'
);

-- ── 13b. Negative: cannot see resource_links from another org ────────────────
select is(
  (select count(*)::int from public.resource_links where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'resource_links: member_a cannot see Org Beta resource links'
);

-- ── 13c. Negative: anon cannot SELECT resource_links ─────────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.resource_links),
  0,
  'resource_links: anon sees zero rows'
);

set local role postgres;

-- ── 13d. Positive: org member can INSERT a resource link ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into public.resource_links (id, component_id, title, url, category, added_by)
     values ('aaaaaaaa-c000-0000-0000-000000000010', 'aaaaaaaa-4000-0000-0000-000000000001', 'Vendor Contact', 'https://example.com', 'other', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'resource_links: member_a can add a resource link'
);

-- ── 13e. Positive: adder can UPDATE their own resource link ──────────────────
select lives_ok(
  $$ update public.resource_links set title = 'Vendor Contact 2' where id = 'aaaaaaaa-c000-0000-0000-000000000010' $$,
  'resource_links: member_a (adder) can update their own resource link'
);

-- ── 13f. Negative: non-adder non-admin cannot UPDATE another's resource link ──
select lives_ok(
  $$ update public.resource_links set title = 'Hacked Link' where id = 'aaaaaaaa-c000-0000-0000-000000000002' $$,
  'resource_links: member_a update on admin_a link executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select title from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000002'),
  'Design Brief',
  'resource_links: admin_a resource link title unchanged after member_a cross-user update'
);

-- ── 13g. Positive: org admin can UPDATE any resource link ────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ update public.resource_links set title = 'Budget Sheet v2' where id = 'aaaaaaaa-c000-0000-0000-000000000001' $$,
  'resource_links: admin_a can update member_a resource link'
);

-- ── 13h. Positive: adder can DELETE their own resource link ──────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000010' $$,
  'resource_links: member_a (adder) can delete their own resource link'
);

-- ── 13i. Negative: non-adder non-admin cannot DELETE another's resource link ──
select lives_ok(
  $$ delete from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000002' $$,
  'resource_links: member_a delete of admin_a resource link executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000002'),
  1,
  'resource_links: admin_a resource link still present after member_a delete attempt'
);

-- ── 13j. Positive: org admin can DELETE any resource link ────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.resource_links where id = 'aaaaaaaa-c000-0000-0000-000000000002' $$,
  'resource_links: admin_a can delete their own resource link'
);


-- =============================================================================
-- 14. COMPONENT_TEMPLATES
--     Policies:
--       SELECT: is_org_member(organization_id)
--       INSERT: is_org_admin(organization_id)
--       UPDATE: is_org_admin(organization_id)
--       DELETE: is_org_admin(organization_id)
-- =============================================================================

-- ── 14a. Positive: org member can SELECT their org's templates ───────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.component_templates where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'),
  1,
  'component_templates: member_a sees Org Alpha template'
);

-- ── 14b. Negative: cannot see templates from another org ─────────────────────
select is(
  (select count(*)::int from public.component_templates where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000'),
  0,
  'component_templates: member_a cannot see Org Beta templates'
);

-- ── 14c. Negative: anon cannot SELECT component_templates ────────────────────
select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from public.component_templates),
  0,
  'component_templates: anon sees zero templates'
);

set local role postgres;

-- ── 14d. Negative: plain member cannot INSERT a template ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select throws_ok(
  $$ insert into public.component_templates (organization_id, name, slug)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'Member Template', 'member-tmpl') $$,
  '42501',
  'component_templates: plain member cannot create a template'
);

-- ── 14e. Positive: org admin can INSERT a template ───────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into public.component_templates (id, organization_id, name, slug)
     values ('aaaaaaaa-d000-0000-0000-000000000010', 'aaaaaaaa-1111-0000-0000-000000000000', 'Volunteer Tmpl', 'volunteer-tmpl') $$,
  'component_templates: admin_a can create a template'
);

-- ── 14f. Positive: org admin can UPDATE a template ───────────────────────────
select lives_ok(
  $$ update public.component_templates set name = 'Finance Tmpl v2' where id = 'aaaaaaaa-d000-0000-0000-000000000001' $$,
  'component_templates: admin_a can update Finance Template'
);

-- ── 14g. Negative: plain member cannot UPDATE a template ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ update public.component_templates set name = 'Hacked Template' where id = 'aaaaaaaa-d000-0000-0000-000000000001' $$,
  'component_templates: member_a update executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select name from public.component_templates where id = 'aaaaaaaa-d000-0000-0000-000000000001'),
  'Finance Tmpl v2',
  'component_templates: template name unchanged after member_a update attempt'
);

-- ── 14h. Positive: org admin can DELETE a template ───────────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$ delete from public.component_templates where id = 'aaaaaaaa-d000-0000-0000-000000000010' $$,
  'component_templates: admin_a can delete Volunteer Tmpl'
);

-- ── 14i. Negative: plain member cannot DELETE a template ─────────────────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$ delete from public.component_templates where id = 'aaaaaaaa-d000-0000-0000-000000000001' $$,
  'component_templates: member_a delete executes (RLS silently blocks)'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.component_templates where id = 'aaaaaaaa-d000-0000-0000-000000000001'),
  1,
  'component_templates: Finance template still present after member_a delete attempt'
);


-- =============================================================================
-- 15. BOUNDARY / CROSS-CUTTING TESTS
-- =============================================================================

-- ── 15a. Multi-org: user who is owner in Org A and member in Org B sees both ──
-- Add owner_a to Org Beta as a member
select tests.clear_auth();
insert into public.organization_members (organization_id, user_id, role)
  values ('bbbbbbbb-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'member');

select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000001');

-- owner_a is a member of Alpha (owner) and Beta (just added above).
-- They are NOT a member of Org Gamma (created by member_a in test 2c) or Org Delta (bootstrap test).
select is(
  (select count(*)::int from public.organizations),
  2,
  'organizations (boundary): owner_a in both Alpha and Beta sees exactly 2 orgs'
);

-- ── 15b. Revoked member loses access immediately ─────────────────────────────
-- Remove owner_a from Org Beta, then confirm they can no longer see Beta's events
select tests.clear_auth();
delete from public.organization_members
  where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.events where organization_id = 'bbbbbbbb-1111-0000-0000-000000000000'),
  0,
  'events (boundary): owner_a loses access to Org Beta events after membership revoked'
);

select is(
  (select count(*)::int from public.organizations),
  -- Gamma and Delta: owner_a is NOT a member of either, so only Alpha remains
  1,
  'organizations (boundary): owner_a only sees Org Alpha after Beta membership revoked'
);

-- ── 15c. Role downgrade: admin demoted to member loses admin privileges ───────
-- Demote admin_a to 'member' and confirm they can no longer INSERT components
select tests.clear_auth();
update public.organization_members
  set role = 'member'
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select throws_ok(
  $$ insert into public.components (event_id, name, slug, sort_order)
     values ('aaaaaaaa-3000-0000-0000-000000000001', 'Sponsorship', 'sponsorship', 3) $$,
  '42501',
  'components (boundary): demoted admin_a cannot insert component after role downgraded to member'
);

-- Restore admin_a's role
select tests.clear_auth();
update public.organization_members
  set role = 'admin'
  where organization_id = 'aaaaaaaa-1111-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ── 15d. Org B member cannot INSERT into Org A's scope ───────────────────────
select tests.set_auth_user('bbbbbbbb-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.events (organization_id, name, slug, status, created_by)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'Infiltrated Event', 'infiltrated', 'draft', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501',
  'events (boundary): Org B owner cannot insert event into Org A'
);

-- ── 15e. org_id_for_component() helper returns correct org ───────────────────
-- Test the helper directly as superuser to verify the chain is correct.
select tests.clear_auth();

select is(
  public.org_id_for_component('aaaaaaaa-4000-0000-0000-000000000001'),
  'aaaaaaaa-1111-0000-0000-000000000000'::uuid,
  'helper: org_id_for_component correctly walks component→event→org for Finance'
);

select is(
  public.org_id_for_component('bbbbbbbb-4000-0000-0000-000000000001'),
  'bbbbbbbb-1111-0000-0000-000000000000'::uuid,
  'helper: org_id_for_component correctly walks component→event→org for Marketing'
);

-- ── 15f. is_org_member() returns false for non-member, true for member ────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  public.is_org_member('aaaaaaaa-1111-0000-0000-000000000000'),
  true,
  'helper: is_org_member returns true for member_a in Org Alpha'
);

select is(
  public.is_org_member('bbbbbbbb-1111-0000-0000-000000000000'),
  false,
  'helper: is_org_member returns false for member_a querying Org Beta'
);

-- ── 15g. is_org_admin() returns false for plain member, true for admin ────────
select is(
  public.is_org_admin('aaaaaaaa-1111-0000-0000-000000000000'),
  false,
  'helper: is_org_admin returns false for member_a (role=member) in Org Alpha'
);

select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000002');

select is(
  public.is_org_admin('aaaaaaaa-1111-0000-0000-000000000000'),
  true,
  'helper: is_org_admin returns true for admin_a (role=admin) in Org Alpha'
);

-- ── 15h. Org B member cannot access Org A component_members ──────────────────
select tests.set_auth_user('bbbbbbbb-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.component_members where component_id = 'aaaaaaaa-4000-0000-0000-000000000001'),
  0,
  'component_members (boundary): Org B owner cannot see Org A component_members'
);

-- ── 15i. Cross-org task INSERT is blocked ────────────────────────────────────
select throws_ok(
  $$ insert into public.tasks (component_id, title, status, priority, created_by)
     values ('aaaaaaaa-4000-0000-0000-000000000001', 'Cross-org task', 'todo', 'low', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501',
  'tasks (boundary): Org B owner cannot insert task into Org A component'
);

-- ── 15j. Cross-org note INSERT is blocked ────────────────────────────────────
select throws_ok(
  $$ insert into public.notes (component_id, content, created_by)
     values ('aaaaaaaa-4000-0000-0000-000000000001', 'Infiltrated note', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501',
  'notes (boundary): Org B owner cannot insert note into Org A component'
);

-- ── 15k. is_org_member_for_component() correctly identifies non-member ────────
select tests.clear_auth();
select tests.set_auth_user('bbbbbbbb-0000-0000-0000-000000000001');

select is(
  public.is_org_member_for_component('aaaaaaaa-4000-0000-0000-000000000001'),
  false,
  'helper: is_org_member_for_component returns false for Org B owner on Org A component'
);

select is(
  public.is_org_member_for_component('bbbbbbbb-4000-0000-0000-000000000001'),
  true,
  'helper: is_org_member_for_component returns true for Org B owner on Org B component'
);

-- ── 15l. Empty result (not error) when querying outside own org scope ─────────
select tests.set_auth_user('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.calendar_events where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'calendar_events (boundary): cross-org query returns empty set, not an error'
);

select is(
  (select count(*)::int from public.resource_links where component_id = 'bbbbbbbb-4000-0000-0000-000000000001'),
  0,
  'resource_links (boundary): cross-org query returns empty set, not an error'
);

-- ── 15m. Notes INSERT: anon is blocked ───────────────────────────────────────
select tests.clear_auth();
set local role anon;

select throws_ok(
  $$ insert into public.notes (component_id, content, created_by)
     values ('aaaaaaaa-4000-0000-0000-000000000001', 'Anon note', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501',
  'notes (anon): anon cannot insert a note'
);

set local role postgres;

-- ── 15n. Tasks INSERT: anon is blocked ───────────────────────────────────────
set local role anon;

select throws_ok(
  $$ insert into public.tasks (component_id, title, status, priority, created_by)
     values ('aaaaaaaa-4000-0000-0000-000000000001', 'Anon task', 'todo', 'low', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501',
  'tasks (anon): anon cannot insert a task'
);

set local role postgres;


-- =============================================================================
-- FINISH
-- =============================================================================

select * from finish();

rollback;
