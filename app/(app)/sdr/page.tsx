import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import type { CallAnalysis, SDRDashboardKPIs } from '@/types'

type SDRCallFilter = 'completed' | 'failed' | 'all'
type AnalysisPreview = Pick<CallAnalysis, 'appointment_booked' | 'sdr_quality_score' | 'prospect_company' | 'interest_level' | 'strengths' | 'weaknesses' | 'coaching_recommendations'>
type KPIAnalysis = Pick<CallAnalysis, 'appointment_booked' | 'appointment_quality_score' | 'sdr_quality_score'>
type CampaignPreview = { campaign_name: string | null; client_name: string | null }
type JobPreview = { status: string; error_message: string | null }
type RawCallRow = {
  id: string
  call_datetime: string
  call_analyses: AnalysisPreview | AnalysisPreview[] | null
  campaigns: CampaignPreview | CampaignPreview[] | null
  analysis_jobs?: JobPreview | JobPreview[] | null
}
type CallRow = {
  id: string
  call_datetime: string
  call_analyses: AnalysisPreview | null
  campaigns: CampaignPreview | null
  failedJob: JobPreview | null
}

const ANALYSIS_SELECT = 'appointment_booked, sdr_quality_score, prospect_company, interest_level, strengths, weaknesses, coaching_recommendations'
const KPI_ANALYSIS_SELECT = 'appointment_booked, appointment_quality_score, sdr_quality_score'

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function normalizeCall(row: RawCallRow): CallRow {
  return {
    id: row.id,
    call_datetime: row.call_datetime,
    call_analyses: one(row.call_analyses),
    campaigns: one(row.campaigns),
    failedJob: one(row.analysis_jobs),
  }
}

function isLegacyFailedCall(row: CallRow) {
  return row.failedJob?.status === 'failed'
    && row.failedJob.error_message?.toLowerCase().includes('stuck pending')
    && !row.call_analyses
}

function filterHref(filter: SDRCallFilter) {
  return filter === 'completed' ? '/sdr' : `/sdr?status=${filter}`
}

function averageScore(values: Array<number | null>) {
  const scores = values.filter((value): value is number => value !== null)
  return scores.length > 0
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : null
}

