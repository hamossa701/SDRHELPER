import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  OwnerDashboardClient,
  type OwnerDashboardCall,
  type OwnerDashboardCampaign,
} from '@/components/dashboard/OwnerDashboardClient'
import type {
  Campaign,
  CampaignHealthResult,
  DashboardCampaignStatsRow,
  DashboardKPIs,
  SDRLeaderboardRow,
} from '@/types'

function campaignHealthFromStats(s: DashboardCampaignStatsRow): CampaignHealthResult {
  if (s.total_calls === 0) {
    return { score: 0, label: 'Pas de données', labelClass: 'text-slate-400', labelBg: 'bg-slate-800 text-slate-400 border-slate-600' }
  }
  const qualRate = s.appointments_booked > 0 ? s.qualified_appointments / s.appointments_booked : 0
  const score = Math.round(
    0.40 * (s.avg_appointment_quality ?? 0) +
    0.25 * (s.avg_sdr_quality ?? 0) +
    0.20 * (qualRate * 100) +
    0.15 * (s.avg_ai_confidence ?? 0)
  )
  if (score >= 80) return { score, label: 'Très saine', labelClass: 'text-emerald-400', labelBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
  if (score >= 65) return { score, label: 'Correcte', labelClass: 'text-blue-400', labelBg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }
  if (score >= 50) return { score, label: 'À surveiller', labelClass: 'text-amber-400', labelBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
  return { score, label: 'Critique', labelClass: 'text-red-400', labelBg: 'bg-red-500/10 text-red-400 border-red-500/30' }
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: { name: string; value: string; options: object }[]) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/login')

  const { data: campaigns } = await supabase
    .from('campaigns').select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const campaignIds = (campaigns || []).map((c: Campaign) => c.id)

  const [
    { data: kpisData },
    { data: leaderboardData },
    { data: campaignStatsData },
    { data: historyCalls },
  ] = await Promise.all([
    supabase.rpc('get_dashboard_kpis', { p_org_id: profile.organization_id }),
    supabase.rpc('get_sdr_leaderboard', { p_org_id: profile.organization_id }),
    campaignIds.length > 0
      ? supabase.rpc('get_dashboard_campaign_stats', { p_campaign_ids: campaignIds, p_org_id: profile.organization_id })
      : Promise.resolve({ data: [] as DashboardCampaignStatsRow[] }),
    supabase
      .from('calls')
      .select('id, call_datetime, review_status, call_analyses!inner(appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, sdr_quality_score, prospect_company, contact_name, decision_maker_detected, pain_point_detected, ai_confidence, human_validated), analysis_jobs!inner(status), users!calls_sdr_id_fkey(name), campaigns(campaign_name, client_name, status)')
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
      .order('call_datetime', { ascending: false })
      .limit(100),
  ])

  const kpis: DashboardKPIs = kpisData?.[0] ?? {
    total_calls: 0, appointments_booked: 0, qualified_appointments: 0,
    avg_appointment_quality: null, avg_sdr_quality: null,
    active_campaigns: 0, sdrs_needing_coaching: 0, team_trend: 'stable',
  }

  const sdrStats = (leaderboardData || []) as SDRLeaderboardRow[]
  const bestSdr = sdrStats[0] ?? null
  const weakestSdr = sdrStats[sdrStats.length - 1] ?? null

  const teamTrendLabel = kpis.team_trend === 'improving' ? '↑ En progression'
    : kpis.team_trend === 'declining' ? '↓ En régression' : '→ Stable'
  const teamTrendColor = kpis.team_trend === 'improving' ? '#86efac'
    : kpis.team_trend === 'declining' ? '#fca5a5' : 'var(--cyan)'

  const statsMap = Object.fromEntries(
    ((campaignStatsData || []) as DashboardCampaignStatsRow[]).map(s => [s.campaign_id, s])
  )
  const emptyStat = (id: string): DashboardCampaignStatsRow => ({
    campaign_id: id, total_calls: 0, appointments_booked: 0, qualified_appointments: 0,
    avg_appointment_quality: null, avg_sdr_quality: null, avg_ai_confidence: null,
  })
  const campaignStats = (campaigns || []).map((c: Campaign) => ({
    ...c,
    totalCalls: statsMap[c.id]?.total_calls ?? 0,
    rdvBooked: statsMap[c.id]?.appointments_booked ?? 0,
    health: campaignHealthFromStats(statsMap[c.id] ?? emptyStat(c.id)),
  })) as OwnerDashboardCampaign[]

  return (
    <OwnerDashboardClient
      kpis={kpis}
      campaigns={campaignStats}
      historyCalls={(historyCalls || []) as OwnerDashboardCall[]}
      teamTrendLabel={teamTrendLabel}
      teamTrendColor={teamTrendColor}
      bestSdr={bestSdr}
      weakestSdr={weakestSdr}
    />
  )
}
