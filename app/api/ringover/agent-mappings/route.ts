import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getOwnerCtx() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('users').select('organization_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return null
  return { supabase, profile }
}

export async function GET() {
  const ctx = await getOwnerCtx()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from('ringover_agent_mappings')
    .select('id, ringover_agent_id, sdr_id, default_campaign_id, sdr:users!sdr_id(name), campaign:campaigns!default_campaign_id(campaign_name)')
    .eq('organization_id', ctx.profile.organization_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  return NextResponse.json({ mappings: data ?? [] })
}

export async function POST(request: NextRequest) {
  const ctx = await getOwnerCtx()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json()
  const { ringover_agent_id, sdr_id, default_campaign_id } = body

  const agentIdNum = Number(ringover_agent_id)
  if (!ringover_agent_id || !Number.isInteger(agentIdNum) || agentIdNum <= 0) {
    return NextResponse.json({ error: 'ringover_agent_id invalide (entier positif requis)' }, { status: 400 })
  }
  if (!sdr_id) return NextResponse.json({ error: 'sdr_id requis' }, { status: 400 })

  const { data: sdr } = await ctx.supabase
    .from('users').select('id')
    .eq('id', sdr_id).eq('organization_id', ctx.profile.organization_id).eq('role', 'sdr')
    .single()
  if (!sdr) return NextResponse.json({ error: 'SDR introuvable' }, { status: 404 })

  if (default_campaign_id) {
    const { data: campaign } = await ctx.supabase
      .from('campaigns').select('id')
      .eq('id', default_campaign_id).eq('organization_id', ctx.profile.organization_id)
      .single()
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  }

  const { data, error } = await ctx.supabase
    .from('ringover_agent_mappings')
    .insert({
      organization_id: ctx.profile.organization_id,
      ringover_agent_id: agentIdNum,
      sdr_id,
      default_campaign_id: default_campaign_id ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Cet agent est déjà mappé' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur création mapping' }, { status: 500 })
  }

  return NextResponse.json({ mapping: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const ctx = await getOwnerCtx()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { error } = await ctx.supabase
    .from('ringover_agent_mappings')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.profile.organization_id)

  if (error) return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
