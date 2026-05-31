import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import type { CallAnalysis, SDRDashboardKPIs } from '@/types'

export default async function SDRPage() {
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

  const [{ data: kpisData }, { data: calls }] = await Promise.all([
    supabase.rpc('get_sdr_dashboard_kpis', { p_sdr_id: user.id }),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses(appointment_booked, sdr_quality_score, prospect_company, interest_level, strengths, weaknesses, coaching_recommendations), campaigns(campaign_name, client_name)')
      .eq('sdr_id', user.id)
      .order('call_datetime', { ascending: false })
      .limit(50),
  ])

  const kpis: SDRDashboardKPIs = kpisData?.[0] ?? {
    total_calls: 0, rdv_booked: 0, avg_rdv_quality: null, avg_sdr_quality: null, conversion_rate: 0,
  }

  const analyses = (calls || []).map((c: { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean) as CallAnalysis[]
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
              <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{calls?.length || 0} appel{(calls?.length || 0) !== 1 ? 's' : ''}</span>
            </div>
            {!calls?.length ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Aucun appel analysé</div>
                <div style={{ fontSize: 12, color: 'var(--muted-2)', marginBottom: 16 }}>Analysez votre premier appel pour voir vos performances.</div>
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
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Intérêt</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>RDV</th>
                      <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Mon score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={call.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 18px', color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>{formatDateShort(call.call_datetime)}</td>
                        <td style={{ padding: '11px 18px', fontWeight: 600, color: 'var(--text)' }}>{call.call_analyses?.prospect_company || '—'}</td>
                        <td style={{ padding: '11px 18px' }}>
                          <Badge className={getInterestBg(call.call_analyses?.interest_level ?? null)}>
                            {getInterestLabel(call.call_analyses?.interest_level ?? null)}
                          </Badge>
                        </td>
                        <td style={{ padding: '11px 18px' }}>
                          {call.call_analyses?.appointment_booked
                            ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">✓ Posé</Badge>
                            : <span style={{ color: 'var(--muted-2)' }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 18px' }}>
                          <Link href={`/calls/${call.id}`}><ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} /></Link>
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
