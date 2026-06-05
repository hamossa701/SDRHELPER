'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { EmailOtpType } from '@supabase/supabase-js'

async function redirectByRole(
  supabase: ReturnType<typeof createClient>,
  replace: (url: string) => void,
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.warn('[auth/callback] redirectByRole: no user -> /login')
    replace('/login')
    return
  }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ''
  console.log('[auth/callback] redirectByRole: role =', role)
  const routes: Record<string, string> = {
    owner: '/dashboard',
    manager: '/dashboard',
    sdr: '/dashboard',
    client: '/client',
  }
  replace(routes[role] ?? '/login')
}

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    async function handle() {
      // Log everything received so we know exactly what Supabase sends
      const search = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.slice(1))

      const code         = search.get('code')
      const tokenHash    = search.get('token_hash')
      const typeQuery    = search.get('type')
      const typeHash     = hash.get('type')
      const type         = typeQuery ?? typeHash
      const accessToken  = hash.get('access_token')
      const refreshToken = hash.get('refresh_token') ?? ''
      const errorCode    = search.get('error')
      const errorDesc    = search.get('error_description')

      console.log('[auth/callback] full href:', window.location.href)
      console.log('[auth/callback] query — code:', !!code, '| token_hash:', !!tokenHash, '| type:', typeQuery, '| error:', errorCode)
      console.log('[auth/callback] hash  — access_token:', !!accessToken, '| refresh_token:', !!refreshToken, '| type:', typeHash)

      // Supabase-level error forwarded in query string
      if (errorCode) {
        console.error('[auth/callback] Supabase error param:', errorCode, '|', errorDesc, '-> /login')
        router.replace('/login')
        return
      }

      // ── Case 1: hash fragment (implicit/invite flow) ─────────────────────────
      // Supabase /auth/v1/verify redirects here with #access_token=...&type=invite
      // Hash fragments are never sent to the server — must be handled client-side.
      if (accessToken) {
        console.log('[auth/callback] case: hash fragment — type:', type)
        const { data: { session }, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error || !session) {
          console.error('[auth/callback] setSession error:', error?.message, '| session:', !!session, '-> /login')
          router.replace('/login')
          return
        }
        console.log('[auth/callback] session ok from hash — user:', session.user.email, '| type:', type)
        if (type === 'invite') {
          console.log('[auth/callback] invite (hash) -> /set-password')
          router.replace('/set-password')
          return
        }
        await redirectByRole(supabase, url => router.replace(url))
        return
      }

      // ── Case 2: PKCE code flow ───────────────────────────────────────────────
      if (code) {
        console.log('[auth/callback] case: PKCE code — type:', type)
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[auth/callback] exchangeCodeForSession error:', error.message, '-> /login')
          router.replace('/login')
          return
        }
        console.log('[auth/callback] code exchange ok')
        if (type === 'invite') {
          console.log('[auth/callback] invite (code) -> /set-password')
          router.replace('/set-password')
          return
        }
        await redirectByRole(supabase, url => router.replace(url))
        return
      }

      // ── Case 3: token_hash OTP flow ──────────────────────────────────────────
      if (tokenHash && type) {
        console.log('[auth/callback] case: verifyOtp — type:', type)
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        })
        if (error) {
          console.error('[auth/callback] verifyOtp error:', error.message, '-> /login')
          router.replace('/login')
          return
        }
        if (type === 'invite') {
          console.log('[auth/callback] invite (token_hash) -> /set-password')
          router.replace('/set-password')
          return
        }
        await redirectByRole(supabase, url => router.replace(url))
        return
      }

      // Nothing matched
      console.warn('[auth/callback] no token format matched — search:', window.location.search, '| hash:', window.location.hash, '-> /login')
      router.replace('/login')
    }

    handle()
  }, [router])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#050816',
      color: '#94a3b8',
      fontSize: 14,
      fontFamily: 'system-ui, sans-serif',
    }}>
      Vérification en cours…
    </div>
  )
}
