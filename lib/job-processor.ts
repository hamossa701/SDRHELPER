import { createAdminClient } from '@/lib/supabase-admin'
import { analyzeCallTranscript } from '@/lib/ai-analysis'

const COST_PER_INPUT_TOKEN  = 3  / 1_000_000
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000
const MAX_RETRIES           = 3
const BACKOFF_SECONDS       = [30, 120, 300] as const

export interface JobInput {
  id:           string
  call_id:      string
  retry_count?: number
}

// ── Response sanitizers ──────────────────────────────────────────────────────
// The AI may return values that violate Postgres CHECK constraints or type
// expectations. Sanitize before every insert to prevent silent failures.

function parseAppointmentDatetime(val: unknown): string | null {
  if (!val || typeof val !== 'string') return null
  const d = new Date(val)
  // Relative strings like "Jeudi prochain à 14h" produce NaN — drop them.
  return isNaN(d.getTime()) ? null : d.toISOString()
}

const VALID_INTEREST = new Set(['cold', 'warm', 'hot', 'unclear'])
const VALID_HALLUC   = new Set(['low', 'medium', 'high'])

function safeInterestLevel(val: unknown): string {
  return VALID_INTEREST.has(val as string) ? (val as string) : 'cold'
}

function safeHallucinationRisk(val: unknown): string {
  return VALID_HALLUC.has(val as string) ? (val as string) : 'low'
}

function safeScore(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const n = Math.round(Number(val))
  return isNaN(n) ? null : Math.max(0, Math.min(100, n))
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function processJobById(job: JobInput): Promise<string> {
  const admin = createAdminClient()
  const tag   = `[worker][${job.id}]`
  const t0    = Date.now()

  try {
    console.log(`[JOB PROCESSING STARTED] job_id:${job.id} call_id:${job.call_id}`)

    await admin
      .from('analysis_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id)

    // ── Fetch transcript + campaign context ──────────────────────────────────
    const t1 = Date.now()
    console.log(`[TRANSCRIPTION STARTED] ${tag}`)
    const { data: call, error: callErr } = await admin
      .from('calls')
      .select('id, transcript, organization_id, campaigns(client_name, sector, offer_description, target_persona)')
      .eq('id', job.call_id)
      .single()

    if (callErr || !call) throw new Error(`Appel introuvable: ${callErr?.message}`)
    if (!call.transcript?.trim()) throw new Error('Transcription vide')
    console.log(`[TRANSCRIPTION DONE] ${tag} ${call.transcript.length} chars — ${Date.now() - t1}ms`)

    // ── Call the AI ──────────────────────────────────────────────────────────
    const t2 = Date.now()
    console.log(`[AI ANALYSIS STARTED] ${tag} model=claude-sonnet-4-5`)
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
    console.log(`[AI ANALYSIS DONE] ${tag} in:${inputTokens} out:${outputTokens} tokens — ${Date.now() - t2}ms`)

    // ── Sanitize AI response ─────────────────────────────────────────────────
    const appointmentDatetime = parseAppointmentDatetime(analysis.appointment.appointment_datetime)
    if (analysis.appointment.appointment_datetime && !appointmentDatetime) {
      console.warn(`${tag} appointment_datetime not ISO-parseable: "${analysis.appointment.appointment_datetime}" — stored as null`)
    }

    // ── Persist to call_analyses (linked by call_id, not job_id) ────────────
    const t3 = Date.now()
    console.log(`[SUPABASE SAVE STARTED] ${tag}`)
    const { error: insertErr } = await admin.from('call_analyses').insert({
      call_id: call.id,
      call_summary: analysis.call_summary ?? null,

      prospect_company:        analysis.prospect.company ?? null,
      contact_name:            analysis.prospect.contact_name ?? null,
      contact_role:            analysis.prospect.contact_role ?? null,
      decision_maker_detected: analysis.prospect.decision_maker_detected ?? null,

      pain_point_detected: analysis.qualification.pain_point_detected ?? null,
      pain_point_details:  analysis.qualification.pain_point_details ?? null,
      urgency:             analysis.qualification.urgency ?? null,
      current_solution:    analysis.qualification.current_solution ?? null,
      interest_level:      safeInterestLevel(analysis.qualification.interest_level),
      objection_detected:  analysis.qualification.objection_detected ?? false,
      objection_type:      analysis.qualification.objection_type ?? null,
      objection_details:   analysis.qualification.objection_details ?? null,
      missing_information: analysis.qualification.missing_information ?? [],

      appointment_booked:         analysis.appointment.appointment_booked ?? false,
      appointment_datetime:       appointmentDatetime,
      appointment_quality_score:  safeScore(analysis.appointment.appointment_quality_score),
      appointment_quality_reason: analysis.appointment.quality_reason ?? null,
      next_step:                  analysis.appointment.next_step ?? null,

      sdr_quality_score:                safeScore(analysis.sdr_performance.sdr_quality_score),
      qualification_completeness_score: safeScore(analysis.sdr_performance.qualification_completeness_score),
      strengths:                        analysis.sdr_performance.strengths ?? [],
      weaknesses:                       analysis.sdr_performance.weaknesses ?? [],
      coaching_recommendations:         analysis.sdr_performance.coaching_recommendations ?? [],

      ai_confidence:      safeScore(analysis.risk_control.ai_confidence),
      hallucination_risk: safeHallucinationRisk(analysis.risk_control.hallucination_risk),
      uncertain_fields:   analysis.risk_control.uncertain_fields ?? [],

      human_validated: false,
    })

    if (insertErr) throw new Error(`Stockage analyse: ${insertErr.message} (code=${insertErr.code})`)
    console.log(`[SUPABASE SAVE DONE] ${tag} — ${Date.now() - t3}ms`)

    // ── Log AI cost ──────────────────────────────────────────────────────────
    const estimatedCost = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN
    await admin.from('ai_usage_log').insert({
      organization_id:    call.organization_id,
      call_id:            call.id,
      job_id:             job.id,
      model:              'claude-sonnet-4-5',
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      estimated_cost_usd: estimatedCost,
    })

    // ── Mark completed ───────────────────────────────────────────────────────
    await admin
      .from('analysis_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), error_message: null })
      .eq('id', job.id)
    console.log(`[JOB COMPLETED] job_id:${job.id} call_id:${job.call_id} total:${Date.now() - t0}ms`)

    return 'completed'

  } catch (err) {
    const message   = err instanceof Error ? err.message : String(err)
    const newCount  = (job.retry_count ?? 0) + 1
    const permanent = newCount >= MAX_RETRIES
    console.error(`[JOB FAILED] job_id:${job.id} attempt:${newCount}/${MAX_RETRIES} permanent:${permanent} total:${Date.now() - t0}ms — ${message}`)

    const backoffIdx = Math.min(newCount - 1, BACKOFF_SECONDS.length - 1)
    const retryAfter = permanent ? null : new Date(Date.now() + BACKOFF_SECONDS[backoffIdx] * 1000).toISOString()

    await admin.from('analysis_jobs').update({
      status:        permanent ? 'failed' : 'pending',
      retry_count:   newCount,
      retry_after:   retryAfter,
      error_message: message,
      completed_at:  permanent ? new Date().toISOString() : null,
      started_at:    null,
    }).eq('id', job.id)

    return permanent ? 'failed' : 'pending_retry'
  }
}
