import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import { computeReviewFlags, isQualifiedAppointment, reviewCriticalityRank } from '@/lib/review-flags'
import { ReviewQueueControls } from '@/components/manager/ReviewQueueControls'
import Link from 'next/link'
import type { CallAnalysis, ManagerKPIs, ReviewStatus, SDRLeaderboardRow } from '@/types'

type ManagerUser = { id: string; name: string }
type ManagerReviewCall = {
  id: string
  call_datetime: string
  review_status: ReviewStatus | null
  assigned_to: string | null
  call_analyses: CallAnalysis | CallAnalysis[] | null
  users: { name: string | null } | { name: string | null }[] | null
  campaigns: { campaign_name: string | null; client_name: string | null } | { campaign_name: string | null; client_name: string | null }[] | null
}
type ManagerRecentCall = {
  id: string
  call_datetime: string
  call_analyses: CallAnalysis | CallAnalysis[] | null
  users: { name: string | null } | { name: string | null }[] | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function ManagerPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'manager') redirect('/login')

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
      .select('id, call_datetime, review_status, assigned_to, call_analyses(id, appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, prospect_company, decision_maker_detected, pain_point_detected, ai_confidence, hallucination_risk, qualification_completeness_score, objection_detected, objection_details, next_step), users!calls_sdr_id_fkey(name), campaigns(campaign_name, client_name)')
      .eq('organization_id', profile.organization_id)
      .neq('review_status', 'resolved')
      .order('call_datetime', { ascending: false })
      .limit(30),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses(appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, sdr_quality_score, prospect_company, interest_level, decision_maker_detected, pain_point_detected), users!calls_sdr_id_fkey(name)')
      .eq('organization_id', profile.organization_id)
      .order('call_datetime', { ascending: false })
      .limit(10),
    supabase.from('users').select('id, name').eq('organization_id', profile.organization_id).in('role', ['owner', 'manager']),
  ])

  const kpis: ManagerKPIs = kpisData?.[0] ?? {
    today_calls: 0, calls_requiring_review: 0, appointments_booked: 0,
    qualified_appointments: 0, qualification_rate: 0,
    calls_reviewed: 0, calls_pending: 0, ai_trust_validated: 0, ai_trust_corrected: 0,
  }

  const sdrStats = (leaderboardData || []) as SDRLeaderboardRow[]
  const managerMap: Record<string, string> = Object.fromEntries(
    ((orgManagers || []) as ManagerUser[]).map((u) => [u.id, u.name])
  )

  const trustTotal = kpis.ai_trust_validated + kpis.ai_trust_corrected
  const trustScore = trustTotal > 0 ? Math.round((kpis.ai_trust_validated / trustTotal) * 100) : null
  const trustLabel = trustScore === null ? 'Pas de données' : trustScore >= 80 ? 'Excellent' : trustScore >= 60 ? 'Bon' : 'À améliorer'
  const trustBg    = trustScore === null ? 'bg-slate-800 text-slate-400 border-slate-600'
    : trustScore >= 80 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : trustScore >= 60 ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'

  const callsWithFlags = ((reviewQueue || []) as ManagerReviewCall[])
    .filter((c) => {
      const analysis = one(c.call_analyses)
      if (!analysis) return false
      return computeReviewFlags(analysis).review_required
    })
    .sort((a, b) =>
      reviewCriticalityRank(one(a.call_analyses) as CallAnalysis) -
      reviewCriticalityRank(one(b.call_analyses) as CallAnalysis)
    )

  const coachingNeeded = sdrStats.filter(s => s.avg_sdr_quality === null || s.avg_sdr_quality < 55)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Supervision</h1>
        <p className="text-slate-400 text-sm mt-1">Vue opérationnelle du jour</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Appels aujourd'hui" value={kpis.today_calls} />
        <StatCard label="À réviser"           value={kpis.calls_requiring_review} sub="flags détectés" />
        <StatCard label="RDV posés"           value={kpis.appointments_booked} />
        <StatCard label="RDV qualifiés"       value={kpis.qualified_appointments} sub="décideur + besoin + date + score ≥60" />
        <StatCard label="Taux qualification"  value={`${kpis.qualification_rate}%`} sub="RDV qualifiés / RDV posés" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels révisés"      value={kpis.calls_reviewed}     sub="human_validated = true" />
        <StatCard label="En attente révision" value={kpis.calls_pending}      sub="analyses non approuvées" />
        <StatCard label="Champs corrigés"     value={kpis.ai_trust_corrected} sub="corrections enregistrées" />
        <StatCard label="Fiabilité IA"        value={trustScore !== null ? `${trustScore}%` : '—'} sub={trustLabel} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Appels nécessitant une révision</h2>
                <span className="text-xs text-slate-500">{kpis.calls_requiring_review} appel(s)</span>
              </div>
            </CardHeader>
            <div className="divide-y divide-white/10">
              {callsWithFlags.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-slate-500">Aucun appel en attente de révision ✓</div>
              )}
              {callsWithFlags.slice(0, 10).map((call) => {
                const analysis = one(call.call_analyses) as CallAnalysis
                const sdr = one(call.users)
                const campaign = one(call.campaigns)
                const { flags } = computeReviewFlags(analysis)
                return (
                  <div key={call.id} className="px-6 py-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <Link href={`/calls/${call.id}`} className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200">
                          {analysis.prospect_company || 'Prospect inconnu'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {sdr?.name} · {campaign?.campaign_name} · {formatDateShort(call.call_datetime)}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {flags.map((flag: string, i: number) => (
                            <Badge key={i} className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">{flag}</Badge>
                          ))}
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBadge score={analysis.appointment_quality_score ?? null} />
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
            <CardHeader><h2 className="text-sm font-semibold">Appels récents</h2></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">SDR</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Prospect</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Intérêt</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">RDV</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {((recentCalls || []) as ManagerRecentCall[]).map((call) => {
                    const analysis = one(call.call_analyses)
                    const sdr = one(call.users)
                    return (
                    <tr key={call.id} className="hover:bg-white/5">
                      <td className="px-6 py-3 font-medium text-slate-200">{sdr?.name || '—'}</td>
                      <td className="px-6 py-3 text-slate-400">{analysis?.prospect_company || '—'}</td>
                      <td className="px-6 py-3">
                        <Badge className={getInterestBg(analysis?.interest_level ?? null)}>
                          {getInterestLabel(analysis?.interest_level ?? null)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        {analysis?.appointment_booked ? (
                          isQualifiedAppointment(analysis)
                            ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">✓ Qualifié</Badge>
                            : <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">~ Posé</Badge>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        <Link href={`/calls/${call.id}`}>
                          <ScoreBadge score={analysis?.sdr_quality_score ?? null} />
                        </Link>
                      </td>
                    </tr>
                    )
                  })}
                  {!recentCalls?.length && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">Aucun appel</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.map((sdr, i) => (
                <div key={sdr.sdr_id} className="flex items-center gap-3 px-6 py-3 border-b border-white/10 last:border-0">
                  <span className={`font-bold text-sm w-4 ${i === 0 ? 'text-amber-500' : 'text-slate-500'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{sdr.sdr_name}</p>
                    <p className="text-xs text-slate-500">{sdr.total_calls} appels · {sdr.rdv_booked} RDV</p>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(sdr.avg_sdr_quality)}`}>{sdr.avg_sdr_quality ?? '—'}</span>
                </div>
              ))}
              {sdrStats.length === 0 && <div className="px-6 py-6 text-center text-sm text-slate-500">Aucun SDR</div>}
            </CardContent>
          </Card>

          {coachingNeeded.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Coaching requis</h2>
                  <Link href="/coaching" className="text-xs text-slate-400 hover:underline">Voir tout →</Link>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {coachingNeeded.map(s => (
                  <div key={s.sdr_id} className="px-6 py-3 border-b border-white/10 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-200">{s.sdr_name}</p>
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
                <h2 className="text-sm font-semibold">Fiabilité IA</h2>
                <Badge className={trustBg}>{trustScore !== null ? `${trustScore}%` : '—'} · {trustLabel}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Champs validés</span>
                  <span className="font-medium text-emerald-400">{kpis.ai_trust_validated}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Champs corrigés</span>
                  <span className="font-medium text-blue-400">{kpis.ai_trust_corrected}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
