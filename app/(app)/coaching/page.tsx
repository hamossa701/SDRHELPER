import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, Badge, ScoreBadge } from '@/components/ui'
import { getScoreColor, formatDateShort } from '@/lib/utils'
import { buildSDRProfile } from '@/lib/coaching'
import Link from 'next/link'
import type { Call, CallAnalysis, User, Campaign } from '@/types'
import type { SDRProfile, TrendDirection } from '@/lib/coaching'

type CallRow = Call & { call_analyses: CallAnalysis; campaigns: Campaign | null }

const TREND_CFG: Record<TrendDirection, { label: string; cls: string }> = {
  improving: { label: '↑ Progression', cls: 'text-emerald-600' },
  stable:    { label: '→ Stable',      cls: 'text-blue-600' },
  declining: { label: '↓ Régression',  cls: 'text-red-500' },
}

const SKILL_LABELS: Record<string, string> = {
  opening:            'Accroche',
  discovery:          'Découverte',
  pain_point:         'Exploration besoin',
  objection_handling: 'Gestion objections',
  qualification:      'Qualification',
  closing:            'Closing / Prochaine étape',
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

  const [{ data: sdrs }, { data: allCalls }] = await Promise.all([
    supabase.from('users').select('*').eq('organization_id', profile.organization_id).eq('role', 'sdr'),
    supabase.from('calls')
      .select('*, call_analyses(*), campaigns(campaign_name, client_name)')
      .eq('organization_id', profile.organization_id)
      .gte('call_datetime', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order('call_datetime', { ascending: false })
      .limit(500),
  ])

  const profiles: SDRProfile[] = ((sdrs || []) as User[]).map(sdr => {
    const sdrCalls = ((allCalls || []) as CallRow[]).filter(c => c.sdr_id === sdr.id)
    return buildSDRProfile(sdr, sdrCalls as any)
  }).sort((a, b) => (b.avgSdrQuality ?? 0) - (a.avgSdrQuality ?? 0))

  const top    = profiles.filter(p => p.category === 'top')
  const needs  = profiles.filter(p => p.category === 'needs_coaching')
  const improved = profiles.filter(p => p.trend === 'improving' && p.totalCalls >= 3)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Coaching SDR</h1>
        <p className="text-gray-500 text-sm mt-1">Basé uniquement sur les données réelles — aucune invention</p>
      </div>

      {/* Part 5 — Leaderboard summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-5 border-l-4 border-emerald-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top Performers</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{top.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{top.map(p => p.sdrName).join(', ') || '—'}</p>
        </Card>
        <Card className="p-5 border-l-4 border-amber-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">En progression</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{improved.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{improved.map(p => p.sdrName).join(', ') || '—'}</p>
        </Card>
        <Card className="p-5 border-l-4 border-red-400">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coaching requis</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{needs.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{needs.map(p => p.sdrName).join(', ') || '—'}</p>
        </Card>
      </div>

      {profiles.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-gray-400">Aucun SDR dans cette organisation.</CardContent></Card>
      )}

      <div className="space-y-6">
        {profiles.map(p => {
          const trend = TREND_CFG[p.trend]
          const catCls =
            p.category === 'top'            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            p.category === 'needs_coaching' ? 'bg-red-50 text-red-600 border-red-200' :
                                              'bg-gray-100 text-gray-600 border-gray-200'
          const catLabel =
            p.category === 'top'            ? 'Top Performer' :
            p.category === 'needs_coaching' ? 'Coaching requis' : 'Stable'

          return (
            <Card key={p.sdrId}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
                      {p.sdrName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.sdrName}</p>
                      <p className="text-xs text-gray-400">{p.totalCalls} appel(s) · {p.callsReviewed} révisé(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={catCls}>{catLabel}</Badge>
                    <span className={`text-xs font-medium ${trend.cls}`}>{trend.label}</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                {/* Part 1 — Performance metrics */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Métriques</p>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'Score SDR moy.',     node: <ScoreBadge score={p.avgSdrQuality} /> },
                      { label: 'Qualité RDV moy.',   node: <ScoreBadge score={p.avgAppointmentQuality} /> },
                      { label: 'Taux qualification', node: <span className={`font-semibold text-sm ${getScoreColor(p.qualificationRate)}`}>{p.qualificationRate !== null ? `${p.qualificationRate}%` : '—'}</span> },
                      { label: 'Taux flags',         node: <span className={`font-semibold text-sm ${p.reviewFlagRate !== null && p.reviewFlagRate > 50 ? 'text-red-500' : 'text-gray-700'}`}>{p.reviewFlagRate !== null ? `${p.reviewFlagRate}%` : '—'}</span> },
                      { label: 'Confiance IA moy.',  node: <span className="font-medium text-sm text-gray-700">{p.avgAiConfidence !== null ? `${p.avgAiConfidence}%` : '—'}</span> },
                    ].map(({ label, node }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-gray-500">{label}</span>
                        {node}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Part 2 — Skill breakdown */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Compétences</p>
                  <div className="space-y-2.5">
                    {(Object.entries(p.skills) as [string, number][]).map(([key, score]) => (
                      <SkillBar key={key} label={SKILL_LABELS[key] || key} score={score} />
                    ))}
                  </div>
                </div>

                {/* Part 3 + 4 — Priorities & coaching calls */}
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
                    {p.coachingCalls.length === 0
                      ? <p className="text-xs text-gray-400">Pas encore d&apos;appels analysés</p>
                      : <ul className="space-y-2">
                          {p.coachingCalls.map((c, i) => (
                            <li key={i}>
                              <Link href={`/calls/${c.callId}`} className="flex items-start gap-2 group">
                                <span className={`text-xs mt-0.5 shrink-0 ${c.type === 'positive' ? 'text-emerald-500' : 'text-red-400'}`}>
                                  {c.type === 'positive' ? '✓' : '✗'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs text-gray-700 group-hover:text-slate-900">{c.reason}</p>
                                  <p className="text-xs text-gray-400">{c.prospect} · {formatDateShort(c.callDate)}</p>
                                </div>
                              </Link>
                            </li>
                          ))}
                        </ul>
                    }
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
