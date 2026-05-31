'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--muted)',
        background: 'rgba(2,6,23,.52)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'border-color .15s, color .15s',
      }}
      onMouseOver={e => {
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(125,211,252,.28)'
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
      }}
      onMouseOut={e => {
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'
      }}
    >
      Exporter PDF
    </button>
  )
}
