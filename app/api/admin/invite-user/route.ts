import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

const ALLOWED_ROLES = ['manager', 'sdr', 'client'] as const
type InviteRole = (typeof ALLOWED_ROLES)[number]

export async function POST(request: NextRequest) {
  try {
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
    if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json() as {
      name?: unknown; email?: unknown; role?: unknown; manager_id?: unknown; client_id?: unknown
    }
    const { name, email, role, manager_id, client_id } = body

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.includes(role as InviteRole)) {
      return NextResponse.json({ error: 'Rôle non autorisé' }, { status: 400 })
    }
    if (role === 'client' && !client_id) {
      return NextResponse.json({ error: 'Compte client requis pour le rôle client' }, { status: 400 })
    }

    const cleanEmail = email.toLowerCase().trim()

    // Duplicate check within org
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .eq('organization_id', profile.organization_id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà dans votre organisation' }, { status: 409 })
    }

    // Validate manager_id if SDR and provided
    if (role === 'sdr' && manager_id) {
      const { data: mgr } = await supabase
        .from('users')
        .select('id')
        .eq('id', manager_id as string)
        .eq('organization_id', profile.organization_id)
        .eq('role', 'manager')
        .single()
      if (!mgr) return NextResponse.json({ error: 'Manager introuvable dans votre organisation' }, { status: 400 })
    }

    // Validate client_id if client
    if (role === 'client' && client_id) {
      const { data: ca } = await supabase
        .from('client_accounts')
        .select('id')
        .eq('id', client_id as string)
        .eq('organization_id', profile.organization_id)
        .single()
      if (!ca) return NextResponse.json({ error: 'Compte client introuvable dans votre organisation' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const supabaseAdmin = createAdminClient()

    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      cleanEmail,
      {
        data: { name: name.trim(), role, organization_id: profile.organization_id },
        redirectTo: `${appUrl}/auth/callback`,
      }
    )

    if (inviteErr) {
      const msg = inviteErr.message.toLowerCase()
      if (msg.includes('already been registered') || msg.includes('already exists') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
      }
      throw inviteErr
    }

    // Create public.users profile immediately (service role bypasses RLS)
    const { error: profileErr } = await supabaseAdmin.from('users').insert({
      id: inviteData.user.id,
      organization_id: profile.organization_id,
      name: name.trim(),
      email: cleanEmail,
      role,
      manager_id: role === 'sdr' && manager_id ? manager_id : null,
      client_id: role === 'client' && client_id ? client_id : null,
    })

    if (profileErr) {
      // Clean up auth user to avoid orphan
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
      throw profileErr
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[invite-user]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
