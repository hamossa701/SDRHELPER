export type CoachingTrendStatus = 'up' | 'down' | 'stable' | 'none'
export type CoachingPriorityRank = 'Critique' | 'Important' | 'Moyen'

export type CoachingAnalysisForSupervision = {
  id: string
  call_id?: string
  sdr_quality_score: number | null
  appointment_quality_score: number | null
  appointment_booked: boolean | null
  decision_maker_detected: boolean | null
  pain_point_detected: boolean | null
  pain_point_details: string | null
  appointment_datetime: string | null
  ai_confidence: number | null
  hallucination_risk: string | null
  qualification_completeness_score: number | null
  objection_detected: boolean | null
  objection_type: string | null
  objection_details: string | null
  next_step: string | null
  human_validated: boolean | null
  urgency: string | null
  current_solution: string | null
  interest_level: string | null
  prospect_company: string | null
  contact_name: string | null
  weaknesses: string[] | null
  coaching_recommendations: string[] | null
  created_at: string | null
}

export type CoachingCallForSupervision = {
  id: string
  sdr_id: string
  call_datetime: string
  call_analyses: CoachingAnalysisForSupervision | CoachingAnalysisForSupervision[] | null
  campaigns?: { campaign_name: string | null; client_name: string | null } | { campaign_name: string | null; client_name: string | null }[] | null
}

export type ScopedCoachingSdr = { id: string; name: string | null }

export type SkillKey =
  | 'skill_opening'
  | 'skill_discovery'
  | 'skill_pain_point'
  | 'skill_objection_handling'
  | 'skill_qualification'
  | 'skill_closing'

export type SkillTrend = {
  current: number
  previous: number | null
  delta: number | null
  status: CoachingTrendStatus
  source: 'analysis_windows'
}

export type RankedCoachingPriority = {
  label: string
  rank: CoachingPriorityRank
  evidence: Array<{ label: string; count: number }>
}

export type CoachingCallExample = {
  callId: string
  prospect: string
  score: number | null
  reason: string
}

export type CoachingSupervisionProfile = {
  sdr_id: string
  sdr_name: string
  total_calls: number
  current_analysis_count: number
  previous_analysis_count: number
  avg_sdr_quality: number | null
  avg_appointment_quality: number | null
  appointments_booked: number
  qualified_appointments: number
  qualification_rate: number
  calls_reviewed: number
  calls_requiring_review: number
  latest_analysis_at: string | null
  review_flag_rate: number | null
  avg_ai_confidence: number | null
  skills: Record<SkillKey, number>
  skill_trends: Record<SkillKey, SkillTrend>
  overall_trend: CoachingTrendStatus
  priorities: RankedCoachingPriority[]
  best_call: CoachingCallExample | null
  worst_call: CoachingCallExample | null
  category: 'top' | 'stable' | 'needs_coaching'
}

const SKILL_KEYS: SkillKey[] = [
  'skill_opening',
  'skill_discovery',
  'skill_pain_point',
  'skill_objection_handling',
  'skill_qualification',
  'skill_closing',
]

export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number')
  return nums.length ? Math.round(nums.reduce((sum, v) => sum + v, 0) / nums.length) : null
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function trend(current: number, previous: number | null): SkillTrend {
  if (previous === null) return { current, previous: null, delta: null, status: 'none', source: 'analysis_windows' }
  const delta = current - previous
  return {
    current,
    previous,
    delta,
    status: Math.abs(delta) < 3 ? 'stable' : delta > 0 ? 'up' : 'down',
    source: 'analysis_windows',
  }
}

