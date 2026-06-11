import assert from 'node:assert/strict'
import test from 'node:test'

import dashboard from './sdr-dashboard.js'

const { buildSdrDashboardModel } = dashboard

const now = new Date('2026-06-11T12:00:00.000Z')

function call(id, daysAgo, analysis) {
  return {
    id,
    call_datetime: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    transcript: analysis.transcript ?? null,
    call_analyses: {
      prospect_company: analysis.prospect_company ?? `Prospect ${id}`,
      contact_name: analysis.contact_name ?? null,
      decision_maker_detected: analysis.decision_maker_detected ?? false,
      pain_point_detected: analysis.pain_point_detected ?? false,
      pain_point_details: analysis.pain_point_details ?? null,
      urgency: analysis.urgency ?? null,
      current_solution: analysis.current_solution ?? null,
      interest_level: analysis.interest_level ?? 'warm',
      objection_detected: analysis.objection_detected ?? false,
      objection_details: analysis.objection_details ?? null,
      appointment_booked: analysis.appointment_booked ?? false,
      appointment_datetime: analysis.appointment_datetime ?? null,
      appointment_quality_score: analysis.appointment_quality_score ?? null,
      next_step: analysis.next_step ?? null,
      sdr_quality_score: analysis.sdr_quality_score ?? null,
      qualification_completeness_score: analysis.qualification_completeness_score ?? null,
      strengths: analysis.strengths ?? [],
      weaknesses: analysis.weaknesses ?? [],
      coaching_recommendations: analysis.coaching_recommendations ?? [],
      missing_information: analysis.missing_information ?? [],
      created_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    },
  }
}

test('builds an SDR-first dashboard model from real call analysis data', () => {
  const model = buildSdrDashboardModel([
    call('a', 2, {
      prospect_company: 'Alpha',
      appointment_booked: true,
      decision_maker_detected: false,
      pain_point_detected: true,
      pain_point_details: 'renouvellement télécom',
      appointment_datetime: '2026-06-20T09:00:00.000Z',
      appointment_quality_score: 52,
      sdr_quality_score: 68,
      qualification_completeness_score: 58,
      strengths: ['Reformule clairement le besoin'],
      weaknesses: ['Décideur non confirmé'],
      next_step: 'Envoyer une invitation',
    }),
    call('b', 4, {
      prospect_company: 'Beta',
      appointment_booked: true,
      decision_maker_detected: false,
      pain_point_detected: true,
      pain_point_details: 'comparaison des options',
      appointment_datetime: '2026-06-21T10:00:00.000Z',
      appointment_quality_score: 49,
      sdr_quality_score: 61,
      qualification_completeness_score: 55,
      strengths: ['Identifie le besoin métier'],
      weaknesses: ['Décideur non confirmé'],
      next_step: 'Confirmer le rendez-vous',
    }),
    call('c', 8, {
      prospect_company: 'Gamma',
      appointment_booked: true,
      decision_maker_detected: true,
      pain_point_detected: true,
      pain_point_details: 'facture trop élevée',
      appointment_datetime: '2026-06-22T11:00:00.000Z',
      appointment_quality_score: 88,
      sdr_quality_score: 91,
      qualification_completeness_score: 92,
      strengths: ['Confirme le décideur', 'Verrouille une prochaine étape claire'],
      next_step: 'Préparer le rendez-vous',
    }),
    call('d', 12, {
      prospect_company: 'Delta',
      appointment_booked: false,
      decision_maker_detected: true,
      pain_point_detected: true,
      pain_point_details: 'multi-sites',
      sdr_quality_score: 83,
      qualification_completeness_score: 80,
      strengths: ['Creuse le contexte existant'],
      next_step: 'Rappeler vendredi',
    }),
    call('e', 35, {
      prospect_company: 'Ancien',
      appointment_booked: true,
      decision_maker_detected: true,
      pain_point_detected: true,
      appointment_datetime: '2026-05-15T11:00:00.000Z',
      appointment_quality_score: 75,
      sdr_quality_score: 58,
      qualification_completeness_score: 70,
      strengths: ['Garde un bon rythme'],
      next_step: 'Préparer',
    }),
  ], { now })

  assert.equal(model.performance.metrics.length, 4)
  assert.equal(model.focusArea.label, 'Décideur non confirmé')
  assert.equal(model.focusArea.actions.length >= 1 && model.focusArea.actions.length <= 3, true)
  assert.match(model.focusArea.evidence, /Alpha|Beta|décideur/i)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'calls').count, 4)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'arguedContacts').available, false)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'arguedContacts').count, null)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'discoveries').count, 4)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'decisionMakers').count, 2)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'appointments').count, 3)
  assert.equal(model.personalFunnel.stages.find((stage) => stage.key === 'qualifiedAppointments').count, 1)
  assert.equal(model.personalFunnel.friction.toLabel, 'RDV qualifiés')
  assert.match(model.personalFunnel.friction.action, /Vérifie|décision|date|RDV/i)
  assert.equal(model.strengths.length >= 3, true)
  assert.equal(model.bestCalls.length, 3)
  assert.equal(model.missedOpportunities[0].missedAction, 'Décideur non confirmé')
  assert.match(model.missedOpportunities[0].suggestedQuestion, /décision|valider|signature/i)
  assert.equal(model.improvementJourney.previousScore, 58)
  assert.equal(model.improvementJourney.currentScore, 76)
})
