import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui'
import { WebhookSecretDisplay } from '@/components/admin/WebhookSecretDisplay'
import { RingoverAgentMappingCard } from '@/components/admin/RingoverAgentMappingCard'

export default async function IntegrationsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) {
          try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('organization_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/dashboard')

  const { data: integration } = await supabase
    .from('ringover_integrations')
    .select('enabled, webhook_secret')
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  const { data: mappingsData } = await supabase
    .from('ringover_agent_mappings')
    .select('id, ringover_agent_id, sdr_id, default_campaign_id, sdr:users!sdr_id(name), campaign:campaigns!default_campaign_id(campaign_name)')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const { data: sdrsData } = await supabase
    .from('users')
    .select('id, name')
    .eq('organization_id', profile.organization_id)
    .eq('role', 'sdr')
    .order('name')

  const { data: campaignsData } = await supabase
    .from('campaigns')
    .select('id, campaign_name')
    .eq('organization_id', profile.organization_id)
    .in('status', ['active', 'paused'])
    .order('campaign_name')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${appUrl}/api/ringover/webhook?org_id=${profile.organization_id}`
  const isConnected = integration?.enabled === true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div
        className="app-page-header"
        style={{
          height: 56,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(18px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650 }}>Administration</div>
      </div>

      <main className="app-scroll">
        <div className="app-content">
          <section>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>
              Intégrations
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>
              Connectez vos outils externes à SDRHelper.
            </p>
          </section>

          <Card>
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(99,102,241,.12)',
                    border: '1px solid rgba(99,102,241,.28)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}>
                    <span className="mat" style={{ fontSize: 20, color: '#a5b4fc' }}>phone_in_talk</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Ringover</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 2 }}>Synchronisation automatique des appels</div>
                  </div>
                </div>

                {isConnected ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#86efac', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.28)', whiteSpace: 'nowrap' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#86efac', flexShrink: 0, animation: 'h3a-pulse-dot 2s ease infinite' }} />
                    Connecté
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    Non configuré
                  </span>
                )}
              </div>

              {integration ? (
                <WebhookSecretDisplay
                  secret={integration.webhook_secret}
                  webhookUrl={webhookUrl}
                />
              ) : (
                <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(2,6,23,.4)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>
                  Aucune configuration trouvée. Contactez le support pour activer l&apos;intégration Ringover.
                </div>
              )}

              <p style={{ margin: '16px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.65 }}>
                Partagez cette URL et ce secret avec votre équipe Ringover pour activer la synchronisation automatique des appels.
              </p>
            </div>
          </Card>
          <RingoverAgentMappingCard
            mappings={(mappingsData ?? []) as unknown as {
              id: string
              ringover_agent_id: number
              sdr_id: string
              default_campaign_id: string | null
              sdr: { name: string } | null
              campaign: { campaign_name: string } | null
            }[]}
            sdrs={(sdrsData ?? []) as { id: string; name: string }[]}
            campaigns={(campaignsData ?? []) as { id: string; campaign_name: string }[]}
          />
        </div>
      </main>
    </div>
  )
}
