'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { DateTimePicker } from '@/components/DateTimePicker'
import { DarkSelect } from '@/components/ui'
import { SkeletonHeader, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'
import type { Campaign, User } from '@/types'

type UploadStep = 'form' | 'queued' | 'processing' | 'completed' | 'failed'
type InputMode = 'paste' | 'audio'

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--input-bg)',
  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
  fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none',
}

export default function UploadCallPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [sdrs, setSdrs] = useState<User[]>([])
  const [profile, setProfile] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [form, setForm] = useState({ campaign_id: '', sdr_id: '', transcript: '', call_datetime: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<UploadStep>('form')
  const [jobId, setJobId] = useState<string | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [timedOut, setTimedOut] = useState(false)
  const [lastKnownStatus, setLastKnownStatus] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('paste')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (!prof) { router.push('/login'); return }
      if (prof.role === 'client') { router.push('/client'); return }
      setProfile(prof)
      const { data: cams } = await supabase.from('campaigns').select('*').eq('organization_id', prof.organization_id).eq('status', 'active').order('campaign_name')
      setCampaigns(cams || [])
      if (prof.role === 'sdr') {
        setForm(f => ({ ...f, sdr_id: user.id }))
        setSdrs([prof])
      } else {
        let sdrQuery = supabase.from('users').select('*').eq('organization_id', prof.organization_id).eq('role', 'sdr').order('name')
        if (prof.role === 'manager') sdrQuery = sdrQuery.eq('manager_id', user.id)
        const { data: sdrList } = await sdrQuery
        setSdrs(sdrList || [])
      }
      setInitializing(false)
    }
    load()
  }, [router])

  useEffect(() => {
    if (!jobId || step === 'form' || step === 'completed' || step === 'failed') return

    // 120-second timeout — AI analysis can take 60-90s on a cold request
    timeoutRef.current = setTimeout(() => setTimedOut(true), 120_000)

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status?job_id=${jobId}`)
        if (!res.ok) return
        const data = await res.json()
        setLastKnownStatus(data.status)
        if (data.status === 'processing' && step !== 'processing') setStep('processing')
        if (data.status === 'completed') {
          clearInterval(pollRef.current!)
          clearTimeout(timeoutRef.current!)
          setStep('completed')
          setTimeout(() => router.push(`/calls/${data.call_id || callId}`), 1200)
        }
        if (data.status === 'failed') {
          clearInterval(pollRef.current!)
          clearTimeout(timeoutRef.current!)
          setStep('failed')
          setJobError(data.error_message ?? null)
          setRetryCount(data.retry_count ?? 0)
        }
      } catch {
        clearInterval(pollRef.current!)
        clearTimeout(timeoutRef.current!)
        setStep('failed')
        setJobError('Erreur de connexion. Vérifiez votre connexion et réessayez.')
      }
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, step])

  function update(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })) }

  const transcriptLen = form.transcript.trim().length

  async function handleTranscribe() {
    if (!audioFile) { setTranscribeError('Sélectionnez un fichier audio.'); return }
    if (!form.campaign_id) { setTranscribeError('Sélectionnez une campagne.'); return }
    if (!form.sdr_id) { setTranscribeError('Sélectionnez un SDR.'); return }
    setTranscribing(true)
    setTranscribeError('')
    try {
      const fd = new FormData()
      fd.append('audio', audioFile)
      fd.append('campaign_id', form.campaign_id)
      fd.append('sdr_id', form.sdr_id)
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setTranscribeError(json.error || 'Erreur de transcription'); return }
      update('transcript', json.transcript)
      setInputMode('paste')
      setAudioFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      setTranscribeError('Erreur réseau')
    } finally {
      setTranscribing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inputMode === 'audio') return
    if (!form.transcript.trim()) { setError('Transcription obligatoire.'); return }
    if (transcriptLen > 30_000) { setError('Transcription trop longue. Maximum : 30 000 caractères.'); return }
    if (!form.campaign_id) { setError('Sélectionnez une campagne.'); return }
    if (!form.sdr_id) { setError('Sélectionnez un SDR.'); return }
    setLoading(true); setError('')
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const sign = tzOffset <= 0 ? '+' : '-'
      const absOff = Math.abs(tzOffset)
      const tzSuffix = `${sign}${String(Math.floor(absOff / 60)).padStart(2, '0')}:${String(absOff % 60).padStart(2, '0')}`
      const callDatetimeTz = `${form.call_datetime}:00${tzSuffix}`
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, call_datetime: callDatetimeTz, idempotency_key: idempotencyKey }) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur lors de la soumission') }
      const { call_id, job_id } = await res.json()
      setCallId(call_id); setJobId(job_id); setStep('queued')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry() {
    if (!jobId) return
    setRetrying(true)
    try {
      const res = await fetch('/api/analyze/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) })
      if (res.ok) { setStep('queued'); setJobError(null) }
    } finally { setRetrying(false) }
  }

  if (transcribing) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <span style={{ width: 36, height: 36, border: '3px solid rgba(148,163,184,.18)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Transcription en cours…</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          Analyse vocale + diarisation · 1–2 min
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-2)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan)', animation: 'h3a-pulse-dot 2s ease infinite' }} />
          AssemblyAI · mise à jour automatique
        </div>
      </div>
    )
  }

  if (step === 'queued' || step === 'processing') {
    if (timedOut) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.32)', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fcd34d' }}>Analyse bloquée</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              L&apos;analyse prend plus de temps que prévu. Veuillez réessayer.{lastKnownStatus ? ` Dernier statut : ${lastKnownStatus}.` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>
              Le job est peut-être toujours en cours. Vérifiez vos appels dans quelques instants ou relancez.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { setTimedOut(false); setLastKnownStatus(null) }}
                style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'Geist, sans-serif' }}>
                Continuer d&apos;attendre
              </button>
              <button onClick={() => { setStep('form'); setJobId(null); setCallId(null); setTimedOut(false); setIdempotencyKey(crypto.randomUUID()) }}
                style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb)', border: '1px solid rgba(125,211,252,.42)', fontFamily: 'Geist, sans-serif' }}>
                Nouvel appel
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <span style={{ width: 36, height: 36, border: '3px solid rgba(148,163,184,.18)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          {step === 'processing' ? 'Analyse en cours…' : 'En file d\'attente…'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          {step === 'processing' ? 'L\'IA analyse la transcription · 10-20 secondes' : 'Transcription reçue, analyse imminente.'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-2)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: step === 'processing' ? 'var(--cyan)' : '#fcd34d' }} />
          {step === 'processing' ? 'Traitement' : 'En attente · mise à jour toutes les 3s'}
        </div>
      </div>
    )
  }

  if (step === 'completed') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 24, color: '#86efac' }}>✓</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Analyse terminée</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Redirection vers les résultats…</div>
      </div>
    )
  }

  if (step === 'failed') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fca5a5' }}>Analyse échouée</div>
          {jobError && <div style={{ fontSize: 11, color: '#fca5a5', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>{jobError}</div>}
          {retryCount > 0 && <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{retryCount} tentative(s) précédente(s)</div>}
          <button onClick={handleRetry} disabled={retrying} style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: retrying ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', border: '1px solid rgba(239,68,68,.42)', opacity: retrying ? .6 : 1, fontFamily: 'Geist, sans-serif' }}>
            {retrying ? 'Relance en cours…' : 'Réessayer l\'analyse'}
          </button>
          <button onClick={() => { setStep('form'); setJobId(null); setCallId(null); setJobError(null); setIdempotencyKey(crypto.randomUUID()) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted-2)', fontFamily: 'Geist, sans-serif' }}>
            Soumettre un nouvel appel
          </button>
        </div>
      </div>
    )
  }

  if (initializing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <SkeletonHeader titleWidth={160} subtitleWidth={300} />
        <main className="app-scroll">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800, margin: '0 auto' }}>
            <SkeletonCard style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
                <SkeletonLine width={180} height={11} />
              </div>
              <div className="upload-meta-grid" style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <SkeletonLine height={38} />
                <SkeletonLine height={38} />
                <SkeletonLine height={38} />
              </div>
            </SkeletonCard>
            <SkeletonCard style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
                <SkeletonLine width={150} height={11} />
              </div>
              <div style={{ padding: 16 }}>
                <SkeletonLine height={360} />
              </div>
            </SkeletonCard>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Analyser un appel</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Collez la transcription et lancez l&apos;analyse IA</div>
        </div>
      </div>

      <main className="app-scroll">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800, margin: '0 auto' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>Informations de l&apos;appel</div>
            <div className="upload-meta-grid" style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>CAMPAGNE</label>
                <DarkSelect
                  required
                  value={form.campaign_id}
                  onChange={value => update('campaign_id', value)}
                  ariaLabel="Campagne"
                  options={[{ value: '', label: 'Sélectionner...' }, ...campaigns.map(c => ({ value: c.id, label: c.campaign_name }))]}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>SDR</label>
                <DarkSelect
                  required
                  value={form.sdr_id}
                  onChange={value => update('sdr_id', value)}
                  disabled={profile?.role === 'sdr'}
                  ariaLabel="SDR"
                  options={[{ value: '', label: 'Sélectionner...' }, ...sdrs.map(s => ({ value: s.id, label: s.name }))]}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>DATE / HEURE</label>
                <DateTimePicker value={form.call_datetime} onChange={value => update('call_datetime', value)} />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['paste', 'audio'] as const).map(mode => {
                  const labels: Record<InputMode, string> = { paste: 'Coller la transcription', audio: 'Importer un fichier audio' }
                  const active = inputMode === mode
                  return (
                    <button key={mode} type="button"
                      onClick={() => { setInputMode(mode); setTranscribeError('') }}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', border: active ? '1px solid rgba(125,211,252,.35)' : '1px solid transparent', background: active ? 'rgba(99,102,241,.15)' : 'transparent', color: active ? 'var(--text)' : 'var(--muted-2)', transition: 'all .12s', fontFamily: 'Geist, sans-serif' }}>
                      {labels[mode]}
                    </button>
                  )
                })}
              </div>
              {inputMode === 'paste' && (
                <span style={{ fontSize: 11, color: transcriptLen > 30_000 ? '#f87171' : transcriptLen > 25_000 ? '#fcd34d' : 'var(--muted-2)' }}>
                  {transcriptLen.toLocaleString()} / 30 000 caractères
                </span>
              )}
            </div>

            {inputMode === 'paste' ? (
              <div style={{ padding: 16 }}>
                <textarea rows={18} value={form.transcript} onChange={e => update('transcript', e.target.value)}
                  placeholder={"SDR: Bonjour, je suis [Prénom]...\nPROSPECT: Oui bonjour...\nSDR: ..."}
                  style={{ ...inp, resize: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.6 }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(125,211,252,.06)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.webm" style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null
                    if (f && f.size > 50 * 1024 * 1024) { setTranscribeError('Fichier trop volumineux (max 50 Mo)'); return }
                    setAudioFile(f); setTranscribeError('')
                  }}
                />
                {audioFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.28)' }}>
                    <span className="mat" style={{ fontSize: 22, color: '#a5b4fc' }}>audio_file</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audioFile.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 2 }}>{(audioFile.size / 1024 / 1024).toFixed(1)} Mo</div>
                    </div>
                    <button type="button" onClick={() => { setAudioFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-2)', display: 'flex', padding: 4 }}>
                      <span className="mat" style={{ fontSize: 18 }}>close</span>
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(false)
                      const f = e.dataTransfer.files[0]
                      if (!f) return
                      if (f.size > 50 * 1024 * 1024) { setTranscribeError('Fichier trop volumineux (max 50 Mo)'); return }
                      setAudioFile(f); setTranscribeError('')
                    }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 20px', borderRadius: 10, cursor: 'pointer', userSelect: 'none', border: `2px dashed ${dragOver ? 'rgba(99,102,241,.7)' : 'var(--border)'}`, background: dragOver ? 'rgba(99,102,241,.06)' : 'transparent', transition: 'border-color .15s, background .15s' }}
                  >
                    <span className="mat" style={{ fontSize: 36, color: dragOver ? '#a5b4fc' : 'var(--muted-2)' }}>upload_file</span>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Glissez un fichier audio ici</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>ou cliquez pour sélectionner</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 4 }}>MP3, WAV, M4A, OGG, WEBM · max 50 Mo</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {transcriptLen > 25_000 && transcriptLen <= 30_000 && (
            <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fcd34d' }}>
              Attention : {(30_000 - transcriptLen).toLocaleString()} caractères restants avant la limite.
            </div>
          )}
          {transcriptLen > 30_000 && (
            <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5' }}>
              Transcription trop longue. Maximum : 30 000 caractères.
            </div>
          )}

          {(transcribeError || error) && (
            <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5' }}>
              {transcribeError || error}
            </div>
          )}

          <div className="mobile-full-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => router.back()} style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Geist, sans-serif' }}>Annuler</button>
            {inputMode === 'audio' ? (
              <button type="button" onClick={handleTranscribe} disabled={!audioFile || !form.campaign_id || !form.sdr_id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: (!audioFile || !form.campaign_id || !form.sdr_id) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.2)', fontFamily: 'Geist, sans-serif', opacity: (!audioFile || !form.campaign_id || !form.sdr_id) ? .7 : 1 }}>
                <span className="mat" style={{ fontSize: 16 }}>graphic_eq</span>
                Transcrire l&apos;audio
              </button>
            ) : (
              <button type="submit" disabled={loading || transcriptLen > 30_000} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: (loading || transcriptLen > 30_000) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.2)', fontFamily: 'Geist, sans-serif', opacity: (loading || transcriptLen > 30_000) ? .7 : 1 }}>
                {loading && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />}
                <span className="mat" style={{ fontSize: 16 }}>mic</span>
                Analyser l&apos;appel
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  )
}
