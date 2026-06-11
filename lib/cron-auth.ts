import crypto from 'crypto'
import type { NextRequest } from 'next/server'

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

// Authorizes cron/worker endpoints two ways:
// - Vercel Cron invokes via GET with `Authorization: Bearer ${CRON_SECRET}`
//   (Vercel injects the header when the CRON_SECRET env var is set).
// - Manual/worker triggers use POST with `x-worker-secret: ${WORKER_SECRET}`.
export function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader && timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`)) {
    return true
  }

  const workerSecret = process.env.WORKER_SECRET
  const workerHeader = request.headers.get('x-worker-secret')
  if (workerSecret && workerHeader && timingSafeEqualStr(workerHeader, workerSecret)) {
    return true
  }

  return false
}
