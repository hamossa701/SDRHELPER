import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
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

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 401 })
    if (!['owner', 'manager', 'sdr'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await request.json()
    const { campaign_id, sdr_id, transcript, call_datetime } = body

    if (!transcript?.trim()) return NextResponse.json({ error: 'Transcription requise' }, { status: 400 })
    if (!campaign_id || !sdr_id) return NextResponse.json({ error: 'Campagne et SDR requis' }, { status: 400 })

    // ── RBAC: campaign must belong to this org ────────────────────────────────
    const { data: campaign } = await supabase
      .from('campaigns').select('id')
      .eq('id', campaign_id).eq('organization_id', profile.organization_id).single()
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

    // ── RBAC: sdr_id must belong to this org ─────────────────────────────────
    const { data: sdrUser } = await supabase
      .from('users').select('id')
      .eq('id', sdr_id).eq('organization_id', profile.organization_id).single()
    if (!sdrUser) return NextResponse.json({ error: 'SDR non autorisé' }, { status: 403 })

    // ── Create call ───────────────────────────────────────────────────────────
    const { data: call, error: callErr } = await supabase
      .from('calls')
      .insert({
        organization_id: profile.organization_id,
        campaign_id,
        sdr_id,
        transcript: transcript.trim(),
        call_datetime: call_datetime || new Date().toISOString(),
      })
      .select('id').single()
    if (callErr || !call) {
      return NextResponse.json({ error: callErr?.message || 'Erreur création appel' }, { status: 500 })
    }

    // ── Create job record ─────────────────────────────────────────────────────
    const { data: job, error: jobErr } = await supabase
      .from('analysis_jobs')
      .insert({
        organization_id: profile.organization_id,
        call_id: call.id,
        status: 'pending',
      })
      .select('id').single()
    if (jobErr || !job) {
      return NextResponse.json({ error: 'Impossible de créer le job' }, { status: 500 })
    }

    // ── Trigger worker (server-side only — secret never reaches browser) ──────
    const origin = new URL(request.url).origin
    fetch(`${origin}/api/analysis-worker/process`, {
      method: 'POST',
      headers: { 'x-worker-secret': process.env.WORKER_SECRET ?? '' },
    }).catch(() => {}) // Non-fatal — UI polls status; worker will retry

    return NextResponse.json({ call_id: call.id, job_id: job.id })

  } catch (error) {
    console.error('analyze route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
