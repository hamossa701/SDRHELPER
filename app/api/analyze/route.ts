import { after, NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { processJobById } from '@/lib/job-processor'

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

    const { data: profile, error: profileErr } = await supabase
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile) {
      console.error('[analyze] profile not found:', profileErr?.message)
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 401 })
    }

    if (!['owner', 'manager', 'sdr'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await request.json()
    const { campaign_id, sdr_id, transcript, call_datetime, idempotency_key } = body

    if (!transcript?.trim()) return NextResponse.json({ error: 'Transcription requise' }, { status: 400 })
    if (transcript.trim().length > 30_000) return NextResponse.json({ error: 'Transcript too long. Maximum is 30,000 characters.' }, { status: 400 })
    if (!campaign_id || !sdr_id) return NextResponse.json({ error: 'Campagne et SDR requis' }, { status: 400 })
    if (profile.role === 'sdr' && sdr_id !== user.id) {
      return NextResponse.json({ error: 'SDR non autorisé pour cet appel' }, { status: 403 })
    }

    // ── RBAC: campaign must belong to this org ────────────────────────────────
    const { data: campaign } = await supabase
      .from('campaigns').select('id')
      .eq('id', campaign_id).eq('organization_id', profile.organization_id).single()
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

    // ── RBAC: sdr_id must belong to this org ─────────────────────────────────
    const { data: sdrUser } = await supabase
      .from('users').select('id, role, manager_id')
      .eq('id', sdr_id).eq('organization_id', profile.organization_id).eq('role', 'sdr').single()
    if (!sdrUser) return NextResponse.json({ error: 'SDR non autorisé' }, { status: 403 })
    if (profile.role === 'manager' && sdrUser.manager_id !== user.id) {
      return NextResponse.json({ error: 'SDR hors de votre équipe' }, { status: 403 })
    }

    // Owners have full campaign access; managers/SDRs must have an active assignment.
    // is_campaign_sdr() checks campaign_assignments (the canonical table).
    if (profile.role !== 'owner') {
      const { data: isSdrAssigned } = await supabase.rpc('is_campaign_sdr', {
        p_campaign_id: campaign_id,
        p_user_id: sdr_id,
      })
      if (!isSdrAssigned) {
        return NextResponse.json({ error: 'SDR non assigné à cette campagne' }, { status: 403 })
      }
    }

    // ── Rate limit: 10 analyses per user per hour ─────────────────────────────
    const admin = createAdminClient()
    const windowStart = new Date()
    windowStart.setMinutes(0, 0, 0)
    const { data: rlCount, error: rlErr } = await admin
      .rpc('increment_rate_limit', {
        p_user_id: user.id,
        p_route: '/api/analyze',
        p_window_start: windowStart.toISOString(),
      })
    if (rlErr) console.error('[analyze] rate limit rpc error:', rlErr.message)
    if (!rlErr && rlCount > 10) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. You can analyze up to 10 calls per hour.' },
        { status: 429 }
      )
    }

    // ── Create call + job (auth+RBAC already verified above) ──────────────────
    // Service role bypasses RLS; org boundary enforced by organization_id from verified profile.
    const { data: call, error: callErr } = await admin
      .from('calls')
      .insert({
        organization_id: profile.organization_id,
        campaign_id,
        sdr_id,
        transcript: transcript.trim(),
        call_datetime: call_datetime || new Date().toISOString(),
        idempotency_key: idempotency_key ?? null,
      })
      .select('id').single()
    if (callErr) {
      if (callErr.code === '23505' && idempotency_key) {
        const { data: existing } = await admin
          .from('calls').select('id')
          .eq('organization_id', profile.organization_id)
          .eq('sdr_id', sdr_id).eq('campaign_id', campaign_id)
          .eq('idempotency_key', idempotency_key)
          .single()
        if (existing) {
          const { data: existingJob } = await admin
            .from('analysis_jobs').select('id')
            .eq('call_id', existing.id)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle()
          return NextResponse.json({ call_id: existing.id, job_id: existingJob?.id ?? null, deduplicated: true })
        }
      }
      console.error('[analyze] call insert failed:', callErr?.message)
      return NextResponse.json({ error: 'Erreur création appel' }, { status: 500 })
    }
    if (!call) {
      return NextResponse.json({ error: 'Erreur création appel' }, { status: 500 })
    }

    const { data: job, error: jobErr } = await admin
      .from('analysis_jobs')
      .insert({
        organization_id: profile.organization_id,
        call_id: call.id,
        status: 'pending',
      })
      .select('id').single()
    if (jobErr || !job) {
      console.error('[analyze] job insert failed:', jobErr?.message)
      return NextResponse.json({ error: 'Impossible de créer le job d\'analyse' }, { status: 500 })
    }

    // ── Process after response using Next's request-lifetime primitive ─────
    after(() => processJobById({ id: job.id, call_id: call.id, retry_count: 0 })
      .catch(e => console.error('[analyze] background job error:', e instanceof Error ? e.message : e, '| job:', job.id)))

    return NextResponse.json({ call_id: call.id, job_id: job.id })

  } catch (error) {
    console.error('[analyze] unexpected error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
