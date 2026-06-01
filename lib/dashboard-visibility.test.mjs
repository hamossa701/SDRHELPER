import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

function readPage(...parts) {
  return readFileSync(join(process.cwd(), 'app', '(app)', ...parts), 'utf8')
}

function compileDashboardVisibilityHelper() {
  const sourcePath = join(process.cwd(), 'lib', 'dashboard-visibility.ts')
  assert.equal(existsSync(sourcePath), true, 'lib/dashboard-visibility.ts should exist')

  const outDir = join(tmpdir(), 'sdrhelper-dashboard-visibility-tests')
  mkdirSync(outDir, { recursive: true })

  const source = readFileSync(sourcePath, 'utf8')
    .replace(/export type ProspectDisplayInput = \{[\s\S]*?\}\r?\n\r?\n/, '')
    .replace(/: ProspectDisplayInput \| null \| undefined/g, '')
  const outPath = join(outDir, `dashboard-visibility-${Date.now()}.mjs`)
  writeFileSync(outPath, source)

  return import(`file:///${outPath.replaceAll('\\', '/')}`)
}

test('completed dashboard queries do not use prospect_company as a visibility gate', () => {
  const pages = [
    ['owner', readPage('dashboard', 'page.tsx')],
    ['manager', readPage('manager', 'page.tsx')],
    ['sdr', readPage('sdr', 'page.tsx')],
  ]

  for (const [role, page] of pages) {
    assert.equal(
      page.includes(".not('call_analyses.prospect_company'"),
      false,
      `${role} completed analyses with a null prospect_company must remain visible`,
    )
    assert.equal(
      page.includes(".neq('call_analyses.prospect_company'"),
      false,
      `${role} placeholder prospect labels must be presentation concerns, not query visibility filters`,
    )
  }
})

test('owner completed dashboard visibility is scoped only by organization and completion', () => {
  const page = readPage('dashboard', 'page.tsx')

  assert.match(page, /call_analyses!inner\(/, 'owner dashboard must require a linked call analysis')
  assert.match(page, /analysis_jobs!inner\(status\)/, 'owner dashboard must require a linked analysis job')
  assert.match(page, /\.eq\('organization_id', profile\.organization_id\)/, 'owner dashboard must stay organization scoped')
  assert.match(page, /\.eq\('analysis_jobs\.status', 'completed'\)/, 'owner dashboard must only list completed analyses')
  assert.equal(
    page.includes(".eq('assigned_to'"),
    false,
    'owner visibility must not require a manager assignment',
  )
})

test('manager completed dashboard visibility includes organization completed calls without action assignment gates', () => {
  const page = readPage('manager', 'page.tsx')

  assert.match(page, /call_analyses!inner\(/, 'manager dashboard must require a linked call analysis')
  assert.match(page, /analysis_jobs!inner\(status\)/, 'manager dashboard must require a linked analysis job')
  assert.match(page, /\.eq\('organization_id', profile\.organization_id\)/, 'manager dashboard must stay organization scoped')
  assert.match(page, /\.eq\('analysis_jobs\.status', 'completed'\)/, 'manager dashboard must only list completed analyses')
  assert.equal(
    page.includes(".eq('assigned_to'"),
    false,
    'manager dashboard visibility must not reuse action assignment gates',
  )
})

test('prospect display fallback keeps null-company analyzed calls visible', async () => {
  const { formatProspectDisplay } = await compileDashboardVisibilityHelper()

  assert.equal(formatProspectDisplay({ prospect_company: 'TechNova', contact_name: 'Monsieur Bernard' }), 'TechNova')
  assert.equal(formatProspectDisplay({ prospect_company: null, contact_name: 'Monsieur Bernard' }), 'Monsieur Bernard')
  assert.equal(formatProspectDisplay({ prospect_company: null, contact_name: null }), 'Prospect non identifié')
})
