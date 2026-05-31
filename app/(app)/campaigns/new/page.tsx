'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button, Card } from '@/components/ui'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color .15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--muted)',
  marginBottom: 7,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    client_name: '',
    campaign_name: '',
    sector: '',
    target_persona: '',
    offer_description: '',
    script_notes: '',
    status: 'active' as const,
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single()
    if (!profile) { setError('Erreur de profil'); setLoading(false); return }

    const { data, error: err } = await supabase
      .from('campaigns')
      .insert({ ...form, organization_id: profile.organization_id })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/campaigns/${data.id}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        .h3a-input:focus { border-color: var(--border-strong) !important; box-shadow: 0 0 0 3px rgba(125,211,252,.1); }
        .h3a-input::placeholder { color: var(--muted-2); }
        .h3a-input option { background: #0f172a; color: var(--text); }
      `}</style>

      <div style={{
        height: 56,
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
      }}>
        <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650 }}>Campagnes</div>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: '22px 24px 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <section>
            <button
              onClick={() => router.back()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              ← Retour
            </button>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>
              Nouvelle campagne
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>
              Configurez une campagne de prise de rendez-vous
            </p>
          </section>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card>
              <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Informations principales</h2>
              </div>
              <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Nom client *</label>
                    <input
                      required
                      className="h3a-input"
                      value={form.client_name}
                      onChange={e => update('client_name', e.target.value)}
                      placeholder="ex: TechSolutions France"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Nom de campagne *</label>
                    <input
                      required
                      className="h3a-input"
                      value={form.campaign_name}
                      onChange={e => update('campaign_name', e.target.value)}
                      placeholder="ex: Prospection DSI Île-de-France"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Secteur</label>
                    <input
                      className="h3a-input"
                      value={form.sector}
                      onChange={e => update('sector', e.target.value)}
                      placeholder="ex: Logiciels B2B / SaaS"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Statut</label>
                    <select
                      className="h3a-input"
                      value={form.status}
                      onChange={e => update('status', e.target.value)}
                      style={inputStyle}
                    >
                      <option value="active">Active</option>
                      <option value="paused">En pause</option>
                      <option value="completed">Terminée</option>
                    </select>
                  </div>
                </div>

              </div>
            </Card>

            <Card>
              <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Contexte de vente</h2>
              </div>
              <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                <div>
                  <label style={labelStyle}>Persona cible</label>
                  <input
                    className="h3a-input"
                    value={form.target_persona}
                    onChange={e => update('target_persona', e.target.value)}
                    placeholder="ex: DSI ou DG dans PME 50-500 salariés"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description de l&apos;offre</label>
                  <textarea
                    rows={4}
                    className="h3a-input"
                    value={form.offer_description}
                    onChange={e => update('offer_description', e.target.value)}
                    placeholder="Décrivez l'offre : bénéfices clés, différenciateurs..."
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Notes de script</label>
                  <textarea
                    rows={4}
                    className="h3a-input"
                    value={form.script_notes}
                    onChange={e => update('script_notes', e.target.value)}
                    placeholder="Consignes pour les SDRs, points à qualifier, objections courantes..."
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>

              </div>
            </Card>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.10)',
                border: '1px solid rgba(239,68,68,.32)',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 13,
                color: '#fca5a5',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
              <Button type="button" variant="secondary" onClick={() => router.back()}>Annuler</Button>
              <Button type="submit" loading={loading}>Créer la campagne</Button>
            </div>

          </form>
        </div>
      </main>
    </div>
  )
}
