'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

type Manager = { id: string; name: string }
type ClientAccount = { id: string; name: string }

interface Props {
  managers: Manager[]
  clientAccounts: ClientAccount[]
}

export function InviteUserModal({ managers, clientAccounts }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'manager' | 'sdr' | 'client'>('sdr')
  const [managerId, setManagerId] = useState('')
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successEmail, setSuccessEmail] = useState('')

  useEffect(() => {
    if (!open) return

    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
    }
  }, [open])

  function reset() {
    setName('')
    setEmail('')
    setRole('sdr')
    setManagerId('')
    setClientId('')
    setError('')
    setSuccessEmail('')
  }

  function close() {
    setOpen(false)
    reset()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          manager_id: role === 'sdr' && managerId ? managerId : undefined,
          client_id: role === 'client' && clientId ? clientId : undefined,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Erreur serveur')
        return
      }
      setSuccessEmail(email.trim())
      router.refresh()
      setTimeout(() => close(), 3000)
    } catch {
      setError('Erreur r\u00e9seau. Veuillez r\u00e9essayer.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,.42)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelCapStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    display: 'block',
    marginBottom: 6,
  }

  const isClientWithNoAccounts = role === 'client' && clientAccounts.length === 0

  const modal = open ? createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2,6,23,.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-user-title"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 'min(90vw, 560px)',
          maxHeight: '85vh',
          minHeight: 0,
          background: 'linear-gradient(180deg,rgba(15,23,42,.98),rgba(6,9,20,.98))',
          border: '1px solid rgba(125,211,252,.24)',
          borderRadius: 14,
          boxShadow: '0 28px 72px rgba(0,0,0,.68), 0 0 0 1px rgba(125,211,252,.08)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div id="invite-user-title" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16 }}>
              Inviter un utilisateur
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
              Un email d&apos;invitation s&eacute;curis&eacute; sera envoy&eacute;
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(2,6,23,.28)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              marginLeft: 12,
              flexShrink: 0,
            }}
            aria-label="Fermer"
          >
            &times;
          </button>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
          {successEmail ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 30, color: '#86efac', marginBottom: 12 }}>&#10003;</div>
              <div style={{ color: '#86efac', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Invitation envoy&eacute;e</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                Un email a &eacute;t&eacute; envoy&eacute; &agrave; <strong style={{ color: 'var(--text)' }}>{successEmail}</strong>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label>
                <span style={labelCapStyle}>Nom</span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jean Dupont"
                  style={inputStyle}
                />
              </label>

              <label>
                <span style={labelCapStyle}>Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jean@exemple.fr"
                  style={inputStyle}
                />
              </label>

              <label>
                <span style={labelCapStyle}>R&ocirc;le</span>
                <select
                  value={role}
                  onChange={e => { setRole(e.target.value as typeof role); setManagerId(''); setClientId('') }}
                  style={inputStyle}
                >
                  <option value="manager">Superviseur</option>
                  <option value="sdr">SDR</option>
                  <option value="client">Client</option>
                </select>
              </label>

              {role === 'sdr' && managers.length > 0 && (
                <label>
                  <span style={labelCapStyle}>
                    Manager assign&eacute;{' '}
                    <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(optionnel)</span>
                  </span>
                  <select value={managerId} onChange={e => setManagerId(e.target.value)} style={inputStyle}>
                    <option value="">Non assign&eacute;</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
              )}

              {role === 'client' && clientAccounts.length > 0 && (
                <label>
                  <span style={labelCapStyle}>Compte client</span>
                  <select required value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
                    <option value="">S&eacute;lectionner un compte...</option>
                    {clientAccounts.map(ca => <option key={ca.id} value={ca.id}>{ca.name}</option>)}
                  </select>
                </label>
              )}

              {isClientWithNoAccounts && (
                <div style={{ fontSize: 13, color: '#fcd34d', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.22)', borderRadius: 8, padding: '10px 14px' }}>
                  Aucun compte client n&apos;existe dans votre organisation. Cr&eacute;ez d&apos;abord un compte client.
                </div>
              )}

              {error && (
                <div style={{ fontSize: 13, color: '#fca5a5', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', borderRadius: 8, padding: '10px 14px' }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {!successEmail && (
          <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(6,9,20,.98)',
            boxShadow: '0 -12px 24px rgba(0,0,0,.18)',
            flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={close}
              style={{
                padding: '0 16px',
                height: 36,
                borderRadius: 8,
                background: 'rgba(2,6,23,.28)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || isClientWithNoAccounts}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '0 18px',
                height: 36,
                borderRadius: 8,
                background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
                border: '1px solid rgba(125,211,252,.42)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading || isClientWithNoAccounts ? 0.6 : 1,
                transition: 'opacity .15s',
              }}
            >
              {loading && (
                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
              )}
              Envoyer l&apos;invitation
            </button>
          </div>
        )}
      </form>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true) }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 14px',
          height: 34,
          borderRadius: 8,
          background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
          border: '1px solid rgba(125,211,252,.42)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(37,99,235,.22)',
          flexShrink: 0,
        }}
      >
        + Inviter un utilisateur
      </button>
      {modal}
    </>
  )
}
