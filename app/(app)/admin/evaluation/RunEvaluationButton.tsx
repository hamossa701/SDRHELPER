'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function RunEvaluationButton({ caseId }: { caseId?: string }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runEvaluation() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/evaluation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseId ? { case_id: caseId } : {}),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Évaluation impossible')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Évaluation impossible')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        type="button"
        onClick={runEvaluation}
        disabled={running}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          minHeight: 34,
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid rgba(125,211,252,.42)',
          background: running ? 'rgba(15,23,42,.7)' : 'linear-gradient(135deg,#2563eb,#0891b2)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 750,
          cursor: running ? 'wait' : 'pointer',
          opacity: running ? .72 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        <span className="mat" style={{ fontSize: 16 }}>{running ? 'hourglass_top' : 'science'}</span>
        {running ? 'Évaluation...' : caseId ? 'Tester ce cas' : 'Lancer les 20 cas'}
      </button>
      {error && <span style={{ color: '#fca5a5', fontSize: 11, maxWidth: 260, textAlign: 'right' }}>{error}</span>}
    </div>
  )
}