export function requiresReview(a: CoachingAnalysisForSupervision): boolean {
  return (
    (a.appointment_booked === true && a.decision_maker_detected !== true)
    || (a.appointment_booked === true && (a.appointment_quality_score ?? 0) < 60)
    || (a.appointment_booked === true && !a.appointment_datetime)
    || (a.appointment_booked === true && a.pain_point_detected !== true)
    || (a.ai_confidence !== null && a.ai_confidence < 70)
    || a.hallucination_risk === 'medium'
    || a.hallucination_risk === 'high'
    || (a.qualification_completeness_score !== null && a.qualification_completeness_score < 60)
    || (a.objection_detected === true && !a.objection_details)
    || !a.next_step
  )
}

export function skillScores(a: CoachingAnalysisForSupervision): Record<SkillKey, number> {
  const interest = a.interest_level === 'hot' ? 90 : a.interest_level === 'warm' ? 65 : a.interest_level === 'cold' ? 30 : 15
  return {
    skill_opening: Math.round(interest * 0.5 + (a.sdr_quality_score ?? 50) * 0.5),
    skill_discovery:
      (a.decision_maker_detected ? 25 : 0)
      + (a.pain_point_detected ? 25 : 0)
      + (a.urgency ? 25 : 0)
      + (a.current_solution ? 25 : 0),
    skill_pain_point:
      (a.pain_point_detected ? 50 : 0)
      + (a.pain_point_details ? 30 : 0)
      + (a.urgency ? 20 : 0),
    skill_objection_handling: !a.objection_detected
      ? 70
      : a.objection_details
        ? Math.min(90, (a.sdr_quality_score ?? 50) + 10)
        : 25,
    skill_qualification: a.qualification_completeness_score ?? 0,
    skill_closing: (a.appointment_booked ? 60 : 0) + (a.next_step ? 40 : 0),
  }
}

function evidenceCount(analyses: CoachingAnalysisForSupervision[], predicate: (a: CoachingAnalysisForSupervision) => boolean) {
  return analyses.filter(predicate).length
}

export function buildEvidence(analyses: CoachingAnalysisForSupervision[]) {
  const rows = [
    { label: 'Decideur non confirme', count: evidenceCount(analyses, a => a.appointment_booked === true && a.decision_maker_detected !== true) },
    { label: 'Besoin insuffisamment explore', count: evidenceCount(analyses, a => a.pain_point_detected !== true || !a.pain_point_details) },
    { label: 'Prochaine etape absente', count: evidenceCount(analyses, a => !a.next_step) },
    { label: 'Objection sans detail', count: evidenceCount(analyses, a => a.objection_detected === true && !a.objection_details) },
    { label: 'Confiance IA basse', count: evidenceCount(analyses, a => a.ai_confidence !== null && a.ai_confidence < 70) },
  ]
  return rows.filter(row => row.count > 0)
}

export function buildPriorities(analyses: CoachingAnalysisForSupervision[], skills: Record<SkillKey, number>): RankedCoachingPriority[] {
  if (analyses.length === 0) return []
  const booked = analyses.filter(a => a.appointment_booked === true)
  const objections = analyses.filter(a => a.objection_detected === true)
  const rows: RankedCoachingPriority[] = []
  const evidence = buildEvidence(analyses)
  const pick = (...labels: string[]) => evidence.filter(row => labels.includes(row.label))

  const missingDecisionMaker = evidenceCount(booked, a => a.decision_maker_detected !== true)
  if (skills.skill_qualification < 55 || missingDecisionMaker > 0) {
    rows.push({
      label: missingDecisionMaker > 0 ? 'Qualification: confirmer le decideur' : 'Qualification incomplete',
      rank: 'Critique',
      evidence: pick('Decideur non confirme', 'Prochaine etape absente'),
    })
  }

  if (skills.skill_discovery < 50 || skills.skill_pain_point < 50 || evidenceCount(analyses, a => a.pain_point_detected !== true || !a.pain_point_details) > 0) {
    rows.push({
      label: 'Decouverte: explorer le besoin avant le RDV',
      rank: 'Important',
      evidence: pick('Besoin insuffisamment explore'),
    })
  }

  const repeatedObjectionIssue = evidenceCount(objections, a => !a.objection_details)
  if (skills.skill_objection_handling < 55 || repeatedObjectionIssue > 0) {
    rows.push({
      label: repeatedObjectionIssue >= 3 ? 'Objections repetees sans traitement clair' : 'Gestion objections a renforcer',
      rank: repeatedObjectionIssue >= 3 ? 'Important' : 'Moyen',
      evidence: pick('Objection sans detail'),
    })
  }

  if (evidenceCount(analyses, a => !a.next_step) > analyses.length / 2 && !rows.some(row => row.evidence.some(item => item.label === 'Prochaine etape absente'))) {
    rows.push({
      label: 'Closing: formaliser la prochaine etape',
      rank: 'Important',
      evidence: pick('Prochaine etape absente'),
    })
  }

  const rankScore: Record<CoachingPriorityRank, number> = { Critique: 0, Important: 1, Moyen: 2 }
  return rows
    .sort((a, b) => rankScore[a.rank] - rankScore[b.rank])
    .slice(0, 3)
}

