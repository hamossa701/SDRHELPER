import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function makeSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
}

export async function POST(request: NextRequest) {
  const supabase = await makeSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organization_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await request.json()
  const { campaign_id, sdr_id, starts_at, ends_at, assignment_type } = body

  if (!campaign_id || !sdr_id || !starts_at || !ends_at || !assignment_type) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  // Verify campaign belongs to this org
  const { data: campaign } = await supabase
    .from('campaigns').select('id').eq('id', campaign_id).eq('organization_id', profile.organization_id).single()
  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

  // Verify SDR belongs to this org with role = 'sdr'
  const { data: sdr } = await supabase
    .from('users').select('id, manager_id').eq('id', sdr_id).eq('organization_id', profile.organization_id).eq('role', 'sdr').single()
  if (!sdr) return NextResponse.json({ error: 'SDR introuvable' }, { status: 404 })
  if (profile.role === 'manager' && sdr.manager_id !== user.id) {
    return NextResponse.json({ error: 'SDR hors de votre equipe' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('campaign_assignments')
    .insert({
      organization_id: profile.organization_id,
      campaign_id,
      sdr_id,
      assigned_by: user.id,
      starts_at,
      ends_at,
      assignment_type,
      status: 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erreur création assignation' }, { status: 500 })
  return NextResponse.json({ assignment: data }, { status: 201 })
}
