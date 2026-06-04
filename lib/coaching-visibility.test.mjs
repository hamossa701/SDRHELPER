import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const page = readFileSync(join(process.cwd(), 'app', '(app)', 'coaching', 'page.tsx'), 'utf8')
const migration = readFileSync(join(process.cwd(), 'supabase', 'migration-coaching-role-scope.sql'), 'utf8')
const globals = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

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
  assert.match(page, /\.eq\('organization_id', profile\.organization_id\)/, 'coaching reads must stay organization scoped')
  assert.match(page, /sdrQuery = sdrQuery\.eq\('manager_id', managerScopeId\)/, 'manager reads must scope to assigned SDRs')
  assert.match(page, /\.in\('sdr_id', sdrs\.map\(s => s\.id\)\)/, 'call reads must use the role-scoped SDR list')
})

test('coaching page has explicit error, empty states, and development logs', () => {
  assert.match(page, /Aucune donn/, 'owner true-empty state should be explicit')
  assert.match(page, /Aucun SDR assign/, 'manager permission-empty state should be explicit')
  assert.match(page, /calls query failed|scoped SDR query failed/, 'query errors should be logged server-side')
  assert.match(page, /sdrs_returned/, 'development log should include SDR count')
  assert.match(page, /current_period_analyses/, 'development log should include current analysis count')
  assert.match(page, /previous_period_analyses/, 'development log should include previous analysis count')
  assert.match(page, /trend_source/, 'development log should include trend data source')
})

test('coaching page shows coaching-specific summaries and supervision details', () => {
  assert.match(page, /SDR stables/, 'summary must stay coaching-specific')
  assert.match(page, /SDR en progression/, 'summary must show progression')
  assert.match(page, /Coaching critique/, 'summary must distinguish critical coaching')
  assert.match(page, /Coaching leger/, 'summary must distinguish light coaching')
  assert.match(page, /Meilleur appel a partager/, 'best call example should be explicit')
  assert.match(page, /Appel a analyser ensemble/, 'joint-review call example should be explicit')
  assert.match(page, /Tendance indisponible - historique insuffisant/, 'missing trend data should be shown once at card level')
  assert.equal(/Pas assez d&apos;historique/.test(page), false, 'missing trend text should not repeat on every competency row')
  assert.match(page, /Ouvrir/, 'call examples should expose a compact open action')
})

test('coaching competency rows keep progress bars separate from score and trend text', () => {
  assert.match(page, /className="coaching-skill-row"/, 'skill rows should use a stable coaching layout class')
  assert.match(page, /gridTemplateColumns: '122px minmax\(116px, 1fr\) 148px'/, 'skill rows should split label, bar, and score/trend into separate columns')
  assert.match(page, /overflow: 'hidden'/, 'progress track should clip the fill inside its own column')
  assert.match(page, /whiteSpace: 'nowrap'/, 'score/trend text should not wrap over the bar')
  assert.match(globals, /\.coaching-profile-grid/, 'coaching grid should have scoped responsive rules')
  assert.match(globals, /grid-template-columns: 1fr !important/, 'medium and mobile screens should stack coaching sections')
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
