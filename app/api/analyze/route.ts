import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

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
    if (authErr || !user) {
      console.error('[analyze] auth failed:', authErr?.message)
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    console.log('[analyze] user_id:', user.id)

    const { data: profile, error: profileErr } = await supabase
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile) {
      console.error('[analyze] profile not found for user:', user.id, profileErr?.message)
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 401 })
    }
    console.log('[analyze] profile role:', profile.role, 'org:', profile.organization_id)

    if (!['owner', 'manager', 'sdr'].includes(profile.role)) {
      console.error('[analyze] role denied:', profile.role)
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await request.json()
    const { campaign_id, sdr_id, transcript, call_datetime } = body
    console.log('[analyze] body campaign_id:', campaign_id, 'sdr_id:', sdr_id, 'transcript_len:', transcript?.length)

    if (!transcript?.trim()) return NextResponse.json({ error: 'Transcription requise' }, { status: 400 })
    if (!campaign_id || !sdr_id) return NextResponse.json({ error: 'Campagne et SDR requis' }, { status: 400 })

    // ── RBAC: campaign must belong to this org ────────────────────────────────
    const { data: campaign, error: campaignErr } = await supabase
      .from('campaigns').select('id')
      .eq('id', campaign_id).eq('organization_id', profile.organization_id).single()
    console.log('[analyze] campaign lookup:', campaign ? 'found' : 'not found', campaignErr?.message)
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

    // ── RBAC: sdr_id must belong to this org ─────────────────────────────────
    const { data: sdrUser, error: sdrErr } = await supabase
      .from('users').select('id')
      .eq('id', sdr_id).eq('organization_id', profile.organization_id).single()
    console.log('[analyze] sdr lookup:', sdrUser ? 'found' : 'not found', sdrErr?.message)
    if (!sdrUser) return NextResponse.json({ error: 'SDR non autorisé' }, { status: 403 })

    // ── Create call + job via admin client (auth+RBAC already verified above) ─
    // Service role bypasses RLS; org boundary is enforced by the explicit
    // organization_id field set from the verified profile.
    const admin = createAdminClient()

    const { data: call, error: callErr } = await admin
      .from('calls')
      .insert({
        organization_id: profile.organization_id,
        campaign_id,
        sdr_id,
        transcript: transcript.trim(),
        call_datetime: call_datetime || new Date().toISOString(),
      })
      .select('id').single()
    console.log('[analyze] call insert:', call?.id ?? 'failed', callErr?.message)
    if (callErr || !call) {
      return NextResponse.json({ error: callErr?.message || 'Erreur création appel' }, { status: 500 })
    }

    const { data: job, error: jobErr } = await admin
      .from('analysis_jobs')
      .insert({
        organization_id: profile.organization_id,
        call_id: call.id,
        status: 'pending',
      })
      .select('id').single()
    console.log('[analyze] job insert:', job?.id ?? 'failed', jobErr?.message, '| code:', jobErr?.code, '| detail:', jobErr?.details, '| hint:', jobErr?.hint)
    if (jobErr || !job) {
      return NextResponse.json({
        error: `Impossible de créer le job: ${jobErr?.message ?? 'no data returned'}`,
        detail: jobErr?.details ?? null,
        hint: jobErr?.hint ?? null,
      }, { status: 500 })
    }

    // ── Trigger worker (server-side only — secret never reaches browser) ──────
    const origin = new URL(request.url).origin
    fetch(`${origin}/api/analysis-worker/process`, {
      method: 'POST',
      headers: { 'x-worker-secret': process.env.WORKER_SECRET ?? '' },
    }).catch(() => {})

    console.log('[analyze] success — call:', call.id, 'job:', job.id)
    return NextResponse.json({ call_id: call.id, job_id: job.id })

  } catch (error) {
    console.error('[analyze] unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
