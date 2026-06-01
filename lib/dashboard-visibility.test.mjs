import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('SDR completed dashboard queries do not use prospect_company as a visibility gate', () => {
  const page = readFileSync(join(process.cwd(), 'app', '(app)', 'sdr', 'page.tsx'), 'utf8')

  assert.equal(
    page.includes(".not('call_analyses.prospect_company'"),
    false,
    'completed analyses with a null prospect_company must remain visible',
  )
  assert.equal(
    page.includes(".neq('call_analyses.prospect_company'"),
    false,
    'placeholder prospect labels must be presentation concerns, not query visibility filters',
  )
})
