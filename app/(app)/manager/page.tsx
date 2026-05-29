import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import { computeReviewFlags, isQualifiedAppointment, reviewCriticalityRank } from '@/lib/review-flags'
import { ReviewQueueControls } from '@/components/manager/ReviewQueueControls'
import Link from 'next/link'
import type { CallAnalysis, ManagerKPIs, SDRLeaderboardRow } from '@/types'

export default async function ManagerPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'manager') redirect('/login')

  // All KPIs are SQL aggregations — correct at any call volume.
  // Review queue and recent calls are display-only, explicitly limited.
  const [
    { data: kpisData },
    { data: leaderboardData },
    { data: reviewQueue },
    { data: recentCalls },
    { data: orgManagers },
  ] = await Promise.all([
    supabase.rpc('get_manager_kpis', { p_org_id: profile.organization_id }),
    supabase.rpc('get_sdr_leaderboard', { p_org_id: profile.organization_id }),
    supabase
      .from('calls')
      .select('id, call_datetime, review_status, assigned_to, call_analyses(id, appointment_booked, appointment_quality_score, prospect_company, decision_maker_detected, pain_point_detected, appointment_datetime, ai_confidence, hallucination_risk, qualification_completeness_score, objection_detected, objection_details, next_step), users!calls_sdr_id_fkey(name), campaigns(campaign_name, client_name)')
      .eq('organization_id', profile.organization_id)
      .neq('review_status', 'resolved')
      .order('call_datetime', { ascending: false })
      .limit(30),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses(appointment_booked, sdr_quality_score, prospect_company, interest_level, decision_maker_detected, pain_point_detected, appointment_datetime), users!calls_sdr_id_fkey(name)')
      .eq('organization_id', profile.organization_id)
      .order('call_datetime', { ascending: false })
      .limit(10),
    supabase
      .from('users').select('id, name')
      .eq('organization_id', profile.organization_id)
      .in('role', ['owner', 'manager']),
  ])

  const kpis: ManagerKPIs = kpisData?.[0] ?? {
    today_calls: 0, calls_requiring_review: 0, appointments_booked: 0,
    qualified_appointments: 0, qualification_rate: 0,
    calls_reviewed: 0, calls_pending: 0, ai_trust_validated: 0, ai_trust_corrected: 0,
  }

  const sdrStats = (leaderboardData || []) as SDRLeaderboardRow[]
  const managerMap: Record<string, string> = Object.fromEntries(
    (orgManagers || []).map((u: any) => [u.id, u.name])
  )

  // Trust score from RPC counts — no row scan needed
  const trustTotal  = kpis.ai_trust_validated + kpis.ai_trust_corrected
  const trustScore  = trustTotal > 0 ? Math.round((kpis.ai_trust_validated / trustTotal) * 100) : null
  const trustLabel  = trustScore === null ? 'Pas de données' : trustScore >= 80 ? 'Excellent' : trustScore >= 60 ? 'Bon' : 'À améliorer'
  const trustBg     = trustScore === null ? 'bg-gray-100 text-gray-500 border-gray-200'
    : trustScore >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : trustScore >= 60 ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'

  // JS flag filter applies to the 30 display rows; KPI count comes from the RPC
  const callsWithFlags = (reviewQueue || [])
    .filter((c: any) => {
      if (!c.call_analyses) return false
      return computeReviewFlags(c.call_analyses as CallAnalysis).review_required
    })
    .sort((a: any, b: any) =>
      reviewCriticalityRank(a.call_analyses as CallAnalysis) -
      reviewCriticalityRank(b.call_analyses as CallAnalysis)
    )

  const coachingNeeded = sdrStats.filter(s => s.avg_sdr_quality === null || s.avg_sdr_quality < 55)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Supervision</h1>
        <p className="text-gray-500 text-sm mt-1">Vue opérationnelle du jour</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Appels aujourd'hui" value={kpis.today_calls} />
        <StatCard label="À réviser"           value={kpis.calls_requiring_review} sub="flags détectés" />
        <StatCard label="RDV posés"           value={kpis.appointments_booked} />
        <StatCard label="RDV qualifiés"       value={kpis.qualified_appointments} sub="décideur + besoin + date + score ≥60" />
        <StatCard label="Taux qualification"  value={`${kpis.qualification_rate}%`} sub="RDV qualifiés / RDV posés" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels révisés"      value={kpis.calls_reviewed}    sub="human_validated = true" />
        <StatCard label="En attente révision" value={kpis.calls_pending}     sub="analyses non approuvées" />
        <StatCard label="Champs corrigés"     value={kpis.ai_trust_corrected} sub="corrections enregistrées" />
        <StatCard label="Fiabilité IA"        value={trustScore !== null ? `${trustScore}%` : '—'} sub={trustLabel} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Appels nécessitant une révision</h2>
                <span className="text-xs text-gray-400">{kpis.calls_requiring_review} appel(s)</span>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {callsWithFlags.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">Aucun appel en attente de révision ✓</div>
              )}
              {callsWithFlags.slice(0, 10).map((call: any) => {
                const { flags } = computeReviewFlags(call.call_analyses as CallAnalysis)
                return (
                  <div key={call.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <Link href={`/calls/${call.id}`} className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {call.call_analyses?.prospect_company || 'Prospect inconnu'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {call.users?.name} · {call.campaigns?.campaign_name} · {formatDateShort(call.call_datetime)}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {flags.map((flag: string, i: number) => (
                            <Badge key={i} className="bg-red-50 text-red-600 border-red-200 text-xs">{flag}</Badge>
                          ))}
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} />
                        <ReviewQueueControls
                          callId={call.id}
                          status={call.review_status || 'open'}
                          assignedToId={call.assigned_to}
                          assigneeName={call.assigned_to ? (managerMap[call.assigned_to] ?? null) : null}
                          currentUserId={user.id}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Appels récents</h2></CardHeader>
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
                  {(recentCalls || []).map((call: any) => (
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
                          isQualifiedAppointment(call.call_analyses as CallAnalysis)
                            ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Qualifié</Badge>
                            : <Badge className="bg-amber-50 text-amber-700 border-amber-200">~ Posé</Badge>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        <Link href={`/calls/${call.id}`}>
                          <ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!recentCalls?.length && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Aucun appel</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.map((sdr, i) => (
                <div key={sdr.sdr_id} className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 last:border-0">
                  <span className={`font-bold text-sm w-4 ${i === 0 ? 'text-amber-500' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sdr.sdr_name}</p>
                    <p className="text-xs text-gray-400">{sdr.total_calls} appels · {sdr.rdv_booked} RDV</p>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(sdr.avg_sdr_quality)}`}>{sdr.avg_sdr_quality ?? '—'}</span>
                </div>
              ))}
              {sdrStats.length === 0 && <div className="px-6 py-6 text-center text-sm text-gray-400">Aucun SDR</div>}
            </CardContent>
          </Card>

          {coachingNeeded.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Coaching requis</h2>
                  <Link href="/coaching" className="text-xs text-slate-600 hover:underline">Voir tout →</Link>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {coachingNeeded.map(s => (
                  <div key={s.sdr_id} className="px-6 py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">{s.sdr_name}</p>
                      <ScoreBadge score={s.avg_sdr_quality} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Fiabilité IA</h2>
                <Badge className={trustBg}>{trustScore !== null ? `${trustScore}%` : '—'} · {trustLabel}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Champs validés</span>
                  <span className="font-medium text-emerald-600">{kpis.ai_trust_validated}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Champs corrigés</span>
                  <span className="font-medium text-blue-600">{kpis.ai_trust_corrected}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
