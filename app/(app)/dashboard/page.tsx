import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getCampaignStatusBg, getCampaignStatusLabel, getScoreColor, formatDateShort } from '@/lib/utils'
import { computeCampaignHealthScore, isQualifiedAppointment } from '@/lib/review-flags'
import { buildSDRProfile, computeTrend } from '@/lib/coaching'
import Link from 'next/link'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c) { try { c.forEach(({name,value,options}) => cookieStore.set(name,value,options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/login')

  const { data: campaigns } = await supabase
    .from('campaigns').select('*').eq('organization_id', profile.organization_id).order('created_at', { ascending: false })

  const { data: calls } = await supabase
    .from('calls').select('*, call_analyses(*), users!calls_sdr_id_fkey(name)')
    .eq('organization_id', profile.organization_id).order('call_datetime', { ascending: false }).limit(500)

  const { data: sdrs } = await supabase
    .from('users').select('*').eq('organization_id', profile.organization_id).eq('role', 'sdr')

  const totalCalls = calls?.length || 0
  const analyses = calls?.map((c: any) => c.call_analyses).filter(Boolean) || []
  const appointmentsBooked = analyses.filter((a: any) => a?.appointment_booked).length
  const qualifiedAppointments = analyses.filter((a: any) => a && isQualifiedAppointment(a)).length
  const avgAppointmentQuality = analyses.length > 0
    ? Math.round(analyses.reduce((s: number, a: any) => s + (a?.appointment_quality_score || 0), 0) / analyses.length) : 0
  const avgSdrQuality = analyses.length > 0
    ? Math.round(analyses.reduce((s: number, a: any) => s + (a?.sdr_quality_score || 0), 0) / analyses.length) : 0
  const activeCampaigns = campaigns?.filter((c: any) => c.status === 'active').length || 0

  const sdrStats = (sdrs || []).map((sdr: any) => {
    const sdrCalls = calls?.filter((c: any) => c.sdr_id === sdr.id) || []
    const sdrAnalyses = sdrCalls.map((c: any) => c.call_analyses).filter(Boolean)
    const avgQ = sdrAnalyses.length > 0 ? Math.round(sdrAnalyses.reduce((s: number, a: any) => s + (a?.sdr_quality_score || 0), 0) / sdrAnalyses.length) : 0
    return { ...sdr, totalCalls: sdrCalls.length, avgQuality: avgQ, rdvBooked: sdrAnalyses.filter((a: any) => a?.appointment_booked).length }
  }).sort((a: any, b: any) => b.avgQuality - a.avgQuality)

  // Part 6 — SDR coaching overview for owner
  const sdrProfiles = ((sdrs || []) as any[]).map((sdr: any) => {
    const sdrCalls = (calls || []).filter((c: any) => c.sdr_id === sdr.id)
    return buildSDRProfile(sdr, sdrCalls as any)
  }).sort((a: any, b: any) => (b.avgSdrQuality ?? 0) - (a.avgSdrQuality ?? 0))
  const bestSdr    = sdrProfiles[0] || null
  const weakestSdr = sdrProfiles[sdrProfiles.length - 1] || null
  const needsCoachingCount = sdrProfiles.filter((p: any) => p.category === 'needs_coaching').length
  const allAnalyses = (calls || []).map((c: any) => c.call_analyses).filter(Boolean)
  const teamTrend = computeTrend([...allAnalyses].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
  const teamTrendLabel = teamTrend === 'improving' ? '↑ Équipe en progression' : teamTrend === 'declining' ? '↓ Équipe en régression' : '→ Équipe stable'
  const teamTrendCls   = teamTrend === 'improving' ? 'text-emerald-600' : teamTrend === 'declining' ? 'text-red-500' : 'text-blue-600'

  // Part 3 — campaign health score per campaign
  const campaignStats = (campaigns || []).map((c: any) => {
    const cc = calls?.filter((call: any) => call.campaign_id === c.id) || []
    const an = cc.map((call: any) => call.call_analyses).filter(Boolean)
    const avgQ = an.length > 0 ? Math.round(an.reduce((s: number, a: any) => s + (a?.appointment_quality_score || 0), 0) / an.length) : 0
    const health = computeCampaignHealthScore(an)
    return { ...c, totalCalls: cc.length, avgQuality: avgQ, rdvBooked: an.filter((a: any) => a?.appointment_booked).length, health }
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble</h1>
        <p className="text-gray-500 text-sm mt-1">Supervision globale de votre activité</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Appels analysés" value={totalCalls} />
        <StatCard label="RDV posés" value={appointmentsBooked} />
        <StatCard label="RDV qualifiés" value={qualifiedAppointments} sub="décideur + besoin + date + score ≥60" />
        <StatCard label="Qualité RDV moy." value={avgAppointmentQuality} sub="/100" />
        <StatCard label="Qualité SDR moy." value={avgSdrQuality} sub="/100" />
        <StatCard label="Campagnes actives" value={activeCampaigns} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Part 3 — campaign list with health score */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Campagnes</h2>
                <Link href="/campaigns" className="text-xs text-slate-600 hover:underline">Voir tout →</Link>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {campaignStats.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">Aucune campagne</div>}
              {campaignStats.map((c: any) => (
                <Link key={c.id} href={`/campaigns/${c.id}`}>
                  <div className="px-6 py-3 hover:bg-gray-50 flex items-center justify-between transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.campaign_name}</p>
                      <p className="text-xs text-gray-400">{c.client_name} · {c.totalCalls} appel(s) · {c.rdvBooked} RDV</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {c.totalCalls > 0 && (
                        <Badge className={c.health.labelBg}>{c.health.label} {c.health.score}/100</Badge>
                      )}
                      <Badge className={getCampaignStatusBg(c.status)}>{getCampaignStatusLabel(c.status)}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Classement SDR</h2></CardHeader>
            <CardContent className="px-0 pb-0">
              {sdrStats.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">Aucun SDR</div>}
              {sdrStats.map((sdr: any, i: number) => (
                <div key={sdr.id} className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 last:border-0">
                  <span className={`text-lg font-bold w-5 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{sdr.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sdr.name}</p>
                    <p className="text-xs text-gray-400">{sdr.totalCalls} appels · {sdr.rdvBooked} RDV</p>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(sdr.avgQuality)}`}>{sdr.avgQuality || '—'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Part 6 — Owner coaching overview */}
      {sdrProfiles.length > 0 && (
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Meilleur SDR</p>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate">{bestSdr?.sdrName || '—'}</p>
            <p className="text-xs text-gray-400">Score moy. {bestSdr?.avgSdrQuality ?? '—'}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">SDR à coacher</p>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate">{weakestSdr?.sdrName || '—'}</p>
            <p className="text-xs text-gray-400">Score moy. {weakestSdr?.avgSdrQuality ?? '—'}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Charge coaching</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{needsCoachingCount}</p>
            <p className="text-xs text-gray-400">SDR nécessitant coaching</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tendance équipe</p>
            <p className={`text-lg font-bold mt-1 ${teamTrendCls}`}>{teamTrendLabel}</p>
            <Link href="/coaching" className="text-xs text-slate-500 hover:underline">Voir coaching →</Link>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900">Appels récents</h2></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">SDR</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Prospect</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">RDV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Qualité RDV</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Score SDR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(calls || []).slice(0, 10).map((call: any) => (
                  <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{formatDateShort(call.call_datetime)}</td>
                    <td className="px-6 py-3 font-medium text-gray-800">{call.users?.name || '—'}</td>
                    <td className="px-6 py-3 text-gray-600">{call.call_analyses?.prospect_company || '—'}</td>
                    <td className="px-6 py-3">
                      {call.call_analyses?.appointment_booked ? (
                        isQualifiedAppointment(call.call_analyses)
                          ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Qualifié</Badge>
                          : <Badge className="bg-amber-50 text-amber-700 border-amber-200">~ Posé</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500 border-gray-200">Non</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3"><Link href={`/calls/${call.id}`}><ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} /></Link></td>
                    <td className="px-6 py-3"><ScoreBadge score={call.call_analyses?.sdr_quality_score ?? null} /></td>
                  </tr>
                ))}
                {(!calls || calls.length === 0) && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Aucun appel analysé pour l&apos;instant</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
