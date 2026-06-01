-- Per-user per-route hourly rate limits
-- Used by /api/analyze to cap analysis requests at 10 per user per hour

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route        text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, route, window_start)
);

-- Table is only accessed via the SECURITY DEFINER function below (admin client).
-- Deny all direct access so RLS cannot be accidentally bypassed by anon/authenticated roles.
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_direct_access" ON api_rate_limits FOR ALL USING (false);

-- Atomically increments the counter for (user, route, window) and returns the new count.
-- Called by /api/analyze after all auth/RBAC checks pass, before the AI job is created.
-- Returns the count AFTER incrementing so the caller can check against the limit.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id      uuid,
  p_route        text,
  p_window_start timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO api_rate_limits (user_id, route, window_start, count)
  VALUES (p_user_id, p_route, p_window_start, 1)
  ON CONFLICT (user_id, route, window_start)
  DO UPDATE SET
    count      = api_rate_limits.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
