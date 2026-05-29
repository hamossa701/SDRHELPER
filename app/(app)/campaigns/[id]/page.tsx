import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, Badge, ScoreBadge } from '@/components/ui'
import { getCampaignStatusBg, getCampaignStatusLabel, getInterestBg, getInterestLabel, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import type { Call, CallAnalysis, User } from '@/types'

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).single()
  if (!campaign) notFound()

  const { data: calls } = await supabase
    .from('calls')
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name)')
    .eq('campaign_id', id)
    .order('call_datetime', { ascending: false })

  const analyses = calls?.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean) || []
  const rdvBooked = analyses.filter((a: CallAnalysis) => a?.appointment_booked).length
  const avgQ = analyses.length > 0
    ? Math.round(analyses.reduce((s: number, a: CallAnalysis) => s + (a?.appointment_quality_score || 0), 0) / analyses.length)
    : null

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link href="/campaigns" className="text-xs text-slate-400 hover:text-slate-300 mb-3 inline-block">← Campagnes</Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{campaign.campaign_name}</h1>
              <Badge className={getCampaignStatusBg(campaign.status)}>{getCampaignStatusLabel(campaign.status)}</Badge>
            </div>
            <p className="text-slate-400 text-sm">Client : <strong className="text-slate-200">{campaign.client_name}</strong></p>
          </div>
          {['owner', 'manager'].includes(profile.role) && (
            <Link href="/calls/upload" className="inline-flex items-center gap-2 bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
              + Analyser un appel
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Appels</p>
          <p className="text-3xl font-bold mt-1">{calls?.length || 0}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wide">RDV posés</p>
          <p className="text-3xl font-bold mt-1">{rdvBooked}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Qualité RDV moy.</p>
          <div className="mt-1"><ScoreBadge score={avgQ} /></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {campaign.offer_description && (
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Offre</h3></CardHeader>
            <CardContent><p className="text-sm text-slate-400">{campaign.offer_description}</p></CardContent>
          </Card>
        )}
        {campaign.target_persona && (
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Persona cible</h3></CardHeader>
            <CardContent><p className="text-sm text-slate-400">{campaign.target_persona}</p></CardContent>
          </Card>
        )}
        {campaign.script_notes && (
          <Card className="lg:col-span-2">
            <CardHeader><h3 className="text-sm font-semibold">Notes script</h3></CardHeader>
            <CardContent><p className="text-sm text-slate-400">{campaign.script_notes}</p></CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold">Appels de la campagne</h2></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">SDR</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Prospect</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Intérêt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">RDV</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Score RDV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(calls || []).map((call: Call & { call_analyses: CallAnalysis, users: User }) => (
                <tr key={call.id} className="hover:bg-white/5">
                  <td className="px-6 py-3 text-slate-400">{formatDateShort(call.call_datetime)}</td>
                  <td className="px-6 py-3 font-medium text-slate-200">{call.users?.name || '—'}</td>
                  <td className="px-6 py-3 text-slate-400">{call.call_analyses?.prospect_company || '—'}</td>
                  <td className="px-6 py-3">
                    <Badge className={getInterestBg(call.call_analyses?.interest_level ?? null)}>
                      {getInterestLabel(call.call_analyses?.interest_level ?? null)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    {call.call_analyses?.appointment_booked
                      ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">✓</Badge>
                      : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-6 py-3">
                    <Link href={`/calls/${call.id}`}>
                      <ScoreBadge score={call.call_analyses?.appointment_quality_score ?? null} />
                    </Link>
                  </td>
                </tr>
              ))}
              {!calls?.length && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">Aucun appel pour cette campagne</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
