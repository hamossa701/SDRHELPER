import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function importEvaluationModule() {
  const sourcePath = join(process.cwd(), 'lib', 'evaluation.ts')
  assert.equal(existsSync(sourcePath), true, 'lib/evaluation.ts should exist')

  const outDir = join(tmpdir(), 'sdrhelper-evaluation-tests')
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
  const outPath = join(outDir, `evaluation-${Date.now()}.mjs`)
  writeFileSync(outPath, compiled.outputText)
  return import(pathToFileURL(outPath).href)
}

test('scoreEvaluationComparison subtracts weighted mismatches and reports failed fields', async () => {
  const { scoreEvaluationComparison } = await importEvaluationModule()

  const result = scoreEvaluationComparison(
    {
      decision_maker: true,
      rdv_pose: true,
      rdv_qualifie: true,
      temperature: 'hot',
    },
    {
      decision_maker: false,
      rdv_pose: true,
      rdv_qualifie: false,
      temperature: 'warm',
    },
  )

  assert.equal(result.score, 25)
  assert.equal(result.passed, false)
  assert.deepEqual(result.mismatches, ['decision_maker', 'rdv_qualifie', 'temperature'])
})

test('scoreEvaluationComparison passes only exact human-vs-AI judgments', async () => {
  const { scoreEvaluationComparison } = await importEvaluationModule()

  const result = scoreEvaluationComparison(
    {
      decision_maker: false,
      rdv_pose: false,
      rdv_qualifie: false,
      temperature: 'cold',
    },
    {
      decision_maker: false,
      rdv_pose: false,
      rdv_qualifie: false,
      temperature: 'cold',
    },
  )

  assert.equal(result.score, 100)
  assert.equal(result.passed, true)
  assert.deepEqual(result.mismatches, [])
})

test('mapAIAnalysisToEvaluationJudgment treats a booked meeting as qualified only with core qualification evidence', async () => {
  const { mapAIAnalysisToEvaluationJudgment } = await importEvaluationModule()

  const judgment = mapAIAnalysisToEvaluationJudgment({
    prospect: {
      decision_maker_detected: true,
    },
    qualification: {
      pain_point_detected: true,
      interest_level: 'hot',
    },
    appointment: {
      appointment_booked: true,
      appointment_date_text: 'mardi 10h',
      appointment_datetime: null,
      appointment_quality_score: 72,
    },
  })

  assert.deepEqual(judgment, {
    decision_maker: true,
    rdv_pose: true,
    rdv_qualifie: true,
    temperature: 'hot',
  })
})
