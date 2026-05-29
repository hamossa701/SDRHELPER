import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ScoreBadge, StatusBadge } from '@/components/ui'
import Link from 'next/link'

export default async function CampaignsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const { data: campaigns } = await supabase.from('campaigns').select('*').eq('organization_id', profile.organization_id).order('created_at', { ascending: false })
  const { data: calls } = await supabase.from('calls').select('campaign_id, call_analyses(appointment_booked, appointment_quality_score)').eq('organization_id', profile.organization_id)

  const stats = (campaigns || []).map((c: any) => {
    const cc = calls?.filter((x: any) => x.campaign_id === c.id) || []
    const an = cc.map((x: any) => x.call_analyses).filter(Boolean)
    const rdv = an.filter((a: any) => a?.appointment_booked).length
    const avg = an.length > 0 ? Math.round(an.reduce((s: number, a: any) => s + (a?.appointment_quality_score || 0), 0) / an.length) : null
    return { ...c, totalCalls: cc.length, rdvBooked: rdv, avgQuality: avg }
  })

  const canCreate = ['owner', 'manager'].includes(profile.role)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Campagnes</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{campaigns?.length || 0} campagne(s)</div>
        </div>
        {canCreate && (
          <Link href="/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.18)' }}>
            <span className="mat" style={{ fontSize: 16 }}>add</span> Nouvelle campagne
          </Link>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)', fontSize: 13 }}>Aucune campagne créée.</div>
          )}
          {stats.map((c: any) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(18px)', cursor: 'pointer', transition: 'border-color .15s' }}
                onMouseOver={e => (e.currentTarget.style.borderColor = 'rgba(125,211,252,.22)')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.campaign_name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--muted-2)' }}>Client :</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{c.client_name}</span>
                    {c.sector && <> · {c.sector}</>}
                    <span style={{ marginLeft: 12, color: 'var(--muted-2)' }}>{c.totalCalls} appel(s) · {c.rdvBooked} RDV</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 20, flexShrink: 0 }}>
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
