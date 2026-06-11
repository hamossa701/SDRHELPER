const DAY_MS = 86_400_000

function one(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function analysisOf(call) {
  return one(call.call_analyses)
}

function prospectOf(call, analysis) {
  return analysis?.prospect_company || analysis?.contact_name || one(call.campaigns)?.client_name || 'Prospect non identifié'
}

function isQualified(a) {
  return a?.appointment_booked === true
    && a.decision_maker_detected === true
    && a.pain_point_detected === true
    && Boolean(a.appointment_datetime)
    && (a.appointment_quality_score ?? 0) >= 60
}

function avg(values) {
  const nums = values.filter((value) => typeof value === 'number')
  return nums.length ? Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length) : null
}

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0
}

function delta(current, previous) {
  if (current === null || previous === null) return null
  return current - previous
}

function periodRows(calls, start, end) {
  return calls
    .filter((call) => {
      const ts = Date.parse(call.call_datetime)
      return Number.isFinite(ts) && ts >= start && ts < end && analysisOf(call)
    })
    .map((call) => ({ call, analysis: analysisOf(call) }))
}

function periodStats(rows) {
  const analyses = rows.map((row) => row.analysis)
  const booked = analyses.filter((a) => a.appointment_booked === true)
  const qualified = analyses.filter(isQualified)
  return {
    total: analyses.length,
    qualityScore: avg(analyses.map((a) => a.sdr_quality_score)),
    qualificationRate: pct(qualified.length, booked.length),
    decisionMakerRate: pct(analyses.filter((a) => a.decision_maker_detected === true).length, analyses.length),
    appointmentRate: pct(booked.length, analyses.length),
    bookedCount: booked.length,
    qualifiedCount: qualified.length,
  }
}

function hasDiscovery(a) {
  return a?.pain_point_detected === true
    || Boolean(a?.pain_point_details)
    || Boolean(a?.current_solution)
}

function metric(label, current, previous, suffix = '') {
  return {
    label,
    value: current,
    previous,
    delta: delta(current, previous),
    suffix,
  }
}

function impactFromCount(count) {
  return `+${Math.max(4, Math.min(18, count * 6))}% de RDV qualifiés`
}

function focusCandidates(rows) {
  const candidates = [
    {
      label: 'Décideur non confirmé',
      skill: 'confirmation du décideur',
      matches: rows.filter(({ analysis }) => analysis.appointment_booked === true && analysis.decision_maker_detected !== true),
      why: 'Un RDV sans décideur confirmé a plus de risque de ne pas avancer après la passation.',
      actions: [
        'Demander qui valide la décision avant de proposer le créneau.',
        'Confirmer si la personne au téléphone participera au rendez-vous.',
        'Ajouter le décideur à l’invitation quand il n’est pas présent dans l’appel.',
      ],
    },
    {
      label: 'Besoin insuffisamment qualifié',
      skill: 'qualification du besoin',
      matches: rows.filter(({ analysis }) => analysis.pain_point_detected !== true || !analysis.pain_point_details),
      why: 'Sans besoin formulé, le rendez-vous ressemble à une découverte froide plutôt qu’à une opportunité qualifiée.',
      actions: [
        'Faire préciser le problème actuel avant de parler du rendez-vous.',
        'Demander l’impact concret du problème sur l’activité.',
        'Reformuler le besoin avant de proposer la suite.',
      ],
    },
    {
      label: 'Prochaine étape absente',
      skill: 'closing',
      matches: rows.filter(({ analysis }) => !analysis.next_step),
      why: 'Quand la prochaine étape n’est pas claire, le prospect peut accepter sans réel engagement.',
      actions: [
        'Terminer l’appel par une action datée et attribuée.',
        'Récapituler ce qui sera préparé avant le rendez-vous.',
        'Confirmer le canal de suivi avant de raccrocher.',
      ],
    },
    {
      label: 'Objection non traitée',
      skill: 'traitement des objections',
      matches: rows.filter(({ analysis }) => analysis.objection_detected === true && !analysis.objection_details),
      why: 'Une objection non creusée laisse une raison de refus active après l’appel.',
      actions: [
        'Demander ce qui bloque précisément avant de répondre.',
        'Valider l’objection avec les mots du prospect.',
        'Relier la réponse à un enjeu déjà exprimé dans l’appel.',
      ],
    },
  ]
  return candidates
    .filter((candidate) => candidate.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length)
}

