-- ROLLBACK: manager team isolation migration
-- Run this to restore the exact pre-migration state.
-- Generated from live pg_policies on 2026-06-06.

-- 1. Remove is_manager_of_sdr if it was created by the migration
DROP FUNCTION IF EXISTS public.is_manager_of_sdr(uuid, uuid);

-- 2. Restore calls_select (pre-migration live state)
DROP POLICY IF EXISTS "calls_select" ON public.calls;
CREATE POLICY "calls_select" ON public.calls
  FOR SELECT USING (
    (organization_id = get_my_org_id())
    AND (
      (get_my_role() = ANY (ARRAY['owner'::text, 'manager'::text]))
      OR (
        (get_my_role() = 'sdr'::text)
        AND (sdr_id = auth.uid())
        AND is_campaign_sdr(campaign_id, auth.uid())
      )
    )
  );

-- 3. Restore calls_update (pre-migration live state)
DROP POLICY IF EXISTS "calls_update" ON public.calls;
CREATE POLICY "calls_update" ON public.calls
  FOR UPDATE
  USING (
    (organization_id = get_my_org_id())
    AND (
      (get_my_role() = 'owner'::text)
      OR (
        (get_my_role() = 'manager'::text)
        AND ((assigned_to IS NULL) OR (assigned_to = auth.uid()))
      )
    )
  )
  WITH CHECK (
    (organization_id = get_my_org_id())
    AND (
      (get_my_role() = 'owner'::text)
      OR (
        (get_my_role() = 'manager'::text)
        AND (assigned_to = auth.uid())
      )
    )
  );

-- 4. Restore call_analyses_select (pre-migration live state)
DROP POLICY IF EXISTS "call_analyses_select" ON public.call_analyses;
CREATE POLICY "call_analyses_select" ON public.call_analyses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calls c
      WHERE c.id = call_analyses.call_id
        AND c.organization_id = get_my_org_id()
        AND (
          (get_my_role() = ANY (ARRAY['owner'::text, 'manager'::text]))
          OR (
            (get_my_role() = 'sdr'::text)
            AND c.sdr_id = auth.uid()
            AND is_campaign_sdr(c.campaign_id, auth.uid())
          )
        )
    )
  );

-- 5. Restore users_select (pre-migration live state)
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    (organization_id = get_my_org_id())
    AND (
      (get_my_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'sdr'::text]))
      OR (id = auth.uid())
    )
  );
