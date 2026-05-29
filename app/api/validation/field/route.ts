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
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile || !['owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { analysisId, fieldName, action, originalValue, correctedValue } = body

    if (!analysisId || !fieldName || !['validate', 'correct'].includes(action)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    // Fetch current field_validations to merge (never discard existing statuses)
    const { data: current, error: fetchErr } = await supabase
      .from('call_analyses').select('field_validations').eq('id', analysisId).single()
    if (fetchErr || !current) return NextResponse.json({ error: 'Analyse introuvable' }, { status: 404 })

    const newStatus = action === 'validate' ? 'validated' : 'corrected'
    const merged = { ...(current.field_validations || {}), [fieldName]: newStatus }

    await supabase.from('call_analyses').update({ field_validations: merged }).eq('id', analysisId)

    let correction = null
    if (action === 'correct') {
      const { data: upserted } = await supabase
        .from('field_corrections')
        .upsert(
          {
            analysis_id: analysisId,
            field_name: fieldName,
            original_value: originalValue ?? null,
            corrected_value: correctedValue ?? null,
            corrected_by: user.id,
            corrected_at: new Date().toISOString(),
          },
          { onConflict: 'analysis_id,field_name' }
        )
        .select()
        .single()
      correction = upserted
    }

    await supabase.from('audit_log').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      analysis_id: analysisId,
      field_name: fieldName,
      old_value: action === 'correct' ? (originalValue ?? null) : null,
      new_value: action === 'correct' ? (correctedValue ?? null) : 'validated',
      action: action === 'validate' ? 'validate_field' : 'correct_field',
    })

    return NextResponse.json({ ok: true, status: newStatus, correction })
  } catch (err) {
    console.error('validation/field error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
