import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getCampaignStatusBg, getCampaignStatusLabel, getScoreColor, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import type { Campaign, User, CallAnalysis, Call } from '@/types'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/login')

  // Fetch all campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  // Fetch all calls with analyses
  const { data: calls } = await supabase
    .from('calls')
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name)')
    .eq('organization_id', profile.organization_id)
    .order('call_datetime', { ascending: false })

  // Fetch all SDRs
  const { data: sdrs } = await supabase
    .from('users')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'sdr')

  // Compute stats
  const totalCalls = calls?.length || 0
  const analyses = calls?.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean) || []
  const appointmentsBooked = analyses.filter((a: CallAnalysis) => a?.appointment_booked).length
  const avgAppointmentQuality = analyses.length > 0
    ? Math.round(analyses.reduce((sum: number, a: CallAnalysis) => sum + (a?.appointment_quality_score || 0), 0) / analyses.length)
    : 0
  const avgSdrQuality = analyses.length > 0
    ? Math.round(analyses.reduce((sum: number, a: CallAnalysis) => sum + (a?.sdr_quality_score || 0), 0) / analyses.length)
    : 0
  const activeCampaigns = campaigns?.filter((c: Campaign) => c.status === 'active').length || 0

  // SDR stats
  const sdrStats = (sdrs || []).map((sdr: User) => {
    const sdrCalls = calls?.filter((c: Call) => c.sdr_id === sdr.id) || []
    const sdrAnalyses = sdrCalls.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean)
    const avgQ = sdrAnalyses.length > 0
      ? Math.round(sdrAnalyses.reduce((s: number, a: CallAnalysis) => s + (a?.sdr_quality_score || 0), 0) / sdrAnalyses.length)
      : 0
    const rdvBooked = sdrAnalyses.filter((a: CallAnalysis) => a?.appointment_booked).length
    return { ...sdr, totalCalls: sdrCalls.length, avgQuality: avgQ, rdvBooked }
  }).sort((a, b) => b.avgQuality - a.avgQuality)

  // Campaign stats
  const campaignStats = (campaigns || []).map((c: Campaign) => {
    const campCalls = calls?.filter((call: Call) => call.campaign_id === c.id) || []
    const campAnalyses = campCalls.map((call: Call & { call_analyses: CallAnalysis }) => call.call_analyses).filter(Boolean)
    const avgQ = campAnalyses.length > 0
      ? Math.round(campAnalyses.reduce((s: number, a: CallAnalysis) => s + (a?.appointment_quality_score || 0), 0) / campAnalyses.length)
      : 0
    const rdv = campAnalyses.filter((a: CallAnalysis) => a?.appointment_booked).length
    return { ...c, totalCalls: campCalls.length, avgQuality: avgQ, rdvBooked: rdv }
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble</h1>
        <p className="text-gray-500 text-sm mt-1">Supervision globale de votre activité</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Appels analysés" value={totalCalls} />
        <StatCard label="RDV posés" value={appointmentsBooked} />
        <StatCard label="Qualité RDV moy." value={avgAppointmentQuality} sub="/100" />
        <StatCard label="Qualité SDR moy." value={avgSdrQuality} sub="/100" />
        <StatCard label="Campagnes actives" value={activeCampaigns} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaigns */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Campagnes</h2>
                <Link href="/campaigns" className="text-xs text-slate-600 hover:underline">Voir tout →</Link>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {campaignStats.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">Aucune campagne</div>
              )}
              {campaignStats.map(c => (
                <Link key={c.id} href={`/campaigns/${c.id}`}>
                  <div className="px-6 py-3 hover:bg-gray-50 flex items-center justify-between transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.campaign_name}</p>
                      <p className="text-xs text-gray-400">{c.client_name} · {c.totalCalls} appel(s) · {c.rdvBooked} RDV</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <ScoreBadge score={c.avgQuality} />
                      <Badge className={getCampaignStatusBg(c.status)}>{getCampaignStatusLabel(c.status)}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* SDR Leaderboard */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Classement SDR</h2>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">Aucun SDR</div>
              )}
              {sdrStats.map((sdr, i) => (
                <div key={sdr.id} className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 last:border-0">
                  <span className={`text-lg font-bold w-5 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'}`}>
                    {i + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">
                    {sdr.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sdr.name}</p>
                    <p className="text-xs text-gray-400">{sdr.totalCalls} appels · {sdr.rdvBooked} RDV</p>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(sdr.avgQuality)}`}>
                    {sdr.avgQuality || '—'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent calls */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Appels récents</h2>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">SDR</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Prospect</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">RDV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Qualité RDV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Score SDR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(calls || []).slice(0, 10).map((call: Call & { call_analyses: CallAnalysis, users: User }) => (
                  <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{formatDateShort(call.call_datetime)}</td>
                    <td className="px-6 py-3 font-medium text-gray-800">{call.users?.name || '—'}</td>
                    <td className="px-6 py-3 text-gray-600">{call.call_analyses?.prospect_company || '—'}</td>
                    <td className="px-6 py-3">
                      {call.call_analyses?.appointment_booked
                        ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Posé</Badge>
                        : <Badge className="bg-gray-100 text-gray-500 border-gray-200">Non</Badge>
                      }
                    </td>
                    <td className="px-6 py-3">
                      <Link href={`/calls/${call.id}`}>
                        <ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} />
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} />
                    </td>
                  </tr>
                ))}
                {(!calls || calls.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                      Aucun appel analysé pour l&apos;instant
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
