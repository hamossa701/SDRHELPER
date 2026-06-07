import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('Ringover webhook requires enabled integration and real transcription before analysis', () => {
  const route = readFileSync(join(process.cwd(), 'app', 'api', 'ringover', 'webhook', 'route.ts'), 'utf8')

  assert.match(route, /if \(!integration\.enabled\)/, 'disabled Ringover integrations must reject webhooks')
  assert.match(route, /transcribeAssemblyAiAudioUrl\(recordingUrl\)/, 'Ringover recordings must be transcribed before analysis')
  assert.doesNotMatch(route, /RINGOVER_PENDING_TRANSCRIPTION/, 'placeholder transcripts must not enter the analysis pipeline')
  assert.match(route, /external_call_id/, 'Ringover call id must be stored for idempotency')
})

test('Ringover mapping migration enforces same-organization SDR and campaign references', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20260607000003_ringover_hardening.sql'),
    'utf8'
  )

  assert.match(migration, /validate_ringover_agent_mapping/, 'mapping validation trigger must exist')
  assert.match(migration, /sdr_role IS DISTINCT FROM 'sdr'/, 'mapped user must be an SDR')
  assert.match(migration, /sdr_org IS DISTINCT FROM NEW\.organization_id/, 'mapped SDR must be in the same org')
  assert.match(migration, /campaign_org IS DISTINCT FROM NEW\.organization_id/, 'default campaign must be in the same org')
  assert.match(migration, /calls_ringover_external_call_idx/, 'Ringover call id uniqueness index must exist')
})
