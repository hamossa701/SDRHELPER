import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

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

  // Invite / magic-link / recovery flow (token_hash param)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      if (type === 'invite') {
        return NextResponse.redirect(new URL('/set-password', origin))
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
        const routes: Record<string, string> = { owner: '/dashboard', manager: '/manager', sdr: '/sdr', client: '/client' }
        const dest = profile?.role ? (routes[profile.role] ?? '/login') : '/login'
        return NextResponse.redirect(new URL(dest, origin))
      }
    }
  }

  // PKCE code flow (normal sign-in)
  if (code) {
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
