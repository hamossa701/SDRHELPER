import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getCampaignStatusBg, getCampaignStatusLabel, getScoreColor, formatDateShort } from '@/lib/utils'
import { isQualifiedAppointment } from '@/lib/review-flags'
import Link from 'next/link'
import type {
  Campaign, DashboardKPIs, SDRLeaderboardRow,
  ClientCampaignStatsRow, CampaignHealthResult,
} from '@/types'

function campaignHealthFromStats(s: ClientCampaignStatsRow): CampaignHealthResult {
  if (s.total_calls === 0) {
    return { score: 0, label: 'Pas de données', labelClass: 'text-gray-400', labelBg: 'bg-gray-100 text-gray-500 border-gray-200' }
  }
  const qualRate = s.appointments_booked > 0 ? s.qualified_appointments / s.appointments_booked : 0
  const score = Math.round(
    0.40 * (s.avg_appointment_quality ?? 0) +
    0.25 * (s.avg_sdr_quality         ?? 0) +
    0.20 * (qualRate * 100) +
    0.15 * (s.avg_ai_confidence       ?? 0)
  )
  if (score >= 80) return { score, label: 'Très saine',   labelClass: 'text-emerald-600', labelBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 65) return { score, label: 'Correcte',     labelClass: 'text-blue-600',    labelBg: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (score >= 50) return { score, label: 'À surveiller', labelClass: 'text-amber-600',   labelBg: 'bg-amber-50 text-amber-700 border-amber-200' }
  return             { score, label: 'Critique',       labelClass: 'text-red-600',     labelBg: 'bg-red-50 text-red-700 border-red-200' }
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/login')

  // Campaigns first — IDs needed for the campaign-stats RPC
  const { data: campaigns } = await supabase
    .from('campaigns').select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const campaignIds = (campaigns || []).map((c: Campaign) => c.id)

  // All KPI queries run as SQL aggregations — correct at any call volume.
  // recentCalls is the only limited fetch, used for the display table only.
  const [
    { data: kpisData },
    { data: leaderboardData },
    { data: campaignStatsData },
    { data: recentCalls },
  ] = await Promise.all([
    supabase.rpc('get_dashboard_kpis', { p_org_id: profile.organization_id }),
    supabase.rpc('get_sdr_leaderboard', { p_org_id: profile.organization_id }),
    campaignIds.length > 0
      ? supabase.rpc('get_client_campaign_stats', {
          p_campaign_ids: campaignIds,
          p_org_id: profile.organization_id,
        })
      : Promise.resolve({ data: [] as ClientCampaignStatsRow[] }),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses(appointment_booked, appointment_quality_score, sdr_quality_score, prospect_company, decision_maker_detected, pain_point_detected, appointment_datetime), users!calls_sdr_id_fkey(name)')
      .eq('organization_id', profile.organization_id)
      .order('call_datetime', { ascending: false })
      .limit(10),
  ])

  const kpis: DashboardKPIs = kpisData?.[0] ?? {
    total_calls: 0, appointments_booked: 0, qualified_appointments: 0,
    avg_appointment_quality: null, avg_sdr_quality: null,
    active_campaigns: 0, sdrs_needing_coaching: 0, team_trend: 'stable',
  }

  const sdrStats = (leaderboardData || []) as SDRLeaderboardRow[]
  const bestSdr    = sdrStats[0]                       ?? null
  const weakestSdr = sdrStats[sdrStats.length - 1]     ?? null

  const teamTrendLabel = kpis.team_trend === 'improving' ? '↑ Équipe en progression'
    : kpis.team_trend === 'declining' ? '↓ Équipe en régression' : '→ Équipe stable'
  const teamTrendCls = kpis.team_trend === 'improving' ? 'text-emerald-600'
    : kpis.team_trend === 'declining' ? 'text-red-500' : 'text-blue-600'

  const statsMap = Object.fromEntries(
    ((campaignStatsData || []) as ClientCampaignStatsRow[]).map(s => [s.campaign_id, s])
  )
  const emptyStat = (id: string): ClientCampaignStatsRow => ({
    campaign_id: id, total_calls: 0, appointments_booked: 0, qualified_appointments: 0,
    avg_appointment_quality: null, avg_sdr_quality: null, avg_ai_confidence: null,
  })
  const campaignStats = (campaigns || []).map((c: Campaign) => ({
    ...c,
    totalCalls: statsMap[c.id]?.total_calls   ?? 0,
    rdvBooked:  statsMap[c.id]?.appointments_booked ?? 0,
    health:     campaignHealthFromStats(statsMap[c.id] ?? emptyStat(c.id)),
  }))

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble</h1>
        <p className="text-gray-500 text-sm mt-1">Supervision globale de votre activité</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Appels analysés"  value={kpis.total_calls} />
        <StatCard label="RDV posés"         value={kpis.appointments_booked} />
        <StatCard label="RDV qualifiés"     value={kpis.qualified_appointments} sub="décideur + besoin + date + score ≥60" />
        <StatCard label="Qualité RDV moy."  value={kpis.avg_appointment_quality ?? '—'} sub="/100" />
        <StatCard label="Qualité SDR moy."  value={kpis.avg_sdr_quality ?? '—'} sub="/100" />
        <StatCard label="Campagnes actives" value={kpis.active_campaigns} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Campagnes</h2>
                <Link href="/campaigns" className="text-xs text-slate-600 hover:underline">Voir tout →</Link>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {campaignStats.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">Aucune campagne</div>}
              {campaignStats.map((c: any) => (
                <Link key={c.id} href={`/campaigns/${c.id}`}>
                  <div className="px-6 py-3 hover:bg-gray-50 flex items-center justify-between transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.campaign_name}</p>
                      <p className="text-xs text-gray-400">{c.client_name} · {c.totalCalls} appel(s) · {c.rdvBooked} RDV</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {c.totalCalls > 0 && (
                        <Badge className={c.health.labelBg}>{c.health.label} {c.health.score}/100</Badge>
                      )}
                      <Badge className={getCampaignStatusBg(c.status)}>{getCampaignStatusLabel(c.status)}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">Aucun SDR</div>}
              {sdrStats.map((sdr, i) => (
                <div key={sdr.sdr_id} className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 last:border-0">
                  <span className={`text-lg font-bold w-5 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{sdr.sdr_name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sdr.sdr_name}</p>
                    <p className="text-xs text-gray-400">{sdr.total_calls} appels · {sdr.rdv_booked} RDV</p>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(sdr.avg_sdr_quality)}`}>{sdr.avg_sdr_quality ?? '—'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {sdrStats.length > 0 && (
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Meilleur SDR</p>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate">{bestSdr?.sdr_name || '—'}</p>
            <p className="text-xs text-gray-400">Score moy. {bestSdr?.avg_sdr_quality ?? '—'}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">SDR à coacher</p>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate">{weakestSdr?.sdr_name || '—'}</p>
            <p className="text-xs text-gray-400">Score moy. {weakestSdr?.avg_sdr_quality ?? '—'}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Charge coaching</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.sdrs_needing_coaching}</p>
            <p className="text-xs text-gray-400">SDR nécessitant coaching</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tendance équipe</p>
            <p className={`text-lg font-bold mt-1 ${teamTrendCls}`}>{teamTrendLabel}</p>
            <Link href="/coaching" className="text-xs text-slate-500 hover:underline">Voir coaching →</Link>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900">Appels récents</h2></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">SDR</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Prospect</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">RDV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Qualité RDV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Score SDR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(recentCalls || []).map((call: any) => (
                  <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{formatDateShort(call.call_datetime)}</td>
                    <td className="px-6 py-3 font-medium text-gray-800">{call.users?.name || '—'}</td>
                    <td className="px-6 py-3 text-gray-600">{call.call_analyses?.prospect_company || '—'}</td>
                    <td className="px-6 py-3">
                      {call.call_analyses?.appointment_booked ? (
                        isQualifiedAppointment(call.call_analyses)
                          ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Qualifié</Badge>
                          : <Badge className="bg-amber-50 text-amber-700 border-amber-200">~ Posé</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500 border-gray-200">Non</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3"><Link href={`/calls/${call.id}`}><ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} /></Link></td>
                    <td className="px-6 py-3"><ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} /></td>
                  </tr>
                ))}
                {!recentCalls?.length && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Aucun appel analysé pour l&apos;instant</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
