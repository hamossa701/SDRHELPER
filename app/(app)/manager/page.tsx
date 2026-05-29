import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import { computeReviewFlags, isQualifiedAppointment, reviewCriticalityRank } from '@/lib/review-flags'
import { computeTrustScore } from '@/lib/trust-score'
import { buildSDRProfile } from '@/lib/coaching'
import Link from 'next/link'
import type { Call, CallAnalysis, User, Campaign } from '@/types'

type CallRow = Call & { call_analyses: CallAnalysis; users: User; campaigns: Campaign }

export default async function ManagerPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'manager') redirect('/login')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: allCalls } = await supabase
    .from('calls')
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name, id), campaigns(campaign_name, client_name)')
    .eq('organization_id', profile.organization_id)
    .order('call_datetime', { ascending: false })

  const todayCalls = allCalls?.filter((c: CallRow) => new Date(c.call_datetime) >= today) || []
  const analyses = allCalls?.map((c: CallRow) => c.call_analyses).filter(Boolean) || []

  // Part 2 — Qualified appointment KPIs
  const appointmentsBooked = analyses.filter((a: CallAnalysis) => a?.appointment_booked).length
  const qualifiedAppointments = analyses.filter((a: CallAnalysis) => a && isQualifiedAppointment(a)).length
  const qualificationRate = appointmentsBooked > 0
    ? Math.round((qualifiedAppointments / appointmentsBooked) * 100)
    : 0

  // Part 5 — Trust score KPIs
  const callsReviewed = analyses.filter((a: CallAnalysis) => a?.human_validated).length
  const callsPending  = analyses.filter((a: CallAnalysis) => a && !a.human_validated).length
  const totalCorrections = analyses.reduce((n: number, a: CallAnalysis) => {
    return n + Object.values(a?.field_validations || {}).filter(s => s === 'corrected').length
  }, 0)
  const trust = computeTrustScore(analyses)

  // Part 4 — Review queue: calls with any review flag, sorted by criticality
  const callsWithFlags = (allCalls || [])
    .filter((c: CallRow) => {
      if (!c.call_analyses) return false
      const { review_required } = computeReviewFlags(c.call_analyses)
      return review_required
    })
    .sort((a: CallRow, b: CallRow) =>
      reviewCriticalityRank(a.call_analyses) - reviewCriticalityRank(b.call_analyses)
    )

  // Common objections
  const objectionTypes: Record<string, number> = {}
  analyses.forEach((a: CallAnalysis) => {
    if (a?.objection_detected && a?.objection_type) {
      objectionTypes[a.objection_type] = (objectionTypes[a.objection_type] || 0) + 1
    }
  })
  const topObjections = Object.entries(objectionTypes).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // SDR leaderboard + coaching profiles
  const { data: sdrs } = await supabase
    .from('users').select('*').eq('organization_id', profile.organization_id).eq('role', 'sdr')

  const sdrStats = (sdrs || []).map((sdr: User) => {
    const sdrCalls = allCalls?.filter((c: CallRow) => c.sdr_id === sdr.id) || []
    const sdrAnalyses = sdrCalls.map((c: CallRow) => c.call_analyses).filter(Boolean)
    const avgQ = sdrAnalyses.length > 0
      ? Math.round(sdrAnalyses.reduce((s: number, a: CallAnalysis) => s + (a?.sdr_quality_score || 0), 0) / sdrAnalyses.length)
      : 0
    const rdv = sdrAnalyses.filter((a: CallAnalysis) => a?.appointment_booked).length
    return { ...sdr, totalCalls: sdrCalls.length, avgQuality: avgQ, rdvBooked: rdv }
  }).sort((a: any, b: any) => b.avgQuality - a.avgQuality)

  // Coaching: SDRs needing attention
  const coachingNeeded = (sdrs || []).map((sdr: User) => {
    const sdrCalls = (allCalls || []).filter((c: CallRow) => c.sdr_id === sdr.id)
    return buildSDRProfile(sdr, sdrCalls as any)
  }).filter((p: any) => p.category === 'needs_coaching')

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Supervision</h1>
        <p className="text-gray-500 text-sm mt-1">Vue opérationnelle du jour</p>
      </div>

      {/* KPIs — appointment metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Appels aujourd'hui" value={todayCalls.length} />
        <StatCard label="À réviser" value={callsWithFlags.length} sub="flags détectés" />
        <StatCard label="RDV posés" value={appointmentsBooked} />
        <StatCard label="RDV qualifiés" value={qualifiedAppointments} sub="décideur + besoin + date + score ≥60" />
        <StatCard label="Taux qualification" value={`${qualificationRate}%`} sub="RDV qualifiés / RDV posés" />
      </div>
      {/* Part 5 — AI trust score KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels révisés" value={callsReviewed} sub="human_validated = true" />
        <StatCard label="En attente révision" value={callsPending} sub="analyses non approuvées" />
        <StatCard label="Champs corrigés" value={totalCorrections} sub="corrections enregistrées" />
        <StatCard
          label="Fiabilité IA"
          value={trust.score !== null ? `${trust.score}%` : '—'}
          sub={trust.label}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Part 4 — Review queue */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Appels nécessitant une révision</h2>
                <span className="text-xs text-gray-400">{callsWithFlags.length} appel(s)</span>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {callsWithFlags.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">Aucun appel en attente de révision ✓</div>
              )}
              {callsWithFlags.slice(0, 10).map((call: CallRow) => {
                const { flags } = computeReviewFlags(call.call_analyses)
                return (
                  <Link key={call.id} href={`/calls/${call.id}`}>
                    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {call.call_analyses?.prospect_company || 'Prospect inconnu'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {call.users?.name} · {call.campaigns?.campaign_name} · {formatDateShort(call.call_datetime)}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {flags.map((flag, i) => (
                              <Badge key={i} className="bg-red-50 text-red-600 border-red-200 text-xs">{flag}</Badge>
                            ))}
                          </div>
                        </div>
                        <ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} />
                      </div>
                    </div>
                  </Link>
                )
              })}
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
                  {(allCalls || []).slice(0, 10).map((call: CallRow) => (
                    <tr key={call.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-800">{call.users?.name || '—'}</td>
                      <td className="px-6 py-3 text-gray-600">{call.call_analyses?.prospect_company || '—'}</td>
                      <td className="px-6 py-3">
                        <Badge className={getInterestBg(call.call_analyses?.interest_level ?? null)}>
                          {getInterestLabel(call.call_analyses?.interest_level ?? null)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        {call.call_analyses?.appointment_booked ? (
                          isQualifiedAppointment(call.call_analyses)
                            ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Qualifié</Badge>
                            : <Badge className="bg-amber-50 text-amber-700 border-amber-200">~ Posé</Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
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
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.map((sdr: any, i: number) => (
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

          {/* Coaching needs widget */}
          {coachingNeeded.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Coaching requis</h2>
                  <Link href="/coaching" className="text-xs text-slate-600 hover:underline">Voir tout →</Link>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {coachingNeeded.map((p: any) => (
                  <div key={p.sdrId} className="px-6 py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">{p.sdrName}</p>
                      <ScoreBadge score={p.avgSdrQuality} />
                    </div>
                    {p.priorities[0] && (
                      <p className="text-xs text-red-500 mt-0.5">● {p.priorities[0].label}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

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
