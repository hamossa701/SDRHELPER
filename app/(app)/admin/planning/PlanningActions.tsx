'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, StatusBadge } from '@/components/ui'
import type { AssignmentType } from '@/types'

interface CampaignRow {
  id: string
  campaign_name: string
  client_name: string
  status: string
  assigned_sdr_names: string[]
}

interface AssignmentRow {
  id: string
  campaign_id: string
  sdr_id: string
  starts_at: string
  ends_at: string
  assignment_type: string
  sdr_name: string
  campaign_name: string
  client_name: string
}

interface Props {
  campaigns: CampaignRow[]
  sdrs: { id: string; name: string }[]
  assignments: AssignmentRow[]
  today: string // 'YYYY-MM-DD'
}

const DURATION_OPTIONS: { type: AssignmentType; label: string; days: number }[] = [
  { type: '1_day',    label: '1 jour',         days: 0 },
  { type: '2_days',   label: '2 jours',         days: 1 },
  { type: '3_days',   label: '3 jours',         days: 2 },
  { type: '4_days',   label: '4 jours',         days: 3 },
  { type: 'full_week',label: 'Semaine complète', days: 6 },
  { type: 'custom',   label: 'Personnalisée',    days: -1 },
]

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const thStyle: React.CSSProperties = {
  padding: '10px 18px', textAlign: 'left',
  color: 'var(--muted-2)', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.04em',
  borderBottom: '1px solid var(--border)',
}

const tdStyle: React.CSSProperties = {
  padding: '13px 18px', borderBottom: '1px solid var(--border)',
  fontSize: 13, color: 'var(--muted)',
}

