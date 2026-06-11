import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import dashboardModel from '@/lib/sdr-dashboard.js'

const { buildSdrDashboardModel } = dashboardModel as {
  buildSdrDashboardModel: (calls: SdrDashboardCall[], options?: { now?: Date }) => SdrDashboardModel
}

type MetricModel = {
  label: string
  value: number | null
  previous: number | null
  delta: number | null
  suffix: string
}

type SdrDashboardModel = {
  hasData: boolean
  performance: { metrics: MetricModel[] }
  focusArea: null | {
    label: string
    skill: string
    evidence: string
    why: string
    actions: string[]
    expectedImpact: string
    callId: string
  }
  personalFunnel: null | {
    periodLabel: string
    stages: Array<{
      key: string
      label: string
      count: number | null
      available: boolean
      conversionFromPrevious: number | null
      dropOff: number | null
    }>
    friction: null | {
      fromLabel: string
      toLabel: string
      fromCount: number
      toCount: number
      conversion: number | null
      action: string
    }
  }
  strengths: Array<{ label: string; behavior: string; callId: string; prospect: string }>
  bestCalls: Array<{ callId: string; prospect: string; score: number | null; signals: string[] }>
  trends: null | {
    metrics: Array<{ key: string; label: string; delta: number | null; values: Array<number | null> }>
    mostImproved: null | { label: string; delta: number | null }
    mostDeclining: null | { label: string; delta: number | null }
  }
  missedOpportunities: Array<{
    callId: string
    prospect: string
    prospectSignal: string
    missedAction: string
    suggestedQuestion: string
  }>
  improvementJourney: null | { previousScore: number | null; currentScore: number | null; delta: number | null }
}

type SdrDashboardCall = {
  id: string
  call_datetime: string
  transcript: string | null
  campaigns?: { client_name: string | null } | { client_name: string | null }[] | null
  call_analyses: unknown
}

const ANALYSIS_SELECT = [
  'prospect_company',
  'contact_name',
  'decision_maker_detected',
  'pain_point_detected',
  'pain_point_details',
  'urgency',
  'current_solution',
  'interest_level',
  'objection_detected',
  'objection_type',
  'objection_details',
  'appointment_booked',
  'appointment_datetime',
  'appointment_quality_score',
  'next_step',
  'sdr_quality_score',
  'qualification_completeness_score',
  'strengths',
  'weaknesses',
  'coaching_recommendations',
  'missing_information',
  'created_at',
].join(',')

function formatMetricValue(metric: MetricModel) {
  if (metric.value === null) return '—'
  return `${metric.value}${metric.suffix}`
}

function formatDelta(value: number | null, suffix: string) {
  if (value === null) return 'historique insuffisant'
  if (value === 0) return `stable`
  return `${value > 0 ? '+' : ''}${value}${suffix}`
}

function deltaColor(value: number | null) {
  if (value === null || value === 0) return 'var(--muted-2)'
  return value > 0 ? '#86efac' : '#fca5a5'
}

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg,rgba(15,23,42,.70),rgba(10,16,32,.58))',
  border: '1px solid rgba(148,163,184,.12)',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '0 10px 28px rgba(0,0,0,.22)',
}

const softCardStyle: React.CSSProperties = {
  border: '1px solid rgba(148,163,184,.10)',
  borderRadius: 8,
  background: 'rgba(2,6,23,.22)',
}

