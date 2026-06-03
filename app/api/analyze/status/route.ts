import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('organization_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'sdr'].includes(profile.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const jobId = request.nextUrl.searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id requis' }, { status: 400 })

  const { data: job } = await supabase
    .from('analysis_jobs')
    .select('id, status, call_id, error_message, retry_count, retry_after')
    .eq('id', jobId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!job) return NextResponse.json({ error: 'Job introuvable' }, { status: 404 })
  if (profile.role === 'manager' && job.call_id) {
    const { data: call } = await supabase
      .from('calls')
      .select('id, sdr:users!calls_sdr_id_fkey(manager_id)')
      .eq('id', job.call_id)
      .eq('organization_id', profile.organization_id)
      .single()
    const sdr = Array.isArray(call?.sdr) ? call?.sdr[0] : call?.sdr
    if (!call || sdr?.manager_id !== user.id) {
      return NextResponse.json({ error: 'Job introuvable' }, { status: 404 })
    }
  }

  return NextResponse.json({
    status:        job.status,
    call_id:       job.call_id,
    error_message: job.error_message,
    retry_count:   job.retry_count,
    retry_after:   job.retry_after,
  })
}
