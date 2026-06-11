import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isCronAuthorized } from '@/lib/cron-auth'
import { processJobById } from '@/lib/job-processor'

export const maxDuration = 300

type ClaimedAnalysisJob = {
  id: string
  call_id: string
  retry_count: number | null
}

async function handleWorkerRun(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Reset jobs stuck in 'processing' for >10 min back to 'pending' so they get retried.
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: stuckJobs } = await admin
    .from('analysis_jobs')
    .update({ status: 'pending', started_at: null })
    .eq('status', 'processing')
    .lt('started_at', stuckCutoff)
    .select('id, started_at')
  if (stuckJobs?.length) {
    console.warn(`[worker] reset ${stuckJobs.length} stuck job(s) to pending:`, stuckJobs.map((j: { id: string }) => j.id))
    try {
      const Sentry = await import('@sentry/nextjs')
      for (const j of stuckJobs as Array<{ id: string; started_at: string | null }>) {
        const ageSec = j.started_at ? Math.round((Date.now() - new Date(j.started_at).getTime()) / 1000) : null
        Sentry.captureMessage('Stuck analysis job reclaimed', {
          level: 'warning',
          extra: { job_id: j.id, age_seconds: ageSec },
        })
      }
    } catch {}
  }

  // Claim a batch of pending jobs atomically (FOR UPDATE SKIP LOCKED).
  // This is only used for batch/cron retries — normal flow goes through
  // processJobById directly from the analyze route.
  const { data: jobs, error: claimErr } = await admin
    .rpc('claim_analysis_jobs', { p_batch_size: 3 })

  if (claimErr) {
    console.error('[worker] claim_analysis_jobs error:', claimErr.message)
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }

  const claimedJobs = (jobs ?? []) as ClaimedAnalysisJob[]

  if (!claimedJobs.length) {
    console.log('[worker] no pending jobs')
    return NextResponse.json({ processed: 0, results: [] })
  }
  console.log(`[worker] claimed ${claimedJobs.length} job(s):`, claimedJobs.map((job) => job.id))

  const results: Array<{ job_id: string; outcome: string }> = []
  for (const job of claimedJobs) {
    const outcome = await processJobById({ id: job.id, call_id: job.call_id, retry_count: job.retry_count ?? 0 })
    results.push({ job_id: job.id, outcome })
  }

  return NextResponse.json({ processed: results.length, results })
}

// Vercel Cron invokes via GET; manual/worker triggers use POST.
export async function GET(request: NextRequest) {
  return handleWorkerRun(request)
}

export async function POST(request: NextRequest) {
  return handleWorkerRun(request)
}
