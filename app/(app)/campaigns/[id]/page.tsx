import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  Empty,
  InterestBadge,
  ScoreBadge,
  StatCard,
  StatusBadge,
} from '@/components/ui'
import { formatDateShort } from '@/lib/utils'
import type { AnalysisJob, Call, CallAnalysis, Campaign, User } from '@/types'

type Joined<T> = T | T[] | null

type CampaignCall = Pick<Call, 'id' | 'call_datetime'> & {
  call_analyses: Joined<CallAnalysis>
  analysis_jobs: Joined<Pick<AnalysisJob, 'status' | 'error_message'>>
  users: Joined<Pick<User, 'name'>>
}

function firstJoined<T>(value: Joined<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function hasUsableProspect(analysis: CallAnalysis | null) {
  const value = analysis?.prospect_company?.trim()
  return Boolean(value && value !== 'En attente...' && value !== 'En attente…')
}

function isValidCompletedCall(call: CampaignCall) {
  const analysis = firstJoined(call.call_analyses)
  const job = firstJoined(call.analysis_jobs)
  return job?.status === 'completed' && Boolean(analysis) && hasUsableProspect(analysis)
}

function filterHref(id: string, view: TableView) {
  return view === 'completed' ? `/campaigns/${id}` : `/campaigns/${id}?view=${view}`
}

type TableView = 'completed' | 'failed' | 'all'

function CopyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      </div>
      <div style={{ padding: '12px 18px 16px' }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, maxWidth: 760 }}>
          {children}
        </p>
      </div>
    </Card>
  )
}

