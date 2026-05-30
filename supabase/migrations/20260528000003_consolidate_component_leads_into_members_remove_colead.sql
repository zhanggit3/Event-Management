-- Normalize any existing co-lead rows to lead
UPDATE public.component_leads  SET role = 'lead' WHERE role = 'co-lead';
UPDATE public.component_members SET role = 'lead' WHERE role = 'co-lead';

-- Add nullable user_id to component_members
ALTER TABLE public.component_members
  ADD COLUMN user_id uuid references public.profiles(id) on delete cascade;

-- Partial unique index: one row per (component, user) when user is set
CREATE UNIQUE INDEX component_members_component_user_unique
  ON public.component_members(component_id, user_id)
  WHERE user_id IS NOT NULL;

-- Fast lookup: which components can this user access?
CREATE INDEX component_members_user_id_idx
  ON public.component_members(user_id)
  WHERE user_id IS NOT NULL;

-- Backfill component_leads → component_members (skip if user already present)
INSERT INTO public.component_members (component_id, user_id, name, email, role, created_at)
SELECT
  cl.component_id,
  cl.user_id,
  COALESCE(NULLIF(p.full_name, ''), p.email, 'Unknown'),
  p.email,
  cl.role,
  cl.created_at
FROM public.component_leads cl
JOIN public.profiles p ON p.id = cl.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.component_members cm
  WHERE cm.component_id = cl.component_id AND cm.user_id = cl.user_id
);

-- Add role check to component_members
ALTER TABLE public.component_members
  ADD CONSTRAINT component_members_role_check
  CHECK (role IN ('lead', 'member'));

-- Rebuild the two component_access_requests policies that referenced component_leads
DROP POLICY car_select ON public.component_access_requests;
DROP POLICY car_update ON public.component_access_requests;

CREATE POLICY car_select ON public.component_access_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR is_org_admin_for_component(component_id)
    OR EXISTS (
      SELECT 1 FROM public.component_members cm
      WHERE cm.component_id = component_access_requests.component_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'lead'
    )
  );

CREATE POLICY car_update ON public.component_access_requests FOR UPDATE
  USING (
    requester_id = auth.uid()
    OR is_org_admin_for_component(component_id)
    OR EXISTS (
      SELECT 1 FROM public.component_members cm
      WHERE cm.component_id = component_access_requests.component_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'lead'
    )
  );

-- Drop component_leads (its RLS policies drop automatically)
DROP TABLE public.component_leads;
