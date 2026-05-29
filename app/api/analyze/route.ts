import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { analyzeCallTranscript } from '@/lib/ai-analysis'

// Claude Sonnet 4.5 pricing
const COST_PER_INPUT_TOKEN  = 3  / 1_000_000   // $3  per million
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000   // $15 per million

export async function POST(request: NextRequest) {
  let jobId: string | null = null

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
      .from('campaigns').select('*')
      .eq('id', campaign_id).eq('organization_id', profile.organization_id).single()
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })

    // ── RBAC: sdr_id must belong to this org (Part 7 fix) ────────────────────
    const { data: sdrUser } = await supabase
      .from('users').select('id')
      .eq('id', sdr_id).eq('organization_id', profile.organization_id).single()
    if (!sdrUser) return NextResponse.json({ error: 'SDR non autorisé' }, { status: 403 })

    // ── Create job record — every submission is tracked (Part 1) ─────────────
    const { data: job, error: jobErr } = await supabase
      .from('analysis_jobs')
      .insert({ organization_id: profile.organization_id, status: 'pending' })
      .select('id').single()
    if (jobErr || !job) return NextResponse.json({ error: 'Impossible de créer le job' }, { status: 500 })
    jobId = job.id

    // ── Insert call ───────────────────────────────────────────────────────────
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

    if (callErr || !call) throw new Error(callErr?.message || 'Erreur création appel')

    // ── Mark job as processing ────────────────────────────────────────────────
    await supabase.from('analysis_jobs').update({
      status: 'processing',
      call_id: call.id,
      started_at: new Date().toISOString(),
    }).eq('id', jobId)

    // ── Run AI analysis ───────────────────────────────────────────────────────
    const { analysis, inputTokens, outputTokens } = await analyzeCallTranscript(transcript, {
      client_name:       campaign.client_name,
      sector:            campaign.sector,
      offer_description: campaign.offer_description,
      target_persona:    campaign.target_persona,
    })

    // ── Store analysis ────────────────────────────────────────────────────────
    const { error: analysisErr } = await supabase.from('call_analyses').insert({
      call_id: call.id,
      call_summary: analysis.call_summary,

      prospect_company:        analysis.prospect.company,
      contact_name:            analysis.prospect.contact_name,
      contact_role:            analysis.prospect.contact_role,
      decision_maker_detected: analysis.prospect.decision_maker_detected,

      pain_point_detected: analysis.qualification.pain_point_detected,
      pain_point_details:  analysis.qualification.pain_point_details,
      urgency:             analysis.qualification.urgency,
      current_solution:    analysis.qualification.current_solution,
      interest_level:      analysis.qualification.interest_level,
      objection_detected:  analysis.qualification.objection_detected,
      objection_type:      analysis.qualification.objection_type,
      objection_details:   analysis.qualification.objection_details,
      missing_information: analysis.qualification.missing_information,

      appointment_booked:         analysis.appointment.appointment_booked,
      appointment_datetime:       analysis.appointment.appointment_datetime,
      appointment_quality_score:  analysis.appointment.appointment_quality_score,
      appointment_quality_reason: analysis.appointment.quality_reason,
      next_step:                  analysis.appointment.next_step,

      sdr_quality_score:                analysis.sdr_performance.sdr_quality_score,
      qualification_completeness_score: analysis.sdr_performance.qualification_completeness_score,
      strengths:                        analysis.sdr_performance.strengths,
      weaknesses:                       analysis.sdr_performance.weaknesses,
      coaching_recommendations:         analysis.sdr_performance.coaching_recommendations,

      ai_confidence:      analysis.risk_control.ai_confidence,
      hallucination_risk: analysis.risk_control.hallucination_risk,
      uncertain_fields:   analysis.risk_control.uncertain_fields,

      human_validated: false,
    })

    if (analysisErr) throw new Error(`Erreur stockage analyse : ${analysisErr.message}`)

    // ── Log AI cost (Part 6) ──────────────────────────────────────────────────
    const estimatedCost = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN
    await supabase.from('ai_usage_log').insert({
      organization_id:    profile.organization_id,
      call_id:            call.id,
      job_id:             jobId,
      model:              'claude-sonnet-4-5',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      estimated_cost_usd: estimatedCost,
    })

    // ── Complete job ──────────────────────────────────────────────────────────
    await supabase.from('analysis_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    return NextResponse.json({ call_id: call.id, job_id: jobId })

  } catch (error) {
    // ── Explicit failure — no silent data loss (Part 1 fix) ───────────────────
    if (jobId) {
      await supabase.from('analysis_jobs').update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Erreur inconnue',
        completed_at:  new Date().toISOString(),
      }).eq('id', jobId)
    }
    console.error('analyze route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur', job_id: jobId },
      { status: 500 }
    )
  }
}