function Section({
  title,
  children,
  aside,
}: {
  title: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <section className="sdr-dense-section" style={panelStyle}>
      <div className="sdr-section-title-row" style={{ padding: '9px 12px', borderBottom: '1px solid rgba(148,163,184,.10)', background: 'rgba(15,23,42,.42)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 780, color: 'var(--text)', lineHeight: 1.15 }}>{title}</h2>
        {aside}
      </div>
      <div className="sdr-section-body" style={{ padding: 12 }}>{children}</div>
    </section>
  )
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
    const y = value === null ? 92 : 92 - Math.max(0, Math.min(100, value)) * 0.82
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 30, display: 'block' }}>
      <polyline points={points} fill="none" stroke="var(--cyan)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default async function SDRPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: { name: string; value: string; options: object }[]) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'sdr') redirect('/login')

  const now = new Date()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000).toISOString()

  const { data: callsData } = await supabase
    .from('calls')
    .select(`id, call_datetime, transcript, campaigns(client_name), call_analyses!inner(${ANALYSIS_SELECT}), analysis_jobs!inner(status)`)
    .eq('sdr_id', user.id)
    .eq('analysis_jobs.status', 'completed')
    .gte('call_datetime', sixtyDaysAgo)
    .order('call_datetime', { ascending: false })
    .limit(300)

  const model = buildSdrDashboardModel(((callsData || []) as unknown) as SdrDashboardCall[], {
    now,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style>{`
        .sdr-page-scroll {
          flex: 0 0 auto !important;
          overflow: visible !important;
        }
        .sdr-dense-section > .sdr-section-title-row {
          min-height: 32px;
        }
        .sdr-dense-section > .sdr-section-body {
          padding: 12px !important;
        }
        .sdr-top-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.42fr) minmax(320px, .58fr);
          gap: 10px;
          align-items: start;
        }
        .sdr-middle-grid,
        .sdr-bottom-grid {
          display: grid;
          gap: 10px;
          align-items: start;
        }
        .sdr-middle-grid {
          grid-template-columns: minmax(230px, .78fr) minmax(360px, 1.24fr) minmax(260px, .98fr);
        }
        .sdr-bottom-grid {
          grid-template-columns: minmax(0, 1.58fr) minmax(280px, .42fr);
        }
        .sdr-compact-card {
          padding: 9px 10px !important;
        }
        .sdr-compact-list {
          gap: 7px !important;
        }
        .sdr-compact-text {
          line-height: 1.35 !important;
        }
        @media (max-width: 1100px) {
          .sdr-performance-hero,
          .sdr-focus-grid,
          .sdr-top-grid,
          .sdr-missed-row,
          .sdr-middle-grid,
          .sdr-bottom-grid {
            grid-template-columns: 1fr !important;
          }
          .sdr-performance-grid,
          .sdr-earnings-grid,
          .sdr-three-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 680px) {
          .sdr-performance-grid,
          .sdr-earnings-grid,
          .sdr-three-grid {
            grid-template-columns: 1fr !important;
          }
          .sdr-section-title-row {
            align-items: flex-start !important;
            flex-direction: column !important;
          }
        }
        @media (max-width: 520px) {
          .sdr-funnel-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 38, minHeight: 38, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 720, color: 'var(--text)', lineHeight: 1 }}>Mon amélioration</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.1, marginTop: 2 }}>Bonjour {profile.name}</div>
        </div>
        <Link href="/calls/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 750, color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 6px 14px rgba(37,99,235,.16)', textDecoration: 'none' }}>
          <span className="mat" style={{ fontSize: 13 }}>mic</span>
          Analyser un appel
        </Link>
      </div>

      <div className="app-scroll sdr-page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, paddingBottom: 14, paddingLeft: 14, paddingRight: 14 }}>
        {!model.hasData ? (
          <div style={{ ...panelStyle, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 780, color: 'var(--text)', marginBottom: 5 }}>Aucun appel analysé sur les 30 derniers jours</div>
            <div style={{ fontSize: 12, color: 'var(--muted-2)', marginBottom: 14 }}>Analyse un appel pour obtenir ton score, ta priorité et tes pistes de progression.</div>
            <Link href="/calls/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 750, color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', textDecoration: 'none' }}>
              <span className="mat" style={{ fontSize: 15 }}>mic</span>
              Analyser un appel
            </Link>
          </div>
        ) : (
          <>
            <section style={{ border: '1px solid rgba(125,211,252,.22)', borderRadius: 11, overflow: 'hidden', boxShadow: '0 14px 34px rgba(2,6,23,.30)', background: 'linear-gradient(135deg,rgba(15,23,42,.98),rgba(8,21,39,.96) 55%,rgba(8,47,73,.58))' }}>
              <div className="sdr-performance-hero" style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(172px,.34fr) minmax(0,1.66fr)', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 840, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '.08em', lineHeight: 1 }}>Score SDR</div>
                  <div style={{ margin: 0, fontSize: 42, lineHeight: .9, color: 'var(--text)', fontWeight: 920, fontVariantNumeric: 'tabular-nums' }}>{formatMetricValue(model.performance.metrics[0])}</div>
                  <div style={{ fontSize: 11, color: deltaColor(model.performance.metrics[0]?.delta ?? null), fontWeight: 750 }}>{formatDelta(model.performance.metrics[0]?.delta ?? null, model.performance.metrics[0]?.suffix ?? '')}</div>
                </div>
                <div className="sdr-performance-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, model.performance.metrics.slice(1).length)},minmax(0,1fr))`, gap: 8 }}>
                  {model.performance.metrics.slice(1).map((metric) => (
                    <div key={metric.label} style={{ background: 'rgba(2,6,23,.24)', border: '1px solid rgba(148,163,184,.10)', borderRadius: 8, padding: '9px 10px', minWidth: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 760, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.label}</div>
                        <div style={{ marginTop: 4, fontSize: 10, color: deltaColor(metric.delta), fontWeight: 730, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatDelta(metric.delta, metric.suffix)}</div>
                      </div>
                      <div style={{ fontSize: 24, color: 'var(--text)', fontWeight: 880, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatMetricValue(metric)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="sdr-top-grid">
              {model.focusArea && (
                <Section
                  title="Priorité de la semaine"
                  aside={<Link href={`/calls/${model.focusArea.callId}`} style={{ color: 'var(--cyan)', fontSize: 11, fontWeight: 750, textDecoration: 'none' }}>Voir l’appel</Link>}
                >
                  <div className="sdr-focus-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.9fr) minmax(0,1.1fr)', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 860, color: '#fcd34d', lineHeight: 1.1 }}>{model.focusArea.label}</div>
                      <div className="sdr-compact-text" style={{ marginTop: 8, padding: '8px 9px', borderRadius: 8, background: 'rgba(245,158,11,.09)', border: '1px solid rgba(245,158,11,.20)', color: 'var(--text)', fontSize: 12, lineHeight: 1.35 }}>
                        Signal réel : {model.focusArea.evidence}
                      </div>
                      <div className="sdr-compact-text" style={{ marginTop: 7, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.35 }}>{model.focusArea.why}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 820, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>À faire au prochain appel</div>
                      <div className="sdr-compact-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {model.focusArea.actions.map((action, index) => (
                          <div key={action} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, alignItems: 'start' }}>
                            <span style={{ width: 18, height: 18, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(125,211,252,.12)', color: 'var(--cyan)', fontSize: 10, fontWeight: 860 }}>{index + 1}</span>
                            <span className="sdr-compact-text" style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.35, fontWeight: 610 }}>{action}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 820, color: '#86efac' }}>Impact attendu : {model.focusArea.expectedImpact}</div>
                    </div>
                  </div>
                </Section>
              )}

              {model.personalFunnel && (
                <Section
                  title="Mon entonnoir personnel"
                  aside={<span style={{ fontSize: 10, color: 'var(--muted-2)', fontWeight: 720 }}>{model.personalFunnel.periodLabel}</span>}
                >
                  <div className="sdr-funnel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 5 }}>
                    {model.personalFunnel.stages.map((stage) => (
                      <div key={stage.key} style={{ ...softCardStyle, padding: '6px 7px', opacity: stage.available ? 1 : .62 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 7 }}>
                          <span style={{ minWidth: 0, fontSize: 10, color: stage.available ? 'var(--muted)' : 'var(--muted-2)', fontWeight: 760, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.label}</span>
                          <span style={{ fontSize: stage.available ? 15 : 10, color: stage.available ? 'var(--text)' : 'var(--muted-2)', fontWeight: 880, lineHeight: 1, whiteSpace: 'nowrap' }}>
                            {stage.available ? stage.count : 'Non disponible'}
                          </span>
                        </div>
                        {stage.available && stage.conversionFromPrevious !== null && (
                          <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 9, color: 'var(--muted-2)' }}>
                            <span>Conversion : {stage.conversionFromPrevious}%</span>
                            {stage.dropOff !== null && stage.dropOff > 0 && <span>-{stage.dropOff}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {model.personalFunnel.friction ? (
                    <div style={{ marginTop: 7, padding: '7px 8px', borderRadius: 8, background: 'rgba(125,211,252,.07)', border: '1px solid rgba(125,211,252,.16)' }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 820, textTransform: 'uppercase', letterSpacing: '.06em' }}>Principal point de friction</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text)', fontWeight: 820, lineHeight: 1.2 }}>
                        {model.personalFunnel.friction.fromLabel} → {model.personalFunnel.friction.toLabel}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 10, color: 'var(--muted-2)', lineHeight: 1.25 }}>
                        {model.personalFunnel.friction.fromCount} → {model.personalFunnel.friction.toCount} · Conversion : {model.personalFunnel.friction.conversion ?? '—'}%
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--cyan)', fontWeight: 760, lineHeight: 1.3 }}>
                        {model.personalFunnel.friction.action}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 7, fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.3 }}>
                      Analyse encore quelques appels pour construire ton entonnoir.
                    </div>
                  )}
                </Section>
              )}
            </div>

            <div className="sdr-middle-grid">
              {model.strengths.length >= 3 && (
                <Section title="Ce que tu fais bien">
                <div className="sdr-three-grid sdr-compact-list" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7 }}>
                  {model.strengths.map((strength) => (
                    <Link className="sdr-compact-card" key={`${strength.callId}-${strength.label}`} href={`/calls/${strength.callId}`} style={{ display: 'block', textDecoration: 'none', border: '1px solid rgba(34,197,94,.16)', borderRadius: 8, padding: 12, background: 'rgba(34,197,94,.055)' }}>
                      <div style={{ fontSize: 13, fontWeight: 820, color: '#86efac', lineHeight: 1.2 }}>{strength.label}</div>
                      <div style={{ marginTop: 5, fontSize: 12, color: 'var(--muted)', lineHeight: 1.35 }}>À répéter : {strength.behavior}</div>
                      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--cyan)', fontWeight: 760, textTransform: 'uppercase', letterSpacing: '.04em' }}>{strength.prospect}</div>
                    </Link>
                  ))}
                </div>
                </Section>
              )}

              {model.bestCalls.length > 0 && (
                <Section title="Apprendre de tes meilleurs appels">
                <div className="sdr-three-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                  {model.bestCalls.map((call) => (
                    <Link className="sdr-compact-card" key={call.callId} href={`/calls/${call.callId}`} style={{ display: 'block', textDecoration: 'none', ...softCardStyle, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 820, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{call.prospect}</div>
                        <div style={{ color: '#86efac', fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{call.score ?? '—'}</div>
                      </div>
                      <div className="sdr-compact-list" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {call.signals.map((signal) => (
                          <div key={signal} style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {signal}</div>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
                </Section>
              )}

              {model.trends && (
                <Section
                title="Progression sur 30 jours"
                aside={
                  <span style={{ fontSize: 10, color: 'var(--muted-2)', fontWeight: 720, whiteSpace: 'nowrap' }}>
                    + {model.trends.mostImproved?.label ?? '—'} · - {model.trends.mostDeclining?.label ?? '—'}
                  </span>
                }
              >
                <div className="sdr-three-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 7 }}>
                  {model.trends.metrics.map((metric) => (
                    <div className="sdr-compact-card" key={metric.key} style={{ ...softCardStyle, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 800 }}>{metric.label}</span>
                        <span style={{ fontSize: 11, color: deltaColor(metric.delta), fontWeight: 800 }}>{metric.delta === null ? '—' : `${metric.delta > 0 ? '+' : ''}${metric.delta}%`}</span>
                      </div>
                      <Sparkline values={metric.values} />
                    </div>
                  ))}
                </div>
                </Section>
              )}
            </div>

            <div className="sdr-bottom-grid">
              {model.missedOpportunities.length > 0 && (
                <Section title="Opportunités manquées">
                <div className="sdr-compact-list" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {model.missedOpportunities.slice(0, 5).map((item) => (
                    <Link className="sdr-missed-row sdr-compact-card" key={`${item.callId}-${item.missedAction}`} href={`/calls/${item.callId}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(220px,.75fr)', gap: 12, alignItems: 'center', textDecoration: 'none', ...softCardStyle, padding: '9px 11px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 820, lineHeight: 1.28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.suggestedQuestion}</div>
                        <div style={{ marginTop: 5, display: 'flex', gap: 7, minWidth: 0, color: 'var(--muted-2)', fontSize: 11, lineHeight: 1.25 }}>
                          <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.prospectSignal}</span>
                        </div>
                      </div>
                      <div style={{ minWidth: 0, color: '#fcd34d', fontSize: 12, fontWeight: 760, lineHeight: 1.28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Action manquée : {item.missedAction}
                      </div>
                    </Link>
                  ))}
                </div>
                </Section>
              )}

              {model.improvementJourney && (
                <Section title="Parcours d’amélioration">
                <div style={{ ...softCardStyle, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 820, textTransform: 'uppercase', letterSpacing: '.06em' }}>Maintenant</div>
                      <div style={{ marginTop: 4, fontSize: 28, color: 'var(--text)', fontWeight: 920, lineHeight: 1 }}>{model.improvementJourney.currentScore === null ? '—' : `${model.improvementJourney.currentScore}`}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 820, textTransform: 'uppercase', letterSpacing: '.06em' }}>Écart</div>
                      <div style={{ marginTop: 4, fontSize: 22, color: deltaColor(model.improvementJourney.delta), fontWeight: 900, lineHeight: 1 }}>
                        {model.improvementJourney.delta === null ? '—' : `${model.improvementJourney.delta > 0 ? '+' : ''}${model.improvementJourney.delta}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(148,163,184,.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--muted-2)' }}>
                    <span>Mois précédent</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 760 }}>{model.improvementJourney.previousScore === null ? 'Historique insuffisant' : `${model.improvementJourney.previousScore}/100`}</span>
                  </div>
                </div>
                </Section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
