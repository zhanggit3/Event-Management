-- Backfill: personal workspace orgs created before the is_workspace column was added
-- received DEFAULT false. Identify them by slug pattern + single-owner membership.
-- Slug patterns: old = *-workspace, new = *-workspace-XXXXXXXX (8 hex chars from user ID)
UPDATE public.organizations
SET is_workspace = true
WHERE is_workspace = false
  AND (
    slug ~ '-workspace$'
    OR slug ~ '-workspace-[a-f0-9]{8}$'
  )
  AND id IN (
    SELECT organization_id
    FROM public.organization_members
    GROUP BY organization_id
    HAVING count(*) = 1
  );
