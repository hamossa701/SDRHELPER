import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { analyzeCallTranscript } from '@/lib/ai-analysis'

const COST_PER_INPUT_TOKEN  = 3  / 1_000_000  // $3 per million
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000  // $15 per million
const MAX_RETRIES           = 3
// Backoff per attempt number: 30s, 2min, 5min
const BACKOFF_SECONDS       = [30, 120, 300] as const

export async function POST(request: NextRequest) {
  // ── Auth: worker secret only (never exposed to browser) ──────────────────
  const secret = request.headers.get('x-worker-secret')
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── Claim a batch of pending jobs atomically ──────────────────────────────
  // FOR UPDATE SKIP LOCKED inside claim_analysis_jobs ensures concurrent
  // worker invocations never claim the same job.
  const { data: jobs, error: claimErr } = await supabase
    .rpc('claim_analysis_jobs', { p_batch_size: 3 })

  if (claimErr) {
    console.error('claim_analysis_jobs error:', claimErr)
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }

  if (!jobs?.length) {
    console.log('[worker] no pending jobs')
    return NextResponse.json({ processed: 0, results: [] })
  }
  console.log(`[worker] claimed ${jobs.length} job(s):`, jobs.map((j: any) => j.id))

  const results: Array<{ job_id: string; outcome: string }> = []

  for (const job of jobs) {
    const outcome = await processOneJob(supabase, job)
    results.push({ job_id: job.id, outcome })
  }

  return NextResponse.json({ processed: results.length, results })
}

async function processOneJob(supabase: ReturnType<typeof createAdminClient>, job: any) {
  const tag = `[worker][${job.id}]`
  try {
    console.log(`[JOB PROCESSING STARTED] job_id:${job.id} call_id:${job.call_id}`)
    // ── Mark processing ─────────────────────────────────────────────────────
    await supabase.from('analysis_jobs').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', job.id)

    // ── Fetch call + campaign ───────────────────────────────────────────────
    console.log(`[TRANSCRIPTION STARTED] ${tag} fetching call row`)
    const { data: call, error: callErr } = await supabase
      .from('calls')
      .select('id, transcript, organization_id, campaigns(client_name, sector, offer_description, target_persona)')
      .eq('id', job.call_id)
      .single()

    if (callErr || !call) throw new Error(`Appel introuvable: ${callErr?.message}`)
    if (!call.transcript?.trim()) throw new Error('Transcription vide')
    console.log(`[TRANSCRIPTION DONE] ${tag} ${call.transcript.length} chars`)

    // ── Run AI analysis ─────────────────────────────────────────────────────
    console.log(`[AI ANALYSIS STARTED] ${tag} calling claude-sonnet-4-5`)
    const campaign = (call as any).campaigns ?? {}
    const { analysis, inputTokens, outputTokens } = await analyzeCallTranscript(
      call.transcript,
      {
        client_name:       campaign.client_name,
        sector:            campaign.sector,
        offer_description: campaign.offer_description,
        target_persona:    campaign.target_persona,
      }
    )
    console.log(`[AI ANALYSIS DONE] ${tag} in:${inputTokens} out:${outputTokens} tokens`)

    // ── Store analysis ──────────────────────────────────────────────────────
    console.log(`[SUPABASE SAVE STARTED] ${tag} inserting call_analyses`)
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

    if (analysisErr) throw new Error(`Stockage analyse : ${analysisErr.message}`)
    console.log(`[SUPABASE SAVE DONE] ${tag} call_analyses saved`)

    // ── Log AI cost ─────────────────────────────────────────────────────────
    const estimatedCost = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN
    await supabase.from('ai_usage_log').insert({
      organization_id:    call.organization_id,
      call_id:            call.id,
      job_id:             job.id,
      model:              'claude-sonnet-4-5',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      estimated_cost_usd: estimatedCost,
    })

    // ── Mark completed ──────────────────────────────────────────────────────
    await supabase.from('analysis_jobs').update({
      status:        'completed',
      completed_at:  new Date().toISOString(),
      error_message: null,
    }).eq('id', job.id)
    console.log(`[JOB COMPLETED] job_id:${job.id}`)

    return 'completed'

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    const newCount = (job.retry_count ?? 0) + 1
    const permanent = newCount >= MAX_RETRIES
    console.error(`[JOB FAILED] job_id:${job.id} attempt:${newCount}/${MAX_RETRIES} permanent:${permanent} error: ${message}`)

    const backoffIdx = Math.min(newCount - 1, BACKOFF_SECONDS.length - 1)
    const retryAfter = permanent
      ? null
      : new Date(Date.now() + BACKOFF_SECONDS[backoffIdx] * 1000).toISOString()

    await supabase.from('analysis_jobs').update({
      status:        permanent ? 'failed' : 'pending',
      retry_count:   newCount,
      retry_after:   retryAfter,
      error_message: message,
      completed_at:  permanent ? new Date().toISOString() : null,
      started_at:    null,
    }).eq('id', job.id)

    console.error(`job ${job.id} attempt ${newCount}/${MAX_RETRIES} failed:`, message)
    return permanent ? 'failed' : `pending_retry_${BACKOFF_SECONDS[backoffIdx]}s`
  }
}
