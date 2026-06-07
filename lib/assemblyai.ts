const ASSEMBLYAI_BASE = 'https://api.assemblyai.com'
const MAX_POLLS = 60
const POLL_MS = 3000

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function formatUtterances(utterances: Array<{ speaker: string; text: string }> | undefined, text?: string) {
  const speakerMap = new Map<string, string>()
  const roles = ['SDR', 'PROSPECT']

  for (const utterance of utterances ?? []) {
    if (!speakerMap.has(utterance.speaker) && speakerMap.size < roles.length) {
      speakerMap.set(utterance.speaker, roles[speakerMap.size])
    }
  }

  const diarized = (utterances ?? [])
    .map(utterance => `${speakerMap.get(utterance.speaker) ?? utterance.speaker}: ${utterance.text}`)
    .join('\n')
  return diarized || text || ''
}

export async function transcribeAssemblyAiAudioUrl(audioUrl: string) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) throw new Error('AssemblyAI non configure')

  const submitRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ['universal-3-pro', 'universal-2'],
      speaker_labels: true,
      language_code: 'fr',
      speakers_expected: 2,
    }),
  })
  if (!submitRes.ok) {
    throw new Error(`AssemblyAI submit failed: ${submitRes.status}`)
  }

  const { id: transcriptId } = await submitRes.json() as { id: string }

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
      text?: string
      utterances?: Array<{ speaker: string; text: string }>
    }

    if (data.status === 'error') {
      throw new Error(data.error || 'Transcription echouee')
    }
    if (data.status !== 'completed') continue

    return {
      transcript: formatUtterances(data.utterances, data.text),
      duration_seconds: data.audio_duration ?? 0,
    }
  }

  throw new Error('Delai de transcription depasse')
}
