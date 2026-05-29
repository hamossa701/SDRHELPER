'use client'
import { useState } from 'react'
import type { AnalysisJobStatus } from '@/types'

interface Props {
  job: { id: string; status: AnalysisJobStatus; error_message: string | null; retry_count: number } | null
}

export function JobStatusBanner({ job }: Props) {
  const [retrying, setRetrying] = useState(false)
  const [retried,  setRetried]  = useState(false)

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
      <p className="text-sm text-gray-400 text-center py-6">
        Cet appel n&apos;a pas encore été analysé.
      </p>
    )
  }

  if (job.status === 'pending' || job.status === 'processing') {
    return (
      <div className="flex items-center gap-3 justify-center py-8 text-sm text-gray-500">
        <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Analyse en cours…
      </div>
    )
  }

  if (job.status === 'failed') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-red-700">Analyse échouée</p>
        {job.error_message && (
          <p className="text-xs text-red-500 font-mono">{job.error_message}</p>
        )}
        {job.retry_count > 0 && (
          <p className="text-xs text-gray-400">{job.retry_count} tentative(s) précédente(s)</p>
        )}
        {retried ? (
          <p className="text-xs text-blue-600">
            Relancé — rechargez la page dans quelques secondes.
          </p>
        ) : (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {retrying ? 'Relance en cours…' : 'Réessayer l\'analyse'}
          </button>
        )}
      </div>
    )
  }

  return null
}
