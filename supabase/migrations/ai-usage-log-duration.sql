-- Add AssemblyAI audio duration to ai_usage_log for per-call cost analysis.
-- Populated from calls.call_duration_seconds at analysis time.
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS assemblyai_duration_secs integer;