function buildFocusArea(rows) {
  const [candidate] = focusCandidates(rows)
  if (!candidate) return null
  const sample = candidate.matches[0]
  const prospect = prospectOf(sample.call, sample.analysis)
  const signal = sample.analysis.pain_point_details
    ? `${prospect} : ${sample.analysis.pain_point_details}`
    : `${prospect} : ${candidate.label.toLowerCase()}`
  return {
    label: candidate.label,
    skill: candidate.skill,
    evidence: signal,
    why: candidate.why,
    actions: candidate.actions,
    expectedImpact: impactFromCount(candidate.matches.length),
    callId: sample.call.id,
    count: candidate.matches.length,
  }
}

function buildStrengths(rows) {
  const map = new Map()
  for (const { call, analysis } of rows) {
    for (const item of analysis.strengths ?? []) {
      const key = item.trim()
      if (!key || map.has(key)) continue
      map.set(key, {
        label: key,
        behavior: key,
        callId: call.id,
        prospect: prospectOf(call, analysis),
      })
    }
    const inferred = [
      analysis.decision_maker_detected === true ? 'Confirme le décideur' : null,
      analysis.pain_point_detected === true && analysis.pain_point_details ? 'Fait exprimer un besoin concret' : null,
      analysis.next_step ? 'Verrouille une prochaine étape' : null,
      analysis.objection_detected === true && analysis.objection_details ? 'Creuse les objections' : null,
      analysis.urgency ? 'Identifie le timing du prospect' : null,
    ].filter(Boolean)

    for (const item of inferred) {
      if (map.has(item)) continue
      map.set(item, {
        label: item,
        behavior: item,
        callId: call.id,
        prospect: prospectOf(call, analysis),
      })
    }
  }
  return [...map.values()].slice(0, 3)
}

function observedSignals(analysis) {
  return [
    analysis.decision_maker_detected === true ? 'Décideur confirmé' : null,
    analysis.pain_point_detected === true
      ? `Besoin identifié${analysis.pain_point_details ? ` : ${analysis.pain_point_details}` : ''}`
      : null,
    analysis.appointment_booked === true ? 'RDV obtenu' : null,
    analysis.next_step ? `Prochaine étape claire : ${analysis.next_step}` : null,
    analysis.urgency ? `Urgence détectée : ${analysis.urgency}` : null,
    analysis.current_solution ? `Solution actuelle identifiée : ${analysis.current_solution}` : null,
    analysis.objection_detected === true && analysis.objection_details ? `Objection traitée : ${analysis.objection_details}` : null,
    ...(analysis.strengths ?? []),
  ].filter(Boolean).slice(0, 4)
}

function buildBestCalls(rows, now) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return rows
    .filter(({ call, analysis }) => Date.parse(call.call_datetime) >= monthStart && typeof analysis.sdr_quality_score === 'number')
    .sort((a, b) => (b.analysis.sdr_quality_score ?? -1) - (a.analysis.sdr_quality_score ?? -1))
    .slice(0, 3)
    .map(({ call, analysis }) => ({
      callId: call.id,
      prospect: prospectOf(call, analysis),
      score: analysis.sdr_quality_score,
      signals: observedSignals(analysis),
    }))
    .filter((item) => item.signals.length > 0)
}

