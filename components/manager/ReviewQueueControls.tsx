'use client'
import { useState } from 'react'
import type { ReviewStatus } from '@/types'

interface Props {
  callId: string
  status: ReviewStatus
  assignedToId: string | null
  assigneeName: string | null
  currentUserId: string
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  background: 'rgba(2,6,23,.32)',
  border: '1px solid var(--border)',
  color: 'var(--muted)',
}

export function ReviewQueueControls({
  callId,
  status,
  assignedToId,
  assigneeName,
  currentUserId,
}: Props) {
  const [current, setCurrent] = useState<ReviewStatus>(status)
  const [loading, setLoading] = useState(false)
  const [assignee, setAssignee] = useState<string | null>(assigneeName)

  async function claim() {
    setLoading(true)
    try {
      const r = await fetch('/api/review/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      if (r.ok) { setCurrent('in_review'); setAssignee('moi') }
    } finally { setLoading(false) }
  }

  async function resolve() {
    setLoading(true)
    try {
      const r = await fetch('/api/review/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      if (r.ok) setCurrent('resolved')
    } finally { setLoading(false) }
  }

  if (current === 'resolved') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#86efac', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.35)', whiteSpace: 'nowrap' }}>
        Résolu
      </span>
    )
  }

  if (current === 'in_review') {
    const isAssignedToMe = assignedToId === currentUserId
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          En révision{assignee ? ` · ${assignee}` : ''}
        </span>
        {isAssignedToMe && (
          <button
            onClick={(e) => { e.preventDefault(); resolve() }}
            disabled={loading}
            style={{ ...buttonStyle, color: '#86efac', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.35)', opacity: loading ? .6 : 1 }}
          >
            Résoudre
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); claim() }}
      disabled={loading}
      style={{ ...buttonStyle, opacity: loading ? .6 : 1 }}
    >
      {loading ? '...' : 'Prendre en charge'}
    </button>
  )
}
