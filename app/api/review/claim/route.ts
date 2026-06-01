import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { canClaimReview } from '@/lib/review-rbac'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
        },
      }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { callId } = await request.json()
    if (!callId) return NextResponse.json({ error: 'callId requis' }, { status: 400 })

    const { data: call } = await supabase
      .from('calls').select('id, organization_id, assigned_to, review_status')
      .eq('id', callId).eq('organization_id', profile.organization_id).single()

    if (!call) return NextResponse.json({ error: 'Appel introuvable' }, { status: 404 })
    const access = canClaimReview(profile, user.id, call)
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    let updateQuery = supabase
      .from('calls')
      .update({ review_status: 'in_review', assigned_to: user.id })
      .eq('id', callId).eq('organization_id', profile.organization_id)
      .select('id')

    if (profile.role !== 'owner') {
      updateQuery = updateQuery.is('assigned_to', null).neq('review_status', 'resolved')
    }

    const { data: claimed, error } = await updateQuery.maybeSingle()

    if (error) throw error
    if (!claimed) {
      return NextResponse.json({ error: 'Revue deja assignee' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('review/claim error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
