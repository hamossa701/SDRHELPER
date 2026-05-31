-- ============================================================
-- campaign_assignments: time-bounded SDR → campaign assignments
-- Run this in the Supabase SQL editor after migration-client-accounts.sql
-- ============================================================

-- 1. Create campaign_assignments table
CREATE TABLE IF NOT EXISTS campaign_assignments (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  campaign_id      uuid        NOT NULL REFERENCES campaigns(id)      ON DELETE CASCADE,
  sdr_id           uuid        NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  assigned_by      uuid        NOT NULL REFERENCES users(id),
  starts_at        date        NOT NULL,
  ends_at          date        NOT NULL,
  assignment_type  text        NOT NULL DEFAULT 'custom'
                               CHECK (assignment_type IN ('1_day','2_days','3_days','4_days','full_week','custom')),
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_dates_valid CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_campaign_assignments_campaign
  ON campaign_assignments(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_assignments_sdr
  ON campaign_assignments(sdr_id);

CREATE INDEX IF NOT EXISTS idx_campaign_assignments_active
  ON campaign_assignments(sdr_id, starts_at, ends_at)
  WHERE status = 'active';

-- 2. RLS
ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manager_assignments_all" ON campaign_assignments
  FOR ALL TO authenticated
  USING  (organization_id = get_my_org_id() AND get_my_role() IN ('owner','manager'))
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() IN ('owner','manager'));

CREATE POLICY "sdr_own_assignments_select" ON campaign_assignments
  FOR SELECT TO authenticated
  USING (sdr_id = auth.uid() AND get_my_role() = 'sdr');

-- 3. Migrate existing campaign_sdrs rows → campaign_assignments (permanent end date)
INSERT INTO campaign_assignments
  (organization_id, campaign_id, sdr_id, assigned_by, starts_at, ends_at, assignment_type, status)
SELECT
  c.organization_id,
  cs.campaign_id,
  cs.user_id,
  cs.user_id,
  CURRENT_DATE,
  '2099-12-31'::date,
  'custom',
  'active'
FROM campaign_sdrs cs
JOIN campaigns c ON c.id = cs.campaign_id
ON CONFLICT DO NOTHING;

-- 4. Update is_campaign_sdr() to use date-filtered campaign_assignments
--    This function is called by RLS policies on campaigns, calls, call_analyses.
--    Updating it here automatically scopes SDR visibility everywhere.
CREATE OR REPLACE FUNCTION is_campaign_sdr(p_campaign_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_assignments
    WHERE  campaign_id = p_campaign_id
      AND  sdr_id      = p_user_id
      AND  status      = 'active'
      AND  starts_at  <= CURRENT_DATE
      AND  ends_at    >= CURRENT_DATE
  );
$$;

-- 5. Add 'archived' to campaigns.status check constraint
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('active','paused','completed','archived'));
