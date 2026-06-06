import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'
import { Card, CardContent, CardHeader, StatCard } from '@/components/ui'
import { formatAppointmentDate, formatDateShort } from '@/lib/utils'
import { PrintButton } from '@/components/client/PrintButton'
import { createAdminClient } from '@/lib/supabase-admin'
import { hasQualifiedAppointmentDate } from '@/lib/appointment-date'
import type { ClientKPIsRow, ClientValueReportRow, ClientCampaignStatsRow } from '@/types'

type ReportPeriod = '7d' | '30d' | 'month'
type ClientAnalysis = {
  id: string
  prospect_company: string | null
  contact_name: string | null
  contact_role: string | null
  interest_level: string | null
  appointment_booked: boolean | null
  appointment_date_text: string | null
  appointment_datetime: string | null
  appointment_date_confidence: string | null
  appointment_quality_score: number | null
  pain_point_detected: boolean | null
  pain_point_details: string | null
  objection_detected: boolean | null
  objection_type: string | null
  decision_maker_detected: boolean | null
}
type ClientCallRow = {
  id: string
  campaign_id: string
  organization_id?: string
  sdr_id: string | null
  call_datetime: string
  call_analyses: ClientAnalysis | ClientAnalysis[] | null
  analysis_jobs?: { status: string } | { status: string }[] | null
}
type ClientProfile = {
  organization_id: string
  client_id: string | null
  role: string
}
type ClientCampaign = {
  id: string
  client_id: string
  campaign_name: string
  client_name: string
  sector: string | null
  status: string
  created_at: string
}
type SdrUserRow = { id: string; name: string }

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  '7d':    '7 jours',
  '30d':   '30 jours',
  'month': 'Mois en cours',
}

const AVG_CALL_MINUTES = 8
const CAMPAIGN_SAFE_COLS = 'id, client_id, campaign_name, client_name, sector, status, created_at'
const CLIENT_ANALYSIS_COLS = [
  'id',
  'prospect_company',
  'contact_name',
  'contact_role',
  'interest_level',
  'appointment_booked',
  'appointment_date_text',
  'appointment_datetime',
  'appointment_date_confidence',
  'appointment_quality_score',
  'pain_point_detected',
  'pain_point_details',
  'objection_detected',
  'objection_type',
  'decision_maker_detected',
].join(', ')

// ─── Period utilities ────────────────────────────────────────────────────────

function previousPeriodBounds(period: ReportPeriod): { since: string; until: string } {
  const now = new Date()
  if (period === 'month') {
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    return {
      since: new Date(prevYear, prevMonth, 1).toISOString(),
      until: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    }
  }
  const days = period === '7d' ? 7 : 30
  const prevEnd = new Date(now.getTime() - days * 86_400_000)
  const prevStart = new Date(prevEnd.getTime() - days * 86_400_000)
  return { since: prevStart.toISOString(), until: prevEnd.toISOString() }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function isQualifiedAnalysis(a: ClientAnalysis | null): boolean {
  return !!a
    && a.appointment_booked === true
    && a.decision_maker_detected === true
    && a.pain_point_detected === true
    && !!a.pain_point_details?.trim()
    && hasQualifiedAppointmentDate(a)
    && a.appointment_quality_score !== null
    && a.appointment_quality_score >= 60
}

function buildKpis(rows: ClientCallRow[]): ClientKPIsRow {
  const analyses = rows.map(row => one(row.call_analyses)).filter((a): a is ClientAnalysis => !!a)
  const total = analyses.length
  const booked = analyses.filter(a => a.appointment_booked === true).length
  const qualified = analyses.filter(isQualifiedAnalysis).length
  const decisionMakers = analyses.filter(a => a.decision_maker_detected === true).length

  return {
    total_calls: total,
    hot_warm_contacts: analyses.filter(a => a.interest_level === 'hot' || a.interest_level === 'warm').length,
    appointments_booked: booked,
    qualified_appointments: qualified,
    qualification_rate: booked > 0 ? Math.round((qualified / booked) * 100) : null,
    decision_maker_rate: total > 0 ? Math.round((decisionMakers / total) * 100) : null,
    appointment_conversion_rate: total > 0 ? Math.round((booked / total) * 100) : null,
  }
}

function buildValueRows(rows: ClientCallRow[]): ClientValueReportRow[] {
  const pain = new Map<string, number>()
  const objections = new Map<string, number>()

  for (const row of rows) {
    const a = one(row.call_analyses)
    if (!a) continue
    if (a.pain_point_detected === true && a.pain_point_details?.trim()) {
      const label = a.pain_point_details.slice(0, 80)
      pain.set(label, (pain.get(label) ?? 0) + 1)
    }
    if (a.objection_detected === true && a.objection_type?.trim()) {
      objections.set(a.objection_type, (objections.get(a.objection_type) ?? 0) + 1)
    }
  }

  const top = (source: Map<string, number>, kind: ClientValueReportRow['kind']) =>
    [...source.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, cnt]) => ({ label, cnt, kind }))

  return [...top(pain, 'pain_point'), ...top(objections, 'objection')]
}

