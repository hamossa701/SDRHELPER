ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS external_call_id text;

CREATE UNIQUE INDEX IF NOT EXISTS calls_ringover_external_call_idx
  ON calls (organization_id, source, external_call_id)
  WHERE source = 'ringover' AND external_call_id IS NOT NULL;

DROP POLICY IF EXISTS "owner manage integration" ON ringover_integrations;

CREATE POLICY "owner manage integration"
  ON ringover_integrations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "owner manage agent mappings" ON ringover_agent_mappings;

CREATE POLICY "owner manage agent mappings"
  ON ringover_agent_mappings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

CREATE INDEX IF NOT EXISTS idx_ringover_agent_mappings_org_sdr
  ON ringover_agent_mappings (organization_id, sdr_id);

CREATE INDEX IF NOT EXISTS idx_ringover_agent_mappings_org_campaign
  ON ringover_agent_mappings (organization_id, default_campaign_id);

CREATE OR REPLACE FUNCTION validate_ringover_agent_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sdr_org uuid;
  sdr_role text;
  campaign_org uuid;
BEGIN
  SELECT organization_id, role INTO sdr_org, sdr_role
  FROM users
  WHERE id = NEW.sdr_id;

  IF sdr_org IS DISTINCT FROM NEW.organization_id OR sdr_role IS DISTINCT FROM 'sdr' THEN
    RAISE EXCEPTION 'sdr_id must reference an SDR in the same organization';
  END IF;

  IF NEW.default_campaign_id IS NOT NULL THEN
    SELECT organization_id INTO campaign_org
    FROM campaigns
    WHERE id = NEW.default_campaign_id;

    IF campaign_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'default_campaign_id must reference a campaign in the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ringover_agent_mappings_validate_org_refs
  ON ringover_agent_mappings;

CREATE TRIGGER ringover_agent_mappings_validate_org_refs
  BEFORE INSERT OR UPDATE OF organization_id, sdr_id, default_campaign_id
  ON ringover_agent_mappings
  FOR EACH ROW
  EXECUTE FUNCTION validate_ringover_agent_mapping();
