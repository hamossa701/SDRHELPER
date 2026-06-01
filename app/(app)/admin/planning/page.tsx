import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PlanningActions } from './PlanningActions'

export default async function PlanningPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/dashboard')

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: campaignsRaw },
    { data: sdrsRaw },
    { data: assignmentsRaw },
  ] = await Promise.all([
    supabase.from('campaigns')
      .select('id, campaign_name, client_name, status')
      .eq('organization_id', profile.organization_id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase.from('users')
      .select('id, name')
      .eq('organization_id', profile.organization_id)
      .eq('role', 'sdr')
      .order('name'),
    supabase.from('campaign_assignments')
      .select('id, campaign_id, sdr_id, starts_at, ends_at, assignment_type, status')
      .eq('organization_id', profile.organization_id)
      .neq('status', 'cancelled')
      .gte('ends_at', today)
      .order('starts_at', { ascending: true }),
  ])

  const sdrs = (sdrsRaw ?? []) as { id: string; name: string }[]
  const rawAssignments = (assignmentsRaw ?? []) as {
    id: string; campaign_id: string; sdr_id: string
    starts_at: string; ends_at: string; assignment_type: string; status: string
  }[]

  // Compute assigned SDR names per campaign for today's active assignments
  const sdrsByCampaign = new Map<string, string[]>()
  for (const a of rawAssignments) {
    if (a.starts_at <= today) {
      const sdrName = sdrs.find(s => s.id === a.sdr_id)?.name ?? '?'
      const names = sdrsByCampaign.get(a.campaign_id) ?? []
      if (!names.includes(sdrName)) names.push(sdrName)
      sdrsByCampaign.set(a.campaign_id, names)
    }
  }

  const campaigns = (campaignsRaw ?? []).map(c => ({
    id: c.id,
    campaign_name: c.campaign_name,
    client_name: c.client_name,
    status: c.status,
    assigned_sdr_names: sdrsByCampaign.get(c.id) ?? [],
  }))

  const assignments = rawAssignments.map(a => {
    const campaign = campaigns.find(c => c.id === a.campaign_id)
    const sdr = sdrs.find(s => s.id === a.sdr_id)
    return {
      id: a.id,
      campaign_id: a.campaign_id,
      sdr_id: a.sdr_id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      assignment_type: a.assignment_type,
      sdr_name: sdr?.name ?? '—',
      campaign_name: campaign?.campaign_name ?? '—',
      client_name: campaign?.client_name ?? '—',
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{
        height: 56, flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--header-bg)', backdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', padding: '0 24px',
      }}>
        <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650 }}>Planning</div>
      </div>

      <main className="app-scroll">
        <div className="app-content">
          <section>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>
              Planning
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>
              Gérez vos campagnes et assignez vos SDRs
            </p>
          </section>

          <PlanningActions
            campaigns={campaigns}
            sdrs={sdrs}
            assignments={assignments}
            today={today}
          />
        </div>
      </main>
    </div>
  )
}