function buildCampaignStats(rows: ClientCallRow[], campaignIds: string[]): ClientCampaignStatsRow[] {
  return campaignIds.map(campaignId => {
    const campaignRows = rows.filter(row => row.campaign_id === campaignId)
    const kpis = buildKpis(campaignRows)
    const scores = campaignRows
      .map(row => one(row.call_analyses)?.appointment_quality_score)
      .filter((score): score is number => score !== null && score !== undefined)
    const avg = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null
    const qualRate = kpis.qualification_rate ?? 0
    const healthScore = 0.65 * (avg ?? 0) + 0.35 * qualRate

    return {
      campaign_id: campaignId,
      total_calls: kpis.total_calls,
      appointments_booked: kpis.appointments_booked,
      qualified_appointments: kpis.qualified_appointments,
      avg_appointment_quality: avg,
      health_label:
        kpis.total_calls === 0 ? 'En cours'
        : healthScore >= 75 ? 'Saine'
        : healthScore >= 55 ? 'En bonne voie'
        : healthScore >= 40 ? 'À surveiller'
        : 'Attention requise',
      health_bg:
        kpis.total_calls === 0 ? 'bg-gray-100 text-gray-500 border-gray-200'
        : healthScore >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : healthScore >= 55 ? 'bg-blue-50 text-blue-700 border-blue-200'
        : healthScore >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200',
    }
  })
}

function logClientDashboardStep(step: string, payload: Record<string, unknown>) {
  console.log(`[CLIENT DASHBOARD TRACE] ${step}`, JSON.stringify(payload))
}

// ─── Pure computations ───────────────────────────────────────────────────────

function formatTimeSaved(totalCalls: number): string {
  const total = totalCalls * AVG_CALL_MINUTES
  const h = Math.floor(total / 60)
  const m = Math.round(total % 60)
  if (h === 0) return `${m}min`
  return `${h}h${m.toString().padStart(2, '0')}`
}

function trendDelta(current: number, previous: number): { pct: number; dir: 'up' | 'down' | 'flat' } | null {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  return { pct: Math.abs(pct), dir: pct > 2 ? 'up' : pct < -2 ? 'down' : 'flat' }
}

interface AISummary {
  hasData: boolean
  headline: string
  strengths: string[]
  weaknesses: string[]
  priority: string
}

function buildAISummary(kpis: ClientKPIsRow, statsRows: ClientCampaignStatsRow[]): AISummary {
  if (kpis.total_calls === 0) {
    return {
      hasData: false,
      headline: "Pas encore assez d'appels analysés pour générer des recommandations.",
      strengths: [],
      weaknesses: [],
      priority: '',
    }
  }

  const qualRate = kpis.qualification_rate ?? 0
  const dmRate = kpis.decision_maker_rate ?? 0
  const convRate = kpis.appointment_conversion_rate ?? 0
  const avgQuality =
    statsRows.length > 0
      ? statsRows.reduce((s, r) => s + (r.avg_appointment_quality ?? 0), 0) / statsRows.length
      : null

  const headline =
    qualRate >= 60 && dmRate >= 40
      ? 'La campagne est globalement performante.'
      : qualRate < 35 || dmRate < 20
      ? 'La campagne nécessite une attention particulière sur la qualification.'
      : 'La campagne progresse mais certains points freinent les résultats.'

  const strengths: string[] = []
  const weaknesses: string[] = []

  if (dmRate >= 40) strengths.push('Les décideurs sont régulièrement atteints')
  if (qualRate >= 60) strengths.push('Le taux de qualification est solide')
  if (convRate >= 15) strengths.push('Le taux de conversion appels → RDV est élevé')
  if (kpis.hot_warm_contacts > 0) {
    const n = kpis.hot_warm_contacts
    strengths.push(`${n} contact${n > 1 ? 's' : ''} chaud${n > 1 ? 's' : ''} ou tiède${n > 1 ? 's' : ''} identifié${n > 1 ? 's' : ''}`)
  }

  if (dmRate < 30) weaknesses.push('Peu de décideurs atteints dans les conversations')
  if (qualRate > 0 && qualRate < 50) weaknesses.push('Certains RDV sont pris sans besoin clairement exprimé')
  if (kpis.appointments_booked > 0 && convRate < 10) weaknesses.push('Le taux de conversion appels → RDV reste faible')
  if (avgQuality !== null && avgQuality < 60) weaknesses.push('La qualité moyenne des RDV est à améliorer')
  if (qualRate === 0 && kpis.appointments_booked > 0) weaknesses.push("Aucun RDV ne remplit encore les critères de qualification")

  let priority = ''
  if (dmRate < 25) priority = "Améliorer l'identification et l'atteinte des décideurs"
  else if (qualRate < 50) priority = 'Renforcer la qualification avant prise de rendez-vous'
  else if (convRate < 10) priority = 'Augmenter le taux de conversion des appels en rendez-vous'
  else priority = 'Maintenir les performances et capitaliser sur les RDV qualifiés'

  return { hasData: true, headline, strengths, weaknesses, priority }
}

interface HealthAssessment {
  label: string
  color: string
  bg: string
  border: string
  qualRate: number | null
  dmRate: number | null
  mainCause: string
}