function dailySparkline(rows, now, predicate, denominatorPredicate = () => true) {
  const start = now.getTime() - 29 * DAY_MS
  return Array.from({ length: 30 }, (_, index) => {
    const dayStart = start + index * DAY_MS
    const dayEnd = dayStart + DAY_MS
    const dayRows = rows.filter(({ call }) => {
      const ts = Date.parse(call.call_datetime)
      return ts >= dayStart && ts < dayEnd
    })
    const denominator = dayRows.filter(({ analysis }) => denominatorPredicate(analysis)).length
    if (denominator === 0) return null
    const numerator = dayRows.filter(({ analysis }) => denominatorPredicate(analysis) && predicate(analysis)).length
    return pct(numerator, denominator)
  })
}

function buildTrends(currentRows, stats, previousStats, now) {
  if (currentRows.length < 2) return null
  const metrics = [
    {
      key: 'qualification',
      label: 'Qualification',
      delta: delta(stats.qualificationRate, previousStats.qualificationRate),
      values: dailySparkline(currentRows, now, isQualified, (a) => a.appointment_booked === true),
    },
    {
      key: 'decisionMaker',
      label: 'Décideur',
      delta: delta(stats.decisionMakerRate, previousStats.decisionMakerRate),
      values: dailySparkline(currentRows, now, (a) => a.decision_maker_detected === true),
    },
    {
      key: 'appointment',
      label: 'RDV',
      delta: delta(stats.appointmentRate, previousStats.appointmentRate),
      values: dailySparkline(currentRows, now, (a) => a.appointment_booked === true),
    },
  ]
  const comparable = metrics.filter((item) => item.delta !== null)
  return {
    metrics,
    mostImproved: comparable.length ? [...comparable].sort((a, b) => b.delta - a.delta)[0] : null,
    mostDeclining: comparable.length ? [...comparable].sort((a, b) => a.delta - b.delta)[0] : null,
  }
}

function missedOpportunityFromRow(row) {
  const { call, analysis } = row
  const prospect = prospectOf(call, analysis)
  const base = { callId: call.id, prospect }

  if (analysis.appointment_booked === true && analysis.decision_maker_detected !== true) {
    return {
      ...base,
      prospectSignal: analysis.pain_point_details || 'RDV accepté sans décideur confirmé',
      missedAction: 'Décideur non confirmé',
      suggestedQuestion: 'Qui doit valider la décision et doit-il participer au rendez-vous ?',
    }
  }
  if ((analysis.pain_point_detected !== true || !analysis.pain_point_details) && analysis.interest_level !== 'cold') {
    return {
      ...base,
      prospectSignal: analysis.interest_level === 'hot' ? 'Intérêt fort détecté' : 'Intérêt détecté',
      missedAction: 'Besoin métier non précisé',
      suggestedQuestion: 'Quel problème voulez-vous résoudre en priorité sur ce sujet ?',
    }
  }
  if (analysis.objection_detected === true && !analysis.objection_details) {
    return {
      ...base,
      prospectSignal: analysis.objection_type || 'Objection détectée',
      missedAction: 'Objection non creusée',
      suggestedQuestion: 'Qu’est-ce qui vous bloque précisément aujourd’hui ?',
    }
  }
  if (!analysis.next_step) {
    return {
      ...base,
      prospectSignal: analysis.appointment_booked ? 'RDV ou intérêt détecté' : 'Conversation sans suite claire',
      missedAction: 'Prochaine étape non verrouillée',
      suggestedQuestion: 'Quelle est la prochaine action concrète que nous validons ensemble ?',
    }
  }
  return null
}

function buildMissedOpportunities(rows) {
  return rows
    .map(missedOpportunityFromRow)
    .filter(Boolean)
    .slice(0, 5)
}

function funnelStage(key, label, count, available = true) {
  return {
    key,
    label,
    count,
    available,
    conversionFromPrevious: null,
    dropOff: null,
  }
}

function frictionAction(fromKey, toKey) {
  if (fromKey === 'discoveries' && toKey === 'decisionMakers') {
    return 'Sur tes prochains appels, demande explicitement qui valide la décision avant de proposer le RDV.'
  }
  if (fromKey === 'decisionMakers' && toKey === 'appointments') {
    return 'Verrouille une date concrète avant la fin de l’appel.'
  }
  if (fromKey === 'appointments' && toKey === 'qualifiedAppointments') {
    return 'Vérifie besoin, décideur, date et prochaine étape avant de confirmer le RDV.'
  }
  if (fromKey === 'calls' && toKey === 'discoveries') {
    return 'Avant de présenter la suite, fais formuler le contexte actuel et le problème prioritaire.'
  }
  return 'Concentre le prochain appel sur l’étape qui manque avant de passer à la suite.'
}

