import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { analyzeCallTranscript } from '@/lib/ai-analysis'

const COST_PER_INPUT_TOKEN  = 3  / 1_000_000
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000

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
    if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile || !['owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { jobId } = await request.json()
    if (!jobId) return NextResponse.json({ error: 'jobId requis' }, { status: 400 })

    const { data: job } = await supabase
      .from('analysis_jobs').select('*')
      .eq('id', jobId).eq('organization_id', profile.organization_id).single()

    if (!job) return NextResponse.json({ error: 'Job introuvable' }, { status: 404 })
    if (job.status !== 'failed') {
      return NextResponse.json({ error: 'Seuls les jobs échoués peuvent être relancés' }, { status: 409 })
    }
    if (!job.call_id) {
      return NextResponse.json({ error: 'Pas d\'appel associé' }, { status: 422 })
    }

    const { data: call } = await supabase
      .from('calls')
      .select('*, campaigns(client_name, sector, offer_description, target_persona)')
      .eq('id', job.call_id).eq('organization_id', profile.organization_id).single()

    if (!call || !call.transcript?.trim()) {
      return NextResponse.json({ error: 'Transcription introuvable' }, { status: 422 })
    }

    // If analysis already exists, just mark the job done
    const { data: existing } = await supabase
      .from('call_analyses').select('id').eq('call_id', call.id).maybeSingle()
    if (existing) {
      await supabase.from('analysis_jobs').update({
        status: 'completed', completed_at: new Date().toISOString(), error_message: null,
      }).eq('id', jobId)
      return NextResponse.json({ ok: true, call_id: call.id })
    }

    await supabase.from('analysis_jobs').update({
      status: 'processing',
      started_at: new Date().toISOString(),
      error_message: null,
      retry_count: (job.retry_count || 0) + 1,
    }).eq('id', jobId)

    const campaign = (call as any).campaigns
    const { analysis, inputTokens, outputTokens } = await analyzeCallTranscript(call.transcript, {
      client_name:       campaign?.client_name,
      sector:            campaign?.sector,
      offer_description: campaign?.offer_description,
      target_persona:    campaign?.target_persona,
    })

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

    if (analysisErr) {
      await supabase.from('analysis_jobs').update({
        status: 'failed',
        error_message: analysisErr.message,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId)
      return NextResponse.json({ error: analysisErr.message }, { status: 500 })
    }

    const estimatedCost = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN
    await supabase.from('ai_usage_log').insert({
      organization_id: profile.organization_id,
      call_id: call.id, job_id: jobId,
      model: 'claude-sonnet-4-5',
      input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
    })

    await supabase.from('analysis_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', jobId)

    return NextResponse.json({ ok: true, call_id: call.id })
  } catch (err) {
    console.error('analyze/retry error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
