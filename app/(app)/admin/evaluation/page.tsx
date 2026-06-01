import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, InterestBadge, ScoreBadge, StatCard } from '@/components/ui'
import { formatEvaluationField } from '@/lib/evaluation'
import type { EvaluationCase, EvaluationResult, InterestLevel } from '@/types'
import { RunEvaluationButton } from './RunEvaluationButton'

function boolLabel(value: boolean | null | undefined) {
  if (value === true) return 'Oui'
  if (value === false) return 'Non'
  return '-'
}

function pct(ok: number, total: number) {
  return total > 0 ? `${Math.round((ok / total) * 100)}%` : '-'
}

function latestByCase(results: EvaluationResult[]) {
  const map = new Map<string, EvaluationResult>()
  for (const result of results) {
    if (!map.has(result.case_id)) map.set(result.case_id, result)
  }
  return map
}

function computeSummary(cases: EvaluationCase[], latest: Map<string, EvaluationResult>) {
  const completed = cases
    .map(testCase => ({ testCase, result: latest.get(testCase.id) }))
    .filter((row): row is { testCase: EvaluationCase; result: EvaluationResult } => {
      return row.result !== undefined && !row.result.error_message
    })

  const total = completed.length
  const avgScore = total > 0
    ? `${Math.round(completed.reduce((sum, row) => sum + (row.result.score ?? 0), 0) / total)}%`
    : '-'

  return {
    total,
    avgScore,
    decisionMaker: pct(completed.filter(row => row.testCase.expected_decision_maker === row.result.actual_decision_maker).length, total),
    rdvPose: pct(completed.filter(row => row.testCase.expected_rdv_pose === row.result.actual_rdv_pose).length, total),
    rdvQualifie: pct(completed.filter(row => row.testCase.expected_rdv_qualifie === row.result.actual_rdv_qualifie).length, total),
    temperature: pct(completed.filter(row => row.testCase.expected_temperature === row.result.actual_temperature).length, total),
  }
}

function SmallBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'pass' | 'fail' }) {
  const style = {
    pass: { bg: 'rgba(34,197,94,.10)', color: '#86efac', border: 'rgba(34,197,94,.35)' },
    fail: { bg: 'rgba(239,68,68,.12)', color: '#fca5a5', border: 'rgba(239,68,68,.32)' },
    neutral: { bg: 'rgba(2,6,23,.28)', color: 'var(--muted)', border: 'var(--border)' },
  }[tone]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 750, background: style.bg, color: style.color, border: `1px solid ${style.border}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export default async function EvaluationPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/dashboard')

  const [{ data: casesData }, { data: resultsData }] = await Promise.all([
    supabase.from('evaluation_cases').select('*').order('created_at', { ascending: true }),
    supabase.from('evaluation_results').select('*').order('created_at', { ascending: false }).limit(500),
  ])

  const cases = (casesData ?? []) as EvaluationCase[]
  const results = (resultsData ?? []) as EvaluationResult[]
  const latest = latestByCase(results)
  const summary = computeSummary(cases, latest)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{
        height: 56,
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '0 24px',
      }}>
        <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650 }}>Administration / Evaluation IA</div>
        <RunEvaluationButton />
      </div>

      <main className="app-scroll">
        <div className="app-content">
          <section>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>
              Gold Dataset Evaluation
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>
              Comparaison interne entre jugement humain attendu, jugement IA et score pass/fail sur appels telecom B2B.
            </p>
          </section>

          <div className="app-kpi-grid">
            <StatCard label="Accuracy" value={summary.avgScore} sub={`${summary.total}/${cases.length} cas executes`} dot="var(--cyan)" />
            <StatCard label="Decision Maker" value={summary.decisionMaker} sub="Expected vs Actual" dot="#93c5fd" />
            <StatCard label="RDV Pose" value={summary.rdvPose} sub="Expected vs Actual" dot="#86efac" />
            <StatCard label="RDV Qualifie" value={summary.rdvQualifie} sub="Expected vs Actual" dot="#fcd34d" />
            <StatCard label="Temperature" value={summary.temperature} sub="Expected vs Actual" dot="#fca5a5" />
          </div>

          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 750, color: 'var(--text)' }}>Cas de reference</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-2)', fontSize: 12 }}>
                  {cases.length} cas gold seedes. Les resultats affichent le dernier run par cas.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
                <thead>
                  <tr style={{ background: 'var(--thead)' }}>
                    {['Case', 'Expected', 'AI Result', 'Pass/Fail', 'Score', 'Erreurs / explication', 'Run'].map(label => (
                      <th key={label} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--muted-2)', fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map(testCase => {
                    const result = latest.get(testCase.id)
                    const mismatchLabels = result?.mismatches?.length
                      ? result.mismatches.map(field => field === 'analysis_error' ? 'Erreur analyse' : formatEvaluationField(field as Parameters<typeof formatEvaluationField>[0])).join(', ')
                      : '-'

                    return (
                      <tr key={testCase.id}>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', maxWidth: 320 }}>
                          <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 750, lineHeight: 1.35 }}>{testCase.title}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                            <SmallBadge>{testCase.category}</SmallBadge>
                            <SmallBadge>{testCase.difficulty}</SmallBadge>
                          </div>
                          <p style={{ margin: '8px 0 0', color: 'var(--muted-2)', fontSize: 12, lineHeight: 1.45 }}>
                            {testCase.expected_reason}
                          </p>
                        </td>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                          <div style={{ display: 'grid', gap: 5, color: 'var(--muted)', fontSize: 12 }}>
                            <span>DM: {boolLabel(testCase.expected_decision_maker)}</span>
                            <span>RDV: {boolLabel(testCase.expected_rdv_pose)}</span>
                            <span>Qualifie: {boolLabel(testCase.expected_rdv_qualifie)}</span>
                            <InterestBadge level={testCase.expected_temperature as InterestLevel} />
                          </div>
                        </td>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                          {result ? (
                            result.error_message ? (
                              <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.45 }}>{result.error_message}</div>
                            ) : (
                              <div style={{ display: 'grid', gap: 5, color: 'var(--muted)', fontSize: 12 }}>
                                <span>DM: {boolLabel(result.actual_decision_maker)}</span>
                                <span>RDV: {boolLabel(result.actual_rdv_pose)}</span>
                                <span>Qualifie: {boolLabel(result.actual_rdv_qualifie)}</span>
                                <InterestBadge level={result.actual_temperature} />
                              </div>
                            )
                          ) : (
                            <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>Non execute</span>
                          )}
                        </td>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                          {result ? <SmallBadge tone={result.passed ? 'pass' : 'fail'}>{result.passed ? 'PASS' : 'FAIL'}</SmallBadge> : <SmallBadge>Pending</SmallBadge>}
                        </td>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                          <ScoreBadge score={result?.score ?? null} />
                        </td>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', color: 'var(--muted)', fontSize: 12, maxWidth: 260 }}>
                          <div style={{ color: result?.passed === false ? '#fcd34d' : 'var(--muted)', fontWeight: result?.passed === false ? 700 : 500 }}>
                            {mismatchLabels}
                          </div>
                          {result?.passed === false && result.ai_reason && (
                            <p style={{ margin: '7px 0 0', color: 'var(--muted-2)', fontSize: 11, lineHeight: 1.45 }}>
                              IA : {result.ai_reason}
                            </p>
                          )}
                          {result?.passed === false && result.ai_summary && (
                            <p style={{ margin: '5px 0 0', color: 'var(--muted-2)', fontSize: 11, lineHeight: 1.45 }}>
                              Resume : {result.ai_summary}
                            </p>
                          )}
                        </td>
                        <td style={{ padding: '14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                            <RunEvaluationButton caseId={testCase.id} />
                            {result?.created_at && <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>{new Date(result.created_at).toLocaleString('fr-FR')}</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
