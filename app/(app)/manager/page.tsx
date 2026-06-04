import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import { computeReviewFlags, isQualifiedAppointment, reviewCriticalityRank } from '@/lib/review-flags'
import { ReviewQueueControls } from '@/components/manager/ReviewQueueControls'
import { formatProspectDisplay } from '@/lib/dashboard-visibility'
import Link from 'next/link'
import type { CallAnalysis, ManagerKPIs, ReviewStatus, SDRLeaderboardRow } from '@/types'

type ManagerUser = { id: string; name: string }
type ManagerRecentAnalysis = Pick<CallAnalysis, 'appointment_booked' | 'appointment_date_text' | 'appointment_datetime' | 'appointment_date_confidence' | 'appointment_quality_score' | 'sdr_quality_score' | 'prospect_company' | 'contact_name' | 'interest_level' | 'decision_maker_detected' | 'pain_point_detected'>
type ManagerTeamAnalysis = ManagerRecentAnalysis & Pick<CallAnalysis, 'human_validated' | 'field_validations'>
type ManagerTeamCall = {
  id: string
  sdr_id: string
  call_datetime: string
  review_status: ReviewStatus | null
  assigned_to: string | null
  call_analyses: ManagerTeamAnalysis | ManagerTeamAnalysis[] | null
}
type ManagerReviewCall = {
  id: string
  call_datetime: string
  review_status: ReviewStatus | null
  assigned_to: string | null
  call_analyses: CallAnalysis | CallAnalysis[] | null
  users: { name: string | null; manager_id?: string | null } | { name: string | null; manager_id?: string | null }[] | null
  campaigns: { campaign_name: string | null; client_name: string | null } | { campaign_name: string | null; client_name: string | null }[] | null
}
type ManagerRecentCall = {
  id: string
  call_datetime: string
  call_analyses: ManagerRecentAnalysis | ManagerRecentAnalysis[] | null
  users: { name: string | null; manager_id?: string | null } | { name: string | null; manager_id?: string | null }[] | null
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

  const { data: teamSdrsData } = await supabase
    .from('users')
    .select('id, name')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'sdr')
    .eq('manager_id', user.id)

  const teamSdrs = (teamSdrsData || []) as ManagerUser[]
  const teamSdrIds = teamSdrs.map((sdr) => sdr.id)
  const [
    { data: teamCallsData },
    { data: reviewQueue },
    { data: recentCalls },
    { data: orgManagers },
  ] = await Promise.all([
    teamSdrIds.length
      ? supabase
          .from('calls')
          .select('id, sdr_id, call_datetime, review_status, assigned_to, call_analyses(appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, sdr_quality_score, prospect_company, contact_name, interest_level, decision_maker_detected, pain_point_detected, human_validated, field_validations, ai_confidence, hallucination_risk, qualification_completeness_score, objection_detected, objection_details, next_step)')
          .in('sdr_id', teamSdrIds)
          .order('call_datetime', { ascending: false })
      : Promise.resolve({ data: [] as ManagerTeamCall[] }),
    supabase
      .from('calls')
      .select('id, call_datetime, review_status, assigned_to, call_analyses(id, appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, prospect_company, contact_name, decision_maker_detected, pain_point_detected, ai_confidence, hallucination_risk, qualification_completeness_score, objection_detected, objection_details, next_step), users!calls_sdr_id_fkey!inner(name, manager_id), campaigns(campaign_name, client_name)')
      .eq('organization_id', profile.organization_id)
      .eq('users.manager_id', user.id)
      .neq('review_status', 'resolved')
      .order('call_datetime', { ascending: false })
      .limit(30),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses!inner(appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, sdr_quality_score, prospect_company, contact_name, interest_level, decision_maker_detected, pain_point_detected), analysis_jobs!inner(status), users!calls_sdr_id_fkey!inner(name, manager_id)')
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
      .eq('users.manager_id', user.id)
      .order('call_datetime', { ascending: false })
      .limit(10),
    supabase.from('users').select('id, name').eq('id', user.id),
  ])

  const teamCalls = (teamCallsData || []) as ManagerTeamCall[]
  const teamAnalyses = teamCalls.map((call) => one(call.call_analyses)).filter((a): a is ManagerTeamAnalysis => Boolean(a))
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const kpis: ManagerKPIs = {
    team_sdr_count: teamSdrs.length,
    today_calls: teamCalls.filter((call) => new Date(call.call_datetime) >= todayStart).length,
    calls_requiring_review: teamCalls.filter((call) => {
      const analysis = one(call.call_analyses)
      if (!analysis) return false
      return call.review_status !== 'resolved' && computeReviewFlags(analysis as CallAnalysis).review_required
    }).length,
    appointments_booked: teamAnalyses.filter((analysis) => analysis.appointment_booked).length,
    qualified_appointments: teamAnalyses.filter((analysis) => isQualifiedAppointment(analysis as CallAnalysis)).length,
    qualification_rate: 0,
    weak_appointments: teamAnalyses.filter((analysis) => analysis.appointment_booked && (analysis.appointment_quality_score ?? 0) < 60).length,
    calls_reviewed: teamAnalyses.filter((analysis) => analysis.human_validated).length,
    calls_pending: teamAnalyses.filter((analysis) => !analysis.human_validated).length,
    coaching_opportunities: 0,
    ai_trust_validated: teamAnalyses.reduce((count, analysis) => count + Object.values(analysis.field_validations || {}).filter((value) => value === 'validated').length, 0),
    ai_trust_corrected: teamAnalyses.reduce((count, analysis) => count + Object.values(analysis.field_validations || {}).filter((value) => value === 'corrected').length, 0),
  }
  kpis.qualification_rate = kpis.appointments_booked > 0
    ? Math.round((kpis.qualified_appointments / kpis.appointments_booked) * 100)
    : 0

  const sdrStats: SDRLeaderboardRow[] = teamSdrs.map((sdr) => {
    const calls = teamCalls.filter((call) => call.sdr_id === sdr.id)
    const analyses = calls.map((call) => one(call.call_analyses)).filter((analysis): analysis is ManagerTeamAnalysis => analysis !== null)
    const avgSdrQuality = analyses.length
      ? Math.round(analyses.reduce((sum, analysis) => sum + (analysis.sdr_quality_score ?? 0), 0) / analyses.length)
      : null
    return {
      sdr_id: sdr.id,
      sdr_name: sdr.name,
      total_calls: calls.length,
      rdv_booked: analyses.filter((analysis) => analysis.appointment_booked).length,
      avg_sdr_quality: avgSdrQuality,
    }
  }).sort((a, b) => (b.avg_sdr_quality ?? -1) - (a.avg_sdr_quality ?? -1))

  kpis.coaching_opportunities = sdrStats.filter((sdr) => sdr.avg_sdr_quality === null || sdr.avg_sdr_quality < 55).length

  if (process.env.NODE_ENV !== 'production') {
    console.log('[manager-dashboard]', {
      user_id: user.id,
      role: profile.role,
      team_sdr_ids: teamSdrIds,
      team_calls_count: teamCalls.length,
      review_queue_count: reviewQueue?.length ?? 0,
      recent_calls_count: recentCalls?.length ?? 0,
      kpis,
    })
  }

  const managerMap: Record<string, string> = Object.fromEntries(
    ((orgManagers || []) as ManagerUser[]).map((u) => [u.id, u.name])
  )

  const trustTotal = kpis.ai_trust_validated + kpis.ai_trust_corrected
  const trustScore = trustTotal > 0 ? Math.round((kpis.ai_trust_validated / trustTotal) * 100) : null
  const trustLabel = trustScore === null ? 'Pas de données' : trustScore >= 80 ? 'Excellent' : trustScore >= 60 ? 'Bon' : 'À améliorer'

  // Inline style objects for trust badge (safe — no dynamic Tailwind class generation)
  const trustStyle: React.CSSProperties = trustScore === null
    ? { background: 'rgba(2,6,23,.28)', color: 'var(--muted)', border: '1px solid var(--border)' }
    : trustScore >= 80
    ? { background: 'rgba(34,197,94,.10)', color: '#86efac', border: '1px solid rgba(34,197,94,.35)' }
    : trustScore >= 60
    ? { background: 'var(--cyan-soft)', color: 'var(--cyan)', border: '1px solid rgba(125,211,252,.28)' }
    : { background: 'rgba(245,158,11,.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,.32)' }

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
    <div className="app-scroll">
      <style>{`.mgr-row:hover { background: var(--row-h); }`}</style>
      <div className="app-content" style={{ gap: 20 }}>

        {/* ── Page header — plain, no card border ── */}
        <div style={{ paddingBottom: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>Supervision</h1>
          <p style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>Vue opérationnelle du jour</p>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(125,211,252,.2), transparent)', marginBottom: -4 }} />

        {/* ── Onboarding checklist ── */}
        <OnboardingChecklist role="manager" />

        {/* ── KPI block — two rows, unified visual group ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Row 1 — operational */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, minWidth: 0 }}>
            <StatCard label="SDR équipe"           value={kpis.team_sdr_count} />
            <StatCard label="Appels aujourd'hui"  value={kpis.today_calls} />
            <StatCard label="À réviser"            value={kpis.calls_requiring_review} sub="flags détectés" />
            <StatCard label="RDV qualifiés"        value={kpis.qualified_appointments} sub="décideur + besoin + date + score ≥60" />
            <StatCard label="Taux qualification"   value={`${kpis.qualification_rate}%`} sub="RDV qualifiés / RDV posés" />
          </div>
          {/* Row 2 — quality */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, minWidth: 0 }}>
            <StatCard label="Appels révisés"       value={kpis.calls_reviewed}      sub="human_validated = true" />
            <StatCard label="En attente révision"  value={kpis.calls_pending}       sub="analyses non approuvées" />
            <StatCard label="RDV faibles"          value={kpis.weak_appointments}   sub="score RDV < 60" />
            <StatCard label="Coaching"             value={kpis.coaching_opportunities} sub="SDR sous 55" />
            <StatCard label="Champs corrigés"      value={kpis.ai_trust_corrected}  sub="corrections enregistrées" />
            <StatCard label="Fiabilité IA"         value={trustScore !== null ? `${trustScore}%` : '—'} sub={trustLabel} />
          </div>
        </div>

        {/* ── Main 2-col layout ── */}
        <div className="manager-main-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.9fr) minmax(280px, 0.8fr)',
          gap: 16,
          alignItems: 'start',
          minWidth: 0,
        }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* Review queue */}
            <Card style={{ overflow: 'hidden' }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Appels nécessitant une révision</h2>
                  <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{kpis.calls_requiring_review} appel(s)</span>
                </div>
              </CardHeader>
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {callsWithFlags.length === 0 && (
                  <div style={{ margin: 16, padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)', background: 'rgba(125,211,252,.03)', border: '1px dashed rgba(125,211,252,.15)', borderRadius: 10 }}>
                    Aucun appel en attente de révision ✓
                  </div>
                )}
                {callsWithFlags.slice(0, 10).map((call) => {
                  const analysis = one(call.call_analyses) as CallAnalysis
                  const sdr = one(call.users)
                  const campaign = one(call.campaigns)
                  const { flags } = computeReviewFlags(analysis)
                  return (
                    <div key={call.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', borderLeft: '2px solid rgba(239,68,68,.5)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <Link href={`/calls/${call.id}`} style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatProspectDisplay(analysis)}
                          </p>
                          <p style={{ marginTop: 3, fontSize: 11, color: 'var(--muted-2)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span>{sdr?.name || '—'}</span>
                            <span>·</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                              {campaign?.campaign_name || campaign?.client_name || 'Campagne non renseignée'}
                            </span>
                            <span>·</span>
                            <span>{formatDateShort(call.call_datetime)}</span>
                          </p>
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {flags.map((flag: string, i: number) => (
                              <span key={i} style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                                background: 'rgba(239,68,68,.10)', color: '#fca5a5',
                                border: '1px solid rgba(239,68,68,.28)',
                              }}>{flag}</span>
                            ))}
                          </div>
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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

            {/* Recent calls table */}
            <Card style={{ overflow: 'hidden' }}>
              <CardHeader>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Appels récents</h2>
              </CardHeader>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 640, fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--thead)', borderBottom: '1px solid var(--border)' }}>
                      {['SDR', 'PROSPECT', 'INTÉRÊT', 'RDV', 'SCORE'].map(h => (
                        <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--muted-2)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {((recentCalls || []) as ManagerRecentCall[]).map((call) => {
                      const analysis = one(call.call_analyses)
                      const sdr = one(call.users)
                      const sc = analysis?.sdr_quality_score ?? null
                      const isQual = analysis?.appointment_booked && isQualifiedAppointment(analysis as Parameters<typeof isQualifiedAppointment>[0])
                      const rBorder = sc !== null && sc < 50 ? '2px solid rgba(239,68,68,.5)' : ((sc !== null && sc >= 75) || isQual) ? '2px solid rgba(34,197,94,.35)' : '2px solid transparent'
                      return (
                        <tr key={call.id} className="mgr-row" style={{ borderBottom: '1px solid var(--border)', borderLeft: rBorder }}>
                          <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text)' }}>{sdr?.name || '—'}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatProspectDisplay(analysis)}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <Badge className={getInterestBg(analysis?.interest_level ?? null)}>
                              {getInterestLabel(analysis?.interest_level ?? null)}
                            </Badge>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            {analysis?.appointment_booked ? (
                              isQualifiedAppointment(analysis as Parameters<typeof isQualifiedAppointment>[0])
                                ? <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,.10)', color: '#86efac', border: '1px solid rgba(34,197,94,.30)' }}>✓ Qualifié</span>
                                : <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,.30)' }}>~ Posé</span>
                            ) : <span style={{ color: 'var(--muted-2)' }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <Link href={`/calls/${call.id}`}>
                              <ScoreBadge score={analysis?.sdr_quality_score ?? null} />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                    {!recentCalls?.length && (
                      <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>Aucun appel</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* SDR leaderboard */}
            <Card style={{ overflow: 'hidden' }}>
              <CardHeader>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Classement SDR</h2>
              </CardHeader>
              <div>
                {sdrStats.map((sdr, i) => (
                  <div key={sdr.sdr_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ width: 18, flexShrink: 0, fontSize: 13, fontWeight: 700, color: i === 0 ? '#f59e0b' : 'var(--muted-2)' }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sdr.sdr_name}</p>
                      <p style={{ marginTop: 2, fontSize: 11, color: 'var(--muted-2)' }}>{sdr.total_calls} appels · {sdr.rdv_booked} RDV</p>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: getScoreColor(sdr.avg_sdr_quality) }}>{sdr.avg_sdr_quality ?? '—'}</span>
                  </div>
                ))}
                {sdrStats.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>Aucun SDR</div>
                )}
              </div>
            </Card>

            {/* Coaching required */}
            {coachingNeeded.length > 0 && (
              <Card style={{ overflow: 'hidden' }}>
                <CardHeader>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Coaching requis</h2>
                    <Link href="/coaching" style={{ fontSize: 11, color: 'var(--muted-2)' }}>Voir tout →</Link>
                  </div>
                </CardHeader>
                <div>
                  {coachingNeeded.map(s => (
                    <div key={s.sdr_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sdr_name}</p>
                      <ScoreBadge score={s.avg_sdr_quality} />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* AI reliability */}
            <Card style={{ overflow: 'hidden' }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Fiabilité IA</h2>
                  <span style={{ ...trustStyle, display: 'inline-flex', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                    {trustScore !== null ? `${trustScore}%` : '—'} · {trustLabel}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>Champs validés</span>
                    <span style={{ fontWeight: 600, color: '#86efac' }}>{kpis.ai_trust_validated}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>Champs corrigés</span>
                    <span style={{ fontWeight: 600, color: 'var(--cyan)' }}>{kpis.ai_trust_corrected}</span>
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
