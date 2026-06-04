import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCoachingSupervisionProfiles } from './coaching-supervision.ts'

const day = 86_400_000
const now = Date.parse('2026-06-04T12:00:00.000Z')

function analysis(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    sdr_quality_score: 70,
    appointment_quality_score: 70,
    appointment_booked: true,
    decision_maker_detected: true,
    pain_point_detected: true,
    pain_point_details: 'besoin telecom',
    appointment_datetime: '2026-06-10T10:00:00.000Z',
    ai_confidence: 90,
    hallucination_risk: 'low',
    qualification_completeness_score: 75,
    objection_detected: false,
    objection_type: null,
    objection_details: null,
    next_step: 'RDV confirme',
    human_validated: false,
    urgency: 'ce mois',
    current_solution: 'operateur actuel',
    interest_level: 'warm',
    prospect_company: 'Atlas Bureauautique',
    contact_name: 'Prospect',
    weaknesses: [],
    coaching_recommendations: [],
    created_at: '2026-06-04T12:00:00.000Z',
    ...overrides,
  }
}

function call(daysAgo, sdrId, analysisOverrides = {}) {
  const dt = new Date(now - daysAgo * day).toISOString()
  return {
    id: crypto.randomUUID(),
    sdr_id: sdrId,
    call_datetime: dt,
    campaigns: { campaign_name: 'Telecom', client_name: 'Client' },
    call_analyses: analysis({ created_at: dt, ...analysisOverrides }),
  }
}

test('calculates competency trends from current and previous 30-day windows', () => {
  const profiles = buildCoachingSupervisionProfiles(
    [{ id: 'sdr-1', name: 'SDR One' }],
    [
      call(5, 'sdr-1', { qualification_completeness_score: 80 }),
      call(10, 'sdr-1', { qualification_completeness_score: 70 }),
      call(35, 'sdr-1', { qualification_completeness_score: 40 }),
      call(45, 'sdr-1', { qualification_completeness_score: 50 }),
    ],
    now,
  )

  assert.equal(profiles[0].skill_trends.skill_qualification.status, 'up')
  assert.equal(profiles[0].skill_trends.skill_qualification.delta, 30)
  assert.equal(profiles[0].skill_trends.skill_qualification.source, 'analysis_windows')
})

test('reports no trend when previous-period analysis is missing', () => {
  const profiles = buildCoachingSupervisionProfiles(
    [{ id: 'sdr-1', name: 'SDR One' }],
    [call(5, 'sdr-1', { qualification_completeness_score: 80 })],
    now,
  )

  assert.equal(profiles[0].skill_trends.skill_qualification.status, 'none')
  assert.equal(profiles[0].skill_trends.skill_qualification.delta, null)
})

test('ranks priorities by impact and attaches evidence from real analysis fields', () => {
  const profiles = buildCoachingSupervisionProfiles(
    [{ id: 'sdr-1', name: 'SDR One' }],
    [
      call(3, 'sdr-1', {
        appointment_booked: true,
        decision_maker_detected: false,
        pain_point_detected: false,
        pain_point_details: null,
        next_step: null,
        qualification_completeness_score: 20,
      }),
      call(4, 'sdr-1', {
        appointment_booked: false,
        pain_point_detected: false,
        pain_point_details: null,
        objection_detected: true,
        objection_details: null,
        qualification_completeness_score: 30,
      }),
      call(5, 'sdr-1', {
        appointment_booked: false,
        pain_point_detected: true,
        pain_point_details: 'cout',
        objection_detected: true,
        objection_details: null,
        qualification_completeness_score: 35,
      }),
    ],
    now,
  )

  assert.equal(profiles[0].priorities.length, 3)
  assert.equal(profiles[0].priorities[0].rank, 'Critique')
  assert.match(profiles[0].priorities[0].label, /Qualification/)
  assert.ok(profiles[0].priorities[0].evidence.some(item => item.label === 'Decideur non confirme' && item.count === 1))
  assert.equal(profiles[0].priorities[1].rank, 'Important')
})

test('selects clear best and joint-review call examples', () => {
  const best = call(2, 'sdr-1', {
    prospect_company: 'Atlas Bureauautique',
    sdr_quality_score: 88,
    qualification_completeness_score: 90,
  })
  const worst = call(3, 'sdr-1', {
    prospect_company: null,
    contact_name: null,
    sdr_quality_score: 0,
    ai_confidence: 40,
  })
  const profiles = buildCoachingSupervisionProfiles([{ id: 'sdr-1', name: 'SDR One' }], [best, worst], now)

  assert.equal(profiles[0].best_call?.prospect, 'Atlas Bureauautique')
  assert.equal(profiles[0].best_call?.score, 88)
  assert.equal(profiles[0].worst_call?.prospect, 'Client')
  assert.equal(profiles[0].worst_call?.reason, 'confiance IA basse')
})
