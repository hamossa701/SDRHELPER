-- ROLLBACK: idempotency key + stuck-job reclaim migration
-- Run this to restore the exact pre-migration state.

-- 1. Drop idempotency constraint
DROP INDEX IF EXISTS public.calls_idempotency_idx;

-- 2. Remove idempotency_key column
ALTER TABLE public.calls DROP COLUMN IF EXISTS idempotency_key;

-- 3. Restore original claim_analysis_jobs (pending-only, no stuck-job reclaim)
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

REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION claim_analysis_jobs(int) FROM anon;
