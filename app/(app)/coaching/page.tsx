import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ScoreBadge, StatCard } from '@/components/ui'
import Link from 'next/link'
import type { SDRCoachingStatsRow } from '@/types'

type TrendDir = 'improving' | 'stable' | 'declining'
type Category = 'top' | 'stable' | 'needs_coaching'
interface Priority { label: string; severity: 'high' | 'medium' }

const TREND_CFG: Record<TrendDir, { label: string; color: string }> = {
  improving: { label: '↑ Progression', color: '#86efac' },
  stable:    { label: '→ Stable',      color: 'var(--cyan)' },
  declining: { label: '↓ Régression',  color: '#fca5a5' },
}

const SKILL_LABELS: Record<string, string> = {
  skill_opening:            'Accroche',
  skill_discovery:          'Découverte',
  skill_pain_point:         'Exploration besoin',
  skill_objection_handling: 'Gestion objections',
  skill_qualification:      'Qualification',
  skill_closing:            'Closing',
}

const SKILL_KEYS = [
  'skill_opening', 'skill_discovery', 'skill_pain_point',
  'skill_objection_handling', 'skill_qualification', 'skill_closing',
] as const

function prioritiesFromStats(s: SDRCoachingStatsRow): Priority[] {
  const c: Priority[] = []
  if (s.booked_without_dm_rate   > 0.4) c.push({ label: 'Échoue à confirmer le décideur',           severity: 'high' })
  if (s.booked_without_pain_rate > 0.3) c.push({ label: 'RDV posés sans besoin identifié',           severity: 'high' })
  if (s.missing_next_step_rate   > 0.5) c.push({ label: 'Prochaines étapes souvent manquantes',      severity: 'high' })
  if (s.objection_no_detail_rate > 0.4) c.push({ label: 'Objections non détaillées',                 severity: 'high' })
  else if (s.skill_objection_handling < 55) c.push({ label: 'Traitement des objections insuffisant', severity: 'medium' })
  if (s.skill_qualification < 55) c.push({ label: 'Qualification incomplète',                        severity: 'medium' })
  if (s.skill_discovery     < 50) c.push({ label: 'Découverte insuffisante',                         severity: 'medium' })
  if ((s.avg_sdr_quality ?? 100) < 50) c.push({ label: 'Score SDR globalement faible',               severity: 'medium' })
  return c.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1)).slice(0, 3)
}

function finalCategory(s: SDRCoachingStatsRow, priorities: Priority[]): Category {
  if (s.avg_sdr_quality === null) return 'stable'
  if (s.avg_sdr_quality >= 75) return 'top'
  if (s.avg_sdr_quality < 55 || priorities.some(p => p.severity === 'high')) return 'needs_coaching'
  return 'stable'
}

