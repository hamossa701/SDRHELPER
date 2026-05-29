'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button, Card, CardContent, CardHeader, Spinner } from '@/components/ui'
import type { Campaign, User } from '@/types'

type UploadStep = 'form' | 'queued' | 'processing' | 'completed' | 'failed'

export default function UploadCallPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [sdrs, setSdrs] = useState<User[]>([])
  const [profile, setProfile] = useState<User | null>(null)
  const [form, setForm] = useState({
    campaign_id: '',
    sdr_id: '',
    transcript: '',
    call_datetime: new Date().toISOString().slice(0, 16),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [step, setStep] = useState<UploadStep>('form')
  const [jobId, setJobId] = useState<string | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [retrying, setRetrying] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (!prof) { router.push('/login'); return }
      setProfile(prof)

      const { data: cams } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', prof.organization_id)
        .eq('status', 'active')
        .order('campaign_name')
      setCampaigns(cams || [])

      if (prof.role === 'sdr') {
        setForm(f => ({ ...f, sdr_id: user.id }))
        setSdrs([prof])
      } else {
        const { data: sdrList } = await supabase
          .from('users')
          .select('*')
          .eq('organization_id', prof.organization_id)
          .eq('role', 'sdr')
          .order('name')
        setSdrs(sdrList || [])
      }
    }
    load()
  }, [router])

  // Poll job status every 3 s while queued or processing
  useEffect(() => {
    if (!jobId || step === 'form' || step === 'completed' || step === 'failed') return

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status?job_id=${jobId}`)
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'processing' && step !== 'processing') {
          setStep('processing')
        }
        if (data.status === 'completed') {
          clearInterval(pollRef.current!)
          setStep('completed')
          setTimeout(() => router.push(`/calls/${data.call_id || callId}`), 1200)
        }
        if (data.status === 'failed') {
          clearInterval(pollRef.current!)
          setStep('failed')
          setJobError(data.error_message ?? null)
          setRetryCount(data.retry_count ?? 0)
        }
      } catch {
        // Network blip — keep polling
      }
    }, 3000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, step])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.transcript.trim()) { setError('La transcription est obligatoire.'); return }
    if (!form.campaign_id) { setError('Sélectionnez une campagne.'); return }
    if (!form.sdr_id) { setError('Sélectionnez un SDR.'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la soumission')
      }

      const { call_id, job_id } = await res.json()
      setCallId(call_id)
      setJobId(job_id)
      setStep('queued')
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
      const res = await fetch('/api/analyze/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      if (res.ok) {
        setStep('queued')
        setJobError(null)
      }
    } finally {
      setRetrying(false)
    }
  }

  // ── Status screens ──────────────────────────────────────────────────────────

  if (step === 'queued' || step === 'processing') {
    return (
      <div className="p-8 max-w-lg mx-auto mt-20 text-center">
        <Spinner size="lg" />
        <h2 className="text-lg font-semibold text-gray-900 mt-4">
          {step === 'processing' ? 'Analyse en cours…' : 'Analyse en file d\'attente…'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {step === 'processing'
            ? 'L\'IA analyse la transcription de l\'appel.'
            : 'La transcription a été reçue et sera analysée sous peu.'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {step === 'processing'
            ? 'Cela peut prendre 10 à 20 secondes.'
            : 'Mise à jour automatique toutes les 3 secondes.'}
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-400">
          <span className={`inline-block w-2 h-2 rounded-full ${step === 'processing' ? 'bg-blue-400 animate-pulse' : 'bg-amber-400'}`} />
          {step === 'processing' ? 'Traitement' : 'En attente'}
        </div>
      </div>
    )
  }

  if (step === 'completed') {
    return (
      <div className="p-8 max-w-lg mx-auto mt-20 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mt-4">Analyse terminée</h2>
        <p className="text-sm text-gray-500 mt-1">Redirection vers les résultats…</p>
      </div>
    )
  }

  if (step === 'failed') {
    return (
      <div className="p-8 max-w-lg mx-auto mt-16">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-red-700">Analyse échouée</p>
          {jobError && (
            <p className="text-xs text-red-500 font-mono break-all">{jobError}</p>
          )}
          {retryCount > 0 && (
            <p className="text-xs text-gray-400">{retryCount} tentative(s) précédente(s)</p>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {retrying ? 'Relance en cours…' : 'Réessayer l\'analyse'}
          </button>
          <div>
            <button
              onClick={() => { setStep('form'); setJobId(null); setCallId(null); setJobError(null) }}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1"
            >
              Soumettre un nouvel appel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analyser un appel</h1>
        <p className="text-gray-500 text-sm mt-1">Collez la transcription et lancez l&apos;analyse IA</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900">Informations de l&apos;appel</h2></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Campagne *</label>
                <select
                  required
                  value={form.campaign_id}
                  onChange={e => update('campaign_id', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">-- Sélectionner --</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.campaign_name} · {c.client_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SDR *</label>
                <select
                  required
                  value={form.sdr_id}
                  onChange={e => update('sdr_id', e.target.value)}
                  disabled={profile?.role === 'sdr'}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">-- Sélectionner --</option>
                  {sdrs.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date et heure de l&apos;appel *</label>
              <input
                type="datetime-local"
                value={form.call_datetime}
                onChange={e => update('call_datetime', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Transcription *</h2>
              <span className="text-xs text-gray-400">{form.transcript.length} caractères</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Collez la transcription complète de l&apos;appel. Format libre — l&apos;IA gère toutes les mises en forme.
            </p>
          </CardHeader>
          <CardContent>
            <textarea
              rows={16}
              value={form.transcript}
              onChange={e => update('transcript', e.target.value)}
              placeholder={`SDR: Bonjour, je suis [Prénom] de [Société], je vous contacte au sujet de...
PROSPECT: Oui, bonjour...
SDR: ...`}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none font-mono text-xs"
            />
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Annuler</Button>
          <Button type="submit" loading={loading} size="lg">
            🤖 Analyser l&apos;appel
          </Button>
        </div>
      </form>
    </div>
  )
}