function computeHealth(kpis: ClientKPIsRow): HealthAssessment {
  const qualRate = kpis.qualification_rate
  const dmRate = kpis.decision_maker_rate

  if (kpis.total_calls === 0) {
    return {
      label: 'En attente',
      color: 'var(--muted)',
      bg: 'rgba(148,163,184,.08)',
      border: 'var(--border)',
      qualRate: null,
      dmRate: null,
      mainCause: 'Aucun appel analysé sur cette période',
    }
  }

  if ((qualRate ?? 0) >= 60 && (dmRate ?? 0) >= 40) {
    return {
      label: 'Campagne saine',
      color: '#86efac',
      bg: 'rgba(34,197,94,.10)',
      border: 'rgba(34,197,94,.35)',
      qualRate,
      dmRate,
      mainCause: 'Tous les indicateurs sont dans les normes',
    }
  }

  if ((qualRate !== null && qualRate < 30) || (dmRate !== null && dmRate < 20)) {
    const cause =
      dmRate !== null && dmRate < 20
        ? 'Peu de décideurs atteints dans les conversations'
        : 'Taux de qualification insuffisant'
    return {
      label: 'Campagne en risque',
      color: '#fca5a5',
      bg: 'rgba(239,68,68,.12)',
      border: 'rgba(239,68,68,.32)',
      qualRate,
      dmRate,
      mainCause: cause,
    }
  }

  return {
    label: 'Campagne à surveiller',
    color: '#fcd34d',
    bg: 'rgba(245,158,11,.12)',
    border: 'rgba(245,158,11,.32)',
    qualRate,
    dmRate,
    mainCause: dmRate !== null && dmRate < 40 ? 'Décideurs atteints à améliorer' : 'Qualification à renforcer',
  }
}

interface NonQualReason { label: string; count: number; pct: number }

function computeNonQualReasons(bookedCalls: ClientCallRow[]): NonQualReason[] {
  if (bookedCalls.length === 0) return []

  const counts: Record<string, number> = {
    'Pas de décideur': 0,
    'Besoin non identifié': 0,
    'Score qualité faible': 0,
    'Date non confirmée': 0,
  }

  for (const call of bookedCalls) {
    const a = one(call.call_analyses)
    if (!a) continue
    if (!a.decision_maker_detected) counts['Pas de décideur']++
    if (!a.pain_point_details || a.pain_point_details.trim() === '') counts['Besoin non identifié']++
    if (a.appointment_quality_score !== null && a.appointment_quality_score < 60) counts['Score qualité faible']++
    if (!hasQualifiedAppointmentDate(a)) counts['Date non confirmée']++
  }

  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, pct: Math.round((count / bookedCalls.length) * 100) }))
}

interface SdrStat { name: string; total: number; booked: number; qualified: number; rate: number }

function aggregateSdrStats(
  calls: ClientCallRow[],
  nameMap: Record<string, string>
): SdrStat[] {
  const acc: Record<string, { name: string; total: number; booked: number; qualified: number }> = {}

  for (const call of calls) {
    const id = call.sdr_id
    if (!id) continue
    if (!acc[id]) acc[id] = { name: nameMap[id] || 'SDR', total: 0, booked: 0, qualified: 0 }
    acc[id].total++

    const a = Array.isArray(call.call_analyses) ? call.call_analyses[0] : call.call_analyses
    if (!a) continue
    if (a.appointment_booked) {
      acc[id].booked++
      if (
        a.decision_maker_detected === true &&
        a.pain_point_detected === true &&
        hasQualifiedAppointmentDate(a) &&
        a.appointment_quality_score !== null &&
        a.appointment_quality_score >= 60
      ) {
        acc[id].qualified++
      }
    }
  }

  return Object.values(acc)
    .map(s => ({ ...s, rate: s.booked > 0 ? Math.round((s.qualified / s.booked) * 100) : 0 }))
    .sort((a, b) => b.qualified - a.qualified || b.booked - a.booked)
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function SectionQ({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8, borderLeft: '2px solid var(--cyan)', paddingLeft: 8 }}>
      {children}
    </div>
  )
}