function displayProspect(call: CoachingCallForSupervision, analysis: CoachingAnalysisForSupervision): string {
  const campaign = one(call.campaigns)
  return analysis.prospect_company || campaign?.client_name || analysis.contact_name || 'Prospect non identifie'
}

function worstReason(a: CoachingAnalysisForSupervision): string {
  if (a.ai_confidence !== null && a.ai_confidence < 70) return 'confiance IA basse'
  if (a.appointment_booked === true && a.decision_maker_detected !== true) return 'decideur non confirme'
  if (a.qualification_completeness_score !== null && a.qualification_completeness_score < 50) return 'qualification faible'
  if (!a.next_step) return 'prochaine etape absente'
  if (a.objection_detected === true && !a.objection_details) return 'objection non detaillee'
  return 'score faible'
}

function callExamples(calls: CoachingCallForSupervision[]): { best: CoachingCallExample | null; worst: CoachingCallExample | null } {
  const withAnalysis = calls
    .map(call => ({ call, analysis: one(call.call_analyses) }))
    .filter((row): row is { call: CoachingCallForSupervision; analysis: CoachingAnalysisForSupervision } => Boolean(row.analysis))

  const scored = withAnalysis.filter(row => typeof row.analysis.sdr_quality_score === 'number')
  const sorted = [...scored].sort((a, b) => (b.analysis.sdr_quality_score ?? -1) - (a.analysis.sdr_quality_score ?? -1))
  const bestRow = sorted.find(row => (row.analysis.sdr_quality_score ?? 0) >= 70) ?? sorted[0]
  const worstRow =
    withAnalysis.find(row => row.analysis.ai_confidence !== null && row.analysis.ai_confidence < 70)
    ?? [...scored].sort((a, b) => (a.analysis.sdr_quality_score ?? 101) - (b.analysis.sdr_quality_score ?? 101))[0]

  return {
    best: bestRow ? {
      callId: bestRow.call.id,
      prospect: displayProspect(bestRow.call, bestRow.analysis),
      score: bestRow.analysis.sdr_quality_score,
      reason: 'exemple a partager',
    } : null,
    worst: worstRow && worstRow.call.id !== bestRow?.call.id ? {
      callId: worstRow.call.id,
      prospect: displayProspect(worstRow.call, worstRow.analysis),
      score: worstRow.analysis.sdr_quality_score,
      reason: worstReason(worstRow.analysis),
    } : null,
  }
}

function periodAnalyses(calls: CoachingCallForSupervision[], start: number, end: number): CoachingAnalysisForSupervision[] {
  return calls
    .filter(call => {
      const ts = Date.parse(call.call_datetime)
      return Number.isFinite(ts) && ts >= start && ts < end
    })
    .map(call => one(call.call_analyses))
    .filter((analysis): analysis is CoachingAnalysisForSupervision => Boolean(analysis))
}

