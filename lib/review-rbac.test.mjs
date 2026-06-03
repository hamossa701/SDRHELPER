import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function importRbacModule() {
  const sourcePath = join(process.cwd(), 'lib', 'review-rbac.ts')
  assert.equal(existsSync(sourcePath), true, 'lib/review-rbac.ts should exist')

  const outDir = join(tmpdir(), 'sdrhelper-review-rbac-tests')
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
  const outPath = join(outDir, `review-rbac-${Date.now()}.mjs`)
  writeFileSync(outPath, compiled.outputText)
  return import(pathToFileURL(outPath).href)
}

const owner = { organization_id: 'org-1', role: 'owner' }
const manager = { organization_id: 'org-1', role: 'manager' }
const sdr = { organization_id: 'org-1', role: 'sdr' }

test('owners can act on calls in their organization regardless of assignment', async () => {
  const { canClaimReview, canResolveReview, canValidateAnalysis } = await importRbacModule()
  const assignedElsewhere = { organization_id: 'org-1', assigned_to: 'manager-2', review_status: 'in_review' }

  assert.equal(canClaimReview(owner, 'owner-1', assignedElsewhere).allowed, true)
  assert.equal(canResolveReview(owner, 'owner-1', assignedElsewhere).allowed, true)
  assert.equal(canValidateAnalysis(owner, 'owner-1', assignedElsewhere).allowed, true)
})

test('managers can claim only unassigned reviews in their organization', async () => {
  const { canClaimReview } = await importRbacModule()

  assert.equal(canClaimReview(manager, 'manager-1', { organization_id: 'org-1', assigned_to: null, review_status: 'open' }).allowed, true)
  assert.equal(canClaimReview(manager, 'manager-1', { organization_id: 'org-1', assigned_to: 'manager-2', review_status: 'in_review' }).allowed, false)
  assert.equal(canClaimReview(manager, 'manager-1', { organization_id: 'org-2', assigned_to: null, review_status: 'open' }).status, 404)
})

test('managers can resolve or validate only calls assigned to themselves', async () => {
  const { canResolveReview, canValidateAnalysis } = await importRbacModule()

  assert.equal(canResolveReview(manager, 'manager-1', { organization_id: 'org-1', assigned_to: 'manager-1' }).allowed, true)
  assert.equal(canValidateAnalysis(manager, 'manager-1', { organization_id: 'org-1', assigned_to: 'manager-1' }).allowed, true)
  assert.equal(canResolveReview(manager, 'manager-1', { organization_id: 'org-1', assigned_to: null }).allowed, false)
  assert.equal(canValidateAnalysis(manager, 'manager-1', { organization_id: 'org-1', assigned_to: 'manager-2' }).allowed, false)
})

test('managers can act on calls owned by their assigned SDRs', async () => {
  const { canClaimReview, canResolveReview, canValidateAnalysis } = await importRbacModule()
  const teamCall = { organization_id: 'org-1', sdr_manager_id: 'manager-1', assigned_to: null, review_status: 'open' }

  assert.equal(canClaimReview(manager, 'manager-1', teamCall).allowed, true)
  assert.equal(canResolveReview(manager, 'manager-1', { ...teamCall, assigned_to: 'manager-1' }).allowed, true)
  assert.equal(canValidateAnalysis(manager, 'manager-1', teamCall).allowed, true)
})

test('managers cannot act on calls owned by another manager team', async () => {
  const { canClaimReview, canResolveReview, canValidateAnalysis } = await importRbacModule()
  const otherTeamCall = { organization_id: 'org-1', sdr_manager_id: 'manager-2', assigned_to: null, review_status: 'open' }

  assert.equal(canClaimReview(manager, 'manager-1', otherTeamCall).status, 404)
  assert.equal(canResolveReview(manager, 'manager-1', { ...otherTeamCall, assigned_to: 'manager-1' }).status, 404)
  assert.equal(canValidateAnalysis(manager, 'manager-1', otherTeamCall).status, 404)
})

test('sdrs cannot claim, resolve, approve, or correct manager review items', async () => {
  const { canClaimReview, canResolveReview, canValidateAnalysis } = await importRbacModule()
  const call = { organization_id: 'org-1', assigned_to: null, review_status: 'open' }

  assert.equal(canClaimReview(sdr, 'sdr-1', call).status, 403)
  assert.equal(canResolveReview(sdr, 'sdr-1', call).status, 403)
  assert.equal(canValidateAnalysis(sdr, 'sdr-1', call).status, 403)
})
