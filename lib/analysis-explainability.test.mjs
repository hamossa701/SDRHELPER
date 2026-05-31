import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function importExplainabilityModule() {
  const sourcePath = join(process.cwd(), 'lib', 'analysis-explainability.ts')
  assert.equal(existsSync(sourcePath), true, 'lib/analysis-explainability.ts should exist')

  const outDir = join(tmpdir(), 'sdrhelper-explainability-tests')
  mkdirSync(outDir, { recursive: true })
  const source = readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
    },
  })
  const outPath = join(outDir, `analysis-explainability-${Date.now()}.mjs`)
  writeFileSync(outPath, compiled.outputText)
  return import(pathToFileURL(outPath).href)
}

const baseAnalysis = {
  prospect_company: 'TechNova Industrie',
  contact_name: 'Nadia Morel',
  contact_role: 'DSI',
  decision_maker_detected: true,
  pain_point_detected: true,
  pain_point_details: 'reduction des couts telecoms',
  urgency: 'priorite 9/10 avant renouvellement',
  current_solution: 'PIKASUS',
  interest_level: 'hot',
  appointment_booked: true,
  appointment_date_text: 'jeudi 14h30',
  appointment_datetime: null,
  appointment_date_confidence: 'medium',
  appointment_quality_score: 88,
  appointment_quality_reason: 'Decideur confirme, besoin clair, parc important et RDV planifie.',
  next_step: 'Audit telecom jeudi 14h30',
  sdr_quality_score: 84,
  qualification_completeness_score: 90,
  strengths: ['Bonne qualification du parc telecom'],
  weaknesses: [],
  coaching_recommendations: ['Continuer a confirmer la date de fin d engagement'],
  missing_information: ['Budget exact', 'Date de decision finale'],
}

test('buildAnalysisExplainability explains a qualified TechNova appointment from saved fields and transcript evidence', async () => {
  const { buildAnalysisExplainability } = await importExplainabilityModule()

  const explanation = buildAnalysisExplainability({
    role: 'owner',
    call: {
      transcript: [
        'SDR: Vous etes bien DSI chez TechNova Industrie ?',
        'Prospect: Oui, je suis la decisionnaire technique.',
        'Prospect: Nous avons 145 lignes mobiles, 4 sites, et PIKASUS devient trop cher.',
        'Prospect: C est priorite 9/10 avant le renouvellement.',
        'SDR: Jeudi 14h30 pour un audit ? Prospect: Oui, envoyez l invitation.',
      ].join('\n'),
    },
    analysis: baseAnalysis,
    qualifiedAppointment: true,
  })

  assert.equal(explanation.qualification.qualified, true)
  assert.equal(explanation.qualification.reasons.some(item => item.label === 'Decideur identifie' && item.evidence?.includes('decisionnaire technique')), true)
  assert.equal(explanation.temperature.level, 'hot')
  assert.equal(explanation.score.value, 88)
  assert.equal(explanation.score.isApproximation, true)
  assert.equal(explanation.score.breakdown.some(item => item.label === 'RDV' && item.points > 0), true)
  assert.deepEqual(explanation.missingInfo.map(item => item.label), ['Budget exact non detecte', 'Date de decision finale non detectee'])
  assert.equal(explanation.recommendation.length > 0, true)
})

test("buildAnalysisExplainability uses Non détecté dans l'appel when qualification evidence is missing", async () => {
  const { buildAnalysisExplainability } = await importExplainabilityModule()

  const explanation = buildAnalysisExplainability({
    role: 'client',
    call: { transcript: 'Prospect: Envoyez une plaquette, je ne peux rien confirmer.' },
    analysis: {
      ...baseAnalysis,
      contact_role: null,
      decision_maker_detected: false,
      pain_point_detected: false,
      pain_point_details: null,
      urgency: null,
      interest_level: 'cold',
      appointment_booked: false,
      appointment_date_text: null,
      appointment_quality_score: 22,
      appointment_quality_reason: null,
      next_step: null,
      missing_information: [],
    },
    qualifiedAppointment: false,
  })

  assert.equal(explanation.qualification.qualified, false)
  assert.equal(explanation.qualification.reasons.some(item => item.evidence === "Non détecté dans l'appel"), true)
  assert.equal(explanation.score.breakdown.some(item => item.label === 'Decideur' && item.points === 0), true)
  assert.equal(explanation.coachingNotes.length, 0, 'client view should not receive coaching notes')
})