export function buildCoachingSupervisionProfiles(
  sdrs: ScopedCoachingSdr[],
  calls: CoachingCallForSupervision[],
  nowMs = Date.now(),
): CoachingSupervisionProfile[] {
  const currentStart = nowMs - 30 * 86_400_000
  const previousStart = nowMs - 60 * 86_400_000

  return sdrs.map((sdr) => {
    const sdrCalls = calls.filter(call => call.sdr_id === sdr.id)
    const currentAnalyses = periodAnalyses(sdrCalls, currentStart, nowMs + 1)
    const previousAnalyses = periodAnalyses(sdrCalls, previousStart, currentStart)
    const currentSkills = currentAnalyses.map(skillScores)
    const previousSkills = previousAnalyses.map(skillScores)
    const skills = Object.fromEntries(SKILL_KEYS.map(key => [key, avg(currentSkills.map(s => s[key])) ?? 0])) as Record<SkillKey, number>
    const previous = Object.fromEntries(SKILL_KEYS.map(key => [key, avg(previousSkills.map(s => s[key]))])) as Record<SkillKey, number | null>
    const skill_trends = Object.fromEntries(SKILL_KEYS.map(key => [key, trend(skills[key], previous[key])])) as Record<SkillKey, SkillTrend>

    const booked = currentAnalyses.filter(a => a.appointment_booked === true)
    const qualified = booked.filter(a =>
      a.decision_maker_detected === true
      && a.pain_point_detected === true
      && Boolean(a.appointment_datetime)
      && (a.appointment_quality_score ?? 0) >= 60
    )
    const reviewRequired = currentAnalyses.filter(requiresReview)
    const avgSdrQuality = avg(currentAnalyses.map(a => a.sdr_quality_score))
    const priorities = buildPriorities(currentAnalyses, skills)
    const examples = callExamples(sdrCalls.filter(call => Date.parse(call.call_datetime) >= currentStart))
    const currentOverall = avg(currentAnalyses.map(a => a.sdr_quality_score))
    const previousOverall = avg(previousAnalyses.map(a => a.sdr_quality_score))
    const overallTrend = trend(currentOverall ?? 0, previousOverall).status
    const category: CoachingSupervisionProfile['category'] =
      avgSdrQuality !== null && avgSdrQuality >= 75
        ? 'top'
        : avgSdrQuality !== null && (avgSdrQuality < 55 || priorities.some(p => p.rank === 'Critique'))
          ? 'needs_coaching'
          : 'stable'
    const latestAnalysisAt = currentAnalyses
      .map(a => a.created_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null

    return {
      sdr_id: sdr.id,
      sdr_name: sdr.name ?? 'SDR',
      total_calls: sdrCalls.filter(call => Date.parse(call.call_datetime) >= currentStart).length,
      current_analysis_count: currentAnalyses.length,
      previous_analysis_count: previousAnalyses.length,
      avg_sdr_quality: avgSdrQuality,
      avg_appointment_quality: avg(currentAnalyses.map(a => a.appointment_quality_score)),
      appointments_booked: booked.length,
      qualified_appointments: qualified.length,
      qualification_rate: pct(qualified.length, booked.length),
      calls_reviewed: currentAnalyses.filter(a => a.human_validated === true).length,
      calls_requiring_review: reviewRequired.length,
      latest_analysis_at: latestAnalysisAt,
      review_flag_rate: currentAnalyses.length > 0 ? pct(reviewRequired.length, currentAnalyses.length) : null,
      avg_ai_confidence: avg(currentAnalyses.map(a => a.ai_confidence)),
      skills,
      skill_trends,
      overall_trend: overallTrend,
      priorities,
      best_call: examples.best,
      worst_call: examples.worst,
      category,
    }
  }).sort((a, b) => (b.avg_sdr_quality ?? -1) - (a.avg_sdr_quality ?? -1))
}
