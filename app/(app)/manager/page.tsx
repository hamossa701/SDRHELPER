import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import { computeReviewFlags, isQualifiedAppointment, reviewCriticalityRank } from '@/lib/review-flags'
import { ReviewQueueControls } from '@/components/manager/ReviewQueueControls'
import { formatProspectDisplay } from '@/lib/dashboard-visibility'
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
type ManagerRecentAnalysis = Pick<CallAnalysis, 'appointment_booked' | 'appointment_date_text' | 'appointment_datetime' | 'appointment_date_confidence' | 'appointment_quality_score' | 'sdr_quality_score' | 'prospect_company' | 'contact_name' | 'interest_level' | 'decision_maker_detected' | 'pain_point_detected'>
type ManagerRecentCall = {
  id: string
  call_datetime: string
  call_analyses: ManagerRecentAnalysis | ManagerRecentAnalysis[] | null
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
      .select('id, call_datetime, review_status, assigned_to, call_analyses(id, appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, prospect_company, contact_name, decision_maker_detected, pain_point_detected, ai_confidence, hallucination_risk, qualification_completeness_score, objection_detected, objection_details, next_step), users!calls_sdr_id_fkey(name), campaigns(campaign_name, client_name)')
      .eq('organization_id', profile.organization_id)
      .neq('review_status', 'resolved')
      .order('call_datetime', { ascending: false })
      .limit(30),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses!inner(appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, sdr_quality_score, prospect_company, contact_name, interest_level, decision_maker_detected, pain_point_detected), analysis_jobs!inner(status), users!calls_sdr_id_fkey(name)')
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
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
    <div className="w-full" style={{ padding: '32px clamp(24px, 4vw, 56px) 48px' }}>
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-7">
        <div className="rounded-xl border border-cyan-300/20 bg-slate-950/45 px-6 py-5 shadow-[0_20px_54px_rgba(0,0,0,.28)] backdrop-blur">
          <h1 className="text-[26px] font-bold text-slate-50">Supervision</h1>
          <p className="mt-1 text-sm text-slate-400">Vue opérationnelle du jour</p>
        </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Appels aujourd'hui" value={kpis.today_calls} />
        <StatCard label="À réviser"           value={kpis.calls_requiring_review} sub="flags détectés" />
        <StatCard label="RDV posés"           value={kpis.appointments_booked} />
        <StatCard label="RDV qualifiés"       value={kpis.qualified_appointments} sub="décideur + besoin + date + score ≥60" />
        <StatCard label="Taux qualification"  value={`${kpis.qualification_rate}%`} sub="RDV qualifiés / RDV posés" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Appels révisés"      value={kpis.calls_reviewed}     sub="human_validated = true" />
        <StatCard label="En attente révision" value={kpis.calls_pending}      sub="analyses non approuvées" />
        <StatCard label="Champs corrigés"     value={kpis.ai_trust_corrected} sub="corrections enregistrées" />
        <StatCard label="Fiabilité IA"        value={trustScore !== null ? `${trustScore}%` : '—'} sub={trustLabel} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.85fr)_minmax(340px,0.85fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Appels nécessitant une révision</h2>
                <span className="text-xs font-medium text-slate-500">{kpis.calls_requiring_review} appel(s)</span>
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
                  <div key={call.id} className="px-5 py-5 transition-colors hover:bg-white/5 sm:px-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <Link href={`/calls/${call.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {formatProspectDisplay(analysis)}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span>{sdr?.name || '—'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="max-w-full truncate">{campaign?.campaign_name || campaign?.client_name || 'Campagne non renseignée'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDateShort(call.call_datetime)}</span>
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {flags.map((flag: string, i: number) => (
                            <Badge key={i} className="max-w-full bg-red-500/10 text-xs text-red-400 border-red-500/30">{flag}</Badge>
                          ))}
                        </div>
                      </Link>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
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

          <Card className="overflow-hidden">
            <CardHeader><h2 className="text-sm font-semibold text-slate-100">Appels récents</h2></CardHeader>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-500">SDR</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-500">Prospect</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-500">Intérêt</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-500">RDV</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-500">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {((recentCalls || []) as ManagerRecentCall[]).map((call) => {
                    const analysis = one(call.call_analyses)
                    const sdr = one(call.users)
                    return (
                    <tr key={call.id} className="h-16 hover:bg-white/5">
                      <td className="px-6 py-4 font-medium text-slate-200">{sdr?.name || '—'}</td>
                      <td className="max-w-[280px] px-6 py-4 text-slate-400"><span className="block truncate">{formatProspectDisplay(analysis)}</span></td>
                      <td className="px-6 py-4">
                        <Badge className={getInterestBg(analysis?.interest_level ?? null)}>
                          {getInterestLabel(analysis?.interest_level ?? null)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {analysis?.appointment_booked ? (
                          isQualifiedAppointment(analysis as Parameters<typeof isQualifiedAppointment>[0])
                            ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">✓ Qualifié</Badge>
                            : <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">~ Posé</Badge>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-6 py-4">
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

        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader><h2 className="text-sm font-semibold text-slate-100">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.map((sdr, i) => (
                <div key={sdr.sdr_id} className="flex min-h-16 items-center gap-3 border-b border-white/10 px-5 py-4 last:border-0 sm:px-6">
                  <span className={`w-5 shrink-0 text-sm font-bold ${i === 0 ? 'text-amber-500' : 'text-slate-500'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{sdr.sdr_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{sdr.total_calls} appels · {sdr.rdv_booked} RDV</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${getScoreColor(sdr.avg_sdr_quality)}`}>{sdr.avg_sdr_quality ?? '—'}</span>
                </div>
              ))}
              {sdrStats.length === 0 && <div className="px-6 py-6 text-center text-sm text-slate-500">Aucun SDR</div>}
            </CardContent>
          </Card>

          {coachingNeeded.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-100">Coaching requis</h2>
                  <Link href="/coaching" className="shrink-0 text-xs text-slate-400 hover:underline">Voir tout →</Link>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {coachingNeeded.map(s => (
                  <div key={s.sdr_id} className="border-b border-white/10 px-5 py-4 last:border-0 sm:px-6">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-slate-200">{s.sdr_name}</p>
                      <ScoreBadge score={s.avg_sdr_quality} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Fiabilité IA</h2>
                <Badge className={`${trustBg} w-fit max-w-full`}>{trustScore !== null ? `${trustScore}%` : '—'} · {trustLabel}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Champs validés</span>
                  <span className="shrink-0 font-medium text-emerald-400">{kpis.ai_trust_validated}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Champs corrigés</span>
                  <span className="shrink-0 font-medium text-blue-400">{kpis.ai_trust_corrected}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </div>
  )
}
