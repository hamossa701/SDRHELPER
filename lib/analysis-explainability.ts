import type { CallAnalysis, InterestLevel, UserRole } from '@/types'

type ExplainabilityRole = Extract<UserRole, 'owner' | 'manager' | 'sdr' | 'client'>

export interface ExplainabilityItem {
  label: string
  evidence?: string
  positive?: boolean
}

export interface ScoreBreakdownItem {
  label: string
  points: number
  max: number
  evidence?: string
}

export interface AnalysisExplainability {
  qualification: {
    qualified: boolean
    reasons: ExplainabilityItem[]
  }
  temperature: {
    level: InterestLevel | null
    reasons: ExplainabilityItem[]
  }
  score: {
    value: number | null
    isApproximation: boolean
    breakdown: ScoreBreakdownItem[]
    reason: string | null
  }
  missingInfo: ExplainabilityItem[]
  evidence: ExplainabilityItem[]
  recommendation: string
  coachingNotes: ExplainabilityItem[]
}

interface BuildExplainabilityInput {
  role: ExplainabilityRole
  call: {
    transcript: string | null
  }
  analysis: Pick<CallAnalysis,
    | 'contact_role'
    | 'decision_maker_detected'
    | 'pain_point_detected'
    | 'pain_point_details'
    | 'urgency'
    | 'current_solution'
    | 'interest_level'
    | 'appointment_booked'
    | 'appointment_date_text'
    | 'appointment_datetime'
    | 'appointment_date_confidence'
    | 'appointment_quality_score'
    | 'appointment_quality_reason'
    | 'next_step'
    | 'qualification_completeness_score'
    | 'missing_information'
    | 'strengths'
    | 'weaknesses'
    | 'coaching_recommendations'
  >
  qualifiedAppointment: boolean
}

const NOT_DETECTED = "Non détecté dans l'appel"

function hasQualifiedExplainableAppointmentDate(value: {
  appointment_datetime?: string | null
  appointment_date_text?: string | null
  appointment_date_confidence?: string | null
}): boolean {
  if (value.appointment_datetime) return true
  if (!value.appointment_date_text?.trim()) return false
  return value.appointment_date_confidence === 'high' || value.appointment_date_confidence === 'medium'
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function splitTranscript(transcript: string | null): string[] {
  if (!transcript) return []
  return transcript
    .split(/\n+|(?<=\.)\s+|(?=SDR:|Prospect:|Client:)/)
    .map(line => line.trim())
    .filter(Boolean)
}

function compactEvidence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 150 ? `${cleaned.slice(0, 147).trim()}...` : cleaned
}

function findEvidence(transcript: string | null, candidates: Array<string | null | undefined>): string | undefined {
  const lines = splitTranscript(transcript)
  const tokens = candidates
    .filter(present)
    .flatMap(candidate => candidate.split(/[,\s;:.!?/()]+/))
    .map(token => token.trim().toLowerCase())
    .filter(token => token.length >= 4)

  for (const line of lines) {
    const normalized = line.toLowerCase()
    if (tokens.some(token => normalized.includes(token))) return compactEvidence(line)
  }

  return undefined
}

function evidenceOrMissing(transcript: string | null, candidates: Array<string | null | undefined>) {
  return findEvidence(transcript, candidates) ?? NOT_DETECTED
}

function missingLabel(value: string) {
  const cleaned = value.trim()
  if (/non detect/i.test(cleaned)) return cleaned
  return `${cleaned} non detecte${/\b(date|personne|solution|information)\b/i.test(cleaned) ? 'e' : ''}`
}

function temperatureReasons(input: BuildExplainabilityInput): ExplainabilityItem[] {
  const { analysis, call } = input
  const reasons: ExplainabilityItem[] = []

  if (analysis.pain_point_detected) {
    reasons.push({
      label: 'Besoin clair',
      evidence: evidenceOrMissing(call.transcript, [analysis.pain_point_details, 'probleme', 'besoin', 'coupure', 'cout', 'cher']),
      positive: true,
    })
  }

  if (analysis.urgency) {
    reasons.push({
      label: 'Priorite ou timing detecte',
      evidence: evidenceOrMissing(call.transcript, [analysis.urgency, 'priorite', 'urgent', 'renouvellement']),
      positive: true,
    })
  }

  if (analysis.appointment_booked) {
    reasons.push({
      label: 'RDV accepte',
      evidence: evidenceOrMissing(call.transcript, [analysis.appointment_date_text, analysis.next_step, 'oui']),
      positive: true,
    })
  }

  if (!analysis.pain_point_detected && !analysis.appointment_booked && !analysis.urgency) {
    reasons.push({
      label: 'Signaux business limites',
      evidence: NOT_DETECTED,
      positive: false,
    })
  }

  if (reasons.length === 0) {
    reasons.push({ label: 'Temperature basee sur le niveau d interet extrait', evidence: NOT_DETECTED })
  }

  return reasons
}

