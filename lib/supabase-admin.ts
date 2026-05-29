import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS entirely.
// Use only in server components and API routes where you manually
// enforce org and campaign boundaries in the query itself.
// Never expose this client or its key to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
