export type EvaluationTemperature = 'cold' | 'warm' | 'hot' | 'unclear'
export type EvaluationField = 'decision_maker' | 'rdv_pose' | 'rdv_qualifie' | 'temperature'

export interface EvaluationJudgment {
  decision_maker: boolean | null
  rdv_pose: boolean
  rdv_qualifie: boolean
  temperature: EvaluationTemperature
}

export interface EvaluationComparison {
  score: number
  passed: boolean
  mismatches: EvaluationField[]
}

export interface EvaluationAIShape {
  prospect?: {
    decision_maker_detected?: boolean | null
  }
  qualification?: {
    pain_point_detected?: boolean | null
    interest_level?: EvaluationTemperature | null
  }
  appointment?: {
    appointment_booked?: boolean | null
    appointment_date_text?: string | null
    appointment_datetime?: string | null
    appointment_quality_score?: number | null
  }
}

const WEIGHTS: Record<EvaluationField, number> = {
  decision_maker: 25,
  rdv_pose: 25,
  rdv_qualifie: 35,
  temperature: 15,
}

export function scoreEvaluationComparison(
  expected: EvaluationJudgment,
  actual: EvaluationJudgment,
): EvaluationComparison {
  const mismatches: EvaluationField[] = []

  if (expected.decision_maker !== actual.decision_maker) mismatches.push('decision_maker')
  if (expected.rdv_pose !== actual.rdv_pose) mismatches.push('rdv_pose')
  if (expected.rdv_qualifie !== actual.rdv_qualifie) mismatches.push('rdv_qualifie')
  if (expected.temperature !== actual.temperature) mismatches.push('temperature')

  const penalty = mismatches.reduce((sum, field) => sum + WEIGHTS[field], 0)
  const score = Math.max(0, 100 - penalty)

  return {
    score,
    passed: mismatches.length === 0,
    mismatches,
  }
}

const VALID_TEMPERATURES = new Set<string>(['cold', 'warm', 'hot', 'unclear'])

export function mapAIAnalysisToEvaluationJudgment(analysis: EvaluationAIShape): EvaluationJudgment {
  const appointmentBooked = analysis.appointment?.appointment_booked === true
  const decisionMaker = analysis.prospect?.decision_maker_detected ?? null
  const painPoint = analysis.qualification?.pain_point_detected === true
  const hasAppointmentDate = Boolean(
    analysis.appointment?.appointment_datetime || analysis.appointment?.appointment_date_text?.trim(),
  )
  const appointmentQuality = analysis.appointment?.appointment_quality_score ?? null
  const rawTemp = analysis.qualification?.interest_level
  const temperature: EvaluationTemperature = rawTemp && VALID_TEMPERATURES.has(rawTemp) ? rawTemp as EvaluationTemperature : 'unclear'

  return {
    decision_maker: decisionMaker,
    rdv_pose: appointmentBooked,
    rdv_qualifie: appointmentBooked
      && decisionMaker === true
      && painPoint
      && hasAppointmentDate
      && appointmentQuality !== null
      && appointmentQuality >= 60,
    temperature,
  }
}

export function formatEvaluationField(field: EvaluationField): string {
  const labels: Record<EvaluationField, string> = {
    decision_maker: 'Décideur',
    rdv_pose: 'RDV posé',
    rdv_qualifie: 'RDV qualifié',
    temperature: 'Température',
  }
  return labels[field]
}
