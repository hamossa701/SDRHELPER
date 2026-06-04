import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScoreBadge, StatCard } from '@/components/ui'
import {
  buildCoachingSupervisionProfiles,
  type CoachingCallForSupervision,
  type CoachingPriorityRank,
  type CoachingSupervisionProfile,
  type CoachingTrendStatus,
  type ScopedCoachingSdr,
  type SkillKey,
  type SkillTrend,
} from '@/lib/coaching-supervision'

const SKILL_LABELS: Record<SkillKey, string> = {
  skill_opening: 'Accroche',
  skill_discovery: 'Découverte',
  skill_pain_point: 'Exploration besoin',
  skill_objection_handling: 'Gestion objections',
  skill_qualification: 'Qualification',
  skill_closing: 'Closing',
}

const SKILL_KEYS = Object.keys(SKILL_LABELS) as SkillKey[]

const RANK_STYLE: Record<CoachingPriorityRank, { color: string; bg: string; border: string }> = {
  Critique: { color: '#fca5a5', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.34)' },
  Important: { color: '#fcd34d', bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.32)' },
  Moyen: { color: 'var(--cyan)', bg: 'rgba(125,211,252,.10)', border: 'rgba(125,211,252,.28)' },
}

type CoachingUrgency = 'stable' | 'light' | 'critical'

function coachingUrgency(profile: CoachingSupervisionProfile): CoachingUrgency {
  const hasCriticalPriority = profile.priorities.some(priority => priority.rank === 'Critique')
  if (
    (profile.avg_sdr_quality !== null && profile.avg_sdr_quality < 50)
    || profile.skills.skill_qualification < 50
    || (profile.qualified_appointments === 0 && profile.current_analysis_count > 0)
    || hasCriticalPriority
  ) {
    return 'critical'
  }
  if (
    (profile.avg_sdr_quality !== null && profile.avg_sdr_quality < 70)
    || profile.priorities.some(priority => priority.rank === 'Important')
  ) {
    return 'light'
  }
  return 'stable'
}

function TrendText({ trend }: { trend: SkillTrend }) {
  if (trend.status === 'none') {
    return null
  }
  if (trend.status === 'stable') {
    return <span style={{ color: 'var(--cyan)' }}>stable</span>
  }
  const color = trend.status === 'up' ? '#86efac' : '#fca5a5'
  const prefix = trend.status === 'up' ? '+' : ''
  return <span style={{ color }}>{prefix}{trend.delta}</span>
}

function OverallTrend({ status }: { status: CoachingTrendStatus }) {
  if (status === 'up') return <span style={{ color: '#86efac' }}>Progression</span>
  if (status === 'down') return <span style={{ color: '#fca5a5' }}>Régression</span>
  if (status === 'stable') return <span style={{ color: 'var(--cyan)' }}>Stable</span>
  return <span style={{ color: 'var(--muted-2)' }}>Tendance indisponible</span>
}

function SkillBar({ label, score, trend }: { label: string; score: number; trend: SkillTrend }) {
  const barColor = score >= 70 ? '#86efac' : score >= 50 ? '#fcd34d' : '#fca5a5'
  return (
    <div className="coaching-skill-row" style={{ display: 'grid', gridTemplateColumns: '122px minmax(116px, 1fr) 148px', alignItems: 'center', gap: 12, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.25, minWidth: 0 }}>{label}</span>
      <div style={{ width: '100%', minWidth: 0, height: 6, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(148,163,184,.14)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${score}%` }} />
        </div>
        <div style={{ position: 'absolute', left: '70%', top: -8, width: 1, height: 22, background: 'rgba(255,255,255,.22)', pointerEvents: 'none' }} />
      </div>
      <span style={{ display: 'flex', justifyContent: 'flex-start', gap: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', minWidth: 0 }}>
        <span style={{ color: barColor }}>{score}</span>
        <TrendText trend={trend} />
      </span>
    </div>
  )
}

function CategoryBadge({ profile }: { profile: CoachingSupervisionProfile }) {
  const urgency = coachingUrgency(profile)
  const catBg = urgency === 'stable' ? 'rgba(34,197,94,.10)' : urgency === 'critical' ? 'rgba(239,68,68,.10)' : 'rgba(245,158,11,.12)'
  const catColor = urgency === 'stable' ? '#86efac' : urgency === 'critical' ? '#fca5a5' : '#fcd34d'
  const catBorder = urgency === 'stable' ? 'rgba(34,197,94,.35)' : urgency === 'critical' ? 'rgba(239,68,68,.35)' : 'rgba(245,158,11,.32)'
  const catLabel = urgency === 'stable' ? 'Stable' : urgency === 'critical' ? 'Coaching critique' : 'Coaching léger'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: catBg, color: catColor, border: `1px solid ${catBorder}` }}>
      {catLabel}
    </span>
  )
}

function TrendSummary({ profile }: { profile: CoachingSupervisionProfile }) {
  const unavailable = Object.values(profile.skill_trends).every(trend => trend.status === 'none')
  if (unavailable) {
    return (
      <span style={{ fontSize: 11, color: 'var(--muted-2)', fontWeight: 600 }}>
        Tendance indisponible — historique insuffisant
      </span>
    )
  }
  return <span style={{ fontSize: 12, fontWeight: 600 }}><OverallTrend status={profile.overall_trend} /></span>
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function CallExampleRow({
  call,
  label,
  color,
}: {
  call: NonNullable<CoachingSupervisionProfile['best_call']>
  label: string
  color: string
}) {
  return (
    <Link
      href={`/calls/${call.callId}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'center',
        minWidth: 0,
        padding: '5px 7px',
        borderRadius: 7,
        border: '1px solid rgba(148,163,184,.12)',
        background: 'rgba(2,6,23,.24)',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10, color, fontWeight: 800, lineHeight: 1.1 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--cyan)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>{call.prospect}</span>
        <span style={{ display: 'block', fontSize: 10, color: 'var(--muted-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{call.reason}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{call.score ?? '-'}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Ouvrir</span>
      </span>
    </Link>
  )
}

function EmptyPanel({ children, color = 'var(--muted-2)' }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)', padding: '42px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color }}>{children}</div>
    </div>
  )
}

