import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function importTsModule(name) {
  const sourcePath = join(process.cwd(), 'lib', `${name}.ts`)
  assert.equal(existsSync(sourcePath), true, `lib/${name}.ts should exist`)

  const outDir = join(process.cwd(), 'test-results', 'appointment-date-tests')
  mkdirSync(outDir, { recursive: true })
  const source = readFileSync(sourcePath, 'utf8')
    .replace(
      "import { DEFAULT_APPOINTMENT_TIME_ZONE } from '@/lib/appointment-date'\n",
      "const DEFAULT_APPOINTMENT_TIME_ZONE = 'Europe/Paris'\n",
    )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
    },
  })
  const outPath = join(outDir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(outPath, compiled.outputText)
  const imported = await import(pathToFileURL(outPath).href)
  try { rmSync(outPath, { force: true }) } catch(_) {}
  return imported
}

test('normalizes and displays French B2B appointment times in Europe/Paris wall time', async () => {
  const { normalizeFrenchAppointmentDate } = await importTsModule('appointment-date')
  const { formatAppointmentDate } = await importTsModule('utils')

  const normalized = normalizeFrenchAppointmentDate('jeudi prochain à 14h', '2026-06-01T09:00:00Z')

  assert.equal(normalized, '2026-06-04T12:00:00.000Z')
  assert.equal(formatAppointmentDate(normalized), '04/06/2026 14:00')
})

test('prefers the spoken appointment text over an AI ISO instant that shifts wall time', async () => {
  const { resolveAppointmentDate } = await importTsModule('appointment-date')

  const resolved = resolveAppointmentDate({
    aiDatetime: '2026-06-04T14:00:00Z',
    aiDateText: 'jeudi prochain à 14h',
    transcript: 'Prospect: jeudi prochain à 14h.',
    callDatetime: '2026-06-01T09:00:00Z',
    aiConfidence: 'high',
  })

  assert.equal(resolved.text, 'jeudi prochain à 14h')
  assert.equal(resolved.datetime, '2026-06-04T12:00:00.000Z')
  assert.equal(resolved.confidence, 'high')
})
