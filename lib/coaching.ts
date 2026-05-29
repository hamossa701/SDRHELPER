import type { Call, CallAnalysis, User } from '@/types'
import { computeReviewFlags, isQualifiedAppointment } from './review-flags'

// ── Types ────────────────────────────────────────────────────────────────────

export type TrendDirection = 'improving' | 'stable' | 'declining'

export interface SkillBreakdown {
  opening: number
  discovery: number
  pain_point: number
  objection_handling: number
  qualification: number
  closing: number
}

export interface CoachingPriority {
  label: string
  severity: 'high' | 'medium'
}

export interface CoachingCall {
  callId: string
  callDate: string
  prospect: string
  campaign: string
  reason: string
  score: number | null
  type: 'positive' | 'negative'
}

export interface SDRProfile {
  sdrId: string
  sdrName: string
  totalCalls: number
  avgSdrQuality: number | null
  avgAppointmentQuality: number | null
  qualificationRate: number | null
  reviewFlagRate: number | null
  avgAiConfidence: number | null
  callsReviewed: number
  trend: TrendDirection
  skills: SkillBreakdown
  priorities: CoachingPriority[]
  coachingCalls: CoachingCall[]
  category: 'top' | 'stable' | 'needs_coaching'
}

type CallRow = Call & {
  call_analyses: CallAnalysis
  campaigns: { campaign_name: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeAvg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function interestToScore(level: string | null): number {
  if (level === 'hot')  return 90
  if (level === 'warm') return 65
  if (level === 'cold') return 30
  return 15
}

// ── Part 2: Skill breakdown ─ derived from existing extracted fields only ─────

export function computeSkillBreakdown(analyses: CallAnalysis[]): SkillBreakdown {
  if (analyses.length === 0)
    return { opening: 0, discovery: 0, pain_point: 0, objection_handling: 0, qualification: 0, closing: 0 }

  const opening = safeAvg(analyses.map(a =>
    Math.round(interestToScore(a.interest_level) * 0.5 + (a.sdr_quality_score ?? 50) * 0.5)
  )) ?? 0

  const discovery = safeAvg(analyses.map(a => {
    let s = 0
    if (a.decision_maker_detected) s += 25
    if (a.pain_point_detected)     s += 25
    if (a.urgency)                 s += 25
    if (a.current_solution)        s += 25
    return s
  })) ?? 0

  const pain_point = safeAvg(analyses.map(a => {
    let s = 0
    if (a.pain_point_detected) s += 50
    if (a.pain_point_details)  s += 30
    if (a.urgency)             s += 20
    return s
  })) ?? 0

  const objection_handling = safeAvg(analyses.map(a => {
    if (!a.objection_detected) return 70
    if (a.objection_details)   return Math.min(90, (a.sdr_quality_score ?? 50) + 10)
    return 25
  })) ?? 0

  const qualification = safeAvg(analyses.map(a => a.qualification_completeness_score ?? 0)) ?? 0

  const closing = safeAvg(analyses.map(a => {
    let s = 0
    if (a.appointment_booked) s += 60
    if (a.next_step)          s += 40
    return s
  })) ?? 0

  return { opening, discovery, pain_point, objection_handling, qualification, closing }
}

// ── Part 3: Coaching priorities ─ from scores + flags only, never invented ───

export function computeCoachingPriorities(
  analyses: CallAnalysis[],
  skills: SkillBreakdown
): CoachingPriority[] {
  if (analyses.length === 0) return []

  const candidates: CoachingPriority[] = []
  const withAppt = analyses.filter(a => a.appointment_booked)
  const withObj  = analyses.filter(a => a.objection_detected)
  const rate = (arr: CallAnalysis[], pred: (a: CallAnalysis) => boolean) =>
    arr.length > 0 ? arr.filter(pred).length / arr.length : 0

  if (rate(withAppt, a => !a.decision_maker_detected) > 0.4)
    candidates.push({ label: 'Échoue fréquemment à confirmer le décideur', severity: 'high' })

  if (rate(withAppt, a => !a.pain_point_detected) > 0.3)
    candidates.push({ label: 'RDV posés sans besoin identifié', severity: 'high' })

  if (rate(analyses, a => !a.next_step) > 0.5)
    candidates.push({ label: 'Prochaines étapes souvent manquantes', severity: 'high' })

  if (rate(withObj, a => !a.objection_details) > 0.4)
    candidates.push({ label: 'Objections détectées mais non détaillées', severity: 'high' })
  else if (skills.objection_handling < 55)
    candidates.push({ label: 'Traitement des objections insuffisant', severity: 'medium' })

  if (skills.qualification < 55)
    candidates.push({ label: 'Qualification incomplète sur la majorité des appels', severity: 'medium' })

  if (skills.discovery < 50)
    candidates.push({ label: 'Découverte insuffisante — décideur, besoin, urgence non explorés', severity: 'medium' })

  const avgSdr = safeAvg(analyses.map(a => a.sdr_quality_score ?? 0))
  if (avgSdr !== null && avgSdr < 50)
    candidates.push({ label: 'Score SDR globalement faible — revoir la structure des appels', severity: 'medium' })

  const avgApptQ = safeAvg(withAppt.map(a => a.appointment_quality_score ?? 0))
  if (avgApptQ !== null && avgApptQ < 50)
    candidates.push({ label: 'Qualité des RDV posés trop faible', severity: 'medium' })

  return candidates
    .sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1))
    .slice(0, 3)
}

