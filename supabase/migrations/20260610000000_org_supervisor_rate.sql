-- Supervisor hourly rate (MAD) used to value supervision time saved on the Owner dashboard ROI block.
-- Default 60 MAD/h. Configurable per organization without redeployment.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS supervisor_hourly_rate_mad integer NOT NULL DEFAULT 60;
