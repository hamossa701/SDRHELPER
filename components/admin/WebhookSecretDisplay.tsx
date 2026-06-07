'use client'
import { useState } from 'react'

export function WebhookSecretDisplay({ secret, webhookUrl }: { secret: string; webhookUrl: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  async function handleCopySecret() {
    await navigator.clipboard.writeText(secret)
    setCopiedSecret(true)
    setTimeout(() => setCopiedSecret(false), 2000)
  }

  async function handleCopyUrl() {
    await navigator.clipboard.writeText(webhookUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const iconBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'rgba(2,6,23,.4)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    color: 'var(--muted)',
    flexShrink: 0,
    transition: 'color .12s, border-color .12s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--muted-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          URL du webhook
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', background: 'rgba(2,6,23,.5)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {webhookUrl}
          </code>
          <button
            onClick={handleCopyUrl}
            title={copiedUrl ? 'Copié !' : "Copier l'URL"}
            style={{ ...iconBtn, color: copiedUrl ? '#86efac' : 'var(--muted)' }}
          >
            <span className="mat" style={{ fontSize: 15 }}>{copiedUrl ? 'check' : 'content_copy'}</span>
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--muted-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Secret de signature
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', background: 'rgba(2,6,23,.5)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {revealed ? secret : '•'.repeat(32)}
          </code>
          <button
            onClick={() => setRevealed(r => !r)}
            title={revealed ? 'Masquer' : 'Révéler'}
            style={iconBtn}
          >
            <span className="mat" style={{ fontSize: 15 }}>{revealed ? 'visibility_off' : 'visibility'}</span>
          </button>
          <button
            onClick={handleCopySecret}
            title={copiedSecret ? 'Copié !' : 'Copier le secret'}
            style={{ ...iconBtn, color: copiedSecret ? '#86efac' : 'var(--muted)' }}
          >
            <span className="mat" style={{ fontSize: 15 }}>{copiedSecret ? 'check' : 'content_copy'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
