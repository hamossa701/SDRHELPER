import type { CallAnalysis } from '@/types'

export interface ReviewFlagsResult {
  flags: string[]
  review_required: boolean
}

// Part 1 — compute automatic review flags from an analysis
export function computeReviewFlags(a: CallAnalysis): ReviewFlagsResult {
  const flags: string[] = []

  if (a.appointment_booked && !a.decision_maker_detected) {
    flags.push('RDV posé mais décideur non confirmé')
  }
  if (a.appointment_booked && a.appointment_quality_score !== null && a.appointment_quality_score < 60) {
    flags.push('RDV posé mais score qualité faible')
  }
  if (a.appointment_booked && !a.appointment_datetime) {
    flags.push('RDV posé mais date manquante')
  }
  if (a.appointment_booked && !a.pain_point_detected) {
    flags.push('RDV posé mais besoin non identifié')
  }
  if (a.ai_confidence !== null && a.ai_confidence < 70) {
    flags.push('Confiance IA faible')
  }
  if (a.hallucination_risk === 'medium' || a.hallucination_risk === 'high') {
    flags.push('Risque hallucination IA')
  }
  if (a.qualification_completeness_score !== null && a.qualification_completeness_score < 60) {
    flags.push('Qualification incomplète')
  }
  if (a.objection_detected && !a.objection_details) {
    flags.push('Objection sans détail de traitement')
  }
  if (!a.next_step) {
    flags.push('Prochaine étape manquante')
  }

  return { flags, review_required: flags.length > 0 }
}

// Part 2 — qualified appointment: all conditions must be met
export function isQualifiedAppointment(a: CallAnalysis): boolean {
  return (
    a.appointment_booked === true &&
    a.decision_maker_detected === true &&
    a.pain_point_detected === true &&
    !!a.appointment_datetime &&
    a.appointment_quality_score !== null &&
    a.appointment_quality_score >= 60
  )
}

// Part 3 — campaign health score (0-100) with label
export interface CampaignHealthResult {
  score: number
  label: string
  labelClass: string
  labelBg: string
}

export function computeCampaignHealthScore(analyses: CallAnalysis[]): CampaignHealthResult {
  if (analyses.length === 0) {
    return { score: 0, label: 'Pas de données', labelClass: 'text-gray-400', labelBg: 'bg-gray-100 text-gray-500 border-gray-200' }
  }

  const withAppointments = analyses.filter(a => a.appointment_booked)
  const qualified = analyses.filter(a => isQualifiedAppointment(a))

  const avgApptQuality = withAppointments.length > 0
    ? withAppointments.reduce((s, a) => s + (a.appointment_quality_score ?? 0), 0) / withAppointments.length
    : 0

  const avgSdrQuality =
    analyses.reduce((s, a) => s + (a.sdr_quality_score ?? 0), 0) / analyses.length

  const qualificationRate = withAppointments.length > 0
    ? qualified.length / withAppointments.length
    : 0

  const avgAiConfidence =
    analyses.reduce((s, a) => s + (a.ai_confidence ?? 0), 0) / analyses.length

  const score = Math.round(
    0.40 * avgApptQuality +
    0.25 * avgSdrQuality +
    0.20 * (qualificationRate * 100) +
    0.15 * avgAiConfidence
  )

  if (score >= 80) return { score, label: 'Très saine',    labelClass: 'text-emerald-600', labelBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 65) return { score, label: 'Correcte',      labelClass: 'text-blue-600',    labelBg: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (score >= 50) return { score, label: 'À surveiller',  labelClass: 'text-amber-600',   labelBg: 'bg-amber-50 text-amber-700 border-amber-200' }
  return             { score, label: 'Critique',        labelClass: 'text-red-600',     labelBg: 'bg-red-50 text-red-700 border-red-200' }
}

// Part 4 — criticality rank for sorting the review queue (lower = more critical)
export function reviewCriticalityRank(a: CallAnalysis): number {
  if (a.hallucination_risk === 'high') return 0
  if (a.appointment_booked && !a.decision_maker_detected) return 1
  if (a.appointment_booked && a.appointment_quality_score !== null && a.appointment_quality_score < 60) return 2
  if (!a.next_step) return 3
  if (a.ai_confidence !== null && a.ai_confidence < 70) return 4
  return 5
}
