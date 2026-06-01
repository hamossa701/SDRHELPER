import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { analyzeCallTranscript } from '@/lib/ai-analysis'
import { createAdminClient } from '@/lib/supabase-admin'
import { mapAIAnalysisToEvaluationJudgment, scoreEvaluationComparison } from '@/lib/evaluation'
import type { EvaluationCase } from '@/types'

export const runtime = 'nodejs'

const EVALUATION_MODEL = 'claude-sonnet-4-5'

function expectedJudgment(testCase: EvaluationCase) {
  return {
    decision_maker: testCase.expected_decision_maker,
    rdv_pose: testCase.expected_rdv_pose,
    rdv_qualifie: testCase.expected_rdv_qualifie,
    temperature: testCase.expected_temperature,
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    },
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') {
    return NextResponse.json({ error: 'Reserve au proprietaire' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { case_id?: string }
  const admin = createAdminClient()

  let query = admin
    .from('evaluation_cases')
    .select('*')
    .order('created_at', { ascending: true })

  if (body.case_id) query = query.eq('id', body.case_id)

  const { data: cases, error: casesErr } = await query
  if (casesErr) return NextResponse.json({ error: casesErr.message }, { status: 500 })

  const runId = crypto.randomUUID()
  const results = []

  for (const testCase of (cases ?? []) as EvaluationCase[]) {
    try {
      const ai = await analyzeCallTranscript(testCase.transcript, {
        client_name: 'Gold Dataset SDRHELPER',
        sector: 'Telecom B2B',
        offer_description: 'Audit telecom, optimisation fibre, mobile et telephonie cloud',
        target_persona: 'DAF, DSI, DG, responsable achats ou operations',
        call_datetime: new Date().toISOString(),
      })
      const actual = mapAIAnalysisToEvaluationJudgment(ai.analysis)
      const comparison = scoreEvaluationComparison(expectedJudgment(testCase), actual)
      const hallucinationRisk = ai.analysis.risk_control?.hallucination_risk
      const aiConfidence = ai.analysis.risk_control?.ai_confidence ?? 100
      const hardCap = hallucinationRisk === 'high' || testCase.category === 'wrong_contact' || aiConfidence < 40
      const scoreCap = hardCap ? 30 : hallucinationRisk === 'medium' ? 65 : 100
      const finalScore = Math.min(comparison.score, scoreCap)

      const row = {
        case_id: testCase.id,
        run_id: runId,
        model: EVALUATION_MODEL,
        actual_decision_maker: actual.decision_maker,
        actual_rdv_pose: actual.rdv_pose,
        actual_rdv_qualifie: actual.rdv_qualifie,
        actual_temperature: actual.temperature,
        score: finalScore,
        passed: comparison.passed,
        mismatches: comparison.mismatches,
        ai_summary: ai.analysis.call_summary,
        ai_reason: ai.analysis.appointment.quality_reason,
        input_tokens: ai.inputTokens,
        output_tokens: ai.outputTokens,
        created_by: user.id,
      }

      const { data: inserted, error: insertErr } = await admin
        .from('evaluation_results')
        .insert(row)
        .select('*')
        .single()

      if (insertErr) throw insertErr
      results.push(inserted)
    } catch (error) {
      console.error(`[EvalRun] case ${testCase.id} failed:`, error)
      const message = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : typeof error === 'string'
            ? error
            : `Erreur inconnue: ${JSON.stringify(error)}`
      const { data: inserted } = await admin
        .from('evaluation_results')
        .insert({
          case_id: testCase.id,
          run_id: runId,
          model: EVALUATION_MODEL,
          score: 0,
          passed: false,
          mismatches: ['analysis_error'],
          error_message: message,
          created_by: user.id,
        })
        .select('*')
        .single()

      results.push(inserted ?? { case_id: testCase.id, error_message: message })
    }
  }

  return NextResponse.json({ run_id: runId, count: results.length, results })
}