function buildPersonalFunnel(rows) {
  if (rows.length === 0) return null

  const stages = [
    funnelStage('calls', 'Appels analysés', rows.length),
    funnelStage('arguedContacts', 'Contacts argumentés', null, false),
    funnelStage('discoveries', 'Découvertes réalisées', rows.filter(({ analysis }) => hasDiscovery(analysis)).length),
    funnelStage('decisionMakers', 'Décideurs identifiés', rows.filter(({ analysis }) => analysis.decision_maker_detected === true).length),
    funnelStage('appointments', 'RDV posés', rows.filter(({ analysis }) => analysis.appointment_booked === true).length),
    funnelStage('qualifiedAppointments', 'RDV qualifiés', rows.filter(({ analysis }) => isQualified(analysis)).length),
  ]

  const availableStages = stages.filter((stage) => stage.available)
  for (let index = 1; index < availableStages.length; index += 1) {
    const previous = availableStages[index - 1]
    const current = availableStages[index]
    current.conversionFromPrevious = previous.count > 0 ? pct(current.count, previous.count) : null
    current.dropOff = Math.max(0, previous.count - current.count)
  }

  const friction = availableStages
    .slice(1)
    .filter((stage) => stage.conversionFromPrevious !== null)
    .sort((a, b) => a.conversionFromPrevious - b.conversionFromPrevious)[0] ?? null

  const previous = friction
    ? availableStages[availableStages.findIndex((stage) => stage.key === friction.key) - 1]
    : null

  return {
    periodLabel: '30 derniers jours',
    stages,
    friction: friction && previous
      ? {
        fromKey: previous.key,
        toKey: friction.key,
        fromLabel: previous.label,
        toLabel: friction.label,
        fromCount: previous.count,
        toCount: friction.count,
        conversion: friction.conversionFromPrevious,
        action: frictionAction(previous.key, friction.key),
      }
      : null,
  }
}

function buildSdrDashboardModel(calls, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const nowMs = now.getTime()
  const currentStart = nowMs - 30 * DAY_MS
  const previousStart = nowMs - 60 * DAY_MS

  const currentRows = periodRows(calls, currentStart, nowMs + 1)
  const previousRows = periodRows(calls, previousStart, currentStart)
  const currentStats = periodStats(currentRows)
  const previousStats = periodStats(previousRows)
  const focusArea = buildFocusArea(currentRows)

  return {
    hasData: currentRows.length > 0,
    performance: {
      metrics: [
        metric('Score qualité', currentStats.qualityScore, previousStats.qualityScore, '/100'),
        metric('Taux de qualification', currentStats.qualificationRate, previousStats.qualificationRate, '%'),
        metric('Taux décideur', currentStats.decisionMakerRate, previousStats.decisionMakerRate, '%'),
        metric('Taux de RDV', currentStats.appointmentRate, previousStats.appointmentRate, '%'),
      ],
      currentStats,
      previousStats,
    },
    focusArea,
    personalFunnel: buildPersonalFunnel(currentRows),
    strengths: buildStrengths(currentRows),
    bestCalls: buildBestCalls(currentRows, now),
    trends: buildTrends(currentRows, currentStats, previousStats, now),
    missedOpportunities: buildMissedOpportunities(currentRows),
    improvementJourney: previousStats.qualityScore === null && currentStats.qualityScore === null
      ? null
      : {
        previousScore: previousStats.qualityScore,
        currentScore: currentStats.qualityScore,
        delta: delta(currentStats.qualityScore, previousStats.qualityScore),
    },
  }
}

module.exports = { buildSdrDashboardModel }
