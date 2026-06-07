'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, DarkSelect } from '@/components/ui'

interface AgentMapping {
  id: string
  ringover_agent_id: number
  sdr_id: string
  default_campaign_id: string | null
  sdr: { name: string } | null
  campaign: { campaign_name: string } | null
}

interface Props {
  mappings: AgentMapping[]
  sdrs: { id: string; name: string }[]
  campaigns: { id: string; campaign_name: string }[]
}

export function RingoverAgentMappingCard({ mappings, sdrs, campaigns }: Props) {
  const router = useRouter()
  const [agentId, setAgentId] = useState('')
  const [sdrId, setSdrId] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/ringover/agent-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ringover_agent_id: Number(agentId),
          sdr_id: sdrId,
          default_campaign_id: campaignId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error ?? 'Erreur'); return }
      setAgentId('')
      setSdrId('')
      setCampaignId('')
      router.refresh()
    } catch {
      setFormError('Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/ringover/agent-mappings?id=${id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    height: 36,
    padding: '0 10px',
    borderRadius: 8,
    background: 'rgba(2,6,23,.5)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
    minWidth: 0,
    width: '100%',
  }

  const sdrOptions = [
    { value: '', label: 'Sélectionner un SDR...' },
    ...sdrs.map(s => ({ value: s.id, label: s.name })),
  ]
  const campaignOptions = [
    { value: '', label: 'Aucune campagne par défaut' },
    ...campaigns.map(c => ({ value: c.id, label: c.campaign_name })),
  ]

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Correspondance des agents</h2>
        <span style={{ color: 'var(--muted-2)', fontSize: 12, fontWeight: 650 }}>
          {mappings.length} agent{mappings.length !== 1 ? 's' : ''}
        </span>
      </div>

      {mappings.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--muted-2)', fontSize: 13, fontStyle: 'italic' }}>
          Aucun agent mappé — ajoutez le Ringover agent_id de chaque SDR.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
            <thead>
              <tr style={{ background: 'var(--thead)' }}>
                {['Ringover Agent ID', 'SDR assigné', 'Campagne par défaut', 'Actions'].map(label => (
                  <th key={label} style={{ padding: '10px 18px', textAlign: 'left', color: 'var(--muted-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id}>
                  <td style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 13, color: 'var(--cyan)', fontWeight: 700 }}>
                    {m.ringover_agent_id}
                  </td>
                  <td style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 }}>
                    {m.sdr?.name ?? m.sdr_id}
                  </td>
                  <td style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', color: m.campaign ? 'var(--muted)' : 'var(--muted-2)', fontSize: 13, fontStyle: m.campaign ? 'normal' : 'italic' }}>
                    {m.campaign?.campaign_name ?? '—'}
                  </td>
                  <td style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deleting === m.id}
                      title="Supprimer"
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted-2)', opacity: deleting === m.id ? .5 : 1, transition: 'color .12s' }}
                      onMouseOver={e => (e.currentTarget.style.color = '#fca5a5')}
                      onMouseOut={e => (e.currentTarget.style.color = 'var(--muted-2)')}
                    >
                      <span className="mat" style={{ fontSize: 15 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAdd} className="ringover-mapping-form">
        <div className="ringover-mapping-intro">
          <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 750 }}>Ajouter une correspondance agent</div>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-2)', fontSize: 12, lineHeight: 1.5 }}>
            L&apos;ID agent vient de Ringover. Utilisez l&apos;identifiant numérique de l&apos;utilisateur Ringover à rattacher au SDR SDRHELPER.
          </p>
        </div>
        <div className="ringover-mapping-field ringover-agent-id-field">
          <label className="ringover-mapping-label">ID agent Ringover *</label>
          <input
            type="number"
            min={1}
            required
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            placeholder="ex: 12345"
            style={inputStyle}
          />
          <div className="ringover-mapping-help">Identifiant numérique Ringover, pas le nom du SDR.</div>
        </div>
        <div className="ringover-mapping-field">
          <label className="ringover-mapping-label">SDR SDRHELPER *</label>
          <DarkSelect required value={sdrId} onChange={setSdrId} ariaLabel="SDR SDRHELPER" options={sdrOptions} />
          <div className="ringover-mapping-help">Les appels de cet agent seront assignés à ce SDR.</div>
        </div>
        <div className="ringover-mapping-field">
          <label className="ringover-mapping-label">Campagne par défaut</label>
          <DarkSelect value={campaignId} onChange={setCampaignId} ariaLabel="Campagne par défaut" options={campaignOptions} />
          <div className="ringover-mapping-help">Optionnel. Sans campagne, le webhook ignorera les appels de cet agent.</div>
        </div>
        <div className="ringover-mapping-actions">
          <button
            type="submit"
            disabled={submitting || !agentId || !sdrId}
            style={{ height: 38, width: '100%', padding: '0 16px', borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting || !agentId || !sdrId ? 'not-allowed' : 'pointer', opacity: submitting || !agentId || !sdrId ? .5 : 1, transition: 'opacity .12s', whiteSpace: 'nowrap' }}
          >
            {submitting ? 'Ajout...' : 'Ajouter'}
          </button>
        </div>
        {formError && (
          <div style={{ width: '100%', fontSize: 12, color: '#fca5a5', marginTop: 2 }}>{formError}</div>
        )}
      </form>
    </Card>
  )
}
