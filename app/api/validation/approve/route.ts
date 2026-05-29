import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organization_id, role, name').eq('id', user.id).single()
    if (!profile || !['owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { analysisId } = await request.json()
    if (!analysisId) return NextResponse.json({ error: 'analysisId requis' }, { status: 400 })

    const now = new Date().toISOString()

    await supabase.from('call_analyses').update({
      human_validated: true,
      validated_by: user.id,
      validated_at: now,
    }).eq('id', analysisId)

    await supabase.from('audit_log').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      analysis_id: analysisId,
      field_name: null,
      old_value: null,
      new_value: profile.name,
      action: 'approve_analysis',
    })

    return NextResponse.json({ ok: true, validated_at: now, validated_by_name: profile.name })
  } catch (err) {
    console.error('validation/approve error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
