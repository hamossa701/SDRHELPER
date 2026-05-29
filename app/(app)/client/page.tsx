import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getInterestBg, getInterestLabel, formatDate, formatDateShort } from '@/lib/utils'
import type { Call, CallAnalysis, Campaign } from '@/types'

export default async function ClientPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'client') redirect('/login')

  // Get campaigns assigned to this client
  const { data: assignments } = await supabase
    .from('campaign_clients')
    .select('campaign_id')
    .eq('user_id', user.id)

  const campaignIds = assignments?.map(a => a.campaign_id) || []

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .in('id', campaignIds)

  const { data: calls } = await supabase
    .from('calls')
    .select('*, call_analyses(*), campaigns(campaign_name)')
    .in('campaign_id', campaignIds)
    .order('call_datetime', { ascending: false })

  const analyses = calls?.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean) || []
  const rdvBooked = analyses.filter((a: CallAnalysis) => a?.appointment_booked).length
  const avgRdvQ = analyses.length > 0
    ? Math.round(analyses.reduce((s: number, a: CallAnalysis) => s + (a?.appointment_quality_score || 0), 0) / analyses.length)
    : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord client</h1>
        <p className="text-gray-500 text-sm mt-1">Suivi de vos campagnes de prise de rendez-vous</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Appels traités" value={calls?.length || 0} />
        <StatCard label="RDV posés" value={rdvBooked} />
        <StatCard label="Qualité RDV moy." value={avgRdvQ} sub="/100" />
        <StatCard label="Campagnes" value={campaigns?.length || 0} />
      </div>

      {/* Campaigns summary */}
      {(campaigns || []).map((campaign: Campaign) => {
        const campCalls = calls?.filter((c: Call) => c.campaign_id === campaign.id) || []
        const campAnalyses = campCalls.map((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses).filter(Boolean)
        const campRdv = campAnalyses.filter((a: CallAnalysis) => a?.appointment_booked).length
        const campAvgQ = campAnalyses.length > 0
          ? Math.round(campAnalyses.reduce((s: number, a: CallAnalysis) => s + (a?.appointment_quality_score || 0), 0) / campAnalyses.length)
          : 0

        return (
          <Card key={campaign.id} className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{campaign.campaign_name}</h2>
                  {campaign.sector && (
                    <p className="text-xs text-gray-400 mt-0.5">{campaign.sector}</p>
                  )}
                </div>
                <ScoreBadge score={campAvgQ} />
              </div>
              <div className="flex gap-4 mt-3 text-sm text-gray-600">
                <span><strong className="text-gray-900">{campCalls.length}</strong> appels</span>
                <span><strong className="text-gray-900">{campRdv}</strong> RDV posés</span>
                <span><strong className="text-gray-900">{campCalls.length > 0 ? Math.round(campRdv / campCalls.length * 100) : 0}%</strong> taux de conversion</span>
              </div>
            </CardHeader>

            {/* Appointments only */}
            <CardContent className="pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Rendez-vous posés</h3>
              <div className="space-y-3">
                {campAnalyses.filter((a: CallAnalysis) => a?.appointment_booked).length === 0 && (
                  <p className="text-sm text-gray-400">Aucun RDV posé pour l&apos;instant.</p>
                )}
                {campAnalyses
                  .filter((a: CallAnalysis) => a?.appointment_booked)
                  .map((analysis: CallAnalysis) => {
                    const call = campCalls.find((c: Call & { call_analyses: CallAnalysis }) => c.call_analyses?.id === analysis.id)
                    return (
                      <div key={analysis.id} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {analysis.prospect_company || 'Entreprise non précisée'}
                            </p>
                            {analysis.contact_name && (
                              <p className="text-xs text-gray-500">{analysis.contact_name} · {analysis.contact_role}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getInterestBg(analysis.interest_level ?? null)}>
                              {getInterestLabel(analysis.interest_level ?? null)}
                            </Badge>
                            <ScoreBadge score={analysis.appointment_quality_score} />
                          </div>
                        </div>

                        {analysis.appointment_datetime && (
                          <p className="text-xs text-gray-600 mb-1">
                            📅 <strong>RDV :</strong> {formatDate(analysis.appointment_datetime)}
                          </p>
                        )}
                        {analysis.pain_point_details && (
                          <p className="text-xs text-gray-600 mb-1">
                            🎯 <strong>Contexte :</strong> {analysis.pain_point_details}
                          </p>
                        )}
                        {analysis.next_step && (
                          <p className="text-xs text-gray-600">
                            ➡️ <strong>Prochaine étape :</strong> {analysis.next_step}
                          </p>
                        )}
                        {call && (
                          <p className="text-xs text-gray-400 mt-2">Appel du {formatDateShort(call.call_datetime)}</p>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </CardContent>
          </Card>
        )
      })}

      {campaigns?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            Aucune campagne assignée à votre compte.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
