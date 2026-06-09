import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { processJobById } from '@/lib/job-processor'

export const maxDuration = 300

type ClaimedAnalysisJob = {
  id: string
  call_id: string
  retry_count: number | null
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-worker-secret')
  const workerSecret = process.env.WORKER_SECRET
  if (!workerSecret || !secret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const secretBuf = Buffer.from(workerSecret)
  const receivedBuf = Buffer.from(secret)
  if (secretBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(secretBuf, receivedBuf)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const admin = createAdminClient()

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
