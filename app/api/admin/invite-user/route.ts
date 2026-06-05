import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

const ALLOWED_ROLES = ['manager', 'sdr', 'client'] as const
type InviteRole = (typeof ALLOWED_ROLES)[number]

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(request: NextRequest) {
  // ── Env check ──────────────────────────────────────────────────────────────
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  console.log('[invite-user] env check — service key present:', hasServiceKey, '| appUrl:', appUrl)

  if (!hasServiceKey) {
    console.error('[invite-user] SUPABASE_SERVICE_ROLE_KEY is missing')
    return jsonError('Configuration serveur manquante', 'MISSING_SERVICE_KEY', 500)
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────────
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

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      console.warn('[invite-user] unauthenticated — authErr:', authErr?.message)
      return jsonError('Non autorisé', 'UNAUTHORIZED', 401)
    }

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, role, email')
      .eq('id', user.id)
      .single()

    console.log('[invite-user] caller — email:', user.email, '| role:', profile?.role)

    if (!profile || profile.role !== 'owner') {
      return jsonError('Accès refusé', 'UNAUTHORIZED', 403)
    }

    // ── Payload ────────────────────────────────────────────────────────────────
    const body = await request.json() as {
      name?: unknown; email?: unknown; role?: unknown; manager_id?: unknown; client_id?: unknown
    }
    const { name, email, role, manager_id, client_id } = body

    if (typeof name !== 'string' || !name.trim()) {
      return jsonError('Nom requis', 'VALIDATION_ERROR', 400)
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError('Email invalide', 'VALIDATION_ERROR', 400)
    }
    if (!ALLOWED_ROLES.includes(role as InviteRole)) {
      return jsonError('Rôle non autorisé', 'VALIDATION_ERROR', 400)
    }
    if (role === 'client' && !client_id) {
      return jsonError('Compte client requis pour le rôle client', 'VALIDATION_ERROR', 400)
    }

    const cleanEmail = email.toLowerCase().trim()
    console.log('[invite-user] inviting — email:', cleanEmail, '| role:', role)

    // ── Duplicate check (public.users in this org) ─────────────────────────────
    const { data: existing, error: dupCheckErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()

    if (dupCheckErr) {
      console.error('[invite-user] duplicate check error:', dupCheckErr.message, dupCheckErr.code)
    }
    if (existing) {
      return jsonError('Un utilisateur avec cet email existe déjà dans votre organisation', 'DUPLICATE_EMAIL', 409)
    }

    // ── Optional: validate manager_id ──────────────────────────────────────────
    if (role === 'sdr' && manager_id) {
      const { data: mgr } = await supabase
        .from('users')
        .select('id')
        .eq('id', manager_id as string)
        .eq('organization_id', profile.organization_id)
        .eq('role', 'manager')
        .single()
      if (!mgr) return jsonError('Manager introuvable dans votre organisation', 'VALIDATION_ERROR', 400)
    }

    // ── Optional: validate client_id ───────────────────────────────────────────
    if (role === 'client' && client_id) {
      const { data: ca } = await supabase
        .from('client_accounts')
        .select('id')
        .eq('id', client_id as string)
        .eq('organization_id', profile.organization_id)
        .single()
      if (!ca) return jsonError('Compte client introuvable dans votre organisation', 'VALIDATION_ERROR', 400)
    }

    // ── Supabase admin invite ──────────────────────────────────────────────────
    const supabaseAdmin = createAdminClient()
    const redirectTo = `${appUrl}/auth/callback`
    console.log('[invite-user] calling inviteUserByEmail — redirectTo:', redirectTo)

    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      {
        data: { name: name.trim(), role, organization_id: profile.organization_id },
        redirectTo,
      }
    )

    if (inviteErr) {
      // Log full error object safely (no secrets — keys only, no env vars)
      console.error('[invite-user] inviteUserByEmail error — full object:', JSON.stringify({
        message: inviteErr.message,
        status: inviteErr.status,
        code: (inviteErr as unknown as Record<string, unknown>).code,
        name: inviteErr.name,
        cause: (inviteErr as unknown as Record<string, unknown>).cause,
      }))

      const msg = inviteErr.message.toLowerCase()
      const isDuplicate =
        msg.includes('already been registered') ||
        msg.includes('already exists') ||
        msg.includes('duplicate') ||
        msg.includes('user already') ||
        inviteErr.status === 422
      const isSmtp =
        msg.includes('smtp') ||
        msg.includes('email') ||
        msg.includes('send') ||
        msg.includes('mail') ||
        msg.includes('delivery') ||
        inviteErr.status === 500

      if (isDuplicate) {
        return jsonError('Cet email est déjà utilisé dans Supabase Auth', 'DUPLICATE_EMAIL', 409)
      }
      if (isSmtp) {
        return jsonError(
          `Erreur envoi email : ${inviteErr.message}`,
          'SMTP_ERROR',
          500
        )
      }
      return jsonError(`Invitation échouée : ${inviteErr.message}`, 'INVITE_FAILED', 500)
    }

    console.log('[invite-user] invite sent — auth user id:', inviteData.user.id, '| email_confirmed_at:', inviteData.user.email_confirmed_at)

    // ── Create public.users profile ────────────────────────────────────────────
    const insertPayload = {
      id: inviteData.user.id,
      organization_id: profile.organization_id,
      name: name.trim(),
      email: cleanEmail,
      role,
      manager_id: role === 'sdr' && manager_id ? manager_id : null,
      client_id: role === 'client' && client_id ? client_id : null,
    }
    console.log('[invite-user] inserting public.users — id:', insertPayload.id, '| role:', insertPayload.role)

    const { error: profileErr } = await supabaseAdmin.from('users').insert(insertPayload)

    if (profileErr) {
      console.error('[invite-user] profile insert error — message:', profileErr.message, '| code:', profileErr.code, '| details:', profileErr.details)
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
      if (deleteErr) {
        console.error('[invite-user] cleanup deleteUser error:', deleteErr.message)
      }
      const isUniqueViolation = profileErr.code === '23505'
      return jsonError(
        isUniqueViolation
          ? 'Un profil avec cet email ou cet ID existe déjà'
          : `Erreur création profil : ${profileErr.message}`,
        'PROFILE_INSERT_FAILED',
        500
      )
    }

    console.log('[invite-user] success — user created:', cleanEmail)
    return NextResponse.json({ ok: true })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[invite-user] unhandled exception:', msg)
    return jsonError(`Erreur serveur inattendue : ${msg}`, 'SERVER_ERROR', 500)
  }
}
