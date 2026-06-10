import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function importAIAnalysisModule() {
  const sourcePath = join(process.cwd(), 'lib', 'ai-analysis.ts')
  assert.equal(existsSync(sourcePath), true, 'lib/ai-analysis.ts should exist')

  const outDir = join(process.cwd(), 'test-results', 'ai-analysis-tests')
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
  const outPath = join(outDir, `ai-analysis-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(outPath, compiled.outputText)
  const imported = await import(pathToFileURL(outPath).href)
  try { rmSync(outPath, { force: true }) } catch(_) {}
  return imported
}

const validAnalysisJson = JSON.stringify({
  call_summary: 'Resume court',
  prospect: {
    company: null,
    contact_name: null,
    contact_role: null,
    decision_maker_detected: null,
  },
  qualification: {
    pain_point_detected: null,
    pain_point_details: null,
    urgency: null,
    current_solution: null,
    interest_level: 'cold',
    objection_detected: false,
    objection_type: null,
    objection_details: null,
    missing_information: [],
  },
  appointment: {
    appointment_booked: false,
    appointment_date_text: null,
    appointment_datetime: null,
    appointment_date_confidence: null,
    appointment_quality_score: 0,
    quality_reason: 'Pas de rendez-vous confirme',
    next_step: null,
  },
  sdr_performance: {
    sdr_quality_score: 0,
    qualification_completeness_score: 0,
    strengths: [],
    weaknesses: [],
    coaching_recommendations: [],
  },
  risk_control: {
    ai_confidence: 0,
    hallucination_risk: 'low',
    uncertain_fields: [],
  },
})

test('parseAIAnalysisResponse returns controlled error for malformed JSON without leaking raw output', async () => {
  const { AIAnalysisValidationError, parseAIAnalysisResponse } = await importAIAnalysisModule()

  assert.throws(
    () => parseAIAnalysisResponse('{"prospect": '),
    (error) => {
      assert.equal(error instanceof AIAnalysisValidationError, true)
      assert.equal(error.message, 'Reponse IA invalide: JSON malforme')
      assert.equal(error.message.includes('prospect'), false)
      return true
    },
  )
})

test('parseAIAnalysisResponse rejects missing required top-level sections', async () => {
  const { AIAnalysisValidationError, parseAIAnalysisResponse } = await importAIAnalysisModule()
  const invalid = JSON.stringify({ ...JSON.parse(validAnalysisJson), risk_control: undefined })

  assert.throws(
    () => parseAIAnalysisResponse(invalid),
    (error) => {
      assert.equal(error instanceof AIAnalysisValidationError, true)
      assert.equal(error.message, 'Reponse IA invalide: sections manquantes risk_control')
      return true
    },
  )
})

test('parseAIAnalysisResponse accepts fenced valid JSON and returns compatible analysis shape', async () => {
  const { parseAIAnalysisResponse } = await importAIAnalysisModule()

  const parsed = parseAIAnalysisResponse(`\`\`\`json\n${validAnalysisJson}\n\`\`\``)

  assert.equal(parsed.qualification.interest_level, 'cold')
  assert.deepEqual(Object.keys(parsed).filter(key => key !== 'call_summary').sort(), [
    'appointment',
    'prospect',
    'qualification',
    'risk_control',
    'sdr_performance',
  ])
})
