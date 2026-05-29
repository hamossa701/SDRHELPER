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

export function ReviewQueueControls({
  callId,
  status,
  assignedToId,
  assigneeName,
  currentUserId,
}: Props) {
  const [current,  setCurrent]  = useState<ReviewStatus>(status)
  const [loading,  setLoading]  = useState(false)
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
    return <span className="text-xs text-emerald-600 font-medium shrink-0">✓ Résolu</span>
  }

  if (current === 'in_review') {
    const isAssignedToMe = assignedToId === currentUserId
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-blue-600 font-medium whitespace-nowrap">
          En cours {assignee ? `· ${assignee}` : ''}
        </span>
        {isAssignedToMe && (
          <button
            onClick={(e) => { e.preventDefault(); resolve() }}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
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
      className="text-xs px-2 py-1 rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 transition-colors shrink-0"
    >
      {loading ? '…' : 'Prendre en charge'}
    </button>
  )
}
