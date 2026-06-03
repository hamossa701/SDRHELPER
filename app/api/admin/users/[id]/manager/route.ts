import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sdrId } = await params
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
          },
        },
      }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { managerId } = await request.json()
    if (managerId !== null && typeof managerId !== 'string') {
      return NextResponse.json({ error: 'managerId invalide' }, { status: 400 })
    }

    const { data: targetSdr } = await supabase
      .from('users')
      .select('id')
      .eq('id', sdrId)
      .eq('organization_id', profile.organization_id)
      .eq('role', 'sdr')
      .single()
    if (!targetSdr) return NextResponse.json({ error: 'SDR introuvable' }, { status: 404 })

    if (managerId) {
      const { data: manager } = await supabase
        .from('users')
        .select('id')
        .eq('id', managerId)
        .eq('organization_id', profile.organization_id)
        .eq('role', 'manager')
        .single()
      if (!manager) return NextResponse.json({ error: 'Manager introuvable' }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ manager_id: managerId })
      .eq('id', sdrId)
      .eq('organization_id', profile.organization_id)
      .eq('role', 'sdr')
    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('admin/users/[id]/manager error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
