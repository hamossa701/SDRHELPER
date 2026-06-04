import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(c) {
            try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
        const routes: Record<string, string> = { owner: '/dashboard', manager: '/manager', sdr: '/sdr', client: '/client' }
        const dest = profile?.role ? (routes[profile.role] ?? '/login') : '/login'
        return NextResponse.redirect(new URL(dest, origin))
      }
    }
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
