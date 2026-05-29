import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, StatCard, Badge } from '@/components/ui'
import { formatDate, formatDateShort, getCampaignStatusLabel, getCampaignStatusBg } from '@/lib/utils'
import { PrintButton } from '@/components/client/PrintButton'
import { appointmentQualityLabel } from '@/lib/client-reporting'
import type {
  Campaign, ClientKPIsRow, ClientValueReportRow,
  ClientCampaignStatsRow,
} from '@/types'

type ReportPeriod = '7d' | '30d' | 'month'

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  '7d':    '7 derniers jours',
  '30d':   '30 derniers jours',
  'month': 'Mois en cours',
}

function periodBounds(period: ReportPeriod): { since: string; until: string } {
  const now = new Date()
  const until = now.toISOString()
  if (period === 'month') {
    return { since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), until }
  }
  const days = period === '7d' ? 7 : 30
  return { since: new Date(now.getTime() - days * 86_400_000).toISOString(), until }
}

function clientHealthLabel(s: ClientCampaignStatsRow): { label: string; bg: string } {
  if (s.total_calls === 0) return { label: 'En cours', bg: 'bg-gray-100 text-gray-500 border-gray-200' }
  const qualRate = s.appointments_booked > 0 ? s.qualified_appointments / s.appointments_booked : 0
  const score = Math.round(
    0.40 * (s.avg_appointment_quality ?? 0) +
    0.25 * (s.avg_sdr_quality         ?? 0) +
    0.20 * (qualRate * 100) +
    0.15 * (s.avg_ai_confidence       ?? 0)
  )
  if (score >= 75) return { label: 'Saine',            bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 55) return { label: 'En bonne voie',    bg: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (score >= 40) return { label: 'À surveiller',     bg: 'bg-amber-50 text-amber-700 border-amber-200' }
  return             { label: 'Attention requise', bg: 'bg-red-50 text-red-700 border-red-200' }
}

function buildExecSummary(kpis: ClientKPIsRow): string {
  if (kpis.total_calls === 0) return 'Aucune donnée disponible pour cette période.'
  const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  let s = `Ce mois-ci (${month}), ${kpis.total_calls} appel${kpis.total_calls !== 1 ? 's' : ''} ont été traités`
  if (kpis.appointments_booked > 0) {
    s += `, dont ${kpis.appointments_booked} rendez-vous posé${kpis.appointments_booked !== 1 ? 's' : ''}`
    if (kpis.qualified_appointments > 0) {
      s += `. ${kpis.qualified_appointments} ${kpis.qualified_appointments !== 1 ? 'répondent' : 'répond'} à l'ensemble des critères de qualification`
    }
  }
  s += '.'
  if (kpis.decision_maker_rate !== null && kpis.decision_maker_rate > 0) {
    s += ` Les décideurs ont été atteints dans ${kpis.decision_maker_rate}% des conversations.`
  }
  return s
}

function PeriodTab({ period, current }: { period: ReportPeriod; current: ReportPeriod }) {
  return (
    <Link
      href={`?period=${period}`}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        period === current ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-gray-100'
      }`}
    >
      {PERIOD_LABELS[period]}
    </Link>
  )
}

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
        setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'client') redirect('/login')

  const { period: periodParam } = await searchParams
  const period: ReportPeriod =
    periodParam === '7d' || periodParam === '30d' || periodParam === 'month' ? periodParam : 'month'

  const { data: assignments } = await supabase
    .from('campaign_clients').select('campaign_id').eq('user_id', user.id)
  const rawIds = (assignments || []).map((a: any) => a.campaign_id)

  // RBAC: verify assignments belong to this org — prevents cross-org data access
  const { data: validRows } = rawIds.length > 0
    ? await supabase.from('campaigns').select('id').in('id', rawIds).eq('organization_id', profile.organization_id)
    : { data: [] as { id: string }[] }
  const campaignIds: string[] = (validRows || []).map((r: any) => r.id)

  if (campaignIds.length === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Tableau de bord</h1>
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            Aucune campagne assignée à votre compte.
          </CardContent>
        </Card>
      </div>
    )
  }

  const { since, until } = periodBounds(period)
  const monthBounds = periodBounds('month')

  // All KPIs are SQL aggregations — correct at any call volume.
  // Appointment list is display-only, paginated to 50 most recent.
  const [
    { data: kpisData },
    { data: valueData },
    { data: campaignStatsData },
    { data: campaigns },
    { data: monthKpisData },
    { data: bookedCalls },
  ] = await Promise.all([
    supabase.rpc('get_client_kpis', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
      p_since: since,
      p_until: until,
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
    supabase.from('campaigns').select('*').in('id', campaignIds),
    supabase.rpc('get_client_kpis', {
      p_campaign_ids: campaignIds,
      p_org_id: profile.organization_id,
      p_since: monthBounds.since,
      p_until: monthBounds.until,
    }),
    // Display list — limited; not used for any KPI computation
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses!inner(prospect_company, contact_name, contact_role, appointment_booked, appointment_datetime, appointment_quality_score, pain_point_details, next_step, decision_maker_detected)')
      .in('campaign_id', campaignIds)
      .eq('organization_id', profile.organization_id)
      .gte('call_datetime', since)
      .lte('call_datetime', until)
      .eq('call_analyses.appointment_booked', true)
      .order('call_datetime', { ascending: false })
      .limit(50),
  ])

  const kpis: ClientKPIsRow = kpisData?.[0] ?? {
    total_calls: 0, hot_warm_contacts: 0, appointments_booked: 0,
    qualified_appointments: 0, qualification_rate: null,
    decision_maker_rate: null, appointment_conversion_rate: null,
  }
  const monthKpis: ClientKPIsRow = monthKpisData?.[0] ?? kpis

  const valueRows  = (valueData  || []) as ClientValueReportRow[]
  const statsRows  = (campaignStatsData || []) as ClientCampaignStatsRow[]
  const statsMap   = Object.fromEntries(statsRows.map(s => [s.campaign_id, s]))

  const topPainPoints = valueRows.filter(r => r.kind === 'pain_point').map(r => ({ label: r.label, count: r.cnt }))
  const topObjections = valueRows.filter(r => r.kind === 'objection').map(r => ({ label: r.label, count: r.cnt }))

  const campaignStats = (campaigns || []).map((c: Campaign) => {
    const s = statsMap[c.id]
    return {
      ...c,
      health:     s ? clientHealthLabel(s) : { label: 'En cours', bg: 'bg-gray-100 text-gray-500 border-gray-200' },
      totalCalls: s?.total_calls        ?? 0,
      booked:     s?.appointments_booked ?? 0,
    }
  })

  const execSummary = buildExecSummary(monthKpis)

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
            <p className="text-gray-500 text-sm mt-1">Suivi de votre campagne de prise de rendez-vous</p>
          </div>
          <PrintButton />
        </div>

        <div className="no-print flex items-center gap-2 mb-6 bg-gray-50 rounded-xl p-1.5 w-fit">
          {(['7d', '30d', 'month'] as ReportPeriod[]).map(p => (
            <PeriodTab key={p} period={p} current={period} />
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Appels traités"       value={kpis.total_calls} />
          <StatCard label="Contacts intéressés"  value={kpis.hot_warm_contacts} sub="chaud ou tiède" />
          <StatCard label="RDV posés"             value={kpis.appointments_booked} />
          <StatCard label="RDV qualifiés"         value={kpis.qualified_appointments} sub="décideur + besoin + date" />
          <StatCard
            label="Taux de qualification"
            value={kpis.qualification_rate !== null ? `${kpis.qualification_rate}%` : '—'}
            sub="RDV qualifiés / RDV posés"
          />
        </div>

        {campaignStats.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">État des campagnes</h2>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {campaignStats.map((c: any) => (
                <div key={c.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.campaign_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.totalCalls} appel{c.totalCalls !== 1 ? 's' : ''} · {c.booked} RDV posé{c.booked !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={c.health.bg}>{c.health.label}</Badge>
                    <Badge className={getCampaignStatusBg(c.status)}>{getCampaignStatusLabel(c.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Rendez-vous posés</h2>
              <span className="text-xs text-gray-400">{kpis.appointments_booked} RDV · {PERIOD_LABELS[period]}</span>
            </div>
          </CardHeader>
          {!bookedCalls?.length ? (
            <CardContent>
              <p className="text-sm text-gray-400 text-center py-6">Aucun rendez-vous sur cette période.</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-gray-50">
              {(bookedCalls || []).map((call: any) => {
                const a = call.call_analyses
                if (!a) return null
                const quality = appointmentQualityLabel(a.appointment_quality_score)
                return (
                  <div key={call.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {a.prospect_company || 'Entreprise non précisée'}
                        </p>
                        {a.contact_name && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {a.contact_name}{a.contact_role ? ` · ${a.contact_role}` : ''}
                          </p>
                        )}
                      </div>
                      <Badge className={quality.bg}>{quality.label}</Badge>
                    </div>
                    <div className="space-y-1">
                      {a.appointment_datetime && (
                        <p className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">RDV :</span> {formatDate(a.appointment_datetime)}
                        </p>
                      )}
                      {a.pain_point_details && (
                        <p className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">Contexte :</span> {a.pain_point_details}
                        </p>
                      )}
                      {a.next_step && (
                        <p className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">Prochaine étape :</span> {a.next_step}
                        </p>
                      )}
                      {a.decision_maker_detected && (
                        <span className="inline-block text-xs text-emerald-600 font-medium mt-1">Décideur confirmé</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Appel du {formatDateShort(call.call_datetime)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Problématiques identifiées</h2>
              <p className="text-xs text-gray-400 mt-0.5">Retours marché de vos prospects</p>
            </CardHeader>
            <CardContent>
              {topPainPoints.length === 0 ? (
                <p className="text-sm text-gray-400">Pas encore de données.</p>
              ) : (
                <div className="space-y-3">
                  {topPainPoints.map(({ label, count }, i) => (
                    <div key={i} className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-700 leading-snug flex-1">{label}</p>
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 shrink-0">{count}×</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">Objections fréquentes</h2>
              </CardHeader>
              <CardContent>
                {topObjections.length === 0 ? (
                  <p className="text-sm text-gray-400">Pas encore de données.</p>
                ) : (
                  <div className="space-y-2">
                    {topObjections.map(({ label, count }, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{label}</span>
                        <Badge className="bg-red-50 text-red-600 border-red-200">{count}×</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="Taux décideurs"
                value={kpis.decision_maker_rate !== null ? `${kpis.decision_maker_rate}%` : '—'}
                sub="parmi les contacts atteints"
              />
              <StatCard
                label="Taux de conversion"
                value={kpis.appointment_conversion_rate !== null ? `${kpis.appointment_conversion_rate}%` : '—'}
                sub="appels → RDV"
              />
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Résumé exécutif</h2>
              <span className="text-xs text-gray-400">Mois en cours</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 leading-relaxed">{execSummary}</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
