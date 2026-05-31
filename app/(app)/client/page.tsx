import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui'
import { formatDateShort } from '@/lib/utils'
import { PrintButton } from '@/components/client/PrintButton'
import { createAdminClient } from '@/lib/supabase-admin'
import type { ClientKPIsRow, ClientValueReportRow, ClientCampaignStatsRow } from '@/types'

type ReportPeriod = '7d' | '30d' | 'month'

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  '7d':    '7 jours',
  '30d':   '30 jours',
  'month': 'Mois en cours',
}

const AVG_CALL_MINUTES = 8
const CAMPAIGN_SAFE_COLS = 'id, campaign_name, client_name, sector, status, created_at'

// ─── Period utilities ────────────────────────────────────────────────────────

function periodBounds(period: ReportPeriod): { since: string; until: string } {
  const now = new Date()
  const until = now.toISOString()
  if (period === 'month') {
    return { since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), until }
  }
  const days = period === '7d' ? 7 : 30
  return { since: new Date(now.getTime() - days * 86_400_000).toISOString(), until }
}

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

function computeNonQualReasons(bookedCalls: any[]): NonQualReason[] {
  if (bookedCalls.length === 0) return []

  const counts: Record<string, number> = {
    'Pas de décideur': 0,
    'Besoin non identifié': 0,
    'Score qualité faible': 0,
    'Date non confirmée': 0,
  }

  for (const call of bookedCalls) {
    const a = call.call_analyses
    if (!a) continue
    if (!a.decision_maker_detected) counts['Pas de décideur']++
    if (!a.pain_point_details || a.pain_point_details.trim() === '') counts['Besoin non identifié']++
    if (a.appointment_quality_score !== null && a.appointment_quality_score < 60) counts['Score qualité faible']++
    if (!a.appointment_datetime) counts['Date non confirmée']++
  }

  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, pct: Math.round((count / bookedCalls.length) * 100) }))
}

interface SdrStat { name: string; total: number; booked: number; qualified: number; rate: number }