function buildScoreBreakdown(input: BuildExplainabilityInput): ScoreBreakdownItem[] {
  const { analysis, call } = input
  const hasDate = hasQualifiedExplainableAppointmentDate(analysis)
  const highPotentialEvidence = findEvidence(call.transcript, ['lignes', 'sites', 'agences', 'multi-sites', 'parc'])
  const hasPotential = Boolean(highPotentialEvidence)
  const hasTiming = Boolean(analysis.urgency || hasDate)

  return [
    {
      label: 'Decideur',
      points: analysis.decision_maker_detected ? 20 : 0,
      max: 20,
      evidence: analysis.decision_maker_detected ? evidenceOrMissing(call.transcript, [analysis.contact_role, 'decideur', 'decisionnaire']) : NOT_DETECTED,
    },
    {
      label: 'Besoin',
      points: analysis.pain_point_detected ? 20 : 0,
      max: 20,
      evidence: analysis.pain_point_detected ? evidenceOrMissing(call.transcript, [analysis.pain_point_details, 'probleme', 'cout', 'coupure']) : NOT_DETECTED,
    },
    {
      label: 'RDV',
      points: analysis.appointment_booked && hasDate ? 25 : analysis.appointment_booked ? 15 : 0,
      max: 25,
      evidence: analysis.appointment_booked ? evidenceOrMissing(call.transcript, [analysis.appointment_date_text, analysis.next_step]) : NOT_DETECTED,
    },
    {
      label: 'Potentiel',
      points: hasPotential ? 15 : 0,
      max: 15,
      evidence: highPotentialEvidence ?? NOT_DETECTED,
    },
    {
      label: 'Timing',
      points: hasTiming ? 8 : 0,
      max: 8,
      evidence: analysis.urgency ? evidenceOrMissing(call.transcript, [analysis.urgency, 'priorite', 'renouvellement']) : hasDate ? evidenceOrMissing(call.transcript, [analysis.appointment_date_text]) : NOT_DETECTED,
    },
  ]
}

function buildRecommendation(input: BuildExplainabilityInput) {
  const { analysis, qualifiedAppointment, role } = input
  if (role === 'client') {
    if (qualifiedAppointment) return `Voici pourquoi ce RDV est considere qualifie. Prochaine etape recommandee : ${analysis.next_step || 'preparer le rendez-vous avec les informations manquantes.'}`
    return 'Ce contact ne remplit pas encore tous les criteres de qualification. Prochaine etape recommandee : completer les informations business manquantes avant de prioriser.'
  }

  if (role === 'sdr') {
    const firstRecommendation = analysis.coaching_recommendations?.[0]
    return firstRecommendation || 'A ameliorer : confirmer systematiquement le decideur, le besoin, le creneau et les informations business manquantes.'
  }

  if (qualifiedAppointment) return 'Le RDV semble solide : verifier les informations manquantes avant transmission ou suivi client.'
  return 'Le RDV demande verification : les criteres manquants expliquent pourquoi il n est pas qualifie.'
}

export function buildAnalysisExplainability(input: BuildExplainabilityInput): AnalysisExplainability {
  const { analysis, call, role, qualifiedAppointment } = input
  const hasDate = hasQualifiedExplainableAppointmentDate(analysis)

  const qualificationReasons: ExplainabilityItem[] = [
    analysis.decision_maker_detected
      ? {
        label: 'Decideur identifie',
        evidence: evidenceOrMissing(call.transcript, [analysis.contact_role, 'decideur', 'decisionnaire']),
        positive: true,
      }
      : { label: 'Decideur non atteint', evidence: NOT_DETECTED, positive: false },
    analysis.pain_point_detected
      ? {
        label: `Besoin identifie${analysis.pain_point_details ? ` : ${analysis.pain_point_details}` : ''}`,
        evidence: evidenceOrMissing(call.transcript, [analysis.pain_point_details, 'besoin', 'probleme', 'cout', 'coupure']),
        positive: true,
      }
      : { label: 'Besoin non identifie', evidence: NOT_DETECTED, positive: false },
    analysis.appointment_booked && hasDate
      ? {
        label: `RDV pose${analysis.appointment_date_text ? ` : ${analysis.appointment_date_text}` : ''}`,
        evidence: evidenceOrMissing(call.transcript, [analysis.appointment_date_text, analysis.next_step]),
        positive: true,
      }
      : { label: analysis.appointment_booked ? 'Creneau de RDV insuffisamment confirme' : 'Aucun creneau confirme', evidence: NOT_DETECTED, positive: false },
  ]

  if (analysis.urgency) {
    qualificationReasons.push({
      label: `Urgence : ${analysis.urgency}`,
      evidence: evidenceOrMissing(call.transcript, [analysis.urgency, 'urgent', 'priorite', 'renouvellement']),
      positive: true,
    })
  }

  const evidence = qualificationReasons
    .filter(item => item.evidence && item.evidence !== NOT_DETECTED)
    .map(item => ({ label: item.label, evidence: item.evidence, positive: item.positive }))

  const missingInfo = (analysis.missing_information?.length ? analysis.missing_information : [
    ...(!analysis.decision_maker_detected ? ['Decideur'] : []),
    ...(!analysis.pain_point_detected ? ['Besoin'] : []),
    ...(!hasDate ? ['Creneau de RDV'] : []),
  ]).map(item => ({
    label: missingLabel(item),
    evidence: NOT_DETECTED,
    positive: false,
  }))

  const coachingNotes = role === 'client'
    ? []
    : [
      ...(analysis.strengths ?? []).map(label => ({ label: `Point fort : ${label}`, positive: true })),
      ...(analysis.weaknesses ?? []).map(label => ({ label: `A ameliorer : ${label}`, positive: false })),
      ...(analysis.coaching_recommendations ?? []).map(label => ({ label, positive: false })),
    ]

  return {
    qualification: {
      qualified: qualifiedAppointment,
      reasons: qualificationReasons,
    },
    temperature: {
      level: analysis.interest_level,
      reasons: temperatureReasons(input),
    },
    score: {
      value: analysis.appointment_quality_score,
      isApproximation: true,
      breakdown: buildScoreBreakdown(input),
      reason: analysis.appointment_quality_reason,
    },
    missingInfo,
    evidence,
    recommendation: buildRecommendation(input),
    coachingNotes,
  }
}
