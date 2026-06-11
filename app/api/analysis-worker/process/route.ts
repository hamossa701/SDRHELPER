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

// Alert if jobs linger in 'pending' past 1h (queue not draining) or failed
// permanently in the last 24h. Individual failures already hit Sentry via
// captureException; this is the safety net for jobs nothing ever picks up.
async function checkQueueHealth(admin: ReturnType<typeof createAdminClient>) {
  const pendingCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const failedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pendingRes, failedRes] = await Promise.all([
    admin.from('analysis_jobs').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').lt('created_at', pendingCutoff),
    admin.from('analysis_jobs').select('id', { count: 'exact', head: true })
      .eq('status', 'failed').gte('completed_at', failedCutoff),
  ])
  if (pendingRes.error || failedRes.error) {
    console.error('[worker] queue health check failed:', pendingRes.error?.message ?? failedRes.error?.message)
  }
  const stalePending = pendingRes.count ?? 0
  const recentFailed = failedRes.count ?? 0
  if (stalePending === 0 && recentFailed === 0) return
  console.warn(`[worker] queue alert: ${stalePending} pending >1h, ${recentFailed} failed in last 24h`)
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureMessage('Analysis queue needs attention', {
      level: 'warning',
      extra: { pending_over_1h: stalePending, failed_last_24h: recentFailed },
    })
  } catch {}
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
    await checkQueueHealth(admin)
    return NextResponse.json({ processed: 0, results: [] })
  }
  console.log(`[worker] claimed ${claimedJobs.length} job(s):`, claimedJobs.map((job) => job.id))

  const results: Array<{ job_id: string; outcome: string }> = []
  for (const job of claimedJobs) {
    const outcome = await processJobById({ id: job.id, call_id: job.call_id, retry_count: job.retry_count ?? 0 })
    results.push({ job_id: job.id, outcome })
  }

  await checkQueueHealth(admin)

  return NextResponse.json({ processed: results.length, results })
}

// Vercel Cron invokes via GET; manual/worker triggers use POST.
export async function GET(request: NextRequest) {
  return handleWorkerRun(request)
}

export async function POST(request: NextRequest) {
  return handleWorkerRun(request)
}
