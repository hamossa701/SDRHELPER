/**
 * RLS isolation tests.
 *
 * Prerequisites — set these env vars before running:
 *   SUPABASE_URL              public project URL
 *   SUPABASE_ANON_KEY         anon/public key
 *   SUPABASE_SERVICE_ROLE_KEY service-role key (test setup only)
 *
 * How to run:
 *   npm run test:rls
 *
 * The tests create two orgs, one user per role in each org, insert
 * representative rows, then assert cross-org and cross-role isolation.
 * All test data is cleaned up in afterAll.
 */

import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL      ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY before running RLS tests.'
  )
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientAs(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
}

async function signIn(email: string, password: string) {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`)
  return data.session.access_token
}

async function createAuthUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`createAuthUser ${email}: ${error.message}`)
  return data.user!.id
}

// ── Test state ────────────────────────────────────────────────────────────────

let orgAId: string, orgBId: string
let ownerAId: string, managerAId: string, sdrAId: string, clientAId: string
let ownerBId: string, managerBId: string, sdrBId: string
let clientAccountAId: string, clientAccountBId: string
let campaignAId: string, campaignBId: string
let callAId: string, callBId: string
let analysisAId: string

let ownerAJwt: string, managerAJwt: string, sdrAJwt: string
let clientAJwt: string, ownerBJwt: string, sdrBJwt: string

const TEST_PASSWORD = 'TestPass123!'
const TAG = `rls-test-${Date.now()}`

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const { data: orgA } = await admin.from('organizations').insert({ name: `${TAG}-orgA` }).select('id').single()
  const { data: orgB } = await admin.from('organizations').insert({ name: `${TAG}-orgB` }).select('id').single()
  orgAId = orgA!.id
  orgBId = orgB!.id

  ownerAId   = await createAuthUser(`${TAG}-ownerA@test.invalid`,   TEST_PASSWORD)
  managerAId = await createAuthUser(`${TAG}-managerA@test.invalid`, TEST_PASSWORD)
  sdrAId     = await createAuthUser(`${TAG}-sdrA@test.invalid`,     TEST_PASSWORD)
  clientAId  = await createAuthUser(`${TAG}-clientA@test.invalid`,  TEST_PASSWORD)
  ownerBId   = await createAuthUser(`${TAG}-ownerB@test.invalid`,   TEST_PASSWORD)
  managerBId = await createAuthUser(`${TAG}-managerB@test.invalid`, TEST_PASSWORD)
  sdrBId     = await createAuthUser(`${TAG}-sdrB@test.invalid`,     TEST_PASSWORD)

  const { data: clientAccount, error: caErr } = await admin.from('client_accounts').insert({
    organization_id: orgAId, name: 'TestClient',
  }).select('id').single()
  if (caErr) throw new Error(`client_accounts orgA insert: ${caErr.message}`)
  clientAccountAId = clientAccount!.id

  const { data: clientAccountB, error: caBErr } = await admin.from('client_accounts').insert({
    organization_id: orgBId, name: 'TestClientB',
  }).select('id').single()
  if (caBErr) throw new Error(`client_accounts orgB insert: ${caBErr.message}`)
  clientAccountBId = clientAccountB!.id

  const { error: usersErr } = await admin.from('users').insert([
    { id: ownerAId,   organization_id: orgAId, role: 'owner',   name: 'OwnerA',   email: `${TAG}-ownerA@test.invalid` },
    { id: managerAId, organization_id: orgAId, role: 'manager', name: 'ManagerA', email: `${TAG}-managerA@test.invalid` },
    { id: sdrAId,     organization_id: orgAId, role: 'sdr',     name: 'SdrA',     email: `${TAG}-sdrA@test.invalid`, manager_id: managerAId },
    { id: clientAId,  organization_id: orgAId, role: 'client',  name: 'ClientA',  email: `${TAG}-clientA@test.invalid`, client_id: clientAccountAId },
    { id: ownerBId,   organization_id: orgBId, role: 'owner',   name: 'OwnerB',   email: `${TAG}-ownerB@test.invalid` },
    { id: managerBId, organization_id: orgBId, role: 'manager', name: 'ManagerB', email: `${TAG}-managerB@test.invalid` },
    { id: sdrBId,     organization_id: orgBId, role: 'sdr',     name: 'SdrB',     email: `${TAG}-sdrB@test.invalid` },
  ])
  if (usersErr) throw new Error(`users insert: ${usersErr.message}`)

  const { data: campaign, error: campErr } = await admin.from('campaigns').insert({
    organization_id: orgAId, campaign_name: `${TAG}-campaign`, client_name: 'TestClient', status: 'active', manager_id: managerAId, client_id: clientAccountAId,
  }).select('id').single()
  if (campErr) throw new Error(`campaignA insert: ${campErr.message}`)
  campaignAId = campaign!.id

  const today = new Date().toISOString().slice(0, 10)
  const { error: assignErr } = await admin.from('campaign_assignments').insert({
    organization_id: orgAId, campaign_id: campaignAId, sdr_id: sdrAId,
    assigned_by: managerAId, starts_at: today, ends_at: '2099-12-31', status: 'active',
  })
  if (assignErr) throw new Error(`campaign_assignments insert: ${assignErr.message}`)

  const { data: campaignB, error: campBErr } = await admin.from('campaigns').insert({
    organization_id: orgBId, campaign_name: `${TAG}-campaignB`, client_name: 'TestClientB', status: 'active', manager_id: managerBId, client_id: clientAccountBId,
  }).select('id').single()
  if (campBErr) throw new Error(`campaignB insert: ${campBErr.message}`)
  campaignBId = campaignB!.id

  const { data: callA, error: callAErr } = await admin.from('calls').insert({
    organization_id: orgAId, campaign_id: campaignAId, sdr_id: sdrAId,
    transcript: 'test transcript', call_datetime: new Date().toISOString(),
  }).select('id').single()
  if (callAErr) throw new Error(`callA insert: ${callAErr.message}`)
  callAId = callA!.id

  const { data: callB, error: callBErr } = await admin.from('calls').insert({
    organization_id: orgBId, campaign_id: campaignBId, sdr_id: sdrBId,
    transcript: 'test transcript B', call_datetime: new Date().toISOString(),
  }).select('id').single()
  if (callBErr) throw new Error(`callB insert: ${callBErr.message}`)
  callBId = callB!.id

  const { data: analysis, error: analysisErr } = await admin.from('call_analyses').insert({
    call_id: callAId, appointment_booked: false, decision_maker_detected: false,
    interest_level: 'cold', objection_detected: false,
  }).select('id').single()
  if (analysisErr) throw new Error(`analysis insert: ${analysisErr.message}`)
  analysisAId = analysis!.id

  ownerAJwt   = await signIn(`${TAG}-ownerA@test.invalid`,   TEST_PASSWORD)
  managerAJwt = await signIn(`${TAG}-managerA@test.invalid`, TEST_PASSWORD)
  sdrAJwt     = await signIn(`${TAG}-sdrA@test.invalid`,     TEST_PASSWORD)
  clientAJwt  = await signIn(`${TAG}-clientA@test.invalid`,  TEST_PASSWORD)
  ownerBJwt   = await signIn(`${TAG}-ownerB@test.invalid`,   TEST_PASSWORD)
  sdrBJwt     = await signIn(`${TAG}-sdrB@test.invalid`,     TEST_PASSWORD)
}, 60_000)

afterAll(async () => {
  await admin.from('call_analyses').delete().eq('call_id', callAId)
  await admin.from('calls').delete().eq('organization_id', orgAId)
  await admin.from('calls').delete().eq('organization_id', orgBId)
  await admin.from('campaign_assignments').delete().eq('campaign_id', campaignAId)
  await admin.from('campaigns').delete().eq('organization_id', orgAId)
  await admin.from('campaigns').delete().eq('organization_id', orgBId)
  await admin.from('client_accounts').delete().eq('organization_id', orgAId)
  await admin.from('client_accounts').delete().eq('organization_id', orgBId)
  await admin.from('users').delete().eq('organization_id', orgAId)
  await admin.from('users').delete().eq('organization_id', orgBId)
  await admin.from('organizations').delete().in('id', [orgAId, orgBId])
  for (const uid of [ownerAId, managerAId, sdrAId, clientAId, ownerBId, managerBId, sdrBId]) {
    await admin.auth.admin.deleteUser(uid)
  }
}, 30_000)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Cross-org isolation — calls', () => {
  it('OwnerB cannot SELECT calls from OrgA', async () => {
    const { data } = await clientAs(ownerBJwt).from('calls').select('id').eq('id', callAId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('SdrB cannot SELECT calls from OrgA', async () => {
    const { data } = await clientAs(sdrBJwt).from('calls').select('id').eq('id', callAId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('OwnerB cannot UPDATE calls from OrgA', async () => {
    await clientAs(ownerBJwt).from('calls').update({ transcript: 'hacked' }).eq('id', callAId)
    const { data } = await admin.from('calls').select('transcript').eq('id', callAId).single()
    expect(data?.transcript).toBe('test transcript')
  })

  it('OwnerB cannot DELETE calls from OrgA', async () => {
    await clientAs(ownerBJwt).from('calls').delete().eq('id', callAId)
    const { data } = await admin.from('calls').select('id').eq('id', callAId).single()
    expect(data?.id).toBe(callAId)
  })
})

describe('Cross-org isolation — call_analyses', () => {
  it('OwnerB cannot SELECT analyses from OrgA', async () => {
    const { data } = await clientAs(ownerBJwt).from('call_analyses').select('id').eq('id', analysisAId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('SdrB cannot SELECT analyses from OrgA', async () => {
    const { data } = await clientAs(sdrBJwt).from('call_analyses').select('id').eq('id', analysisAId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('OwnerB cannot DELETE analyses from OrgA', async () => {
    await clientAs(ownerBJwt).from('call_analyses').delete().eq('id', analysisAId)
    const { data } = await admin.from('call_analyses').select('id').eq('id', analysisAId).single()
    expect(data?.id).toBe(analysisAId)
  })
})

describe('Cross-org isolation — campaigns', () => {
  it('OwnerB cannot SELECT campaigns from OrgA', async () => {
    const { data } = await clientAs(ownerBJwt).from('campaigns').select('id').eq('id', campaignAId)
    expect(data?.length ?? 0).toBe(0)
  })
})

describe('Cross-org isolation — users', () => {
  it('OwnerB cannot SELECT users from OrgA', async () => {
    const { data } = await clientAs(ownerBJwt).from('users').select('id').eq('organization_id', orgAId)
    expect(data?.length ?? 0).toBe(0)
  })
})

describe('SDR role — own-data access', () => {
  it('SdrA can SELECT their own calls', async () => {
    const { data } = await clientAs(sdrAJwt).from('calls').select('id').eq('id', callAId)
    expect(data?.length).toBe(1)
  })

  it('SdrA cannot SELECT calls from OrgB', async () => {
    const { data } = await clientAs(sdrAJwt).from('calls').select('id').eq('id', callBId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('SdrA cannot UPDATE calls from OrgB', async () => {
    await clientAs(sdrAJwt).from('calls').update({ transcript: 'sdr-hack' }).eq('id', callBId)
    const { data } = await admin.from('calls').select('transcript').eq('id', callBId).single()
    expect(data?.transcript).toBe('test transcript B')
  })
})

describe('Client role — restricted visibility', () => {
  it('Client cannot SELECT calls (no client_visibility grant)', async () => {
    const { data } = await clientAs(clientAJwt).from('calls').select('id').eq('organization_id', orgAId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('Client cannot UPDATE calls', async () => {
    await clientAs(clientAJwt).from('calls').update({ transcript: 'client-hack' }).eq('id', callAId)
    const { data } = await admin.from('calls').select('transcript').eq('id', callAId).single()
    expect(data?.transcript).toBe('test transcript')
  })
})

describe('Privilege escalation — users INSERT', () => {
  it('SDR cannot INSERT a users row with owner role', async () => {
    const { error } = await clientAs(sdrAJwt).from('users').insert({
      id: '00000000-0000-0000-0000-000000000099',
      organization_id: orgAId, role: 'owner', name: 'Hack', email: 'hack1@test.invalid',
    })
    expect(error).not.toBeNull()
  })

  it('SDR cannot INSERT a users row with manager role', async () => {
    const { error } = await clientAs(sdrAJwt).from('users').insert({
      id: '00000000-0000-0000-0000-000000000098',
      organization_id: orgAId, role: 'manager', name: 'Hack', email: 'hack2@test.invalid',
    })
    expect(error).not.toBeNull()
  })

  it('SDR cannot INSERT a users row into another org', async () => {
    const { error } = await clientAs(sdrAJwt).from('users').insert({
      id: '00000000-0000-0000-0000-000000000097',
      organization_id: orgBId, role: 'sdr', name: 'CrossOrg', email: 'hack3@test.invalid',
    })
    expect(error).not.toBeNull()
  })
})

describe('Manager role — team-scoped UPDATE', () => {
  it('ManagerA cannot UPDATE a call from OrgB', async () => {
    await clientAs(managerAJwt).from('calls').update({ transcript: 'mgr-hack' }).eq('id', callBId)
    const { data } = await admin.from('calls').select('transcript').eq('id', callBId).single()
    expect(data?.transcript).toBe('test transcript B')
  })
})