// ── Part 1: Trend ─────────────────────────────────────────────────────────────

export function computeTrend(analysesNewestFirst: CallAnalysis[]): TrendDirection {
  if (analysesNewestFirst.length < 4) return 'stable'
  const N = Math.min(5, Math.floor(analysesNewestFirst.length / 2))
  const recent = analysesNewestFirst.slice(0, N)
  const prev   = analysesNewestFirst.slice(N, N * 2)
  const rAvg = recent.reduce((s, a) => s + (a.sdr_quality_score ?? 0), 0) / recent.length
  const pAvg = prev.reduce((s, a)   => s + (a.sdr_quality_score ?? 0), 0) / prev.length
  if (rAvg > pAvg + 5) return 'improving'
  if (rAvg < pAvg - 5) return 'declining'
  return 'stable'
}

// ── Part 4: Select coaching-relevant calls ────────────────────────────────────

export function selectCoachingCalls(calls: CallRow[]): CoachingCall[] {
  const withAnalysis = calls.filter(c => c.call_analyses)
  if (withAnalysis.length === 0) return []

  const seen = new Set<string>()
  const result: CoachingCall[] = []
  const push = (c: CallRow, reason: string, type: 'positive' | 'negative', score: number | null) => {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      result.push({ callId: c.id, callDate: c.call_datetime, prospect: c.call_analyses.prospect_company || 'Inconnu', campaign: c.campaigns?.campaign_name || '—', reason, score, type })
    }
  }

  const sorted = [...withAnalysis].sort((a, b) => (b.call_analyses.sdr_quality_score ?? 0) - (a.call_analyses.sdr_quality_score ?? 0))
  if (sorted[0]) push(sorted[0], 'Excellent exemple à partager', 'positive', sorted[0].call_analyses.sdr_quality_score)

  const worst = sorted[sorted.length - 1]
  if (worst && worst.id !== sorted[0]?.id) push(worst, 'Qualification insuffisante à analyser', 'negative', worst.call_analyses.sdr_quality_score)

  const objCall = withAnalysis.find(c => c.call_analyses.objection_detected && !c.call_analyses.objection_details)
  if (objCall) push(objCall, 'Gestion objection à retravailler', 'negative', objCall.call_analyses.sdr_quality_score)

  const noDM = withAnalysis.find(c => c.call_analyses.appointment_booked && !c.call_analyses.decision_maker_detected)
  if (noDM) push(noDM, 'RDV posé sans décideur confirmé', 'negative', noDM.call_analyses.appointment_quality_score)

  return result.slice(0, 4)
}

// ── Main: build full SDR coaching profile ─────────────────────────────────────

export function buildSDRProfile(sdr: User, calls: CallRow[]): SDRProfile {
  const analyses = calls.map(c => c.call_analyses).filter(Boolean)
  const sortedA  = [...analyses].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const sdrScores  = analyses.map(a => a.sdr_quality_score).filter((v): v is number => v !== null)
  const apptCalls  = analyses.filter(a => a.appointment_booked)
  const apptScores = apptCalls.map(a => a.appointment_quality_score).filter((v): v is number => v !== null)
  const qualRate   = apptCalls.length > 0 ? Math.round(apptCalls.filter(a => isQualifiedAppointment(a)).length / apptCalls.length * 100) : null
  const flagged    = analyses.filter(a => computeReviewFlags(a).review_required).length
  const confs      = analyses.map(a => a.ai_confidence).filter((v): v is number => v !== null)

  const skills     = computeSkillBreakdown(analyses)
  const priorities = computeCoachingPriorities(analyses, skills)
  const trend      = computeTrend(sortedA)

  const avgSdr = safeAvg(sdrScores)
  const category: SDRProfile['category'] =
    avgSdr === null                                               ? 'stable'
    : avgSdr >= 75                                               ? 'top'
    : avgSdr < 55 || priorities.some(p => p.severity === 'high') ? 'needs_coaching'
    : 'stable'

  return {
    sdrId: sdr.id, sdrName: sdr.name, totalCalls: calls.length,
    avgSdrQuality: avgSdr,
    avgAppointmentQuality: safeAvg(apptScores),
    qualificationRate: qualRate,
    reviewFlagRate: analyses.length > 0 ? Math.round(flagged / analyses.length * 100) : null,
    avgAiConfidence: safeAvg(confs),
    callsReviewed: analyses.filter(a => a.human_validated).length,
    trend, skills, priorities,
    coachingCalls: selectCoachingCalls(calls),
    category,
  }
}
