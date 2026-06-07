import { after, NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { processJobById } from '@/lib/job-processor'
import { transcribeAssemblyAiAudioUrl } from '@/lib/assemblyai'

export const maxDuration = 300

interface RingoverPayload {
  event: string
  data: {
    call_id: string
    agent_id: number
    duration: number
    recording_url: string | null
    start_time: string
    direction: 'inbound' | 'outbound'
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'Missing org_id' }, { status: 400 })

  const rawBody = await request.text()
  const signature = request.headers.get('x-ringover-signature') ?? ''

  const admin = createAdminClient()

  const { data: integration } = await admin
    .from('ringover_integrations')
    .select('webhook_secret, enabled')
    .eq('organization_id', orgId)
    .single()

  if (!integration) {
    return NextResponse.json({}, { status: 401 })
  }
  if (!integration.enabled) {
    return NextResponse.json({ error: 'Integration disabled' }, { status: 403 })
  }

  const expected = crypto
    .createHmac('sha256', integration.webhook_secret)
    .update(rawBody)
    .digest('hex')
  const received = (signature.startsWith('sha256=') ? signature.slice(7) : signature).toLowerCase()

  let sigValid = false
  try {
    sigValid =
      expected.length === received.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  } catch {
    sigValid = false
  }
  if (!sigValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: RingoverPayload
  try {
    payload = JSON.parse(rawBody) as RingoverPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { event, data: callData } = payload

  if (event !== 'call.ended' && event !== 'CALL_ENDED') {
    return NextResponse.json({})
  }

  if (!callData.recording_url) {
    console.log('[ringover-webhook] call.ended without recording_url, skipping:', callData.call_id)
    return NextResponse.json({})
  }

  const { data: agentMapping } = await admin
    .from('ringover_agent_mappings')
    .select('sdr_id, default_campaign_id')
    .eq('organization_id', orgId)
    .eq('ringover_agent_id', callData.agent_id)
    .single()

  if (!agentMapping) {
    console.log('[ringover-webhook] agent not mapped, skipping:', callData.agent_id, '| org:', orgId)
    return NextResponse.json({ ok: true, skipped: 'agent_not_mapped' })
  }

  if (!agentMapping.default_campaign_id) {
    console.warn('[ringover-webhook] agent has no default_campaign_id, skipping:', callData.agent_id, '| org:', orgId)
    return NextResponse.json({ ok: true, skipped: 'no_default_campaign' })
  }

  const duration = callData.duration ?? 0
  if (duration < 120) {
    console.log(`[ringover-webhook] call too short (${duration}s), skipping:`, callData.call_id)
    return NextResponse.json({ ok: true, skipped: 'call_too_short', duration })
  }

  const sdrId = agentMapping.sdr_id
  const campaignId = agentMapping.default_campaign_id
  const recordingUrl = callData.recording_url
  const startTime = callData.start_time

  after(async () => {
    try {
      const { data: existingCall } = await admin
        .from('calls')
        .select('id')
        .eq('organization_id', orgId)
        .eq('source', 'ringover')
        .eq('external_call_id', callData.call_id)
        .maybeSingle()

      if (existingCall) {
        const { data: existingJob } = await admin
          .from('analysis_jobs')
          .select('id, status')
          .eq('organization_id', orgId)
          .eq('call_id', existingCall.id)
          .in('status', ['pending', 'processing', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existingJob) {
          console.log('[ringover-webhook] duplicate event, skipping transcription:', callData.call_id)
          return
        }
      }

      const transcription = await transcribeAssemblyAiAudioUrl(recordingUrl)
      const resolvedDuration = transcription.duration_seconds || duration
      if (resolvedDuration < 120) {
        console.log(`[ringover-webhook] transcribed call too short (${resolvedDuration}s), skipping:`, callData.call_id)
        return
      }

      const callPayload = {
        organization_id: orgId,
        campaign_id: campaignId,
        sdr_id: sdrId,
        transcript: transcription.transcript,
        audio_url: recordingUrl,
        call_datetime: startTime,
        call_duration_seconds: resolvedDuration,
        source: 'ringover',
        external_call_id: callData.call_id,
      }

      const { data: call, error: callErr } = existingCall
        ? await admin
          .from('calls')
          .update(callPayload)
          .eq('id', existingCall.id)
          .eq('organization_id', orgId)
          .select('id')
          .single()
        : await admin
        .from('calls')
        .insert(callPayload)
        .select('id')
        .single()
      if (callErr || !call) {
        console.error('[ringover-webhook] call insert failed:', callErr?.message)
        return
      }

      const { data: existingJob } = await admin
        .from('analysis_jobs')
        .select('id, status, retry_count')
        .eq('organization_id', orgId)
        .eq('call_id', call.id)
        .in('status', ['pending', 'processing', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingJob) {
        console.log('[ringover-webhook] existing job found, skipping new job:', existingJob.id, '| status:', existingJob.status)
        return
      }

      const { data: job, error: jobErr } = await admin
        .from('analysis_jobs')
        .insert({ organization_id: orgId, call_id: call.id, status: 'pending' })
        .select('id')
        .single()
      if (jobErr || !job) {
        console.error('[ringover-webhook] job insert failed:', jobErr?.message)
        return
      }
      await processJobById({ id: job.id, call_id: call.id, retry_count: 0 })
        .catch(e => console.error('[ringover-webhook] background job error:', e instanceof Error ? e.message : e))
    } catch (e) {
      console.error('[ringover-webhook] unexpected background error:', e)
    }
  })

  return NextResponse.json({ ok: true })
}
