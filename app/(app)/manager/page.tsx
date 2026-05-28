import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import type { Call, CallAnalysis, User, Campaign } from '@/types'

export default async function ManagerPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'manager') redirect('/login')

  // Fetch calls from today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: allCalls } = await supabase
    .from('calls')
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name, id), campaigns(campaign_name, client_name)')
    .eq('organization_id', profile.organization_id)
    .order('call_datetime', { ascending: false })

  const todayCalls = allCalls?.filter((c: Call) =>
    new Date(c.call_datetime) >= today
  ) || []

  const analyses = allCalls?.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean) || []

  const needsReview = allCalls?.filter((c: Call & { call_analyses: CallAnalysis }) =>
    c.call_analyses && !c.call_analyses.human_validated &&
    (c.call_analyses.hallucination_risk === 'high' ||
     (c.call_analyses.appointment_quality_score || 0) < 40)
  ) || []

  const appointmentsBooked = analyses.filter((a: CallAnalysis) => a?.appointment_booked).length

  // Common objections
  const objectionTypes: Record<string, number> = {}
  analyses.forEach((a: CallAnalysis) => {
    if (a?.objection_detected && a?.objection_type) {
      objectionTypes[a.objection_type] = (objectionTypes[a.objection_type] || 0) + 1
    }
  })
  const topObjections = Object.entries(objectionTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // SDR leaderboard
  const { data: sdrs } = await supabase
    .from('users')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'sdr')

  const sdrStats = (sdrs || []).map((sdr: User) => {
    const sdrCalls = allCalls?.filter((c: Call) => c.sdr_id === sdr.id) || []
    const sdrAnalyses = sdrCalls.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean)
    const avgQ = sdrAnalyses.length > 0
      ? Math.round(sdrAnalyses.reduce((s: number, a: CallAnalysis) => s + (a?.sdr_quality_score || 0), 0) / sdrAnalyses.length)
      : 0
    const rdv = sdrAnalyses.filter((a: CallAnalysis) => a?.appointment_booked).length
    return { ...sdr, totalCalls: sdrCalls.length, avgQuality: avgQ, rdvBooked: rdv }
  }).sort((a, b) => b.avgQuality - a.avgQuality)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Supervision</h1>
        <p className="text-gray-500 text-sm mt-1">Vue opérationnelle du jour</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels aujourd'hui" value={todayCalls.length} />
        <StatCard label="À réviser" value={needsReview.length} sub="score faible ou risque IA" />
        <StatCard label="RDV total" value={appointmentsBooked} />
        <StatCard label="Appels total" value={allCalls?.length || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls needing review */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">⚠️ Appels à réviser</h2>
                <span className="text-xs text-gray-400">{needsReview.length} appel(s)</span>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {needsReview.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">Aucun appel en attente de révision ✓</div>
              )}
              {needsReview.slice(0, 8).map((call: Call & { call_analyses: CallAnalysis, users: User, campaigns: Campaign }) => (
                <Link key={call.id} href={`/calls/${call.id}`}>
                  <div className="px-6 py-3 hover:bg-gray-50 flex items-center justify-between transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {call.call_analyses?.prospect_company || 'Prospect inconnu'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {call.users?.name} · {call.campaigns?.campaign_name} · {formatDateShort(call.call_datetime)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {call.call_analyses?.hallucination_risk === 'high' && (
                        <Badge className="bg-red-50 text-red-600 border-red-200">Risque IA</Badge>
                      )}
                      <ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Recent calls table */}
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Appels récents</h2>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">SDR</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Prospect</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Intérêt</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">RDV</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(allCalls || []).slice(0, 10).map((call: Call & { call_analyses: CallAnalysis, users: User }) => (
                    <tr key={call.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-800">{call.users?.name || '—'}</td>
                      <td className="px-6 py-3 text-gray-600">{call.call_analyses?.prospect_company || '—'}</td>
                      <td className="px-6 py-3">
                        <Badge className={getInterestBg(call.call_analyses?.interest_level ?? null)}>
                          {getInterestLabel(call.call_analyses?.interest_level ?? null)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        {call.call_analyses?.appointment_booked
                          ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Posé</Badge>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-6 py-3">
                        <Link href={`/calls/${call.id}`}>
                          <ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!allCalls?.length && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Aucun appel</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* SDR Leaderboard */}
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.map((sdr, i) => (
                <div key={sdr.id} className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 last:border-0">
                  <span className={`font-bold text-sm w-4 ${i === 0 ? 'text-amber-500' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sdr.name}</p>
                    <p className="text-xs text-gray-400">{sdr.totalCalls} appels · {sdr.rdvBooked} RDV</p>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(sdr.avgQuality)}`}>{sdr.avgQuality || '—'}</span>
                </div>
              ))}
              {sdrStats.length === 0 && <div className="px-6 py-6 text-center text-sm text-gray-400">Aucun SDR</div>}
            </CardContent>
          </Card>

          {/* Top objections */}
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Objections fréquentes</h2></CardHeader>
            <CardContent>
              {topObjections.length === 0 && <p className="text-sm text-gray-400">Pas encore de données</p>}
              <div className="space-y-2">
                {topObjections.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{type}</span>
                    <Badge className="bg-red-50 text-red-600 border-red-200">{count}×</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
