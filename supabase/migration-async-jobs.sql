-- ============================================================
-- SDRHelper — Async Jobs Migration
-- Adds retry_after column and atomic claim function for the
-- async analysis pipeline.
-- Run AFTER migration-client-safe.sql.
-- ============================================================

ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;

-- Partial index used by the worker dequeue query
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_pending_queue
  ON public.analysis_jobs (created_at ASC)
  WHERE status = 'pending';

-- ============================================================
-- ATOMIC CLAIM FUNCTION
-- Uses FOR UPDATE SKIP LOCKED so concurrent worker invocations
-- never claim the same job. Returns claimed rows so the worker
-- knows exactly which jobs it owns.
--
-- Only callable by service_role (the worker uses the admin
-- client). Revoking from PUBLIC/authenticated prevents any
-- authenticated user from hijacking the claim via the SDK.
-- ============================================================
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
    WHERE  status = 'pending'
      AND  (retry_after IS NULL OR retry_after <= now())
    ORDER  BY created_at ASC
    LIMIT  p_batch_size
    FOR    UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Lock down EXECUTE — only service_role (worker) may call this
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM anon;
