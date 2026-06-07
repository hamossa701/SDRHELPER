import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui'
import type { AnalysisJobStatus } from '@/types'

type PipelineStatus = 'Healthy' | 'Warning' | 'Error' | 'Unknown'
type EventSource = 'Ringover' | 'AssemblyAI' | 'Analysis'

type JobPreview = {
  id: string
  status: AnalysisJobStatus
  error_message: string | null
  retry_count: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  retry_after?: string | null
}

type HealthCall = {
  id: string
  created_at: string
  call_datetime: string
  transcript: string | null
  call_duration_seconds: number | null
  source: string | null
  users: { name: string } | { name: string }[] | null
  campaigns: { campaign_name: string } | { campaign_name: string }[] | null
  call_analyses: { id: string; created_at: string } | { id: string; created_at: string }[] | null
  analysis_jobs: JobPreview | JobPreview[] | null
}

type HealthEvent = {
  time: string
  sortTime: number
  sdr: string
  source: EventSource
  status: string
  details: string
}

const th: React.CSSProperties = {
  padding: '11px 14px',
  color: 'var(--muted)',
  fontSize: 11,
  fontWeight: 750,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  background: 'var(--thead)',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '12px 14px',
  color: 'var(--text)',
  fontSize: 13,
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function makeServerClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) {
          try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

function startOfTodayIso() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return 'N/A'
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return 'N/A'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds && seconds !== 0) return 'N/A'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`
}

function formatAverageMs(ms: number | null) {
  if (ms === null) return 'N/A'
  return formatDuration(Math.round(ms / 1000))
}

function relativeTime(iso: string | null | undefined) {
  if (!iso) return 'Aucune donnée'
  const elapsed = Date.now() - new Date(iso).getTime()
  if (elapsed < 0) return 'à l\'instant'
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'il y a moins d\'1 min'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

function statusFromLastEvent(lastIso: string | null, hasRecentFailure = false): PipelineStatus {
  if (hasRecentFailure) return 'Error'
  if (!lastIso) return 'Unknown'
  const minutes = (Date.now() - new Date(lastIso).getTime()) / 60000
  if (minutes <= 30) return 'Healthy'
  if (minutes <= 120) return 'Warning'
  return 'Unknown'
}

function badgeStyle(status: PipelineStatus | AnalysisJobStatus | string): React.CSSProperties {
  const normalized = status.toLowerCase()
  if (normalized === 'healthy' || normalized === 'completed' || normalized === 'received') {
    return { color: '#86efac', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.30)' }
  }
  if (normalized === 'warning' || normalized === 'pending' || normalized === 'processing') {
    return { color: '#fde68a', background: 'rgba(234,179,8,.10)', border: '1px solid rgba(234,179,8,.28)' }
  }
  if (normalized === 'error' || normalized === 'failed') {
    return { color: '#fca5a5', background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.30)' }
  }
  return { color: 'var(--muted)', background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)' }
}

function translateStatus(status: string): string {
  const map: Record<string, string> = {
    'Healthy': 'Opérationnel',
    'Warning': 'Attention',
    'Error': 'Erreur',
    'Unknown': 'En attente',
    'Received': 'Reçu',
    'Completed': 'Terminé',
    'Processing': 'En cours',
    'Failed': 'Échec',
    'Pending': 'En attente',
    'Queued': 'En file d\'attente',
    'Cancelled': 'Annulé',
  }
  return map[status] ?? status
}

function StatusBadge({ status }: { status: PipelineStatus | AnalysisJobStatus | string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 750, whiteSpace: 'nowrap', ...badgeStyle(status) }}>
      {translateStatus(status)}
    </span>
  )
}

function KpiCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="h3a-kpi-card" style={{ minHeight: 124 }}>
      <div className="h3a-kpi-title-row">
        <div className="h3a-kpi-title">
          <span className="mat" style={{ fontSize: 15, color: 'var(--cyan)' }}>analytics</span>
          <span>{label}</span>
        </div>
      </div>
      <div className="h3a-kpi-value">{value}</div>
      <div className="h3a-kpi-footer">
        <div className="h3a-kpi-sub">{note}</div>
      </div>
    </div>
  )
}

function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
      <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 16, fontWeight: 750 }}>{title}</h2>
      {subtitle ? <p style={{ margin: '5px 0 0', color: 'var(--muted-2)', fontSize: 12, lineHeight: 1.5 }}>{subtitle}</p> : null}
    </div>
  )
}

function averageAnalysisMs(jobs: JobPreview[]) {
  const durations = jobs
    .filter((job) => job.status === 'completed' && job.started_at && job.completed_at)
    .map((job) => new Date(job.completed_at as string).getTime() - new Date(job.started_at as string).getTime())
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
  if (!durations.length) return null
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length
}

function buildRecentEvents(calls: HealthCall[]): HealthEvent[] {
  return calls.flatMap((call) => {
    const sdr = one(call.users)?.name ?? 'SDR inconnu'
    const analysis = one(call.call_analyses)
    const job = one(call.analysis_jobs)
    const events: HealthEvent[] = []

    events.push({
      time: formatTime(call.created_at),
      sortTime: new Date(call.created_at).getTime(),
      sdr,
      source: 'Ringover',
      status: 'Received',
      details: call.source === 'ringover' ? 'Appel reçu via webhook Ringover' : 'Appel enregistré manuellement',
    })

    if (call.transcript?.trim()) {
      events.push({
        time: formatTime(call.created_at),
        sortTime: new Date(call.created_at).getTime() + 1,
        sdr,
        source: 'AssemblyAI',
        status: 'Completed',
        details: 'Transcription sauvegardée',
      })
    }

    if (job) {
      const eventIso = job.completed_at ?? job.started_at ?? job.created_at
      events.push({
        time: formatTime(eventIso),
        sortTime: new Date(eventIso).getTime() + 2,
        sdr,
        source: 'Analysis',
        status: job.status.charAt(0).toUpperCase() + job.status.slice(1),
        details: job.error_message ?? (analysis ? 'Analyse enregistrée' : 'Job d\'analyse suivi'),
      })
    }

    return events
  }).sort((a, b) => b.sortTime - a.sortTime).slice(0, 50)
}

export default async function IntegrationHealthPage() {
  const cookieStore = await cookies()
  const supabase = makeServerClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') redirect('/dashboard')

  const todayIso = startOfTodayIso()

  const [
    callsTodayResult,
    jobsTodayResult,
    recentCallsResult,
    failedJobsResult,
    lastSuccessfulResult,
  ] = await Promise.all([
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', profile.organization_id).eq('source', 'ringover').gte('created_at', todayIso),
    supabase.from('analysis_jobs').select('id, status, error_message, retry_count, created_at, started_at, completed_at, retry_after').eq('organization_id', profile.organization_id).gte('created_at', todayIso).order('created_at', { ascending: false }).limit(500),
    supabase.from('calls').select('id, created_at, call_datetime, transcript, call_duration_seconds, source, users!calls_sdr_id_fkey(name), campaigns(campaign_name), call_analyses(id, created_at), analysis_jobs(id, status, error_message, retry_count, created_at, started_at, completed_at, retry_after)').eq('organization_id', profile.organization_id).eq('source', 'ringover').order('created_at', { ascending: false }).limit(75),
    supabase.from('analysis_jobs').select('id, status, error_message, retry_count, created_at, started_at, completed_at, retry_after, calls!inner(id, created_at, source, users!calls_sdr_id_fkey(name))').eq('organization_id', profile.organization_id).eq('status', 'failed').order('completed_at', { ascending: false, nullsFirst: false }).limit(50),
    supabase.from('calls').select('id, created_at, call_datetime, transcript, call_duration_seconds, source, users!calls_sdr_id_fkey(name), campaigns(campaign_name), call_analyses!inner(id, created_at), analysis_jobs!inner(id, status, error_message, retry_count, created_at, started_at, completed_at)').eq('organization_id', profile.organization_id).eq('source', 'ringover').eq('analysis_jobs.status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const jobsToday = (jobsTodayResult.data ?? []) as JobPreview[]
  const recentCalls = (recentCallsResult.data ?? []) as unknown as HealthCall[]
  const failedJobs = (failedJobsResult.data ?? []) as unknown as Array<JobPreview & {
    calls: {
      id: string
      created_at: string
      source: string | null
      users: { name: string } | { name: string }[] | null
    } | Array<{
      id: string
      created_at: string
      source: string | null
      users: { name: string } | { name: string }[] | null
    }> | null
  }>
  const lastSuccessfulCall = lastSuccessfulResult.data as unknown as HealthCall | null

  const callsProcessing = jobsToday.filter((job) => job.status === 'pending' || job.status === 'processing').length
  const callsCompleted = jobsToday.filter((job) => job.status === 'completed').length
  const callsFailed = jobsToday.filter((job) => job.status === 'failed').length
  const avgAnalysis = averageAnalysisMs(jobsToday)

  const lastRingoverIso = recentCalls[0]?.created_at ?? null
  const lastTranscriptIso = recentCalls.find((call) => call.transcript?.trim())?.created_at ?? null
  const lastAnalysisJob = [...jobsToday]
    .filter((job) => job.status === 'completed' && job.completed_at)
    .sort((a, b) => new Date(b.completed_at as string).getTime() - new Date(a.completed_at as string).getTime())[0]

  const pipeline = [
    {
      name: 'Ringover Webhook',
      status: statusFromLastEvent(lastRingoverIso),
      detail: lastRingoverIso ? `Dernier appel Ringover reçu ${relativeTime(lastRingoverIso)}` : 'Aucun appel Ringover reçu pour l\'instant',
    },
    {
      name: 'AssemblyAI',
      status: statusFromLastEvent(lastTranscriptIso),
      detail: lastTranscriptIso ? `Dernière transcription sauvegardée ${relativeTime(lastTranscriptIso)}` : 'Aucune transcription Ringover pour l\'instant',
    },
    {
      name: 'Analysis Engine',
      status: statusFromLastEvent(lastAnalysisJob?.completed_at ?? null, jobsToday.some((job) => job.status === 'failed')),
      detail: lastAnalysisJob?.completed_at ? `Dernière analyse terminée ${relativeTime(lastAnalysisJob.completed_at)}` : 'Aucune analyse terminée aujourd\'hui',
    },
  ]

  const events = buildRecentEvents(recentCalls)
  const lastAnalysis = one(lastSuccessfulCall?.call_analyses)
  const lastJob = one(lastSuccessfulCall?.analysis_jobs)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{ height: 56, flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--header-bg)', backdropFilter: 'blur(18px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 24px' }}>
        <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650 }}>Administration / Intégrations</div>
        <Link href="/admin/integrations" style={{ color: 'var(--cyan)', fontSize: 12, fontWeight: 700 }}>Paramètres</Link>
      </div>

      <main className="app-scroll">
        <div className="app-content">
          <section>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>Santé des intégrations</h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14, maxWidth: 820, lineHeight: 1.55 }}>
              Vue opérationnelle de l&apos;état du pipeline Ringover, des transcriptions AssemblyAI et des jobs d&apos;analyse.
            </p>
          </section>

          <section className="app-kpi-grid">
            <KpiCard label="Appels reçus aujourd'hui" value={callsTodayResult.count ?? 0} note="Appels Ringover enregistrés aujourd'hui" />
            <KpiCard label="Appels en cours" value={callsProcessing} note="Jobs d'analyse en attente ou en cours" />
            <KpiCard label="Appels terminés" value={callsCompleted} note="Jobs d'analyse terminés aujourd'hui" />
            <KpiCard label="Appels en échec" value={callsFailed} note="Jobs d'analyse en échec aujourd'hui" />
            <KpiCard label="Durée moy. transcription" value="N/A" note="Non disponible — nécessite un journal d'événements" />
            <KpiCard label="Durée moy. analyse" value={formatAverageMs(avgAnalysis)} note="completed_at − started_at dans analysis_jobs" />
          </section>

          <Card>
            <CardTitle title="État du pipeline" subtitle="Statut calculé à partir des derniers événements enregistrés dans les tables existantes." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, padding: 18 }}>
              {pipeline.map((item) => (
                <div key={item.name} style={{ minWidth: 0, padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(2,6,23,.28)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 750 }}>{item.name}</div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 }}>{item.detail}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ overflow: 'hidden' }}>
            <CardTitle title="Événements récents" subtitle="Les 50 derniers événements synthétisés depuis les appels, transcriptions et jobs d'analyse." />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead><tr><th style={{ ...th, width: 90 }}>Heure</th><th style={{ ...th, width: 170 }}>SDR</th><th style={{ ...th, width: 130 }}>Source</th><th style={{ ...th, width: 130 }}>Statut</th><th style={th}>Détails</th></tr></thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={`${event.sortTime}-${index}`}>
                      <td style={{ ...td, color: 'var(--muted)' }}>{event.time}</td>
                      <td style={td}>{event.sdr}</td>
                      <td style={td}>{event.source}</td>
                      <td style={td}><StatusBadge status={event.status} /></td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{event.details}</td>
                    </tr>
                  ))}
                  {!events.length && <tr><td colSpan={5} style={{ ...td, padding: 28, textAlign: 'center', color: 'var(--muted-2)' }}>Aucun événement d&apos;intégration récent trouvé.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ overflow: 'hidden' }}>
            <CardTitle title="Éléments en échec" subtitle="Jobs d'analyse en échec uniquement. Les échecs webhook AssemblyAI ne sont pas enregistrés." />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead><tr><th style={{ ...th, width: 150 }}>Date</th><th style={{ ...th, width: 170 }}>SDR</th><th style={{ ...th, width: 150 }}>Étape</th><th style={th}>Erreur</th><th style={{ ...th, width: 140 }}>Relance possible ?</th></tr></thead>
                <tbody>
                  {failedJobs.map((job) => {
                    const call = one(job.calls)
                    const sdrName = one(call?.users)?.name ?? 'SDR inconnu'
                    return (
                      <tr key={job.id}>
                        <td style={{ ...td, color: 'var(--muted)' }}>{formatDateTime(job.completed_at ?? job.created_at)}</td>
                        <td style={td}>{sdrName}</td>
                        <td style={td}>Analyse</td>
                        <td style={{ ...td, color: '#fca5a5' }}>{job.error_message ?? 'Analyse échouée'}</td>
                        <td style={td}>{job.retry_count < 3 ? 'Oui' : 'Non'}</td>
                      </tr>
                    )
                  })}
                  {!failedJobs.length && <tr><td colSpan={5} style={{ ...td, padding: 28, textAlign: 'center', color: 'var(--muted-2)' }}>Aucun élément en échec.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardTitle title="Dernier appel traité avec succès" />
            {lastSuccessfulCall ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, padding: 18 }}>
                {[
                  ['SDR', one(lastSuccessfulCall.users)?.name ?? 'SDR inconnu'],
                  ['Campagne', one(lastSuccessfulCall.campaigns)?.campaign_name ?? 'N/A'],
                  ['Durée', formatDuration(lastSuccessfulCall.call_duration_seconds)],
                  ['Heure de réception', formatDateTime(lastSuccessfulCall.created_at)],
                  ['Transcription terminée à', formatDateTime(lastSuccessfulCall.created_at)],
                  ['Analyse terminée à', formatDateTime(lastJob?.completed_at ?? lastAnalysis?.created_at)],
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--muted-2)', fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
                    <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 650, marginTop: 5, overflowWrap: 'anywhere' }}>{value}</div>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Link href={`/calls/${lastSuccessfulCall.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cyan)', fontSize: 13, fontWeight: 750 }}>
                    <span className="mat" style={{ fontSize: 16 }}>open_in_new</span>
                    Ouvrir l&apos;appel
                  </Link>
                </div>
              </div>
            ) : (
              <div style={{ padding: 24, color: 'var(--muted-2)', fontSize: 13 }}>Aucun appel Ringover traité avec succès pour l&apos;instant.</div>
            )}
          </Card>

          <Card>
            <CardTitle title="Notes techniques" />
            <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13, lineHeight: 1.65 }}>
              <p style={{ margin: 0 }}>
                Disponible maintenant : comptage des appels Ringover depuis <code>calls.source = ringover</code>, états et durées d&apos;analyse depuis <code>analysis_jobs</code>, et complétion des analyses depuis <code>call_analyses.created_at</code>.
              </p>
              <p style={{ margin: '10px 0 0' }}>
                Non disponible : événements bruts de réception webhook, tentatives rejetées, appels Ringover ignorés, et horodatages AssemblyAI. Ajoutez un journal d&apos;événements avec <code>source</code>, <code>stage</code>, <code>status</code>, <code>details</code> et <code>occurred_at</code> pour calculer ces métriques.
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
