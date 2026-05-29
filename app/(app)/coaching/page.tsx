import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor } from '@/lib/utils'
import Link from 'next/link'
import type { SDRCoachingStatsRow } from '@/types'

type TrendDir = 'improving' | 'stable' | 'declining'
type Category = 'top' | 'stable' | 'needs_coaching'
interface Priority { label: string; severity: 'high' | 'medium' }

const TREND_CFG: Record<TrendDir, { label: string; cls: string }> = {
  improving: { label: '↑ Progression', cls: 'text-emerald-600' },
  stable:    { label: '→ Stable',      cls: 'text-blue-600'    },
  declining: { label: '↓ Régression',  cls: 'text-red-500'     },
}

const SKILL_LABELS: Record<string, string> = {
  skill_opening:            'Accroche',
  skill_discovery:          'Découverte',
  skill_pain_point:         'Exploration besoin',
  skill_objection_handling: 'Gestion objections',
  skill_qualification:      'Qualification',
  skill_closing:            'Closing / Prochaine étape',
}
const SKILL_KEYS = [
  'skill_opening', 'skill_discovery', 'skill_pain_point',
  'skill_objection_handling', 'skill_qualification', 'skill_closing',
] as const

function prioritiesFromStats(s: SDRCoachingStatsRow): Priority[] {
  const c: Priority[] = []
  if (s.booked_without_dm_rate   > 0.4) c.push({ label: 'Échoue fréquemment à confirmer le décideur',              severity: 'high' })
  if (s.booked_without_pain_rate > 0.3) c.push({ label: 'RDV posés sans besoin identifié',                          severity: 'high' })
  if (s.missing_next_step_rate   > 0.5) c.push({ label: 'Prochaines étapes souvent manquantes',                     severity: 'high' })
  if (s.objection_no_detail_rate > 0.4) c.push({ label: 'Objections détectées mais non détaillées',                severity: 'high' })
  else if (s.skill_objection_handling < 55) c.push({ label: 'Traitement des objections insuffisant',               severity: 'medium' })
  if (s.skill_qualification < 55) c.push({ label: 'Qualification incomplète sur la majorité des appels',           severity: 'medium' })
  if (s.skill_discovery     < 50) c.push({ label: 'Découverte insuffisante — décideur, besoin, urgence non explorés', severity: 'medium' })
  if ((s.avg_sdr_quality ?? 100) < 50) c.push({ label: 'Score SDR globalement faible — revoir la structure des appels', severity: 'medium' })
  return c
    .sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1))
    .slice(0, 3)
}

function finalCategory(s: SDRCoachingStatsRow, priorities: Priority[]): Category {
  if (s.avg_sdr_quality === null) return 'stable'
  if (s.avg_sdr_quality >= 75) return 'top'
  if (s.avg_sdr_quality < 55 || priorities.some(p => p.severity === 'high')) return 'needs_coaching'
  return 'stable'
}

function SkillBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-40 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${getScoreColor(score)}`}>{score}</span>
    </div>
  )
}

export default async function CoachingPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) redirect('/login')

  // Single RPC call aggregates all per-SDR stats in SQL — no full call fetch
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: statsData } = await supabase.rpc('get_sdr_coaching_stats', {
    p_org_id: profile.organization_id,
    p_since:  thirtyDaysAgo,
  })

  const profiles = ((statsData || []) as SDRCoachingStatsRow[]).map(s => {
    const priorities = prioritiesFromStats(s)
    return { ...s, priorities, cat: finalCategory(s, priorities) }
  })

  const top      = profiles.filter(p => p.cat === 'top')
  const needs    = profiles.filter(p => p.cat === 'needs_coaching')
  const improved = profiles.filter(p => p.trend === 'improving' && p.total_calls >= 4)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Coaching SDR</h1>
        <p className="text-gray-500 text-sm mt-1">Basé uniquement sur les données réelles — aucune invention</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-5 border-l-4 border-emerald-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top Performers</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{top.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{top.map(p => p.sdr_name).join(', ') || '—'}</p>
        </Card>
        <Card className="p-5 border-l-4 border-amber-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">En progression</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{improved.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{improved.map(p => p.sdr_name).join(', ') || '—'}</p>
        </Card>
        <Card className="p-5 border-l-4 border-red-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coaching requis</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{needs.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{needs.map(p => p.sdr_name).join(', ') || '—'}</p>
        </Card>
      </div>

      {profiles.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-gray-400">Aucun SDR dans cette organisation.</CardContent></Card>
      )}

      <div className="space-y-6">
        {profiles.map(p => {
          const trend   = TREND_CFG[p.trend as TrendDir] ?? TREND_CFG.stable
          const catCls  = p.cat === 'top'            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : p.cat === 'needs_coaching'              ? 'bg-red-50 text-red-600 border-red-200'
            : 'bg-gray-100 text-gray-600 border-gray-200'
          const catLabel = p.cat === 'top' ? 'Top Performer' : p.cat === 'needs_coaching' ? 'Coaching requis' : 'Stable'

          return (
            <Card key={p.sdr_id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
                      {p.sdr_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.sdr_name}</p>
                      <p className="text-xs text-gray-400">{p.total_calls} appel(s) · {p.calls_reviewed} révisé(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={catCls}>{catLabel}</Badge>
                    <span className={`text-xs font-medium ${trend.cls}`}>{trend.label}</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                {/* Performance metrics */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Métriques</p>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'Score SDR moy.',     node: <ScoreBadge score={p.avg_sdr_quality} /> },
                      { label: 'Qualité RDV moy.',   node: <ScoreBadge score={p.avg_appointment_quality} /> },
                      { label: 'Taux qualification', node: <span className={`font-semibold text-sm ${getScoreColor(p.qualification_rate)}`}>{p.qualification_rate > 0 ? `${p.qualification_rate}%` : '—'}</span> },
                      { label: 'Taux flags',         node: <span className={`font-semibold text-sm ${(p.review_flag_rate ?? 0) > 50 ? 'text-red-500' : 'text-gray-700'}`}>{p.review_flag_rate !== null ? `${p.review_flag_rate}%` : '—'}</span> },
                      { label: 'Confiance IA moy.',  node: <span className="font-medium text-sm text-gray-700">{p.avg_ai_confidence !== null ? `${p.avg_ai_confidence}%` : '—'}</span> },
                    ].map(({ label, node }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-gray-500">{label}</span>
                        {node}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skill breakdown */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Compétences</p>
                  <div className="space-y-2.5">
                    {SKILL_KEYS.map(key => (
                      <SkillBar key={key} label={SKILL_LABELS[key]} score={p[key] as number} />
                    ))}
                  </div>
                </div>

                {/* Priorities + example calls */}
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Priorités coaching</p>
                    {p.priorities.length === 0
                      ? <p className="text-xs text-gray-400">Aucune priorité identifiée</p>
                      : <ul className="space-y-1.5">
                          {p.priorities.map((pr, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <span className={pr.severity === 'high' ? 'text-red-500 mt-0.5' : 'text-amber-500 mt-0.5'}>●</span>
                              <span className="text-gray-700">{pr.label}</span>
                            </li>
                          ))}
                        </ul>
                    }
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Appels à écouter</p>
                    <ul className="space-y-2">
                      {p.best_call_id && (
                        <li>
                          <Link href={`/calls/${p.best_call_id}`} className="flex items-start gap-2 group">
                            <span className="text-xs text-emerald-500 mt-0.5 shrink-0">✓</span>
                            <p className="text-xs text-gray-700 group-hover:text-slate-900">Meilleur appel à partager</p>
                          </Link>
                        </li>
                      )}
                      {p.worst_call_id && p.worst_call_id !== p.best_call_id && (
                        <li>
                          <Link href={`/calls/${p.worst_call_id}`} className="flex items-start gap-2 group">
                            <span className="text-xs text-red-400 mt-0.5 shrink-0">✗</span>
                            <p className="text-xs text-gray-700 group-hover:text-slate-900">Appel à analyser ensemble</p>
                          </Link>
                        </li>
                      )}
                      {!p.best_call_id && <p className="text-xs text-gray-400">Pas encore d&apos;appels analysés</p>}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