function TrendChip({ current, previous }: { current: number; previous: number }) {
  const t = trendDelta(current, previous)
  if (!t || t.dir === 'flat') return null
  const up = t.dir === 'up'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      color: up ? '#86efac' : '#fca5a5',
      background: up ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)',
      border: `1px solid ${up ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
    }}>
      {up ? '+' : '-'}{t.pct}% vs période préc.
    </span>
  )
}

function KpiTrend({ current, previous }: { current: number; previous: number }) {
  if (previous > 0) return <TrendChip current={current} previous={previous} />
  if (current > 0) return <span style={{ fontSize: 10, color: 'var(--muted-2)' }}>N/A période préc.</span>
  return null
}

function MetricRow({ label, value, fill, color }: {
  label: string; value: string; fill: number; color: string
}) {
  const pct = Math.min(100, Math.max(0, fill))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(148,163,184,.12)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: color, opacity: .7 }} />
      </div>
    </div>
  )
}

function EmptyGuide({ message, steps }: { message: string; steps: string[] }) {
  return (
    <div style={{ padding: '28px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>{message}</div>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              background: 'rgba(125,211,252,.10)', border: '1px solid rgba(125,211,252,.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: 'var(--cyan)',
            }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.5 }}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PeriodTab({ period, current }: { period: ReportPeriod; current: ReportPeriod }) {
  const active = period === current
  return (
    <Link
      href={`?period=${period}`}
      style={{
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: active ? 'var(--text)' : 'var(--muted)',
        background: active ? 'rgba(125,211,252,.12)' : 'transparent',
        border: `1px solid ${active ? 'rgba(125,211,252,.28)' : 'transparent'}`,
        transition: 'all .15s',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {PERIOD_LABELS[period]}
    </Link>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ClientPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('organization_id, client_id, role')
    .eq('id', user.id)
    .single<ClientProfile>()
  if (!profile || profile.role !== 'client') redirect('/login')
  if (!profile.client_id) {
    logClientDashboardStep('client_profile_missing_client_id', {
      user_id: user.id,
      email: user.email,
      organization_id: profile.organization_id,
    })
    redirect('/login')
  }
  logClientDashboardStep('current_user', {
    user_id: user.id,
    email: user.email,
    role: profile.role,
    organization_id: profile.organization_id,
    client_id: profile.client_id,
  })

  const { period: periodParam } = await searchParams
  const period: ReportPeriod =
    periodParam === '7d' || periodParam === '30d' || periodParam === 'month'
      ? periodParam
      : 'month'

  const adminSupabase = createAdminClient()

  const { data: campaignsData } = await adminSupabase
    .from('campaigns')
    .select(CAMPAIGN_SAFE_COLS)
    .eq('organization_id', profile.organization_id)
    .eq('client_id', profile.client_id)
    .order('campaign_name')
  const campaigns = (campaignsData || []) as ClientCampaign[]

  const campaignIds: string[] = campaigns.map(c => c.id)
  logClientDashboardStep('client_scope', {
    user_id: user.id,
    organization_id: profile.organization_id,
    client_id: profile.client_id,
    visible_campaign_ids: campaignIds,
    visible_campaigns: campaigns.map(campaign => ({
      id: campaign.id,
      client_id: campaign.client_id,
      client_name: campaign.client_name,
      campaign_name: campaign.campaign_name,
      status: campaign.status,
    })),
  })

  if (campaignIds.length === 0) {
    return (
      <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>Tableau de bord</h1>
        <Card>
          <EmptyGuide
            message="Aucune campagne assignée à votre compte."
            steps={[
              'Contactez votre responsable de compte',
              'Une campagne vous sera assignée',
              'Les indicateurs apparaîtront automatiquement',
            ]}
          />
        </Card>
      </div>
    )
  }

  const prevBounds = previousPeriodBounds(period)

  const [
    { count: orgCompletedCount },
    { data: visibleCompletedRows, error: visibleCompletedError },
    { data: previousRows, error: previousRowsError },
    { data: sdrUsers },
    { data: assignmentsRaw },
    { data: legacySdrAssignments },
  ] = await Promise.all([
    adminSupabase
      .from('calls')
      .select('id, call_analyses!inner(id), analysis_jobs!inner(status)', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
      .not('call_analyses.prospect_company', 'is', null),
    adminSupabase
      .from('calls')
      .select(`id, campaign_id, sdr_id, call_datetime, call_analyses!inner(${CLIENT_ANALYSIS_COLS}), analysis_jobs!inner(status)`)
      .in('campaign_id', campaignIds)
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
      .not('call_analyses.prospect_company', 'is', null)
      .order('call_datetime', { ascending: false })
      .returns<ClientCallRow[]>(),
    adminSupabase
      .from('calls')
      .select(`id, campaign_id, sdr_id, call_datetime, call_analyses!inner(${CLIENT_ANALYSIS_COLS}), analysis_jobs!inner(status)`)
      .in('campaign_id', campaignIds)
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
      .not('call_analyses.prospect_company', 'is', null)
      .gte('call_datetime', prevBounds.since)
      .lte('call_datetime', prevBounds.until)
      .order('call_datetime', { ascending: false })
      .returns<ClientCallRow[]>(),
    // SDR name lookup — scoped to SDRs assigned to visible campaigns.
    adminSupabase
      .from('users')
      .select('id, name')
      .eq('organization_id', profile.organization_id)
      .eq('role', 'sdr')
      .in('id',
        await adminSupabase
          .from('campaign_sdrs')
          .select('user_id')
          .in('campaign_id', campaignIds)
          .then(r => (r.data ?? []).map(x => x.user_id))
      ),
    // campaign_assignments (may not exist yet)
    adminSupabase
      .from('campaign_assignments')
      .select('sdr_id, campaign_id, starts_at, ends_at, status')
      .in('campaign_id', campaignIds)
      .eq('status', 'active'),
    // legacy fallback
    adminSupabase
      .from('campaign_sdrs')
      .select('user_id, campaign_id')
      .in('campaign_id', campaignIds),
  ])

  const allVisibleCompletedRows = visibleCompletedRows || []
  const dashboardRows = allVisibleCompletedRows
  const kpis = buildKpis(dashboardRows)
  const prevKpis = buildKpis(previousRows || [])

  const valueRows = buildValueRows(dashboardRows)
  const statsRows = buildCampaignStats(dashboardRows, campaignIds)
  const bookedCalls = dashboardRows.filter(call => one(call.call_analyses)?.appointment_booked === true)
  const allCallsRaw = dashboardRows

  logClientDashboardStep('query_results', {
    user_id: user.id,
    organization_id: profile.organization_id,
    client_id: profile.client_id,
    campaign_ids: campaignIds,
    period,
    previous_date_range: prevBounds,
    completed_calls_before_client_filters: orgCompletedCount ?? 0,
    completed_calls_after_campaign_filter: allVisibleCompletedRows.length,
    dashboard_rows_from_visible_completed_calls: dashboardRows.length,
    errors: {
      visible_completed: visibleCompletedError?.message ?? null,
      previous_period: previousRowsError?.message ?? null,
    },
    result_rows: dashboardRows.map(row => {
      const analysis = one(row.call_analyses)
      const job = one(row.analysis_jobs)
      return {
        call_id: row.id,
        campaign_id: row.campaign_id,
        sdr_id: row.sdr_id,
        call_datetime: row.call_datetime,
        job_status: job?.status ?? null,
        analysis_id: analysis?.id ?? null,
        prospect_company: analysis?.prospect_company ?? null,
        appointment_booked: analysis?.appointment_booked ?? null,
        appointment_date_text: analysis?.appointment_date_text ?? null,
        appointment_datetime: analysis?.appointment_datetime ?? null,
        appointment_date_confidence: analysis?.appointment_date_confidence ?? null,
        appointment_quality_score: analysis?.appointment_quality_score ?? null,
      }
    }),
    zero_reason:
      dashboardRows.length > 0 ? null
      : campaignIds.length === 0 ? 'no_visible_campaign_ids'
      : allVisibleCompletedRows.length === 0 ? 'no_completed_analysis_rows_for_visible_campaigns'
      : 'no_visible_completed_rows',
  })

  const topPainPoints = valueRows.filter(r => r.kind === 'pain_point').map(r => ({ label: r.label, count: r.cnt }))
  const topObjections = valueRows.filter(r => r.kind === 'objection').map(r => ({ label: r.label, count: r.cnt }))

  const nameMap: Record<string, string> = Object.fromEntries(
    ((sdrUsers || []) as SdrUserRow[]).map(u => [u.id, u.name])
  )

  const aiSummary    = buildAISummary(kpis, statsRows)
  const health       = computeHealth(kpis)
  const nonQualReasons = computeNonQualReasons(bookedCalls)
  const sdrStats     = aggregateSdrStats(allCallsRaw, nameMap)

  // Assigned SDRs for campaign context section
  type AssignedSdrEntry = { sdr_id: string; name: string; starts_at?: string; ends_at?: string; assignmentStatus: 'active' | 'scheduled' }
  const assignedSdrEntries: AssignedSdrEntry[] = []
  const seenSdrIds = new Set<string>()
  if (assignmentsRaw && assignmentsRaw.length > 0) {
    for (const a of assignmentsRaw as { sdr_id: string; campaign_id: string; starts_at: string; ends_at: string; status: string }[]) {
      if (seenSdrIds.has(a.sdr_id)) continue
      seenSdrIds.add(a.sdr_id)
      const todayStr = new Date().toISOString().split('T')[0]
      assignedSdrEntries.push({
        sdr_id: a.sdr_id,
        name: nameMap[a.sdr_id] ?? '—',
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        assignmentStatus: a.starts_at > todayStr ? 'scheduled' : 'active',
      })
    }
  } else if (legacySdrAssignments && legacySdrAssignments.length > 0) {
    for (const a of legacySdrAssignments as { user_id: string; campaign_id: string }[]) {
      if (seenSdrIds.has(a.user_id)) continue
      seenSdrIds.add(a.user_id)
      assignedSdrEntries.push({ sdr_id: a.user_id, name: nameMap[a.user_id] ?? '—', assignmentStatus: 'active' })
    }
  }

  const recentCalls = dashboardRows.slice(0, 10)

  const qualifiedAppointments = bookedCalls.filter((call: ClientCallRow) =>
    isQualifiedAnalysis(one(call.call_analyses))
  )

  const scoreColor = (n: number | null) =>
    n === null   ? 'var(--muted)'
    : n >= 75    ? '#86efac'
    : n >= 50    ? 'var(--cyan)'
    : n >= 30    ? '#fcd34d'
    : '#fca5a5'

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: #111 !important; }
        }
        @media (max-width: 900px) {
          .kpi-grid     { grid-template-columns: repeat(2,1fr) !important; }
          .summary-grid { grid-template-columns: 1fr !important; }
          .tables-grid  { grid-template-columns: 1fr !important; }
          .insights-grid{ grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .kpi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="app-scroll">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>Tableau de bord</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {campaigns.length === 1
                ? campaigns[0].campaign_name
                : `${campaigns?.length} campagnes`} · {PERIOD_LABELS[period]}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(2,6,23,.52)', border: '1px solid var(--border)', borderRadius: 24, padding: '4px 6px' }}>
              {(['7d', '30d', 'month'] as ReportPeriod[]).map(p => (
                <PeriodTab key={p} period={p} current={period} />
              ))}
            </div>
            <PrintButton />
          </div>
        </div>

        {/* ── CAMPAIGN CONTEXT BANNER ───────────────────────────────────── */}
        <div style={{ background: 'rgba(125,211,252,.05)', border: '1px solid rgba(125,211,252,.18)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Client</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{campaigns[0]?.client_name ?? '—'}</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>
              {campaigns.length > 1 ? `${campaigns.length} campagnes` : 'Campagne'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {campaigns.length === 1 ? campaigns[0].campaign_name : campaigns.map(c => c.campaign_name).join(', ')}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Commerciaux assignés</div>
            {assignedSdrEntries.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Non assignée</div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {assignedSdrEntries.map(s => (
                    <span key={s.sdr_id} style={{
                      fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                      background: s.assignmentStatus === 'active' ? 'rgba(34,197,94,.10)' : 'rgba(245,158,11,.10)',
                      color: s.assignmentStatus === 'active' ? '#86efac' : '#fcd34d',
                      border: `1px solid ${s.assignmentStatus === 'active' ? 'rgba(34,197,94,.30)' : 'rgba(245,158,11,.30)'}`,
                    }}>{s.name}{s.assignmentStatus === 'scheduled' ? ' · planifié' : ''}</span>
                  ))}
                </div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Statut</div>
            {(() => {
              const active = campaigns.filter(c => c.status === 'active').length
              const paused = campaigns.filter(c => c.status === 'paused').length
              const label = active > 0 ? 'Active' : paused > 0 ? 'En pause' : 'Terminée'
              const color = active > 0 ? '#86efac' : paused > 0 ? '#fcd34d' : 'var(--muted)'
              const bg = active > 0 ? 'rgba(34,197,94,.10)' : paused > 0 ? 'rgba(245,158,11,.10)' : 'rgba(148,163,184,.08)'
              const border = active > 0 ? 'rgba(34,197,94,.30)' : paused > 0 ? 'rgba(245,158,11,.30)' : 'var(--border)'
              return <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: bg, color, border: `1px solid ${border}` }}>{label}</span>
            })()}
          </div>
        </div>

        <OnboardingChecklist role="client" />

        {/* ── SECTION 1: KPI Strip ───────────────────────────────────────── */}
        <SectionQ>Obtenons-nous des résultats ?</SectionQ>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 22 }}>
          <StatCard
            label="Appels analysés"
            value={kpis.total_calls}
            trend={<KpiTrend current={kpis.total_calls} previous={prevKpis.total_calls} />}
            accent="var(--cyan)" style={{ borderLeftWidth: 3 }}
          />
          <StatCard
            label="RDV posés"
            value={kpis.appointments_booked}
            trend={<KpiTrend current={kpis.appointments_booked} previous={prevKpis.appointments_booked} />}
            accent="rgba(134,239,172,.7)" style={{ borderLeftWidth: 3 }}
          />
          <StatCard
            label="RDV qualifiés"
            value={kpis.qualified_appointments}
            sub="décideur + besoin + date"
            trend={<KpiTrend current={kpis.qualified_appointments} previous={prevKpis.qualified_appointments} />}
            accent="rgba(252,211,77,.7)" style={{ borderLeftWidth: 3 }}
          />
          <StatCard
            label="Taux de qualification"
            value={kpis.qualification_rate !== null ? `${kpis.qualification_rate}%` : '—'}
            sub="RDV qualifiés / RDV posés"
            accent="rgba(196,181,253,.7)" style={{ borderLeftWidth: 3 }}
          />
          <StatCard
            label="Temps économisé"
            value={kpis.total_calls > 0 ? `~${formatTimeSaved(kpis.total_calls)}` : '—'}
            sub={kpis.total_calls > 0 ? `${kpis.total_calls} appels × ~${AVG_CALL_MINUTES}min` : undefined}
            accent="var(--muted)" style={{ borderLeftWidth: 3 }}
          />
        </div>

        {/* ── SECTION 2+3: AI Summary + Health ──────────────────────────── */}
        <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>

          {/* AI Executive Summary */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>Que nous disent les données de cette période ?</SectionQ>
            <Card style={{ flex: 1 }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Analyse automatique de la campagne</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Mois en cours</span>
                </div>
              </CardHeader>
              <CardContent>
                {!aiSummary.hasData ? (
                  <EmptyGuide
                    message={aiSummary.headline}
                    steps={[
                      "L'équipe analyse les appels de la campagne",
                      "Les recommandations apparaîtront automatiquement",
                    ]}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.55 }}>
                      {aiSummary.headline}
                    </p>

                    {aiSummary.strengths.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#86efac', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>Points forts</div>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {aiSummary.strengths.map((s, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                              <span style={{ color: '#86efac', fontWeight: 700, flexShrink: 0, fontSize: 14, lineHeight: 1.2 }}>+</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiSummary.weaknesses.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>Points faibles</div>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {aiSummary.weaknesses.map((w, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                              <span style={{ color: '#fca5a5', fontWeight: 700, flexShrink: 0, fontSize: 14, lineHeight: 1.2 }}>−</span>
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiSummary.priority && (
                      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(125,211,252,.06)', border: '1px solid rgba(125,211,252,.18)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Priorité</div>
                        <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{aiSummary.priority}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Campaign Health */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>La campagne est-elle en bonne santé ?</SectionQ>
            <Card style={{ flex: 1 }}>
              <CardHeader>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Santé de la campagne</span>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
                    padding: '6px 18px', borderRadius: 20,
                    background: health.bg, border: `1px solid ${health.border}`,
                    fontSize: 14, fontWeight: 700, color: health.color,
                  }}>
                    {health.label}
                  </div>

                  {health.qualRate !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <MetricRow label="Qualification" value={`${health.qualRate}%`} fill={health.qualRate} color={scoreColor(health.qualRate)} />
                      {health.dmRate !== null && (
                        <MetricRow label="Décideurs atteints" value={`${health.dmRate}%`} fill={health.dmRate} color={scoreColor(health.dmRate)} />
                      )}
                      {kpis.appointment_conversion_rate !== null && (
                        <MetricRow label="Conv. appels → RDV" value={`${kpis.appointment_conversion_rate}%`} fill={kpis.appointment_conversion_rate} color={scoreColor(kpis.appointment_conversion_rate)} />
                      )}
                    </div>
                  )}

                  <div style={{ padding: '10px 12px', borderRadius: 8, background: health.bg, border: `1px solid ${health.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: health.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Cause principale</div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{health.mainCause}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── SECTION 5: Non-qualification causes ───────────────────────── */}
        <SectionQ>Pourquoi les RDV ne sont-ils pas qualifiés ?</SectionQ>
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Principales causes de non qualification</span>
              {kpis.appointments_booked > 0 && (
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                  {kpis.appointments_booked - kpis.qualified_appointments} RDV non qualifiés · {kpis.appointments_booked} posés
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {nonQualReasons.length === 0 ? (
              kpis.appointments_booked === 0 ? (
                <EmptyGuide
                  message="Aucun rendez-vous posé sur cette période."
                  steps={[
                    "Les appels doivent être analysés par l'IA",
                    "Les causes apparaîtront pour chaque RDV non qualifié",
                  ]}
                />
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                  Tous les rendez-vous posés sont qualifiés.
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {nonQualReasons.map(({ label, count, pct }) => (
                  <div key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{pct}% · {count} RDV</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(148,163,184,.12)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: 'linear-gradient(90deg,rgba(125,211,252,.65),rgba(99,102,241,.75))' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SECTION 6+7: SDR Leaderboard + Recent Qualified ───────────── */}
        <div className="tables-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* SDR Leaderboard */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>Quel commercial performe le mieux ?</SectionQ>
            <Card style={{ flex: 1 }}>
              <CardHeader>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Classement des commerciaux</span>
              </CardHeader>
              {sdrStats.length === 0 ? (
                <EmptyGuide
                  message="Aucune donnée commerciale sur cette période."
                  steps={[
                    "Les appels doivent être liés à un commercial",
                    "Le classement apparaîtra automatiquement",
                  ]}
                />
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 64px 52px', padding: '7px 20px', gap: 8, background: 'rgba(2,6,23,.4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    <span>Commercial</span>
                    <span style={{ textAlign: 'right' }}>RDV</span>
                    <span style={{ textAlign: 'right' }}>Qualifiés</span>
                    <span style={{ textAlign: 'right' }}>Taux</span>
                  </div>
                  {sdrStats.map((sdr, i) => (
                    <div key={sdr.name} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 64px 52px', padding: '11px 20px', gap: 8, borderBottom: i < sdrStats.length - 1 ? '1px solid var(--border)' : 'none', background: i === 0 ? 'rgba(125,211,252,.025)' : 'transparent', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 10, color: i === 0 ? 'var(--cyan)' : 'var(--muted-2)', fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sdr.name}</span>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{sdr.booked}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: sdr.qualified > 0 ? '#86efac' : 'var(--muted-2)', textAlign: 'right' }}>{sdr.qualified}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(sdr.rate), textAlign: 'right' }}>
                        {sdr.booked > 0 ? `${sdr.rate}%` : '—'}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </Card>
          </div>

          {/* Recent Qualified Appointments */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>Quels sont les derniers RDV qualifiés ?</SectionQ>
            <Card style={{ flex: 1 }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Derniers RDV qualifiés</span>
                  {kpis.qualified_appointments > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{kpis.qualified_appointments} total</span>
                  )}
                </div>
              </CardHeader>
              {qualifiedAppointments.length === 0 ? (
                <EmptyGuide
                  message="Aucun RDV qualifié sur cette période."
                  steps={[
                    "Identifier le décideur lors de l'appel",
                    "Confirmer le besoin et la date du RDV",
                    "Les RDV qualifiés apparaîtront ici",
                  ]}
                />
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 48px 60px', padding: '7px 20px', gap: 8, background: 'rgba(2,6,23,.4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    <span>Entreprise</span>
                    <span>Date RDV</span>
                    <span style={{ textAlign: 'right' }}>Score</span>
                    <span></span>
                  </div>
                  {qualifiedAppointments.slice(0, 8).map((call: ClientCallRow, i: number) => {
                    const a = one(call.call_analyses)
                    if (!a) return null
                    const sdrName = call.sdr_id ? nameMap[call.sdr_id] : null
                    const dateStr = a.appointment_datetime ? formatAppointmentDate(a.appointment_datetime) : a.appointment_date_text || formatDateShort(call.call_datetime)
                    return (
                      <div key={call.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 48px 60px', padding: '10px 20px', gap: 8, borderBottom: i < Math.min(qualifiedAppointments.length, 8) - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.prospect_company || 'Entreprise non précisée'}
                          </div>
                          {sdrName && (
                            <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 1 }}>{sdrName}</div>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{dateStr}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: scoreColor(a.appointment_quality_score) }}>
                          {a.appointment_quality_score ?? '—'}
                        </span>
                        <Link href={`/calls/${call.id}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--cyan)', textDecoration: 'none', textAlign: 'right' }}>
                          Voir →
                        </Link>
                      </div>
                    )
                  })}
                </>
              )}
            </Card>
          </div>
        </div>

        {/* ── SECTION: Recent call analyses ─────────────────────────────── */}
        <SectionQ>Appels analysés par l&apos;équipe</SectionQ>
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Analyses d&apos;appels récentes</span>
              {allVisibleCompletedRows.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{allVisibleCompletedRows.length} appel{allVisibleCompletedRows.length > 1 ? 's' : ''} analysé{allVisibleCompletedRows.length > 1 ? 's' : ''}</span>
              )}
            </div>
          </CardHeader>
          {recentCalls.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                L&apos;équipe n&apos;a pas encore analysé d&apos;appel pour cette campagne.
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                Les appels analysés, RDV obtenus et recommandations apparaîtront ici en temps réel.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 80px 80px 52px 80px', padding: '7px 20px', gap: 8, background: 'rgba(2,6,23,.4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                <span>Date</span>
                <span>Prospect / Entreprise</span>
                <span>Commercial</span>
                <span>Intérêt</span>
                <span>RDV posé</span>
                <span style={{ textAlign: 'right' }}>Score</span>
                <span></span>
              </div>
              {recentCalls.map((call, i) => {
                const a = one(call.call_analyses)
                if (!a) return null
                const sdrName = call.sdr_id ? (nameMap[call.sdr_id] ?? '—') : '—'
                const interestColor = a.interest_level === 'hot' ? '#fca5a5' : a.interest_level === 'warm' ? '#fcd34d' : a.interest_level === 'cold' ? 'var(--cyan)' : 'var(--muted)'
                const interestLabel = a.interest_level === 'hot' ? 'Chaud' : a.interest_level === 'warm' ? 'Tiède' : a.interest_level === 'cold' ? 'Froid' : '—'
                return (
                  <div key={call.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 80px 80px 52px 80px', padding: '10px 20px', gap: 8, borderBottom: i < recentCalls.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{formatDateShort(call.call_datetime)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prospect_company || '—'}</div>
                      {a.contact_name && <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>{a.contact_name}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sdrName}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: interestColor }}>{interestLabel}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: a.appointment_booked ? '#86efac' : 'var(--muted-2)' }}>
                      {a.appointment_booked ? 'Oui' : 'Non'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: scoreColor(a.appointment_quality_score) }}>
                      {a.appointment_quality_score ?? '—'}
                    </span>
                    <Link href={`/calls/${call.id}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--cyan)', textDecoration: 'none', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      Voir →
                    </Link>
                  </div>
                )
              })}
            </>
          )}
        </Card>

        {/* ── Pain points + Objections ───────────────────────────────────── */}
        <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>Qu&apos;est-ce qui freine vos prospects ?</SectionQ>
            <Card style={{ flex: 1 }}>
              <CardHeader>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Problématiques identifiées</span>
                  <p style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 2 }}>Retours marché de vos prospects</p>
                </div>
              </CardHeader>
              <CardContent>
                {topPainPoints.length === 0 ? (
                  <EmptyGuide
                    message="Aucune problématique identifiée sur cette période."
                    steps={[
                      "Les commerciaux doivent identifier les besoins lors des appels",
                      "Les problématiques seront extraites automatiquement par l'IA",
                    ]}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {topPainPoints.map(({ label, count }, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, flex: 1 }}>{label}</span>
                        <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'rgba(148,163,184,.08)', border: '1px solid var(--border)' }}>{count}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>Quelles objections bloquent les RDV ?</SectionQ>
            <Card style={{ flex: 1 }}>
              <CardHeader>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Objections fréquentes</span>
              </CardHeader>
              <CardContent>
                {topObjections.length === 0 ? (
                  <EmptyGuide
                    message="Aucune objection répertoriée sur cette période."
                    steps={[
                      "Les objections sont extraites automatiquement lors de l'analyse",
                      "Elles apparaîtront ici une fois les appels traités",
                    ]}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topObjections.map(({ label, count }, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{label}</span>
                        <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fca5a5', background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.25)' }}>{count}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </>
  )
}
