-- Fix: Restrict self-serve profile creation to 'sdr' role only
-- Prevents privilege escalation during invite acceptance window
-- Safe: invite flow uses supabaseAdmin (service role) which bypasses RLS

DROP POLICY IF EXISTS "users_insert" ON public.users;

CREATE POLICY "users_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND role = 'sdr'
  );
