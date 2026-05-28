import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge, Empty } from '@/components/ui'
import { getInterestBg, getInterestLabel, formatDateShort, getScoreBg } from '@/lib/utils'
import Link from 'next/link'
import type { Call, CallAnalysis } from '@/types'

export default async function SDRPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'sdr') redirect('/login')

  const { data: calls } = await supabase
    .from('calls')
    .select('*, call_analyses(*), campaigns(campaign_name, client_name)')
    .eq('sdr_id', user.id)
    .order('call_datetime', { ascending: false })

  const analyses = calls?.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean) || []
  const totalCalls = calls?.length || 0
  const rdvBooked = analyses.filter((a: CallAnalysis) => a?.appointment_booked).length
  const avgRdvQ = analyses.length > 0
    ? Math.round(analyses.reduce((s: number, a: CallAnalysis) => s + (a?.appointment_quality_score || 0), 0) / analyses.length)
    : 0
  const avgSdrQ = analyses.length > 0
    ? Math.round(analyses.reduce((s: number, a: CallAnalysis) => s + (a?.sdr_quality_score || 0), 0) / analyses.length)
    : 0

  // Aggregate strengths and weaknesses
  const allStrengths: string[] = []
  const allWeaknesses: string[] = []
  const allCoaching: string[] = []
  analyses.forEach((a: CallAnalysis) => {
    if (a?.strengths) allStrengths.push(...a.strengths)
    if (a?.weaknesses) allWeaknesses.push(...a.weaknesses)
    if (a?.coaching_recommendations) allCoaching.push(...a.coaching_recommendations)
  })

  // Frequency count
  const countFreq = (arr: string[]) => {
    const map: Record<string, number> = {}
    arr.forEach(item => { map[item] = (map[item] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }
  const topStrengths = countFreq(allStrengths)
  const topWeaknesses = countFreq(allWeaknesses)
  const topCoaching = countFreq(allCoaching)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mon tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Bonjour {profile.name} — voici vos performances</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels analysés" value={totalCalls} />
        <StatCard label="RDV posés" value={rdvBooked} />
        <StatCard label="Qualité RDV" value={avgRdvQ} sub="/100" />
        <StatCard label="Mon score SDR" value={avgSdrQ} sub="/100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls list */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Mes appels récents</h2>
                <Link href="/calls/upload" className="text-xs text-slate-600 hover:underline">+ Analyser un appel</Link>
              </div>
            </CardHeader>
            {calls?.length === 0 ? (
              <CardContent>
                <Empty
                  title="Aucun appel analysé"
                  description="Analysez votre premier appel pour voir vos performances."
                  action={<Link href="/calls/upload"><Badge className="bg-slate-800 text-white border-slate-800 cursor-pointer">Analyser un appel</Badge></Link>}
                />
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Prospect</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Intérêt</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">RDV</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Mon score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {calls?.map((call: Call & { call_analyses: CallAnalysis }) => (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-500">{formatDateShort(call.call_datetime)}</td>
                        <td className="px-6 py-3 font-medium text-gray-800">{call.call_analyses?.prospect_company || '—'}</td>
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
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Feedback panel */}
        <div className="space-y-4">
          {/* Score overview */}
          <Card>
            <CardContent className="pt-5">
              <div className="text-center mb-4">
                <div className={`text-5xl font-bold mb-1 ${avgSdrQ >= 70 ? 'text-emerald-600' : avgSdrQ >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {avgSdrQ || '—'}
                </div>
                <p className="text-xs text-gray-400">Score SDR moyen</p>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Appels analysés</span>
                  <span className="font-medium">{totalCalls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Taux de RDV</span>
                  <span className="font-medium">{totalCalls > 0 ? Math.round(rdvBooked / totalCalls * 100) : 0}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strengths */}
          {topStrengths.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">✅ Vos points forts</h3></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {topStrengths.map(([item]) => (
                    <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">•</span>{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Weaknesses */}
          {topWeaknesses.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">⚠️ Axes d&apos;amélioration</h3></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {topWeaknesses.map(([item]) => (
                    <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">•</span>{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Coaching */}
          {topCoaching.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">🎯 Conseils coaching</h3></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {topCoaching.map(([item]) => (
                    <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-blue-500 mt-0.5">→</span>{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
