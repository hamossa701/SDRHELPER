-- ============================================================
-- Migration: idempotency key + stuck-job reclaim
-- Date: 2026-06-06
-- Rollback: supabase/rollback-idempotency.sql
-- ============================================================

-- 1. Add idempotency_key column to calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

-- 2. Unique constraint prevents duplicate submits for the same form load.
--    Partial (WHERE NOT NULL) so calls without a key never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS calls_idempotency_idx
  ON public.calls (organization_id, sdr_id, campaign_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Extend claim_analysis_jobs to reclaim stuck 'processing' jobs.
--    A job stuck in 'processing' for >10 min means the worker died mid-flight.
CREATE OR REPLACE FUNCTION claim_analysis_jobs(p_batch_size int DEFAULT 3)
RETURNS SETOF public.analysis_jobs
LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE public.analysis_jobs
  SET    status     = 'processing',
         started_at = now()
  WHERE  id IN (
    SELECT id
    FROM   public.analysis_jobs
    WHERE  (
      (status = 'pending' AND (retry_after IS NULL OR retry_after <= now()))
      OR (status = 'processing' AND started_at < now() - interval '10 minutes')
    )
    ORDER  BY created_at ASC
    LIMIT  p_batch_size
    FOR    UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM anon;