export default async function SDRPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams
  const activeFilter: SDRCallFilter = params?.status === 'failed' || params?.status === 'all'
    ? params.status
    : 'completed'
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: { name: string; value: string; options: object }[]) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'sdr') redirect('/login')

  const completedQuery = supabase
    .from('calls')
    .select(`id, call_datetime, call_analyses!inner(${ANALYSIS_SELECT}), campaigns(campaign_name, client_name), analysis_jobs!inner(status)`)
    .eq('sdr_id', user.id)
    .eq('analysis_jobs.status', 'completed')
    .order('call_datetime', { ascending: false })
    .limit(50)

  const kpiQuery = supabase
    .from('calls')
    .select(`id, call_analyses!inner(${KPI_ANALYSIS_SELECT}), analysis_jobs!inner(status)`)
    .eq('sdr_id', user.id)
    .eq('analysis_jobs.status', 'completed')

  const failedQuery = supabase
    .from('calls')
    .select(`id, call_datetime, call_analyses(${ANALYSIS_SELECT}), campaigns(campaign_name, client_name), analysis_jobs!inner(status, error_message)`)
    .eq('sdr_id', user.id)
    .eq('analysis_jobs.status', 'failed')
    .ilike('analysis_jobs.error_message', '%stuck pending%')
    .order('call_datetime', { ascending: false })
    .limit(50)

  const [kpiRes, completedRes, failedRes] = await Promise.all([
    kpiQuery,
    activeFilter === 'failed' ? Promise.resolve({ data: [] }) : completedQuery,
    activeFilter === 'completed' ? Promise.resolve({ data: [] }) : failedQuery,
  ])

  const kpiAnalyses = ((kpiRes.data || []) as Array<{ call_analyses: KPIAnalysis | KPIAnalysis[] | null }>)
    .map(row => one(row.call_analyses))
    .filter((analysis): analysis is KPIAnalysis => analysis !== null)
  const rdvBooked = kpiAnalyses.filter(analysis => analysis.appointment_booked).length
  const kpis: SDRDashboardKPIs = {
    total_calls: kpiAnalyses.length,
    rdv_booked: rdvBooked,
    avg_rdv_quality: averageScore(kpiAnalyses.map(analysis => analysis.appointment_quality_score)),
    avg_sdr_quality: averageScore(kpiAnalyses.map(analysis => analysis.sdr_quality_score)),
    conversion_rate: kpiAnalyses.length > 0 ? Math.round((rdvBooked / kpiAnalyses.length) * 100) : 0,
  }

  const completedCalls = ((completedRes.data || []) as RawCallRow[]).map(normalizeCall)
  const failedCalls = ((failedRes.data || []) as RawCallRow[]).map(normalizeCall).filter(isLegacyFailedCall)
  const calls = [...completedCalls, ...failedCalls]
    .sort((a, b) => new Date(b.call_datetime).getTime() - new Date(a.call_datetime).getTime())
    .slice(0, 50)

  const analyses = calls.map(c => c.call_analyses).filter(Boolean) as AnalysisPreview[]
  const countFreq = (arr: string[]) => {
    const map: Record<string, number> = {}
    arr.forEach(item => { map[item] = (map[item] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }
  const topStrengths  = countFreq(analyses.flatMap(a => a?.strengths || []))
  const topCoaching   = countFreq(analyses.flatMap(a => a?.coaching_recommendations || []))
  const topWeaknesses = countFreq(analyses.flatMap(a => a?.weaknesses || []))
  const hasRecommendation = topCoaching.length > 0 || topWeaknesses.length > 0

  const scoreColor = (kpis.avg_sdr_quality ?? 0) >= 70 ? '#86efac'
    : (kpis.avg_sdr_quality ?? 0) >= 50 ? '#fcd34d'
    : '#fca5a5'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Mon tableau de bord</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bonjour {profile.name} — vos performances en temps réel</div>
        </div>
        <Link href="/calls/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 8px 20px rgba(37,99,235,.18)' }}>
          <span className="mat" style={{ fontSize: 15 }}>mic</span>
          Analyser un appel
        </Link>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard label="Appels analysés" value={kpis.total_calls} />
          <StatCard label="RDV posés"        value={kpis.rdv_booked} />
          <StatCard label="Qualité RDV"      value={kpis.avg_rdv_quality ?? '—'} sub="/100" />
          <StatCard label="Score SDR"        value={kpis.avg_sdr_quality ?? '—'} sub="/100" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Mes appels récents</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
                  {([
                    ['completed', 'Analysés'],
                    ['failed', 'À vérifier'],
                    ['all', 'Tous'],
                  ] as const).map(([filter, label]) => (
                    <Link
                      key={filter}
                      href={filterHref(filter)}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: activeFilter === filter ? 'var(--text)' : 'var(--muted-2)',
                        background: activeFilter === filter ? 'rgba(125,211,252,.12)' : 'transparent',
                        textDecoration: 'none',
                      }}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{calls.length} appel{calls.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {!calls.length ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  {activeFilter === 'failed' ? 'Aucun appel à vérifier' : 'Aucun appel analysé'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-2)', marginBottom: 16 }}>
                  {activeFilter === 'failed' ? 'Les appels bloqués ou incomplets apparaîtront ici pour suivi.' : 'Analysez votre premier appel pour suivre vos performances et recommandations.'}
                </div>
                <Link href="/calls/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)' }}>
                  <span className="mat" style={{ fontSize: 15 }}>mic</span>
                  Analyser un appel
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Date</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Prospect</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Campagne</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Intérêt</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>RDV</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={call.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: 0, color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>
                          <Link href={`/calls/${call.id}`} style={{ display: 'block', padding: '11px 18px', color: 'inherit', textDecoration: 'none' }}>{formatDateShort(call.call_datetime)}</Link>
                        </td>
                        <td style={{ padding: 0, fontWeight: 600, color: 'var(--text)' }}>
                          <Link href={`/calls/${call.id}`} style={{ display: 'block', padding: '11px 18px', color: 'inherit', textDecoration: 'none' }}>
                            {call.call_analyses?.prospect_company || <span style={{ color: 'var(--muted-2)', fontWeight: 400 }}>En attente…</span>}
                          </Link>
                        </td>
                        <td style={{ padding: 0, color: 'var(--muted)' }}>
                          <Link href={`/calls/${call.id}`} style={{ display: 'block', padding: '11px 18px', color: 'inherit', textDecoration: 'none' }}>
                            {call.campaigns?.campaign_name || '—'}
                          </Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link href={`/calls/${call.id}`} style={{ display: 'block', padding: '11px 18px', textDecoration: 'none' }}>
                            <Badge className={getInterestBg(call.call_analyses?.interest_level ?? null)}>
                              {getInterestLabel(call.call_analyses?.interest_level ?? null)}
                            </Badge>
                          </Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link href={`/calls/${call.id}`} style={{ display: 'block', padding: '11px 18px', textDecoration: 'none' }}>
                            {call.call_analyses?.appointment_booked
                              ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">✓ Posé</Badge>
                              : call.failedJob
                              ? <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Échoué</Badge>
                              : <span style={{ color: 'var(--muted-2)' }}>—</span>}
                          </Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link href={`/calls/${call.id}`} style={{ display: 'block', padding: '11px 18px', textDecoration: 'none' }}>
                            <ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Résumé de performance</span>
              </div>
              <div style={{ padding: '20px 18px' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 48, fontWeight: 700, color: scoreColor, lineHeight: 1, letterSpacing: '-.02em' }}>{kpis.avg_sdr_quality ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 4 }}>Score SDR moyen</div>
                </div>
                {[
                  { label: 'Appels analysés',  value: String(kpis.total_calls) },
                  { label: 'RDV posés',         value: String(kpis.rdv_booked) },
                  { label: 'Taux de RDV',       value: `${kpis.conversion_rate}%` },
                  { label: 'Qualité RDV moy.',  value: kpis.avg_rdv_quality !== null ? `${kpis.avg_rdv_quality}/100` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {topStrengths.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Vos points forts</span>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topStrengths.map(([item]) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color: '#86efac', flexShrink: 0, fontSize: 12, marginTop: 1 }}>+</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Prochaine amélioration</span>
              </div>
              <div style={{ padding: '14px 18px' }}>
                {!hasRecommendation ? (
                  <div style={{ fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.5 }}>
                    Analysez plus d&apos;appels pour générer une recommandation fiable.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(topCoaching.length > 0 ? topCoaching : topWeaknesses).slice(0, 3).map(([item]) => (
                      <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ color: 'var(--cyan)', flexShrink: 0, fontSize: 12, marginTop: 1 }}>→</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
