-- ============================================================
-- Repair: mark stuck pending/processing jobs as failed
-- Run in Supabase SQL editor.
-- After running, click "Réessayer l'analyse" on each call.
-- New submissions use processJobById directly and won't get stuck.
-- ============================================================

UPDATE public.analysis_jobs
SET
  status        = 'failed',
  error_message = 'Auto-failed: job stuck in pending/processing for more than 10 minutes',
  completed_at  = now()
WHERE status IN ('pending', 'processing')
  AND created_at < now() - INTERVAL '10 minutes';

-- Verify result:
SELECT id, call_id, status, error_message, created_at
FROM   public.analysis_jobs
ORDER  BY created_at DESC
LIMIT  20;
