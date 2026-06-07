-- Ringover integration config per org
CREATE TABLE ringover_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_encrypted text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE ringover_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manage integration"
  ON ringover_integrations FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'owner'
  ));
