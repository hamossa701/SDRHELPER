import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge, Empty } from '@/components/ui'
import { getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import type { CallAnalysis, SDRDashboardKPIs } from '@/types'

export default async function SDRPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'sdr') redirect('/login')

  // KPIs: full SQL aggregation — correct regardless of call volume
  // Display list: limited to 50 most recent for the table view only
  const [{ data: kpisData }, { data: calls }] = await Promise.all([
    supabase.rpc('get_sdr_dashboard_kpis', { p_sdr_id: user.id }),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses(appointment_booked, sdr_quality_score, prospect_company, interest_level, strengths, weaknesses, coaching_recommendations), campaigns(campaign_name, client_name)')
      .eq('sdr_id', user.id)
      .order('call_datetime', { ascending: false })
      .limit(50),
  ])

  const kpis: SDRDashboardKPIs = kpisData?.[0] ?? {
    total_calls: 0, rdv_booked: 0, avg_rdv_quality: null, avg_sdr_quality: null, conversion_rate: 0,
  }

  // Qualitative feedback — from last 50 fetched calls (qualitative, not KPIs)
  const analyses = (calls || []).map((c: any) => c.call_analyses).filter(Boolean) as CallAnalysis[]
  const countFreq = (arr: string[]) => {
    const map: Record<string, number> = {}
    arr.forEach(item => { map[item] = (map[item] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }
  const topStrengths = countFreq(analyses.flatMap(a => a?.strengths || []))
  const topWeaknesses = countFreq(analyses.flatMap(a => a?.weaknesses || []))
  const topCoaching  = countFreq(analyses.flatMap(a => a?.coaching_recommendations || []))

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mon tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Bonjour {profile.name} — voici vos performances</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels analysés" value={kpis.total_calls} />
        <StatCard label="RDV posés"        value={kpis.rdv_booked} />
        <StatCard label="Qualité RDV"      value={kpis.avg_rdv_quality ?? '—'} sub="/100" />
        <StatCard label="Mon score SDR"    value={kpis.avg_sdr_quality ?? '—'} sub="/100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Mes appels récents</h2>
                <Link href="/calls/upload" className="text-xs text-slate-600 hover:underline">+ Analyser un appel</Link>
              </div>
            </CardHeader>
            {!calls?.length ? (
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
                    {calls.map((call: any) => (
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

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="text-center mb-4">
                <div className={`text-5xl font-bold mb-1 ${(kpis.avg_sdr_quality ?? 0) >= 70 ? 'text-emerald-600' : (kpis.avg_sdr_quality ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {kpis.avg_sdr_quality ?? '—'}
                </div>
                <p className="text-xs text-gray-400">Score SDR moyen</p>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Appels analysés</span>
                  <span className="font-medium">{kpis.total_calls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Taux de RDV</span>
                  <span className="font-medium">{kpis.conversion_rate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {topStrengths.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Vos points forts</h3></CardHeader>
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

          {topWeaknesses.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Axes d&apos;amélioration</h3></CardHeader>
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

          {topCoaching.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Conseils coaching</h3></CardHeader>
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