export function PlanningActions({ campaigns, sdrs, assignments, today }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<{ open: false } | { open: true }>({ open: false })
  const [formCampaignId, setFormCampaignId] = useState('')
  const [formSdrId, setFormSdrId] = useState('')
  const [formStart, setFormStart] = useState(today)
  const [formDuration, setFormDuration] = useState<AssignmentType>('full_week')
  const [formEnd, setFormEnd] = useState(addDays(today, 6))
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  function openAssign(campaignId?: string) {
    setFormCampaignId(campaignId ?? '')
    setFormSdrId('')
    setFormStart(today)
    setFormDuration('full_week')
    setFormEnd(addDays(today, 6))
    setFormError('')
    setModal({ open: true })
  }

  function handleDurationChange(type: AssignmentType) {
    setFormDuration(type)
    if (type !== 'custom') {
      const opt = DURATION_OPTIONS.find(o => o.type === type)!
      setFormEnd(addDays(formStart, opt.days))
    }
  }

  function handleStartChange(date: string) {
    setFormStart(date)
    if (formDuration !== 'custom') {
      const opt = DURATION_OPTIONS.find(o => o.type === formDuration)!
      setFormEnd(addDays(date, opt.days))
    }
  }

  async function submitAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!formCampaignId || !formSdrId) { setFormError('Campagne et SDR requis'); return }
    if (formDuration === 'custom' && formEnd < formStart) { setFormError('La date de fin doit être après le début'); return }
    setSubmitting(true)
    setFormError('')

    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: formCampaignId,
        sdr_id: formSdrId,
        starts_at: formStart,
        ends_at: formEnd,
        assignment_type: formDuration,
      }),
    })

    setSubmitting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setFormError(body.error ?? 'Erreur serveur')
      return
    }
    setModal({ open: false })
    router.refresh()
  }

  async function cancelAssignment(id: string) {
    await fetch(`/api/assignments/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function archiveCampaign(id: string) {
    await fetch(`/api/campaigns/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    background: 'var(--input-bg)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 13, outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: 'var(--muted)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '.04em',
  }

  return (
    <>
      {/* Campaigns table */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Campagnes</h2>
          <Link href="/campaigns/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, textDecoration: 'none',
            background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
            border: '1px solid rgba(125,211,252,.42)', color: '#fff',
            fontSize: 12, fontWeight: 700,
          }}>
            + Nouvelle campagne
          </Link>
        </div>
        {campaigns.length === 0 ? (
          <div style={{ padding: '34px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Aucune campagne active</div>
            <p style={{ margin: 0, color: 'var(--muted-2)', fontSize: 12 }}>Créez ou réactivez une campagne pour planifier les SDRs.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--thead)' }}>
                  {['Campagne', 'Client', 'Statut', 'SDRs assignés', 'Actions'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}
                    style={{ transition: 'background .12s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tdStyle, color: 'var(--text)', fontWeight: 650 }}>
                      <Link href={`/campaigns/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {c.campaign_name}
                      </Link>
                    </td>
                    <td style={tdStyle}>{c.client_name}</td>
                    <td style={tdStyle}>
                      <StatusBadge status={c.status as 'active' | 'paused' | 'completed'} />
                    </td>
                    <td style={tdStyle}>
                      {c.assigned_sdr_names.length > 0
                        ? c.assigned_sdr_names.join(', ')
                        : <span style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>Non assigné</span>}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => openAssign(c.id)} style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          background: 'var(--cyan-soft)', border: '1px solid rgba(125,211,252,.32)', color: 'var(--cyan)',
                        }}>
                          Assigner
                        </button>
                        <Link href={`/campaigns/${c.id}/edit`} style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
                          color: 'var(--muted)', textDecoration: 'none',
                        }}>
                          Modifier
                        </Link>
                        <button onClick={() => archiveCampaign(c.id)} style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted-2)',
                        }}>
                          Archiver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Planning overview */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Affectations en cours et à venir</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-2)' }}>Qui travaille sur quelle campagne, pour quel client, et jusqu&apos;à quand.</p>
          </div>
          <button onClick={() => openAssign()} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', color: 'var(--muted)',
          }}>
            + Assigner un SDR
          </button>
        </div>
        {assignments.length === 0 ? (
          <div style={{ padding: '34px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Aucune affectation planifiée</div>
            <p style={{ margin: 0, color: 'var(--muted-2)', fontSize: 12 }}>Assignez un SDR pour rendre la campagne visible dans son espace.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--thead)' }}>
                  {['SDR', 'Campagne', 'Client', 'Début', 'Fin', 'Type', 'Statut', ''].map((h, i) => (
                    <th key={i} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => {
                  const isScheduled = a.starts_at > today
                  const statusLabel = isScheduled ? 'Planifié' : 'En cours'
                  const statusColor = isScheduled ? '#fcd34d' : '#86efac'
                  const statusBg = isScheduled ? 'rgba(245,158,11,.10)' : 'rgba(34,197,94,.10)'
                  const statusBorder = isScheduled ? 'rgba(245,158,11,.32)' : 'rgba(34,197,94,.32)'
                  const durationLabel = DURATION_OPTIONS.find(o => o.type === a.assignment_type)?.label ?? a.assignment_type
                  return (
                    <tr key={a.id}
                      style={{ transition: 'background .12s' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ ...tdStyle, color: 'var(--text)', fontWeight: 650 }}>{a.sdr_name}</td>
                      <td style={tdStyle}>{a.campaign_name}</td>
                      <td style={tdStyle}>{a.client_name}</td>
                      <td style={tdStyle}>{a.starts_at}</td>
                      <td style={tdStyle}>{a.ends_at}</td>
                      <td style={tdStyle}>{durationLabel}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`,
                        }}>
                          {statusLabel}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => cancelAssignment(a.id)} style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          background: 'transparent', border: '1px solid rgba(239,68,68,.32)', color: '#fca5a5',
                        }}>
                          Annuler
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Assign SDR modal */}
      {modal.open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setModal({ open: false }) }}
        >
          <Card style={{ width: '100%', maxWidth: 480, padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Assigner un SDR</h3>
              <button onClick={() => setModal({ open: false })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-2)', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <form onSubmit={submitAssignment} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Campagne *</label>
                <select required value={formCampaignId} onChange={e => setFormCampaignId(e.target.value)} style={inputStyle}>
                  <option value="">Sélectionner une campagne...</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name} — {c.client_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>SDR *</label>
                <select required value={formSdrId} onChange={e => setFormSdrId(e.target.value)} style={inputStyle}>
                  <option value="">Sélectionner un SDR...</option>
                  {sdrs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date de début</label>
                <input type="date" value={formStart} onChange={e => handleStartChange(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Durée</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DURATION_OPTIONS.map(opt => (
                    <button key={opt.type} type="button" onClick={() => handleDurationChange(opt.type)} style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${formDuration === opt.type ? 'var(--border-strong)' : 'var(--border)'}`,
                      background: formDuration === opt.type ? 'var(--cyan-soft)' : 'transparent',
                      color: formDuration === opt.type ? 'var(--cyan)' : 'var(--muted)',
                    }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {formDuration === 'custom' ? (
                <div>
                  <label style={labelStyle}>Date de fin</label>
                  <input type="date" value={formEnd} min={formStart} onChange={e => setFormEnd(e.target.value)} style={inputStyle} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                  Fin prévue : <strong style={{ color: 'var(--muted)' }}>{formEnd}</strong>
                </div>
              )}
              {formError && (
                <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5' }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <Button type="button" variant="secondary" onClick={() => setModal({ open: false })}>Annuler</Button>
                <Button type="submit" loading={submitting}>Créer l&apos;affectation</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  )
}
