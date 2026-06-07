-- Maps Ringover agent_id to a user (SDR) in our system
CREATE TABLE ringover_agent_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ringover_agent_id bigint NOT NULL,
  sdr_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  default_campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, ringover_agent_id)
);

ALTER TABLE ringover_agent_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manage agent mappings"
  ON ringover_agent_mappings FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'owner'
  ));

-- Add source column to calls so Ringover-originated calls can be distinguished
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source text;