function LinkedCell({
  href,
  children,
  strong = false,
}: {
  href: string
  children: React.ReactNode
  strong?: boolean
}) {
  return (
    <td style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
      <Link
        href={href}
        style={{
          display: 'block',
          padding: '14px 18px',
          color: strong ? 'var(--text)' : 'var(--muted)',
          fontSize: 13,
          fontWeight: strong ? 650 : 500,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </Link>
    </td>
  )
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string | string[] | undefined }>
}) {
  const { id } = await params
  const query = await searchParams
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view
  const tableView: TableView = requestedView === 'failed' || requestedView === 'all' ? requestedView : 'completed'
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).single()
  if (!campaign) notFound()

  const { data: calls } = await supabase
    .from('calls')
    .select('id, call_datetime, call_analyses(*), analysis_jobs(status, error_message), users!calls_sdr_id_fkey(name)')
    .eq('campaign_id', id)
    .order('call_datetime', { ascending: false })

  const typedCampaign = campaign as Campaign
  const allCalls = (calls ?? []) as CampaignCall[]
  const completedCalls = allCalls.filter(isValidCompletedCall)
  const failedOrInvalidCalls = allCalls.filter((call) => !isValidCompletedCall(call))
  const displayedCalls = tableView === 'completed' ? completedCalls : tableView === 'failed' ? failedOrInvalidCalls : allCalls
  const analyses = completedCalls.map((call) => firstJoined(call.call_analyses)).filter((analysis): analysis is CallAnalysis => Boolean(analysis))
  const rdvBooked = analyses.filter((analysis) => analysis.appointment_booked).length
  const scoredAnalyses = analyses.filter((analysis) => typeof analysis.appointment_quality_score === 'number')
  const avgQ = scoredAnalyses.length
    ? Math.round(scoredAnalyses.reduce((sum, analysis) => sum + (analysis.appointment_quality_score ?? 0), 0) / scoredAnalyses.length)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div
        className="app-page-header"
        style={{
          height: 56,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(18px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <Link href="/campaigns" style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650, textDecoration: 'none' }}>
          ← Campagnes
        </Link>
      </div>

      <main className="app-scroll">
        <style>{`
          .h3a-data-row:hover {
            background: rgba(255, 255, 255, .035);
          }
          .h3a-filter-link:hover {
            border-color: rgba(125,211,252,.42);
            color: var(--text);
          }
          @media (max-width: 820px) {
            .h3a-kpi-grid,
            .h3a-info-grid {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 760px) {
            .campaign-detail-actions {
              width: 100%;
              justify-content: center;
            }
          }
        `}</style>
        <div className="app-content">
          <section
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>
                  {typedCampaign.campaign_name}
                </h1>
                <StatusBadge status={typedCampaign.status} />
              </div>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                Client : <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{typedCampaign.client_name}</strong>
              </p>
              {typedCampaign.sector && (
                <p style={{ margin: '6px 0 0', color: 'var(--muted-2)', fontSize: 13 }}>{typedCampaign.sector}</p>
              )}
            </div>

            {['owner', 'manager'].includes(profile.role) && (
              <Link
                className="campaign-detail-actions"
                href="/calls/upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 38,
                  padding: '0 14px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
                  border: '1px solid rgba(125,211,252,.42)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                  boxShadow: '0 10px 24px rgba(37,99,235,.2)',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 800 }}>+</span>
                Analyser un appel
              </Link>
            )}
          </section>

          <section className="h3a-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            <StatCard label="Appels" value={completedCalls.length} sub="Analyses completes valides" dot="var(--cyan)" />
            <StatCard label="RDV posés" value={rdvBooked} sub="Sur appels termines" dot="#86efac" />
            <StatCard label="Qualité RDV moy." value={avgQ ?? '—'} sub={avgQ === null ? 'Pas encore de score' : 'Score moyen'} dot="#fcd34d" />
          </section>

          <section className="h3a-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            {typedCampaign.offer_description && <CopyBlock title="Offre">{typedCampaign.offer_description}</CopyBlock>}
            {typedCampaign.target_persona && <CopyBlock title="Persona cible">{typedCampaign.target_persona}</CopyBlock>}
            {typedCampaign.script_notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <CopyBlock title="Notes script">{typedCampaign.script_notes}</CopyBlock>
              </div>
            )}
          </section>

          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Appels de la campagne</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-2)' }}>
                    {tableView === 'completed'
                      ? 'Vue par défaut : appels terminés avec une analyse exploitable.'
                      : tableView === 'failed'
                        ? 'Vue diagnostic : appels échoués, invalides ou incomplets.'
                        : 'Vue complète : tous les appels de la campagne.'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    ['completed', 'Terminés'],
                    ['failed', 'Invalides'],
                    ['all', 'Tous'],
                  ] as const).map(([view, label]) => {
                    const active = tableView === view
                    return (
                      <Link
                        className="h3a-filter-link"
                        key={view}
                        href={filterHref(id, view)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: 28,
                          padding: '0 10px',
                          borderRadius: 999,
                          border: active ? '1px solid rgba(125,211,252,.42)' : '1px solid var(--border)',
                          background: active ? 'var(--cyan-soft)' : 'rgba(2,6,23,.24)',
                          color: active ? 'var(--cyan)' : 'var(--muted)',
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        {label}
                      </Link>
                    )
                  })}
                  <span style={{ color: 'var(--muted-2)', fontSize: 12, fontWeight: 650 }}>{displayedCalls.length} appels</span>
                </div>
              </div>
            </div>

            {displayedCalls.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr style={{ background: 'var(--thead)' }}>
                      {['Date', 'SDR', 'Prospect', 'Intérêt', 'RDV', 'Score RDV'].map((label) => (
                        <th
                          key={label}
                          style={{
                            padding: '10px 18px',
                            textAlign: 'left',
                            color: 'var(--muted-2)',
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '.04em',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedCalls.map((call) => {
                      const analysis = firstJoined(call.call_analyses)
                      const sdr = firstJoined(call.users)
                      const href = `/calls/${call.id}`
                      return (
                        <tr className="h3a-data-row" key={call.id} style={{ transition: 'background .15s ease' }}>
                          <LinkedCell href={href}>{formatDateShort(call.call_datetime)}</LinkedCell>
                          <LinkedCell href={href} strong>{sdr?.name ?? '—'}</LinkedCell>
                          <LinkedCell href={href} strong>{analysis?.prospect_company ?? '—'}</LinkedCell>
                          <td style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                            <Link href={href} style={{ textDecoration: 'none' }}>
                              <InterestBadge level={analysis?.interest_level ?? null} />
                            </Link>
                          </td>
                          <td style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                            <Link
                              href={href}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: analysis?.appointment_booked ? 'rgba(34,197,94,.10)' : 'rgba(2,6,23,.28)',
                                color: analysis?.appointment_booked ? '#86efac' : 'var(--muted-2)',
                                border: analysis?.appointment_booked ? '1px solid rgba(34,197,94,.35)' : '1px solid var(--border)',
                                textDecoration: 'none',
                              }}
                            >
                              {analysis?.appointment_booked ? 'Oui' : 'Non'}
                            </Link>
                          </td>
                          <td style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                            <Link href={href} style={{ textDecoration: 'none' }}>
                              <ScoreBadge score={analysis?.appointment_quality_score ?? null} />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title={tableView === 'completed' ? 'Aucun appel terminé valide' : 'Aucun appel dans cette vue'}
                description={tableView === 'completed'
                  ? 'Les appels échoués, invalides ou sans analyse exploitable sont masqués dans cette vue.'
                  : 'Changez de filtre pour consulter les autres appels de cette campagne.'}
              />
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
