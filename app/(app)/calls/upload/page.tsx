'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AnalysisProgressSkeleton } from '@/components/ui/skeleton-templates'
import { SkeletonHeader, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'
import type { Campaign, User } from '@/types'

type UploadStep = 'form' | 'queued' | 'processing' | 'completed' | 'failed'

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--input-bg)',
  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
  fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none',
}
const sel: React.CSSProperties = { ...inp, appearance: 'none', cursor: 'pointer' }

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
  const [timedOut, setTimedOut] = useState(false)
  const [lastKnownStatus, setLastKnownStatus] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        const { data: sdrList } = await supabase.from('users').select('*').eq('organization_id', prof.organization_id).eq('role', 'sdr').order('name')
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.transcript.trim()) { setError('Transcription obligatoire.'); return }
    if (transcriptLen > 30_000) { setError('Transcript too long. Maximum is 30,000 characters.'); return }
    if (!form.campaign_id) { setError('Sélectionnez une campagne.'); return }
    if (!form.sdr_id) { setError('Sélectionnez un SDR.'); return }
    setLoading(true); setError('')
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const sign = tzOffset <= 0 ? '+' : '-'
      const absOff = Math.abs(tzOffset)
      const tzSuffix = `${sign}${String(Math.floor(absOff / 60)).padStart(2, '0')}:${String(absOff % 60).padStart(2, '0')}`
      const callDatetimeTz = `${form.call_datetime}:00${tzSuffix}`
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, call_datetime: callDatetimeTz }) })
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
              <button onClick={() => { setStep('form'); setJobId(null); setCallId(null); setTimedOut(false) }}
                style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb)', border: '1px solid rgba(125,211,252,.42)', fontFamily: 'Geist, sans-serif' }}>
                Nouvel appel
              </button>
            </div>
          </div>
        </div>
      )
    }
    return <AnalysisProgressSkeleton title={step === 'processing' ? 'Analyse en cours' : 'En file d attente'} />
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
          <button onClick={() => { setStep('form'); setJobId(null); setCallId(null); setJobError(null) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted-2)', fontFamily: 'Geist, sans-serif' }}>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800, margin: '0 auto' }}>
            <SkeletonCard style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
                <SkeletonLine width={180} height={11} />
              </div>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Analyser un appel</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Collez la transcription et lancez l&apos;analyse IA</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800, margin: '0 auto' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>Informations de l&apos;appel</div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>CAMPAGNE</label>
                <select required value={form.campaign_id} onChange={e => update('campaign_id', e.target.value)} style={sel}>
                  <option value="">Sélectionner...</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>SDR</label>
                <select required value={form.sdr_id} onChange={e => update('sdr_id', e.target.value)} disabled={profile?.role === 'sdr'} style={{ ...sel, opacity: profile?.role === 'sdr' ? .6 : 1 }}>
                  <option value="">Sélectionner...</option>
                  {sdrs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>DATE / HEURE</label>
                <input type="datetime-local" value={form.call_datetime} onChange={e => update('call_datetime', e.target.value)} style={inp} />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>Transcription</span>
              <span style={{ fontSize: 11, color: transcriptLen > 30_000 ? '#f87171' : transcriptLen > 25_000 ? '#fcd34d' : 'var(--muted-2)' }}>
                {transcriptLen.toLocaleString()} / 30 000 caractères
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <textarea rows={18} value={form.transcript} onChange={e => update('transcript', e.target.value)}
                placeholder={"SDR: Bonjour, je suis [Prénom]...\nPROSPECT: Oui bonjour...\nSDR: ..."}
                style={{ ...inp, resize: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.6 }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(125,211,252,.06)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>
          </div>

          {transcriptLen > 25_000 && transcriptLen <= 30_000 && (
            <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fcd34d' }}>
              Attention : {(30_000 - transcriptLen).toLocaleString()} caractères restants avant la limite.
            </div>
          )}
          {transcriptLen > 30_000 && (
            <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5' }}>
              Transcript too long. Maximum is 30,000 characters.
            </div>
          )}

          {error && <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={() => router.back()} style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Geist, sans-serif' }}>Annuler</button>
            <button type="submit" disabled={loading || transcriptLen > 30_000} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: (loading || transcriptLen > 30_000) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.2)', fontFamily: 'Geist, sans-serif', opacity: (loading || transcriptLen > 30_000) ? .7 : 1 }}>
              {loading && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />}
              <span className="mat" style={{ fontSize: 16 }}>mic</span>
              Analyser l&apos;appel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
