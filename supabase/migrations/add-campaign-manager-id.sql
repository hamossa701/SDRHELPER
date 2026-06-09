-- ============================================================
-- Migration: campaign manager ownership model
-- Adds manager_id to campaigns; restricts insert to owner only.
-- ============================================================

-- 1. Add column (nullable — existing campaigns keep NULL)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS manager_id uuid
    REFERENCES public.users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS campaigns_manager_id_idx
  ON public.campaigns(manager_id);

-- 2. Trigger: validate manager_id references a manager in the same org
CREATE OR REPLACE FUNCTION public.validate_campaign_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mgr_role text;
  mgr_org  uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.manager_id IS NULL THEN
    RAISE EXCEPTION 'campaigns.manager_id is required';
  END IF;
  IF NEW.manager_id IS NOT NULL THEN
    SELECT role, organization_id INTO mgr_role, mgr_org
      FROM public.users WHERE id = NEW.manager_id;
    IF mgr_role IS DISTINCT FROM 'manager' THEN
      RAISE EXCEPTION 'campaigns.manager_id must reference a user with role = ''manager''';
    END IF;
    IF mgr_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'campaigns.manager_id must reference a manager in the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_validate_manager ON public.campaigns;
CREATE TRIGGER campaigns_validate_manager
  BEFORE INSERT OR UPDATE OF manager_id, organization_id ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_campaign_manager();

-- 3. Replace RLS policies
DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
CREATE POLICY "campaigns_select" ON public.campaigns
  FOR SELECT USING (
    organization_id = get_my_org_id() AND (
      get_my_role() = 'owner'
      OR (get_my_role() = 'manager' AND manager_id = auth.uid())
      OR (get_my_role() = 'sdr' AND EXISTS (
        SELECT 1 FROM public.campaign_sdrs
        WHERE campaign_id = campaigns.id AND user_id = auth.uid()
      ))
      OR (get_my_role() = 'client' AND EXISTS (
        SELECT 1 FROM public.campaign_clients
        WHERE campaign_id = campaigns.id AND user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "campaigns_insert" ON public.campaigns;
CREATE POLICY "campaigns_insert" ON public.campaigns
  FOR INSERT WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() = 'owner'
    AND manager_id IS NOT NULL
  );

DROP POLICY IF EXISTS "campaigns_update" ON public.campaigns;
CREATE POLICY "campaigns_update" ON public.campaigns
  FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'owner'
  )
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() = 'owner'
    AND manager_id IS NOT NULL
  );

-- 4. Drop the now-unused function
DROP FUNCTION IF EXISTS public.manager_can_access_campaign(uuid, uuid);