function SkillBar({ label, score }: { label: string; score: number }) {
  const barColor = score >= 70 ? '#86efac' : score >= 50 ? '#fcd34d' : '#fca5a5'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', width: 140, flexShrink: 0, lineHeight: 1.3 }}>{label}</span>
      <div style={{ flex: 1, height: 6, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(148,163,184,.14)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${score}%` }} />
        </div>
        <div style={{ position: 'absolute', left: '70%', top: -8, width: 1, height: 22, background: 'rgba(255,255,255,.22)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', display: 'block', marginBottom: 2, fontSize: 9, color: 'var(--muted-2)', fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1 }}>70</span>
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 28, textAlign: 'right', color: barColor, flexShrink: 0 }}>{score}</span>
    </div>
  )
}

export default async function CoachingPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: { name: string; value: string; options: object }[]) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) redirect('/login')

  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: statsData } = await supabase.rpc('get_sdr_coaching_stats', {
    p_org_id: profile.organization_id,
    p_since: thirtyDaysAgo,
  })

  const profiles = ((statsData || []) as SDRCoachingStatsRow[]).map(s => {
    const priorities = prioritiesFromStats(s)
    return { ...s, priorities, cat: finalCategory(s, priorities) }
  })

  const top      = profiles.filter(p => p.cat === 'top')
  const needs    = profiles.filter(p => p.cat === 'needs_coaching')
  const improved = profiles.filter(p => p.trend === 'improving' && p.total_calls >= 4)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Coaching SDR</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Basé uniquement sur les données réelles · 30 derniers jours</div>
        </div>
      </div>

      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div className="app-kpi-grid">
          <StatCard label="Top Performers" value={top.length} sub={top.map(p => p.sdr_name).join(', ') || '—'} accent="rgba(34,197,94,.7)" valueColor="#86efac" style={{ borderLeftWidth: 3 }} />
          <StatCard label="En progression" value={improved.length} sub={improved.map(p => p.sdr_name).join(', ') || '—'} accent="rgba(125,211,252,.6)" valueColor="var(--cyan)" style={{ borderLeftWidth: 3 }} />
          <StatCard label="Coaching requis" value={needs.length} sub={needs.map(p => p.sdr_name).join(', ') || '—'} accent="rgba(239,68,68,.7)" valueColor="#fca5a5" style={{ borderLeftWidth: 3 }} />
        </div>

        {profiles.length === 0 && (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)', padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--muted-2)' }}>Aucun SDR dans cette organisation.</div>
          </div>
        )}

        {profiles.map(p => {
          const trend = TREND_CFG[p.trend as TrendDir] ?? TREND_CFG.stable
          const catBg     = p.cat === 'top' ? 'rgba(34,197,94,.10)'   : p.cat === 'needs_coaching' ? 'rgba(239,68,68,.10)'  : 'rgba(125,211,252,.08)'
          const catColor  = p.cat === 'top' ? '#86efac'               : p.cat === 'needs_coaching' ? '#fca5a5'              : 'var(--cyan)'
          const catBorder = p.cat === 'top' ? 'rgba(34,197,94,.35)'   : p.cat === 'needs_coaching' ? 'rgba(239,68,68,.35)'  : 'rgba(125,211,252,.28)'
          const catLabel  = p.cat === 'top' ? 'Top Performer'         : p.cat === 'needs_coaching' ? 'Coaching requis'      : 'Stable'

          return (
            <div key={p.sdr_id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>

              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--indigo),var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.sdr_name.charAt(0)}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.sdr_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{p.total_calls} appel{p.total_calls !== 1 ? 's' : ''} · {p.calls_reviewed} révisé{p.calls_reviewed !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: catBg, color: catColor, border: `1px solid ${catBorder}` }}>{catLabel}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: trend.color }}>{trend.label}</span>
                </div>
              </div>

              <div className="coaching-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr' }}>

                <div style={{ padding: '16px 18px', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Métriques</div>
                  {[
                    { label: 'Score SDR moy.',     node: <ScoreBadge score={p.avg_sdr_quality} /> },
                    { label: 'Qualité RDV moy.',   node: <ScoreBadge score={p.avg_appointment_quality} /> },
                    { label: 'Taux qualification', node: <span style={{ fontSize: 12, fontWeight: 700, color: p.qualification_rate >= 60 ? '#86efac' : p.qualification_rate >= 40 ? '#fcd34d' : '#fca5a5' }}>{p.qualification_rate > 0 ? `${p.qualification_rate}%` : '—'}</span> },
                    { label: 'Taux flags',         node: <span style={{ fontSize: 12, fontWeight: 700, color: (p.review_flag_rate ?? 0) > 50 ? '#fca5a5' : 'var(--muted)' }}>{p.review_flag_rate !== null ? `${p.review_flag_rate}%` : '—'}</span> },
                    { label: 'Confiance IA',       node: <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{p.avg_ai_confidence !== null ? `${p.avg_ai_confidence}%` : '—'}</span> },
                  ].map(({ label, node }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{label}</span>
                      {node}
                    </div>
                  ))}
                </div>

                <div style={{ padding: '16px 18px', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Compétences</div>
                  {SKILL_KEYS.map(key => (
                    <SkillBar key={key} label={SKILL_LABELS[key]} score={p[key] as number} />
                  ))}
                </div>

                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Priorités coaching</div>
                  {p.priorities.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted-2)', marginBottom: 16 }}>Aucune priorité identifiée</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {p.priorities.map((pr, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ flexShrink: 0, marginTop: 3, width: 6, height: 6, borderRadius: '50%', background: pr.severity === 'high' ? '#fca5a5' : '#fcd34d', display: 'inline-block' }} />
                          <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{pr.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Appels à écouter</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.best_call_id && (
                      <Link href={`/calls/${p.best_call_id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#86efac', flexShrink: 0, marginTop: 1 }}>✓</span>
                        <span style={{ fontSize: 12, color: 'var(--cyan)' }}>Meilleur appel à partager</span>
                      </Link>
                    )}
                    {p.worst_call_id && p.worst_call_id !== p.best_call_id && (
                      <Link href={`/calls/${p.worst_call_id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#fca5a5', flexShrink: 0, marginTop: 1 }}>✗</span>
                        <span style={{ fontSize: 12, color: 'var(--cyan)' }}>Appel à analyser ensemble</span>
                      </Link>
                    )}
                    {!p.best_call_id && (
                      <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>Pas encore d&apos;appels analysés</span>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )
        })}

      </div>
    </div>
  )
}
