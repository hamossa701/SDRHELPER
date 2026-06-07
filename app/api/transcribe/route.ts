import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Vercel: allow up to 3 min for transcription polling
export const maxDuration = 180

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com'
const MAX_POLLS = 60      // 60 × 3s = 180s
const POLL_MS = 3000
const MAX_FILE_BYTES = 50 * 1024 * 1024

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('organization_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 401 })
  if (!['owner', 'manager', 'sdr'].includes(profile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // ── Parse multipart ───────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Requête multipart invalide' }, { status: 400 })
  }

  const audioFile = formData.get('audio') as File | null
  const campaignId = formData.get('campaign_id') as string | null
  const sdrId = formData.get('sdr_id') as string | null

  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json({ error: 'Fichier audio requis' }, { status: 400 })
  }
  if (!campaignId || !sdrId) {
    return NextResponse.json({ error: 'Campagne et SDR requis' }, { status: 400 })
  }
  if (audioFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Fichier trop volumineux (max 50 Mo)' }, { status: 400 })
  }
  if (profile.role === 'sdr' && sdrId !== user.id) {
    return NextResponse.json({ error: 'SDR non autorisé pour cet appel' }, { status: 403 })
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    console.error('[transcribe] ASSEMBLYAI_API_KEY not set')
    return NextResponse.json({ error: 'AssemblyAI non configuré' }, { status: 500 })
  }

  // ── Upload binary to AssemblyAI ───────────────────────────────────────────
  const audioBytes = await audioFile.arrayBuffer()
  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/v2/upload`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/octet-stream',
    },
    body: audioBytes,
  })
  if (!uploadRes.ok) {
    console.error('[transcribe] upload failed:', uploadRes.status, await uploadRes.text())
    return NextResponse.json({ error: "Échec de l'upload audio" }, { status: 502 })
  }
  const { upload_url } = await uploadRes.json() as { upload_url: string }

  // ── Submit transcription job ──────────────────────────────────────────────
  const submitRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_models: ['universal-3-pro', 'universal-2'],
      speaker_labels: true,
      language_code: 'fr',
      speakers_expected: 2,
    }),
  })
  if (!submitRes.ok) {
    console.error('[transcribe] submit failed:', submitRes.status, await submitRes.text())
    return NextResponse.json({ error: 'Échec de la soumission de transcription' }, { status: 502 })
  }
  const { id: transcriptId } = await submitRes.json() as { id: string }

  // ── Poll until completed ──────────────────────────────────────────────────
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS)

    const pollRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript/${transcriptId}`, {
      headers: { Authorization: apiKey },
    })
    if (!pollRes.ok) continue

    const data = await pollRes.json() as {
      status: string
      error?: string
      audio_duration?: number
      utterances?: Array<{ speaker: string; text: string }>
    }

    if (data.status === 'error') {
      console.error('[transcribe] transcription error:', data.error)
      return NextResponse.json({ error: data.error || 'Transcription échouée' }, { status: 502 })
    }

    if (data.status !== 'completed') continue

    // Duration filter — same rule as Ringover webhook
    const durationSec = data.audio_duration ?? 0
    if (durationSec < 120) {
      return NextResponse.json(
        { error: 'Appel trop court (moins de 2 minutes)' },
        { status: 422 }
      )
    }

    // Map speaker labels to SDR / PROSPECT by order of first appearance
    const speakerMap = new Map<string, string>()
    const roles = ['SDR', 'PROSPECT']
    const utterances = data.utterances ?? []
    for (const u of utterances) {
      if (!speakerMap.has(u.speaker) && speakerMap.size < roles.length) {
        speakerMap.set(u.speaker, roles[speakerMap.size])
      }
    }

    const transcript = utterances
      .map(u => `${speakerMap.get(u.speaker) ?? u.speaker}: ${u.text}`)
      .join('\n')

    return NextResponse.json({ transcript, duration_seconds: durationSec })
  }

  return NextResponse.json(
    { error: 'Délai dépassé — transcription trop longue, réessayez' },
    { status: 504 }
  )
}
