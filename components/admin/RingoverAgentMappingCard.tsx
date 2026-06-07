'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui'

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

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 650,
    color: 'var(--muted-2)',
    textTransform: 'uppercase' as const,
    letterSpacing: '.04em',
    marginBottom: 4,
  }

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Mapping des agents</h2>
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

      <form onSubmit={handleAdd} style={{ padding: '16px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 110, flex: '0 0 110px' }}>
          <div style={labelStyle}>Agent ID</div>
          <input
            type="number"
            min={1}
            required
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            placeholder="ex: 12345"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 160px', minWidth: 140 }}>
          <div style={labelStyle}>SDR</div>
          <select value={sdrId} onChange={e => setSdrId(e.target.value)} required style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Sélectionner...</option>
            {sdrs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 160px', minWidth: 140 }}>
          <div style={labelStyle}>Campagne par défaut</div>
          <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Aucune</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
          <div style={{ ...labelStyle, color: 'transparent' }}>_</div>
          <button
            type="submit"
            disabled={submitting || !agentId || !sdrId}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting || !agentId || !sdrId ? 'not-allowed' : 'pointer', opacity: submitting || !agentId || !sdrId ? .5 : 1, transition: 'opacity .12s', whiteSpace: 'nowrap' }}
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
