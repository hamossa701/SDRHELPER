import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { computeReviewFlags, isQualifiedAppointment } from '@/lib/review-flags'
import { buildAnalysisExplainability } from '@/lib/analysis-explainability'
import { createAdminClient } from '@/lib/supabase-admin'
import { CallDetailView } from '@/components/calls/CallDetailView'
import type { AuditEntry, FieldCorrection } from '@/types'

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const isClient = profile.role === 'client'

  if (isClient) {
    if (!profile.client_id) redirect('/client')
    const adminDb = createAdminClient()
    const { data: clientCampaigns } = await adminDb
      .from('campaigns')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('client_id', profile.client_id)
    const clientCampaignIds = (clientCampaigns ?? []).map((c: { id: string }) => c.id)
    const { data: callCheck } = await adminDb.from('calls').select('id, campaign_id').eq('id', id).single()
    if (!callCheck || !clientCampaignIds.includes(callCheck.campaign_id)) redirect('/client')
  }

  const { data: call } = await (isClient ? createAdminClient() : supabase)
    .from('calls')
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name, manager_id), campaigns(campaign_name, client_name, offer_description)')
    .eq('id', id)
    .single()

  if (!call) notFound()
  const a = call.call_analyses
  const callSdr = Array.isArray(call.users) ? call.users[0] : call.users
  const canValidate = !isClient && (
    profile.role === 'owner'
    || (profile.role === 'manager' && callSdr?.manager_id === user.id)
  )

  let corrections: FieldCorrection[] = []
  let auditLog: AuditEntry[] = []

  if (canValidate && a) {
    const [corrRes, auditRes] = await Promise.all([
      supabase.from('field_corrections').select('*').eq('analysis_id', a.id).order('corrected_at', { ascending: false }),
      supabase.from('audit_log').select('*, user:users(name)').eq('analysis_id', a.id).order('created_at', { ascending: false }),
    ])
    corrections = (corrRes.data || []) as FieldCorrection[]
    auditLog = (auditRes.data || []) as AuditEntry[]
  }

  let validatedByName: string | null = null
  if (a?.validated_by) {
    const { data: validator } = await supabase.from('users').select('name').eq('id', a.validated_by).single()
    validatedByName = validator?.name || null
  }

  let analysisJob = null
  if (!a) {
    const { data: jobData } = await supabase
      .from('analysis_jobs')
      .select('id, status, error_message, retry_count')
      .eq('call_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    analysisJob = jobData
  }

  const reviewResult = a ? computeReviewFlags(a) : null
  const qualifiedAppt = a ? isQualifiedAppointment(a) : false
  const explanation = a ? buildAnalysisExplainability({
    role: profile.role,
    call: { transcript: call.transcript },
    analysis: a,
    qualifiedAppointment: qualifiedAppt,
  }) : null

  return (
    <CallDetailView
      call={call}
      a={a ?? null}
      profile={profile}
      corrections={corrections}
      auditLog={auditLog}
      validatedByName={validatedByName}
      canValidate={canValidate}
      isClient={isClient}
      qualifiedAppt={qualifiedAppt}
      reviewResult={reviewResult}
      explanation={explanation}
      analysisJob={analysisJob}
    />
  )
}
