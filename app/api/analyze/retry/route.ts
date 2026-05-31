import { after, NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { processJobById } from '@/lib/job-processor'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
        },
      }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organization_id, role').eq('id', user.id).single()
    if (!profile || !['owner', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { jobId } = await request.json()
    if (!jobId) return NextResponse.json({ error: 'jobId requis' }, { status: 400 })

    // Verify job belongs to this org and is in a retriable state
    const { data: job } = await supabase
      .from('analysis_jobs').select('id, call_id, status, retry_count')
      .eq('id', jobId).eq('organization_id', profile.organization_id).single()

    if (!job) return NextResponse.json({ error: 'Job introuvable' }, { status: 404 })
    if (job.status !== 'failed') {
      return NextResponse.json({ error: 'Seuls les jobs échoués peuvent être relancés' }, { status: 409 })
    }

    // Reset to pending — clears backoff and error so the worker picks it up cleanly
    const { error: resetErr } = await supabase
      .from('analysis_jobs')
      .update({
        status:        'pending',
        error_message: null,
        retry_after:   null,
        retry_count:   0,
        started_at:    null,
        completed_at:  null,
      })
      .eq('id', jobId)
      .eq('organization_id', profile.organization_id)

    if (resetErr) throw resetErr

    // Re-process after response using Next's request-lifetime primitive.
    after(() => processJobById({ id: jobId, call_id: job.call_id ?? '', retry_count: 0 })
      .catch(e => console.error('[retry] background job error:', e instanceof Error ? e.message : e, '| job:', jobId)))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('analyze/retry error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