export default async function CoachingPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c: { name: string; value: string; options: object }[]) {
          try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id, role, manager_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'manager'].includes(profile.role)) redirect('/login')

  const managerScopeId = profile.role === 'manager' ? user.id : null
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const sixtyDaysAgo = new Date(now - 60 * 86_400_000).toISOString()

  let sdrQuery = supabase
    .from('users')
    .select('id, name')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'sdr')

  if (managerScopeId) sdrQuery = sdrQuery.eq('manager_id', managerScopeId)

  const { data: scopedSdrs, error: sdrError } = await sdrQuery
  const sdrs = (scopedSdrs || []) as ScopedCoachingSdr[]

  let calls: CoachingCallForSupervision[] = []
  let dataError = sdrError

  if (sdrError) {
    console.error('[COACHING] scoped SDR query failed', {
      user_id: user.id,
      role: profile.role,
      organization_id: profile.organization_id,
      manager_id: profile.manager_id,
      error: sdrError,
    })
  } else if (sdrs.length > 0) {
    const { data: callsData, error: callsError } = await supabase
      .from('calls')
      .select(`id, sdr_id, call_datetime, campaigns(campaign_name, client_name), call_analyses(id, call_id, sdr_quality_score, appointment_quality_score, appointment_booked, decision_maker_detected, pain_point_detected, pain_point_details, appointment_datetime, ai_confidence, hallucination_risk, qualification_completeness_score, objection_detected, objection_type, objection_details, next_step, human_validated, urgency, current_solution, interest_level, prospect_company, contact_name, weaknesses, coaching_recommendations, created_at)`)
      .eq('organization_id', profile.organization_id)
      .in('sdr_id', sdrs.map(s => s.id))
      .gte('call_datetime', sixtyDaysAgo)
      .order('call_datetime', { ascending: false })

    if (callsError) {
      console.error('[COACHING] calls query failed', {
        user_id: user.id,
        role: profile.role,
        organization_id: profile.organization_id,
        manager_id: profile.manager_id,
        error: callsError,
      })
      dataError = callsError
    } else {
      calls = (callsData || []) as CoachingCallForSupervision[]
    }
  }

  const profiles = dataError ? [] : buildCoachingSupervisionProfiles(sdrs, calls, now)
  const currentAnalyses = profiles.reduce((sum, p) => sum + p.current_analysis_count, 0)
  const previousAnalyses = profiles.reduce((sum, p) => sum + p.previous_analysis_count, 0)

  console.log('[COACHING] scope result', {
    user_id: user.id,
    role: profile.role,
    organization_id: profile.organization_id,
    manager_id: profile.manager_id,
    sdrs_returned: sdrs.length,
    current_period_analyses: currentAnalyses,
    previous_period_analyses: previousAnalyses,
    trend_source: 'analysis_windows',
  })

  const stable = profiles.filter(p => coachingUrgency(p) === 'stable')
  const progressing = profiles.filter(p => p.overall_trend === 'up')
  const criticalCoaching = profiles.filter(p => coachingUrgency(p) === 'critical')
  const lightCoaching = profiles.filter(p => coachingUrgency(p) === 'light')
  const emptyMessage = profile.role === 'manager' ? 'Aucun SDR assigné à votre équipe' : 'Aucune donnée coaching disponible'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Coaching SDR</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Basé uniquement sur les analyses réelles - 30 derniers jours</div>
        </div>
      </div>

      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, paddingBottom: 24 }}>
        <div className="app-kpi-grid">
          <StatCard label="SDR stables" value={stable.length} sub={stable.length === 0 ? 'Aucun profil stable sur la periode' : stable.map(p => p.sdr_name).join(', ')} accent="rgba(125,211,252,.6)" valueColor="var(--cyan)" style={{ borderLeftWidth: 3 }} />
          <StatCard label="SDR en progression" value={progressing.length} sub={progressing.length === 0 ? 'Aucune hausse confirmee vs periode precedente' : progressing.map(p => p.sdr_name).join(', ')} accent="rgba(34,197,94,.7)" valueColor="#86efac" style={{ borderLeftWidth: 3 }} />
          <StatCard label="Coaching critique" value={criticalCoaching.length} sub={criticalCoaching.length === 0 ? 'Aucun SDR en urgence coaching' : criticalCoaching.map(p => p.sdr_name).join(', ')} accent="rgba(239,68,68,.7)" valueColor="#fca5a5" style={{ borderLeftWidth: 3 }} />
          <StatCard label="Coaching léger" value={lightCoaching.length} sub={lightCoaching.length === 0 ? 'Aucune priorité importante modérée' : lightCoaching.map(p => p.sdr_name).join(', ')} accent="rgba(245,158,11,.7)" valueColor="#fcd34d" style={{ borderLeftWidth: 3 }} />
        </div>

        {dataError && <EmptyPanel color="#fca5a5">Erreur chargement coaching. Consultez les logs serveur.</EmptyPanel>}
        {!dataError && profiles.length === 0 && <EmptyPanel>{emptyMessage}</EmptyPanel>}

        {profiles.map(p => (
          <div key={p.sdr_id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--indigo),var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.sdr_name.charAt(0)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.sdr_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{p.total_calls} appel{p.total_calls !== 1 ? 's' : ''} - {p.current_analysis_count} analyse{p.current_analysis_count !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <CategoryBadge profile={p} />
                <TrendSummary profile={p} />
              </div>
            </div>

            <div className="coaching-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(184px, 0.68fr) minmax(420px, 1.18fr) minmax(330px, 1fr)' }}>
              <div style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Performance</div>
                {[
                  { label: 'Score SDR moy.', node: <ScoreBadge score={p.avg_sdr_quality} /> },
                  { label: 'Qualité RDV moy.', node: <ScoreBadge score={p.avg_appointment_quality} /> },
                  { label: 'RDV qualifies', node: <span style={{ fontSize: 12, fontWeight: 700, color: p.qualification_rate >= 60 ? '#86efac' : p.qualification_rate >= 40 ? '#fcd34d' : '#fca5a5' }}>{p.qualified_appointments}/{p.appointments_booked}</span> },
                  { label: 'Analyses révisées', node: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{p.calls_reviewed}/{p.current_analysis_count}</span> },
                  { label: 'Dernière analyse', node: <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{formatDate(p.latest_analysis_at)}</span> },
                ].map(({ label, node }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{label}</span>
                    {node}
                  </div>
                ))}
              </div>

              <div style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Compétences</div>
                {SKILL_KEYS.map(key => (
                  <SkillBar key={key} label={SKILL_LABELS[key]} score={p.skills[key]} trend={p.skill_trends[key]} />
                ))}
              </div>

              <div style={{ padding: '10px 14px', minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>Priorités coaching</div>
                {p.priorities.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted-2)', marginBottom: 10 }}>Aucune priorité identifiée</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    {p.priorities.map((pr) => {
                      const style = RANK_STYLE[pr.rank]
                      return (
                        <div key={`${pr.rank}-${pr.label}`} style={{ paddingBottom: 4, borderBottom: '1px solid rgba(148,163,184,.10)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: pr.evidence.length ? 2 : 0 }}>
                            <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>{pr.rank}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.18 }}>{pr.label}</span>
                          </div>
                          {pr.evidence.slice(0, 1).map(item => (
                            <div key={item.label} style={{ marginLeft: 4, fontSize: 10, color: 'var(--muted-2)', lineHeight: 1.15 }}>
                              - {item.label}: {item.count} appel{item.count !== 1 ? 's' : ''}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Appels à écouter</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {p.best_call ? (
                    <CallExampleRow call={p.best_call} label="Meilleur appel a partager" color="#86efac" />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Aucun bon exemple disponible</span>
                  )}

                  {p.worst_call ? (
                    <CallExampleRow call={p.worst_call} label="Appel a analyser ensemble" color="#fca5a5" />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Aucun appel a analyser ensemble</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
