import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardHeader, Badge, ScoreBadge } from '@/components/ui'
import { getCampaignStatusBg, getCampaignStatusLabel } from '@/lib/utils'
import Link from 'next/link'
import type { Campaign, Call, CallAnalysis } from '@/types'

export default async function CampaignsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const { data: calls } = await supabase
    .from('calls')
    .select('campaign_id, call_analyses(appointment_booked, appointment_quality_score)')
    .eq('organization_id', profile.organization_id)

  // Compute per-campaign stats
  const campaignStats = (campaigns || []).map((c: Campaign) => {
    const cc = calls?.filter((call: { campaign_id: string }) => call.campaign_id === c.id) || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const an = cc.map((call: any) => call.call_analyses).filter(Boolean)
    const rdv = an.filter((a: CallAnalysis) => a?.appointment_booked).length
    const avg = an.length > 0
      ? Math.round(an.reduce((s: number, a: CallAnalysis) => s + (a?.appointment_quality_score || 0), 0) / an.length)
      : null
    return { ...c, totalCalls: cc.length, rdvBooked: rdv, avgQuality: avg }
  })

  const canCreate = ['owner', 'manager'].includes(profile.role)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campagnes</h1>
          <p className="text-gray-500 text-sm mt-1">{campaigns?.length || 0} campagne(s)</p>
        </div>
        {canCreate && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            + Nouvelle campagne
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {campaignStats.length === 0 && (
          <Card>
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              Aucune campagne créée.
              {canCreate && <> <Link href="/campaigns/new" className="text-slate-600 underline ml-1">Créer la première</Link>.</>}
            </div>
          </Card>
        )}

        {campaignStats.map(c => (
          <Link key={c.id} href={`/campaigns/${c.id}`}>
            <Card className="hover:border-gray-300 transition-colors cursor-pointer">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">{c.campaign_name}</h3>
                    <Badge className={getCampaignStatusBg(c.status)}>
                      {getCampaignStatusLabel(c.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    Client : <strong className="text-gray-700">{c.client_name}</strong>
                    {c.sector && <> · {c.sector}</>}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {c.totalCalls} appel(s) · {c.rdvBooked} RDV posé(s)
                  </p>
                </div>
                <div className="flex items-center gap-4 ml-6 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-1">Qualité RDV</p>
                    <ScoreBadge score={c.avgQuality} />
                  </div>
                  <span className="text-gray-300">→</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
