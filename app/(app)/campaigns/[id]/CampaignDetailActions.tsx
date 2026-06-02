'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Button, DarkSelect } from '@/components/ui'

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 34,
  padding: '0 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'rgba(2,6,23,.28)',
  color: 'var(--muted)',
  textDecoration: 'none',
}

export function CampaignDetailActions({
  campaignId,
  campaignStatus,
  role,
}: {
  campaignId: string
  campaignStatus: string
  role: string
}) {
  const router = useRouter()
  const [assignOpen, setAssignOpen] = useState(false)
  const [sdrs, setSdrs] = useState<{ id: string; name: string }[]>([])
  const [sdrId, setSdrId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [assignError, setAssignError] = useState('')

  async function openAssignModal() {
    if (sdrs.length === 0) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single()
      if (!profile) return
      const { data } = await supabase
        .from('users')
        .select('id, name')
        .eq('organization_id', profile.organization_id)
        .eq('role', 'sdr')
        .order('name')
      setSdrs(data ?? [])
    }
    setSdrId('')
    setAssignError('')
    setAssignOpen(true)
  }

  async function submitAssign() {
    if (!sdrId) { setAssignError('Sélectionnez un SDR'); return }
    setSubmitting(true)
    setAssignError('')
    const today = new Date().toISOString().split('T')[0]
    const endDate = new Date()
    endDate.setFullYear(endDate.getFullYear() + 1)
    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaignId,
        sdr_id: sdrId,
        starts_at: today,
        ends_at: endDate.toISOString().split('T')[0],
        assignment_type: 'custom',
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setAssignError(body.error ?? 'Erreur')
      return
    }
    setAssignOpen(false)
    router.refresh()
  }

  async function updateStatus(status: string) {
    await fetch(`/api/campaigns/${campaignId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    router.refresh()
  }

  async function deleteCampaign() {
    if (!window.confirm('Supprimer cette campagne ? Cette action est irréversible.')) return
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' })
    if (res.ok) router.push('/campaigns')
  }

  const isOwner = role === 'owner'
  const canAct = role === 'owner' || role === 'manager'
  if (!canAct) return null

  return (
    <>
      <div
        className="campaign-detail-actions"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
      >
        <Link href={`/campaigns/${campaignId}/edit`} style={btnBase}>Modifier</Link>

        {isOwner && (
          <button type="button" onClick={openAssignModal} style={btnBase}>
            Assigner SDR
          </button>
        )}

        {isOwner && campaignStatus === 'active' && (
          <button type="button" onClick={() => updateStatus('paused')} style={btnBase}>
            Mettre en pause
          </button>
        )}

        {isOwner && (campaignStatus === 'paused' || campaignStatus === 'archived') && (
          <button type="button" onClick={() => updateStatus('active')} style={{ ...btnBase, color: '#86efac', borderColor: 'rgba(34,197,94,.35)' }}>
            Réactiver
          </button>
        )}

        {isOwner && campaignStatus !== 'archived' && (
          <button type="button" onClick={() => updateStatus('archived')} style={btnBase}>
            Archiver
          </button>
        )}

        <Link
          href="/calls/upload"
          style={{
            ...btnBase,
            background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
            border: '1px solid rgba(125,211,252,.42)',
            color: '#fff',
            boxShadow: '0 10px 24px rgba(37,99,235,.2)',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 800 }}>+</span>
          Analyser un appel
        </Link>

        {isOwner && (
          <button
            type="button"
            onClick={deleteCampaign}
            style={{ ...btnBase, color: '#fca5a5', borderColor: 'rgba(239,68,68,.32)', background: 'transparent' }}
          >
            Supprimer
          </button>
        )}
      </div>

      {assignOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setAssignOpen(false) }}
        >
          <div style={{ width: '100%', maxWidth: 400, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', backdropFilter: 'blur(18px)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Assigner un SDR</h3>
              <button onClick={() => setAssignOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-2)', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>SDR *</label>
                <DarkSelect
                  value={sdrId}
                  onChange={setSdrId}
                  ariaLabel="SDR"
                  options={[
                    { value: '', label: 'Sélectionner un SDR...' },
                    ...sdrs.map(s => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>
              {assignError && (
                <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5' }}>
                  {assignError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
                <Button type="button" loading={submitting} onClick={submitAssign}>Assigner</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
