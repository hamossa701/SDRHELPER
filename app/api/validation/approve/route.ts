import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { canValidateAnalysis } from '@/lib/review-rbac'

export async function POST(request: NextRequest) {
  try {
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

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organization_id, role, name').eq('id', user.id).single()
    if (!profile) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { analysisId } = await request.json()
    if (!analysisId) return NextResponse.json({ error: 'analysisId requis' }, { status: 400 })

    const { data: analysis, error: analysisErr } = await supabase
      .from('call_analyses')
      .select('id, call_id')
      .eq('id', analysisId)
      .single()
    if (analysisErr || !analysis) return NextResponse.json({ error: 'Analyse introuvable' }, { status: 404 })

    const { data: call } = await supabase
      .from('calls')
      .select('id, organization_id, assigned_to, review_status, sdr:users!calls_sdr_id_fkey(manager_id)')
      .eq('id', analysis.call_id)
      .eq('organization_id', profile.organization_id)
      .single()
    if (!call) return NextResponse.json({ error: 'Analyse introuvable' }, { status: 404 })

    const sdr = Array.isArray(call.sdr) ? call.sdr[0] : call.sdr
    const access = canValidateAnalysis(profile, user.id, { ...call, sdr_manager_id: sdr?.manager_id ?? null })
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const now = new Date().toISOString()

    const { error: updateErr } = await supabase.from('call_analyses').update({
      human_validated: true,
      validated_by: user.id,
      validated_at: now,
    }).eq('id', analysisId)
    if (updateErr) throw updateErr

    const { error: auditErr } = await supabase.from('audit_log').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      analysis_id: analysisId,
      field_name: null,
      old_value: null,
      new_value: profile.name,
      action: 'approve_analysis',
    })
    if (auditErr) throw auditErr

    return NextResponse.json({ ok: true, validated_at: now, validated_by_name: profile.name })
  } catch (err) {
    console.error('validation/approve error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
