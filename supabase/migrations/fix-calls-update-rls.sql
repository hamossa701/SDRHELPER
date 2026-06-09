-- Fix: Restore team isolation check on calls_update RLS policy
-- Regression introduced by migration-review-rbac-hardening.sql

DROP POLICY IF EXISTS "calls_update" ON public.calls;

CREATE POLICY "calls_update" ON public.calls
  FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'owner'
      OR (
        get_my_role() = 'manager'
        AND public.is_manager_of_sdr(calls.sdr_id)
      )
    )
  )
  WITH CHECK (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'owner'
      OR (
        get_my_role() = 'manager'
        AND public.is_manager_of_sdr(calls.sdr_id)
        AND (assigned_to IS NULL OR assigned_to = auth.uid())
      )
    )
  );
