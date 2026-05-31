'use client'
import { useState } from 'react'
import type { AnalysisJobStatus } from '@/types'

interface Props {
  job: { id: string; status: AnalysisJobStatus; error_message: string | null; retry_count: number } | null
}

export function JobStatusBanner({ job }: Props) {
  const [retrying, setRetrying] = useState(false)
  const [retried, setRetried] = useState(false)

  async function handleRetry() {
    if (!job) return
    setRetrying(true)
    try {
      await fetch('/api/analyze/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      setRetried(true)
    } finally {
      setRetrying(false)
    }
  }

  if (!job) {
    return (
      <div style={{ padding: '28px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Analyse en préparation</div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>
          Les résultats apparaîtront ici dès que le traitement sera terminé.
        </p>
      </div>
    )
  }

  if (job.status === 'pending' || job.status === 'processing') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '32px 20px', color: 'var(--muted)', fontSize: 13 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(148,163,184,.18)', borderTopColor: 'var(--cyan)', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
        Analyse en cours...
      </div>
    )
  }

  if (job.status === 'failed') {
    return (
      <div style={{ border: '1px solid rgba(239,68,68,.32)', background: 'rgba(239,68,68,.08)', borderRadius: 12, padding: 22, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fca5a5' }}>Analyse échouée</p>
        {job.error_message && (
          <p style={{ margin: 0, fontSize: 11, color: '#fca5a5', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-word' }}>{job.error_message}</p>
        )}
        {job.retry_count > 0 && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-2)' }}>{job.retry_count} tentative(s) précédente(s)</p>
        )}
        {retried ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--cyan)' }}>
            Relancé. Rechargez la page dans quelques secondes.
          </p>
        ) : (
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', border: '1px solid rgba(239,68,68,.42)', opacity: retrying ? .6 : 1, cursor: retrying ? 'not-allowed' : 'pointer' }}
          >
            {retrying ? 'Relance en cours...' : "Réessayer l'analyse"}
          </button>
        )}
      </div>
    )
  }

  return null
}
