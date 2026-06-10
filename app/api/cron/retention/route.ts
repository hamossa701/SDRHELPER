import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase-admin'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Timing-safe cron secret check — same pattern as analysis-worker
  const secret = request.headers.get('x-worker-secret')
  const cronSecret = process.env.WORKER_SECRET
  if (!cronSecret || !secret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  let authorized = false
  try {
    const a = Buffer.from(cronSecret)
    const b = Buffer.from(secret)
    authorized = a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    authorized = false
  }
  if (!authorized) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = createAdminClient()
  let deletedAudio = 0
  let anonymizedTranscripts = 0

  try {
    const { data: orgs, error: orgsErr } = await admin
      .from('organizations')
      .select('id, retention_days')
    if (orgsErr) throw new Error(`Failed to fetch orgs: ${orgsErr.message}`)

    for (const org of orgs ?? []) {
      const cutoff = new Date(Date.now() - org.retention_days * 86_400_000).toISOString()

      // Null out audio_url for calls past retention
      const { data: audioCleared, error: audioErr } = await admin
        .from('calls')
        .update({ audio_url: null })
        .eq('organization_id', org.id)
        .not('audio_url', 'is', null)
        .lt('call_datetime', cutoff)
        .select('id')
      if (audioErr) {
        console.error(`[retention] audio clear org ${org.id}:`, audioErr.message)
        Sentry.captureException(new Error(audioErr.message), { extra: { org_id: org.id, phase: 'audio_clear' } })
      } else {
        deletedAudio += audioCleared?.length ?? 0
      }

      // Replace transcript content with a retention notice for calls past retention
      const { data: transcriptCleared, error: transcriptErr } = await admin
        .from('calls')
        .update({ transcript: '[contenu supprimé — politique de rétention RGPD]' })
        .eq('organization_id', org.id)
        .not('transcript', 'is', null)
        .neq('transcript', '[contenu supprimé — politique de rétention RGPD]')
        .lt('call_datetime', cutoff)
        .select('id')
      if (transcriptErr) {
        console.error(`[retention] transcript clear org ${org.id}:`, transcriptErr.message)
        Sentry.captureException(new Error(transcriptErr.message), { extra: { org_id: org.id, phase: 'transcript_clear' } })
      } else {
        anonymizedTranscripts += transcriptCleared?.length ?? 0
      }
    }

    console.log(`[retention] done: ${deletedAudio} audio URLs cleared, ${anonymizedTranscripts} transcripts anonymized`)
    return NextResponse.json({ ok: true, deleted_audio: deletedAudio, anonymized_transcripts: anonymizedTranscripts })
  } catch (err) {
    Sentry.captureException(err)
    console.error('[retention] unexpected error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
