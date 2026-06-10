-- Add per-org data retention setting (default 365 days).
-- Owners can update this value directly in Supabase or via a future settings UI.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 365
  CONSTRAINT retention_days_positive CHECK (retention_days > 0);
