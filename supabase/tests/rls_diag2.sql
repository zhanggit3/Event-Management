-- =============================================================================
-- DIAGNOSTIC 2 — Isolate why organization_members inserts keep failing
-- Run this as a standalone script in the Supabase SQL editor (no BEGIN needed —
-- each numbered block is independent so an error stops only that block).
-- =============================================================================

-- ── BLOCK 1: Who am I and what privileges do I have? ─────────────────────────
SELECT
  current_user                   AS current_user,
  session_user                   AS session_user,
  r.rolsuper                     AS is_superuser,
  r.rolbypassrls                 AS has_bypassrls,
  r.rolcreaterole                AS can_createrole
FROM pg_roles r
WHERE r.rolname = current_user;

-- ── BLOCK 2: Who OWNS the organization_members table? ────────────────────────
SELECT tableowner
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'organization_members';

-- ── BLOCK 3: Triggers on organization_members (could intercept inserts) ───────
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'organization_members';

-- ── BLOCK 4: Can we CREATE POLICY? (requires table ownership) ────────────────
-- If this errors with "must be owner of table", that is the root cause.
BEGIN;
CREATE POLICY "_diag_test_policy"
  ON public.organization_members FOR INSERT WITH CHECK (true);

-- Verify it was created
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'organization_members'
  AND policyname = '_diag_test_policy';

ROLLBACK;
-- (policy is dropped on rollback)

-- ── BLOCK 5: Can we INSERT after creating the bypass policy? ─────────────────
BEGIN;
CREATE POLICY "_diag_test_policy"
  ON public.organization_members FOR INSERT WITH CHECK (true);

INSERT INTO public.organization_members (id, organization_id, user_id, role)
VALUES (
  'ffffffff-0000-0000-0000-000000000001',
  'ffffffff-1111-0000-0000-000000000000',
  'ffffffff-0000-0000-0000-000000000002',
  'owner'
);
-- If this still fails: the problem is NOT the policy — something else blocks it.
-- If this succeeds: the main script just needs to ensure CREATE POLICY runs first.

ROLLBACK;

-- ── BLOCK 6: Can we ALTER ROLE to grant ourselves BYPASSRLS? ─────────────────
-- (Requires CREATEROLE or superuser. If this works, it's the cleanest fix.)
BEGIN;
ALTER ROLE postgres BYPASSRLS;

INSERT INTO public.organization_members (id, organization_id, user_id, role)
VALUES (
  'ffffffff-0000-0000-0000-000000000001',
  'ffffffff-1111-0000-0000-000000000000',
  'ffffffff-0000-0000-0000-000000000002',
  'owner'
);
-- EXPECT: INSERT 1 if ALTER ROLE BYPASSRLS succeeded

ALTER ROLE postgres NOBYPASSRLS;

ROLLBACK;

-- ── BLOCK 7: Can we SET ROLE to supabase_admin? ──────────────────────────────
-- supabase_admin typically owns all tables and has BYPASSRLS.
BEGIN;
SET LOCAL ROLE supabase_admin;

INSERT INTO public.organization_members (id, organization_id, user_id, role)
VALUES (
  'ffffffff-0000-0000-0000-000000000001',
  'ffffffff-1111-0000-0000-000000000000',
  'ffffffff-0000-0000-0000-000000000002',
  'owner'
);
-- EXPECT: INSERT 1 if we can become supabase_admin

ROLLBACK;

-- ── BLOCK 8: Summary prompt ───────────────────────────────────────────────────
-- After running all blocks above, share:
--   Block 1: rolsuper / has_bypassrls values
--   Block 2: tableowner value
--   Block 3: any trigger rows?
--   Block 4: did CREATE POLICY succeed or error?
--   Block 5: did INSERT after CREATE POLICY succeed or error?
--   Block 6: did ALTER ROLE + INSERT succeed or error?
--   Block 7: did SET ROLE supabase_admin + INSERT succeed or error?
