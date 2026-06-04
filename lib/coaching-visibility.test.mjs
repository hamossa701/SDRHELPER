import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const page = readFileSync(join(process.cwd(), 'app', '(app)', 'coaching', 'page.tsx'), 'utf8')
const migration = readFileSync(join(process.cwd(), 'supabase', 'migration-coaching-role-scope.sql'), 'utf8')

test('coaching page allows only owner and manager supervision roles', () => {
  assert.match(
    page,
    /!\['owner', 'manager'\]\.includes\(profile\.role\)/,
    'clients and SDRs must not access coaching supervision',
  )
})

test('coaching page scopes owner by organization and manager by assigned SDRs', () => {
  assert.match(
    page,
    /const managerScopeId = profile\.role === 'manager' \? user\.id : null/,
    'owner must pass null manager scope, manager must pass current user id',
  )
  assert.match(page, /p_org_id: profile\.organization_id/, 'coaching RPC must stay organization scoped')
  assert.match(page, /p_manager_id: managerScopeId/, 'coaching RPC must use role-derived manager scope')
})

test('coaching page has explicit error and empty states', () => {
  assert.match(page, /Aucune donnée coaching disponible/, 'owner true-empty state should be explicit')
  assert.match(page, /Aucun SDR assigné à votre équipe/, 'manager permission-empty state should be explicit')
  assert.match(page, /get_sdr_coaching_stats failed/, 'RPC errors should be logged server-side')
  assert.match(page, /sdrs_returned/, 'development log should include SDR count')
  assert.match(page, /coaching_records_returned/, 'development log should include coaching record count')
})

test('coaching RPC is non-recursive and manager_id is optional', () => {
  assert.match(
    migration,
    /p_manager_id uuid default null/,
    'RPC must accept an optional manager scope',
  )
  assert.match(
    migration,
    /and \(p_manager_id is null or u\.manager_id = p_manager_id\)/,
    'RPC must not filter owners by manager_id',
  )
  assert.equal(
    /from public\.get_sdr_coaching_stats\(/.test(migration),
    false,
    'RPC implementation must not wrap or recurse into get_sdr_coaching_stats',
  )
})
