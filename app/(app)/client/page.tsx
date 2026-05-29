import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, StatCard, Badge } from '@/components/ui'
import { formatDate, formatDateShort, getCampaignStatusLabel, getCampaignStatusBg } from '@/lib/utils'
import { PrintButton } from '@/components/client/PrintButton'
import {
  computeClientKPIs,
  computeValueReport,
  generateExecutiveSummary,
  appointmentQualityLabel,
  clientCampaignHealthLabel,
  filterByPeriod,
  type ReportPeriod,
} from '@/lib/client-reporting'
import type { Call, CallAnalysis, Campaign } from '@/types'

type CallRow = Call & { call_analyses: CallAnalysis | null; campaigns: Pick<Campaign, 'campaign_name' | 'client_name'> | null }

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  '7d':    '7 derniers jours',
  '30d':   '30 derniers jours',
  'month': 'Mois en cours',
}

function PeriodTab({ period, current }: { period: ReportPeriod; current: ReportPeriod }) {
  const active = period === current
  return (
    <Link
      href={`?period=${period}`}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? 'bg-slate-800 text-white'
          : 'text-slate-600 hover:bg-gray-100'
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
    periodParam === '7d' || periodParam === '30d' || periodParam === 'month'
      ? periodParam
      : 'month'

  const { data: assignments } = await supabase
    .from('campaign_clients').select('campaign_id').eq('user_id', user.id)
  const campaignIds = assignments?.map((a: any) => a.campaign_id) || []

  const [{ data: campaigns }, { data: allCalls }] = await Promise.all([
    supabase.from('campaigns').select('*').in('id', campaignIds),
    supabase
      .from('calls')
      .select('*, call_analyses(*), campaigns(campaign_name, client_name)')
      .in('campaign_id', campaignIds)
      .order('call_datetime', { ascending: false }),
  ])

  const allCallsTyped = (allCalls || []) as CallRow[]

  const periodCalls   = filterByPeriod(allCallsTyped, period)
  const periodAnalyses = periodCalls.map(c => c.call_analyses).filter(Boolean) as CallAnalysis[]

  const monthCalls    = filterByPeriod(allCallsTyped, 'month')
  const monthAnalyses = monthCalls.map(c => c.call_analyses).filter(Boolean) as CallAnalysis[]

  const kpis          = computeClientKPIs(periodCalls as any)
  const valueReport   = computeValueReport(periodAnalyses, kpis.totalCalls)
  const execSummary   = generateExecutiveSummary(monthAnalyses, monthCalls.length)

  const campaignStats = (campaigns || []).map((c: Campaign) => {
    const cc = allCallsTyped.filter(call => call.campaign_id === c.id)
    const an = cc.map(call => call.call_analyses).filter(Boolean) as CallAnalysis[]
    const booked = an.filter(a => a.appointment_booked).length
    return { ...c, totalCalls: cc.length, booked, health: clientCampaignHealthLabel(an) }
  })

  const bookedInPeriod = periodCalls.filter(c => c.call_analyses?.appointment_booked)

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
            <p className="text-gray-500 text-sm mt-1">Suivi de votre campagne de prise de rendez-vous</p>
          </div>
          <PrintButton />
        </div>

        {/* Part 1 — Period selector */}
        <div className="no-print flex items-center gap-2 mb-6 bg-gray-50 rounded-xl p-1.5 w-fit">
          {(['7d', '30d', 'month'] as ReportPeriod[]).map(p => (
            <PeriodTab key={p} period={p} current={period} />
          ))}
        </div>

        {/* Part 1 — KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Appels traités"        value={kpis.totalCalls} />
          <StatCard label="Contacts intéressés"   value={kpis.hotWarmContacts} sub="chaud ou tiède" />
          <StatCard label="RDV posés"              value={kpis.appointmentsBooked} />
          <StatCard label="RDV qualifiés"          value={kpis.qualifiedAppointments} sub="décideur + besoin + date" />
          <StatCard
            label="Taux de qualification"
            value={kpis.qualificationRate !== null ? `${kpis.qualificationRate}%` : '—'}
            sub="RDV qualifiés / RDV posés"
          />
        </div>

        {/* Part 3 — Campaign health */}
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

        {/* Part 2 — Appointment quality report */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Rendez-vous posés</h2>
              <span className="text-xs text-gray-400">{bookedInPeriod.length} RDV · {PERIOD_LABELS[period]}</span>
            </div>
          </CardHeader>
          {bookedInPeriod.length === 0 ? (
            <CardContent>
              <p className="text-sm text-gray-400 text-center py-6">Aucun rendez-vous sur cette période.</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-gray-50">
              {bookedInPeriod.map((call: CallRow) => {
                const a = call.call_analyses!
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

        {/* Part 4 — Value report */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Problématiques identifiées</h2>
              <p className="text-xs text-gray-400 mt-0.5">Retours marché de vos prospects</p>
            </CardHeader>
            <CardContent>
              {valueReport.topPainPoints.length === 0 ? (
                <p className="text-sm text-gray-400">Pas encore de données.</p>
              ) : (
                <div className="space-y-3">
                  {valueReport.topPainPoints.map(({ label, count }, i) => (
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
                {valueReport.topObjections.length === 0 ? (
                  <p className="text-sm text-gray-400">Pas encore de données.</p>
                ) : (
                  <div className="space-y-2">
                    {valueReport.topObjections.map(({ label, count }, i) => (
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
                value={valueReport.decisionMakerRate !== null ? `${valueReport.decisionMakerRate}%` : '—'}
                sub="parmi les contacts atteints"
              />
              <StatCard
                label="Taux de conversion"
                value={valueReport.appointmentConversionRate !== null ? `${valueReport.appointmentConversionRate}%` : '—'}
                sub="appels → RDV"
              />
            </div>
          </div>
        </div>

        {/* Part 5 — Executive summary */}
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

        {(campaigns || []).length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-gray-400">
              Aucune campagne assignée à votre compte.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
