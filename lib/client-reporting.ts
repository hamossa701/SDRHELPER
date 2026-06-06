import type { CallAnalysis } from '@/types'
import { isQualifiedAppointment } from '@/lib/review-flags'
import { computeCampaignHealthScore } from '@/lib/review-flags'

// ---- Quality label (client-facing — never expose raw scores) ----
export function appointmentQualityLabel(score: number | null): { label: string; bg: string } {
  if (score === null) return { label: 'Non évalué', bg: 'bg-gray-100 text-gray-500 border-gray-200' }
  if (score >= 75) return { label: 'Haute qualité',    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 50) return { label: 'Qualité correcte', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
  return                  { label: 'À améliorer',      bg: 'bg-amber-50 text-amber-700 border-amber-200' }
}

// ---- Campaign health (client-facing label only, no score) ----
export function clientCampaignHealthLabel(analyses: CallAnalysis[]): { label: string; bg: string } {
  if (analyses.length === 0) return { label: 'En cours',         bg: 'bg-gray-100 text-gray-500 border-gray-200' }
  const { score } = computeCampaignHealthScore(analyses)
  if (score >= 75) return { label: 'Saine',            bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 55) return { label: 'En bonne voie',    bg: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (score >= 40) return { label: 'À surveiller',     bg: 'bg-amber-50 text-amber-700 border-amber-200' }
  return                  { label: 'Attention requise', bg: 'bg-red-50 text-red-700 border-red-200' }
}

// ---- Period filtering ----
export type ReportPeriod = '7d' | '30d' | 'month'

export function filterByPeriod<T extends { call_datetime: string }>(rows: T[], period: ReportPeriod): T[] {
  const now = new Date()
  if (period === 'month') {
    return rows.filter(r => {
      const d = new Date(r.call_datetime)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
  }
  const days = period === '7d' ? 7 : 30
  const cutoff = new Date(now.getTime() - days * 86_400_000)
  return rows.filter(r => new Date(r.call_datetime) >= cutoff)
}

// ---- KPIs ----
export interface ClientKPIs {
  totalCalls: number
  hotWarmContacts: number
  appointmentsBooked: number
  qualifiedAppointments: number
  qualificationRate: number | null
  validatedCount: number
}

export function computeClientKPIs(
  calls: Array<{ call_datetime: string; call_analyses: CallAnalysis | null }>,
): ClientKPIs {
  const analyses  = calls.map(c => c.call_analyses).filter(Boolean) as CallAnalysis[]
  const validated = analyses.filter(a => a.human_validated)
  const booked    = analyses.filter(a => a.appointment_booked).length
  const qualified = validated.filter(a => isQualifiedAppointment(a)).length
  return {
    totalCalls:            calls.length,
    hotWarmContacts:       analyses.filter(a => a.interest_level === 'hot' || a.interest_level === 'warm').length,
    appointmentsBooked:    booked,
    qualifiedAppointments: qualified,
    qualificationRate:     booked > 0 ? Math.round((qualified / booked) * 100) : null,
    validatedCount:        validated.length,
  }
}

// ---- Value report ----
export interface ValueReport {
  topPainPoints:             Array<{ label: string; count: number }>
  topObjections:             Array<{ label: string; count: number }>
  decisionMakerRate:         number | null
  appointmentConversionRate: number | null
}

export function computeValueReport(analyses: CallAnalysis[], totalCalls: number): ValueReport {
  const painCounts: Record<string, number> = {}
  const objCounts:  Record<string, number> = {}
  let dmReached = 0
  let booked    = 0

  const validated = analyses.filter(a => a.human_validated)

  for (const a of analyses) {
    if (a.pain_point_detected && a.pain_point_details) {
      const key = a.pain_point_details.slice(0, 80)
      painCounts[key] = (painCounts[key] || 0) + 1
    }
    if (a.objection_detected && a.objection_type) {
      objCounts[a.objection_type] = (objCounts[a.objection_type] || 0) + 1
    }
  }

  for (const a of validated) {
    if (a.decision_maker_detected) dmReached++
    if (a.appointment_booked)      booked++
  }

  return {
    topPainPoints: Object.entries(painCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([label, count]) => ({ label, count })),
    topObjections: Object.entries(objCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([label, count]) => ({ label, count })),
    decisionMakerRate:
      validated.length > 0 ? Math.round((dmReached / validated.length) * 100) : null,
    appointmentConversionRate:
      validated.length > 0 ? Math.round((booked / validated.length) * 100) : null,
  }
}

// ---- Executive summary (French, uses validated data when available) ----
export function generateExecutiveSummary(analyses: CallAnalysis[], totalCalls: number): string {
  if (analyses.length === 0 && totalCalls === 0) {
    return "Aucune donnée disponible pour cette période."
  }

  const validated = analyses.filter(a => a.human_validated)
  const src = validated.length >= 3 ? validated : analyses

  const booked    = src.filter(a => a.appointment_booked).length
  const qualified = src.filter(a => isQualifiedAppointment(a)).length
  const dmReached = src.filter(a => a.decision_maker_detected).length
  const dmRate    = src.length > 0 ? Math.round((dmReached / src.length) * 100) : 0

  const painCounts: Record<string, number> = {}
  for (const a of src) {
    if (a.pain_point_detected && a.pain_point_details) {
      const key = a.pain_point_details.slice(0, 80)
      painCounts[key] = (painCounts[key] || 0) + 1
    }
  }
  const topPain = Object.entries(painCounts).sort((a, b) => b[1] - a[1])[0]

  const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  let s = `Ce mois-ci (${month}), ${totalCalls} appel${totalCalls !== 1 ? 's' : ''} ont été traités`
  if (booked > 0) {
    s += `, dont ${booked} rendez-vous posé${booked !== 1 ? 's' : ''}`
    if (qualified > 0) {
      s += `. ${qualified} ${qualified !== 1 ? 'répondent' : 'répond'} à l'ensemble des critères de qualification`
    }
  }
  s += '.'
  if (topPain) {
    s += ` La problématique la plus fréquemment identifiée est : « ${topPain[0]} ».`
  }
  if (dmRate > 0) {
    s += ` Les décideurs ont été atteints dans ${dmRate}% des conversations.`
  }

  return s
}