function aggregateSdrStats(
  calls: Array<{ sdr_id: string | null; call_analyses: any }>,
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
        a.appointment_datetime &&
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
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
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
      padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, marginTop: 4,
      color: up ? '#86efac' : '#fca5a5',
      background: up ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)',
      border: `1px solid ${up ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
    }}>
      {up ? '+' : '-'}{t.pct}% vs période préc.
    </span>
  )
}

function KpiCard({ label, value, sub, current, previous }: {
  label: string; value: string | number; sub?: string; current?: number; previous?: number
}) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 18px',
      backdropFilter: 'blur(18px)',
      boxShadow: 'var(--shadow)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      minHeight: 100,
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(125,211,252,.55),transparent)', opacity: .7 }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{sub}</div>}
      {current !== undefined && previous !== undefined && previous > 0 && (
        <TrendChip current={current} previous={previous} />
      )}
      {current !== undefined && previous !== undefined && previous === 0 && current > 0 && (
        <span style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 4 }}>N/A période préc.</span>
      )}
    </div>
  )
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
        setAll(c: any) { try { c.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'client') redirect('/login')

  const { period: periodParam } = await searchParams
  const period: ReportPeriod =
    periodParam === '7d' || periodParam === '30d' || periodParam === 'month'
      ? periodParam
      : 'month'

  const { data: assignments } = await supabase
    .from('campaign_clients').select('campaign_id').eq('user_id', user.id)
  const rawIds = (assignments || []).map((a: any) => a.campaign_id)

  const adminSupabase = createAdminClient()

  const { data: campaigns } = rawIds.length > 0
    ? await adminSupabase
        .from('campaigns')
        .select(CAMPAIGN_SAFE_COLS)
        .in('id', rawIds)
        .eq('organization_id', profile.organization_id)
    : { data: [] as any[] }

  const campaignIds: string[] = (campaigns || []).map((c: any) => c.id)

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

  const { since, until } = periodBounds(period)
  const prevBounds = previousPeriodBounds(period)
  const monthBounds = periodBounds('month')

  const [
    { data: kpisData },
    { data: prevKpisData },
    { data: valueData },
    { data: campaignStatsData },
    { data: monthKpisData },
    { data: bookedCalls },
    { data: allCallsRaw },
    { data: sdrUsers },
  ] = await Promise.all([
    supabase.rpc('get_client_kpis', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
      p_since: since,
      p_until: until,
    }),
    supabase.rpc('get_client_kpis', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
      p_since: prevBounds.since,
      p_until: prevBounds.until,
    }),
    supabase.rpc('get_client_value_report', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
      p_since: since,
      p_until: until,
    }),
    supabase.rpc('get_client_campaign_stats', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
    }),
    supabase.rpc('get_client_kpis', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
      p_since: monthBounds.since,
      p_until: monthBounds.until,
    }),
    // Booked calls — admin client bypasses RLS; security enforced via campaignIds + org_id filter.
    // sdr_id included here so qualified appointments table can display SDR names.
    adminSupabase
      .from('calls')
      .select('id, sdr_id, call_datetime, call_analyses!inner(prospect_company, contact_name, contact_role, appointment_booked, appointment_datetime, appointment_quality_score, pain_point_details, next_step, decision_maker_detected)')
      .in('campaign_id', campaignIds)
      .eq('organization_id', profile.organization_id)
      .gte('call_datetime', since)
      .lte('call_datetime', until)
      .eq('call_analyses.appointment_booked', true)
      .order('call_datetime', { ascending: false })
      .limit(50),
    // All calls in period for SDR leaderboard aggregation.
    adminSupabase
      .from('calls')
      .select('sdr_id, call_analyses(appointment_booked, decision_maker_detected, pain_point_detected, appointment_datetime, appointment_quality_score)')
      .in('campaign_id', campaignIds)
      .eq('organization_id', profile.organization_id)
      .gte('call_datetime', since)
      .lte('call_datetime', until),
    // SDR name lookup — org-scoped, no cross-org leak possible.
    adminSupabase
      .from('users')
      .select('id, name')
      .eq('organization_id', profile.organization_id),
  ])

  const kpis: ClientKPIsRow = kpisData?.[0] ?? {
    total_calls: 0, hot_warm_contacts: 0, appointments_booked: 0,
    qualified_appointments: 0, qualification_rate: null,
    decision_maker_rate: null, appointment_conversion_rate: null,
  }
  const prevKpis: ClientKPIsRow = prevKpisData?.[0] ?? {
    total_calls: 0, hot_warm_contacts: 0, appointments_booked: 0,
    qualified_appointments: 0, qualification_rate: null,
    decision_maker_rate: null, appointment_conversion_rate: null,
  }
  const monthKpis: ClientKPIsRow = monthKpisData?.[0] ?? kpis

  const valueRows  = (valueData  || []) as ClientValueReportRow[]
  const statsRows  = (campaignStatsData || []) as ClientCampaignStatsRow[]

  const topPainPoints = valueRows.filter(r => r.kind === 'pain_point').map(r => ({ label: r.label, count: r.cnt }))
  const topObjections = valueRows.filter(r => r.kind === 'objection').map(r => ({ label: r.label, count: r.cnt }))

  const nameMap: Record<string, string> = Object.fromEntries(
    (sdrUsers || []).map((u: any) => [u.id, u.name])
  )

  const aiSummary    = buildAISummary(monthKpis, statsRows)
  const health       = computeHealth(kpis)
  const nonQualReasons = computeNonQualReasons(bookedCalls || [])
  const sdrStats     = aggregateSdrStats(allCallsRaw || [], nameMap)

  const qualifiedAppointments = (bookedCalls || []).filter((call: any) => {
    const a = call.call_analyses
    if (!a) return false
    return (
      a.decision_maker_detected === true &&
      a.pain_point_details && a.pain_point_details.trim() !== '' &&
      a.appointment_datetime &&
      a.appointment_quality_score !== null &&
      a.appointment_quality_score >= 60
    )
  })

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

      <div style={{ padding: '22px 28px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>Tableau de bord</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {campaigns?.length === 1
                ? (campaigns[0] as any).campaign_name
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

        {/* ── SECTION 1: KPI Strip ───────────────────────────────────────── */}
        <SectionQ>Obtenons-nous des résultats ?</SectionQ>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 22 }}>
          <KpiCard
            label="Appels analysés"
            value={kpis.total_calls}
            current={kpis.total_calls}
            previous={prevKpis.total_calls}
          />
          <KpiCard
            label="RDV posés"
            value={kpis.appointments_booked}
            current={kpis.appointments_booked}
            previous={prevKpis.appointments_booked}
          />
          <KpiCard
            label="RDV qualifiés"
            value={kpis.qualified_appointments}
            sub="décideur + besoin + date"
            current={kpis.qualified_appointments}
            previous={prevKpis.qualified_appointments}
          />
          <KpiCard
            label="Taux de qualification"
            value={kpis.qualification_rate !== null ? `${kpis.qualification_rate}%` : '—'}
            sub="RDV qualifiés / RDV posés"
          />
          <KpiCard
            label="Temps économisé"
            value={kpis.total_calls > 0 ? `~${formatTimeSaved(kpis.total_calls)}` : '—'}
            sub={kpis.total_calls > 0 ? `${kpis.total_calls} appels × ~${AVG_CALL_MINUTES}min` : undefined}
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Résumé IA de la campagne</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Mois en cours</span>
                </div>
              </CardHeader>
              <CardContent>
                {!aiSummary.hasData ? (
                  <EmptyGuide
                    message={aiSummary.headline}
                    steps={[
                      "Importer un enregistrement d'appel",
                      "Lancer l'analyse IA",
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
                    padding: '6px 16px', borderRadius: 20,
                    background: health.bg, border: `1px solid ${health.border}`,
                    fontSize: 13, fontWeight: 700, color: health.color,
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 48px', padding: '7px 20px', gap: 8, background: 'rgba(2,6,23,.4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    <span>Entreprise</span>
                    <span>Date</span>
                    <span style={{ textAlign: 'right' }}>Score</span>
                  </div>
                  {qualifiedAppointments.slice(0, 8).map((call: any, i: number) => {
                    const a = call.call_analyses
                    const sdrName = call.sdr_id ? nameMap[call.sdr_id] : null
                    const dateStr = formatDateShort(a.appointment_datetime || call.call_datetime)
                    return (
                      <div key={call.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 48px', padding: '10px 20px', gap: 8, borderBottom: i < Math.min(qualifiedAppointments.length, 8) - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
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
                      </div>
                    )
                  })}
                </>
              )}
            </Card>
          </div>
        </div>

        {/* ── Pain points + Objections ───────────────────────────────────── */}
        <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionQ>Qu'est-ce qui freine vos prospects ?</SectionQ>
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
