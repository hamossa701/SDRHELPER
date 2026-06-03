import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Empty, ScoreBadge, StatusBadge } from '@/components/ui'
import Link from 'next/link'
import type { CallAnalysis, Campaign } from '@/types'

type CampaignRow = Campaign & {
  totalCalls: number
  rdvBooked: number
  avgQuality: number | null
}

type CampaignCallMetric = {
  campaign_id: string
  call_analyses: Pick<CallAnalysis, 'appointment_booked' | 'appointment_quality_score'> | Pick<CallAnalysis, 'appointment_booked' | 'appointment_quality_score'>[] | null
}
type AnalysisMetric = Pick<CallAnalysis, 'appointment_booked' | 'appointment_quality_score'>

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function CampaignsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) { try { cookiesToSet.forEach(({name,value,options}) => cookieStore.set(name,value,options)) } catch {} } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  let teamSdrIds: string[] = []
  let campaignQuery = supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  if (profile.role === 'manager') {
    const { data: teamSdrs } = await supabase
      .from('users')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('role', 'sdr')
      .eq('manager_id', user.id)
    teamSdrIds = (teamSdrs ?? []).map((s) => s.id)
    const { data: assignments } = teamSdrIds.length
      ? await supabase.from('campaign_sdrs').select('campaign_id').in('user_id', teamSdrIds)
      : { data: [] }
    const campaignIds = [...new Set((assignments ?? []).map((a) => a.campaign_id))]
    campaignQuery = campaignIds.length ? campaignQuery.in('id', campaignIds) : campaignQuery.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  if (profile.role === 'sdr') {
    const { data: assignments } = await supabase.from('campaign_sdrs').select('campaign_id').eq('user_id', user.id)
    const campaignIds = (assignments ?? []).map((a) => a.campaign_id)
    campaignQuery = campaignIds.length ? campaignQuery.in('id', campaignIds) : campaignQuery.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data: campaigns } = await campaignQuery
  let callsQuery = supabase.from('calls').select('campaign_id, call_analyses(appointment_booked, appointment_quality_score)').eq('organization_id', profile.organization_id)
  if (profile.role === 'manager') callsQuery = teamSdrIds.length ? callsQuery.in('sdr_id', teamSdrIds) : callsQuery.eq('sdr_id', '00000000-0000-0000-0000-000000000000')
  if (profile.role === 'sdr') callsQuery = callsQuery.eq('sdr_id', user.id)
  const { data: calls } = await callsQuery

  const callRows = (calls || []) as CampaignCallMetric[]
  const stats: CampaignRow[] = ((campaigns || []) as Campaign[]).map((c) => {
    const cc = callRows.filter((x) => x.campaign_id === c.id)
    const an = cc.map((x) => one(x.call_analyses)).filter((a): a is AnalysisMetric => Boolean(a))
    const rdv = an.filter((a) => a.appointment_booked).length
    const avg = an.length > 0 ? Math.round(an.reduce((s, a) => s + (a.appointment_quality_score || 0), 0) / an.length) : null
    return { ...c, totalCalls: cc.length, rdvBooked: rdv, avgQuality: avg }
  })

  const canCreate = ['owner', 'manager'].includes(profile.role)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        .campaign-row:hover {
          border-color: rgba(125,211,252,.35) !important;
          background: linear-gradient(180deg,rgba(15,23,42,.86),rgba(10,16,32,.76)) !important;
        }
        @media (max-width: 720px) {
          .campaign-list-card { align-items: flex-start !important; flex-direction: column !important; }
          .campaign-list-metrics { margin-left: 0 !important; }
        }
      `}</style>
      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', minHeight: 56, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, backdropFilter: 'blur(18px)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Campagnes</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{stats.length} campagne{stats.length !== 1 ? 's' : ''} suivie{stats.length !== 1 ? 's' : ''}</div>
        </div>
        {canCreate && (
          <Link href="/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.18)' }}>
            <span className="mat" style={{ fontSize: 16 }}>add</span> Nouvelle campagne
          </Link>
        )}
      </div>

      <div className="app-scroll">
        <div className="app-content" style={{ gap: 12 }}>
          {stats.length === 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
              <Empty
                title="Aucune campagne créée"
                description={canCreate ? 'Créez une campagne pour assigner les SDRs et suivre les appels analysés.' : 'Vos campagnes assignées apparaîtront ici dès leur activation.'}
                action={canCreate ? (
                  <Link href="/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)' }}>
                    <span className="mat" style={{ fontSize: 15 }}>add</span>
                    Nouvelle campagne
                  </Link>
                ) : null}
              />
            </div>
          )}
          {stats.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} style={{ textDecoration: 'none' }}>
              <div className="campaign-row campaign-list-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, backdropFilter: 'blur(18px)', cursor: 'pointer', transition: 'border-color .15s, background .15s', boxShadow: 'var(--shadow)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.campaign_name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                    <span><span style={{ color: 'var(--muted-2)' }}>Client</span> <span style={{ color: 'var(--text)', fontWeight: 650 }}>{c.client_name}</span></span>
                    {c.sector && <span>{c.sector}</span>}
                    <span style={{ color: 'var(--muted-2)' }}>{c.totalCalls} appel{c.totalCalls !== 1 ? 's' : ''} · {c.rdvBooked} RDV</span>
                  </div>
                </div>
                <div className="campaign-list-metrics" style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 20, flexShrink: 0 }}>
                  <ScoreBadge score={c.avgQuality} />
                  <span className="mat" style={{ fontSize: 16, color: 'var(--muted-2)' }}>arrow_forward</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
