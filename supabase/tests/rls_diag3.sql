-- =============================================================================
-- DIAGNOSTIC 3 — Find the actual root cause
-- Run each numbered block separately (highlight + run).
-- =============================================================================

-- ── BLOCK 1: Does test data from a previous run still exist? ─────────────────
-- If any of these return rows, a prior run didn't fully roll back.
SELECT 'orgs' AS tbl, id::text, slug AS detail
  FROM public.organizations
  WHERE id IN (
    'aaaaaaaa-1111-0000-0000-000000000000',
    'bbbbbbbb-1111-0000-0000-000000000000'
  )
UNION ALL
SELECT 'profiles' AS tbl, id::text, email AS detail
  FROM public.profiles
  WHERE id IN (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'bbbbbbbb-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001'
  )
UNION ALL
SELECT 'org_members' AS tbl, id::text, role AS detail
  FROM public.organization_members
  WHERE id IN (
    'aaaaaaaa-2000-0000-0000-000000000001',
    'aaaaaaaa-2000-0000-0000-000000000002',
    'aaaaaaaa-2000-0000-0000-000000000003',
    'bbbbbbbb-2000-0000-0000-000000000001'
  );
-- If rows are returned: leftover data is causing unique-key conflicts.
-- Cleanup query is in BLOCK 2.

-- ── BLOCK 2: Clean up leftover test data (run only if BLOCK 1 returned rows) ─
/*
DELETE FROM public.organization_members
  WHERE id IN (
    'aaaaaaaa-2000-0000-0000-000000000001',
    'aaaaaaaa-2000-0000-0000-000000000002',
    'aaaaaaaa-2000-0000-0000-000000000003',
    'bbbbbbbb-2000-0000-0000-000000000001'
  );
DELETE FROM public.organizations
  WHERE id IN (
    'aaaaaaaa-1111-0000-0000-000000000000',
    'bbbbbbbb-1111-0000-0000-000000000000'
  );
DELETE FROM public.profiles
  WHERE id IN (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'bbbbbbbb-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000001'
  );
*/

-- ── BLOCK 3: Minimal insert chain — confirm postgres bypasses RLS natively ────
-- No bypass tricks, no session_replication_role, no policies.
-- With has_bypassrls=true + tableowner=postgres this MUST succeed.
BEGIN;
  INSERT INTO public.profiles (id, full_name, email) VALUES
    ('ffffffff-0000-0000-0000-000000000001', 'Test User', 'testuser@diag.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, slug) VALUES
    ('ffffffff-1111-0000-0000-000000000000', 'Test Org', 'org-diag-test')
  ON CONFLICT (id) DO NOTHING;

  -- RLS is ENABLED on org_members but postgres has BYPASSRLS — should pass:
  INSERT INTO public.organization_members (id, organization_id, user_id, role) VALUES
    ('ffffffff-2000-0000-0000-000000000001',
     'ffffffff-1111-0000-0000-000000000000',
     'ffffffff-0000-0000-0000-000000000001',
     'owner');

ROLLBACK;
-- EXPECT: all 3 inserts succeed, then rolled back.
-- If org_member INSERT fails here → BYPASSRLS is not working as expected in Supabase.
