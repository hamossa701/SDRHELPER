import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ScoreBadge, InterestBadge, RiskBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { computeReviewFlags, isQualifiedAppointment } from '@/lib/review-flags'
import { ValidationPanel } from '@/components/calls/ValidationPanel'
import { JobStatusBanner } from '@/components/calls/JobStatusBanner'
import { createAdminClient } from '@/lib/supabase-admin'
import type { AuditEntry, FieldCorrection } from '@/types'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, flexShrink: 0, minWidth: 160 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right' }}>{value || <span style={{ color: 'var(--muted-2)' }}>—</span>}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ padding: '4px 16px 12px' }}>{children}</div>
    </div>
  )
}

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
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name), campaigns(campaign_name, client_name, offer_description)')
    .eq('id', id)
    .single()

  if (!call) notFound()
  const a = call.call_analyses
  const canValidate = !isClient && ['owner', 'manager'].includes(profile.role)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href={isClient ? '/client' : '/campaigns'} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="mat" style={{ fontSize: 14 }}>arrow_back</span> Retour
          </Link>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{a?.prospect_company || 'Prospect non identifié'}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{call.campaigns?.campaign_name} · {call.users?.name} · {formatDate(call.call_datetime)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {a?.human_validated && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(34,197,94,.10)', color: '#86efac', border: '1px solid rgba(34,197,94,.35)' }}>✓ Approuvé</span>
          )}
          {qualifiedAppt && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(125,211,252,.10)', color: 'var(--cyan)', border: '1px solid rgba(125,211,252,.35)' }}>✓ RDV qualifié</span>
          )}
          {reviewResult?.review_required && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(239,68,68,.10)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.35)' }}>À réviser</span>
          )}
          {a?.hallucination_risk && <RiskBadge risk={a.hallucination_risk} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!a ? (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            {isClient
              ? <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>L&apos;analyse de cet appel n&apos;est pas encore disponible.</div>
              : <JobStatusBanner job={analysisJob} />
            }
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto' }}>
            {!isClient && reviewResult && reviewResult.flags.length > 0 && (
              <Section title="Signalements automatiques">
                <div style={{ paddingTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {reviewResult.flags.map((flag: string, i: number) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(239,68,68,.10)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.35)' }}>{flag}</span>
                  ))}
                </div>
              </Section>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Qualité RDV', score: a.appointment_quality_score, sub: a.appointment_quality_reason },
                ...(!isClient ? [{ label: 'Score SDR', score: a.sdr_quality_score, sub: null }] : []),
                { label: 'Qualification', score: a.qualification_completeness_score, sub: null },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, backdropFilter: 'blur(18px)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(125,211,252,.55),transparent)', opacity: .7 }} />
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>{item.label}</div>
                  <ScoreBadge score={item.score} />
                  {item.sub && <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 6, lineHeight: 1.4 }}>{item.sub}</div>}
                </div>
              ))}
            </div>

            {a.call_summary && (
              <Section title="Résumé">
                <div style={{ paddingTop: 10, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{a.call_summary}</div>
              </Section>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Section title="Prospect">
                <Row label="Entreprise" value={a.prospect_company} />
                <Row label="Contact" value={a.contact_name} />
                <Row label="Fonction" value={a.contact_role} />
                <Row label="Décideur" value={
                  a.decision_maker_detected === true
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,.10)', color: '#86efac', border: '1px solid rgba(34,197,94,.35)' }}>Confirmé</span>
                    : a.decision_maker_detected === false
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.32)' }}>Non confirmé</span>
                    : null
                } />
              </Section>

              <Section title="Qualification">
                <Row label="Intérêt" value={<InterestBadge level={a.interest_level} />} />
                <Row label="Besoin identifié" value={a.pain_point_detected ? 'Oui' : a.pain_point_detected === false ? 'Non' : null} />
                <Row label="Détail besoin" value={a.pain_point_details} />
                <Row label="Urgence" value={a.urgency} />
                <Row label="Solution actuelle" value={a.current_solution} />
              </Section>
            </div>

            <Section title="Rendez-vous">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: a.appointment_booked ? 'rgba(34,197,94,.10)' : 'rgba(2,6,23,.28)',
                  color: a.appointment_booked ? '#86efac' : 'var(--muted)',
                  border: `1px solid ${a.appointment_booked ? 'rgba(34,197,94,.35)' : 'var(--border)'}`,
                }}>{a.appointment_booked ? 'RDV posé' : 'Pas de RDV'}</span>
                {a.appointment_datetime && <span style={{ fontSize: 13, color: 'var(--cyan)' }}>{formatDate(a.appointment_datetime)}</span>}
                {!a.appointment_datetime && a.appointment_date_text && (
                  <span style={{ fontSize: 13, color: 'var(--cyan)' }}>{a.appointment_date_text}</span>
                )}
                {a.appointment_date_confidence && (
                  <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Confiance date : {a.appointment_date_confidence}</span>
                )}
              </div>
              {a.next_step && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}><span style={{ color: 'var(--muted-2)' }}>Prochaine étape : </span>{a.next_step}</div>}
            </Section>

            {a.objection_detected && (
              <Section title="Objection détectée">
                <Row label="Type" value={a.objection_type} />
                <Row label="Détail" value={a.objection_details} />
              </Section>
            )}

            {a.missing_information?.length > 0 && (
              <Section title="Informations manquantes">
                <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {a.missing_information.map((item: string, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: '#fcd34d', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--muted-2)', flexShrink: 0 }}>·</span>{item}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {canValidate && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {a.strengths?.length > 0 && (
                  <Section title="Points forts SDR">
                    <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {a.strengths.map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: '#86efac', display: 'flex', gap: 8 }}><span style={{ color: 'var(--muted-2)' }}>+</span>{s}</div>
                      ))}
                    </div>
                  </Section>
                )}
                {a.weaknesses?.length > 0 && (
                  <Section title="Axes d'amélioration">
                    <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {a.weaknesses.map((w: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: '#fcd34d', display: 'flex', gap: 8 }}><span style={{ color: 'var(--muted-2)' }}>−</span>{w}</div>
                      ))}
                    </div>
                  </Section>
                )}
                {a.coaching_recommendations?.length > 0 && (
                  <Section title="Recommandations coaching">
                    <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {a.coaching_recommendations.map((r: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--cyan)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--muted-2)' }}>→</span>{r}</div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}

            {!isClient && call.transcript && (
              <Section title="Transcription">
                <pre style={{ paddingTop: 10, fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, maxHeight: 300, overflowY: 'auto' }}>{call.transcript}</pre>
              </Section>
            )}

            {!isClient && (
              <Section title="Indicateurs IA">
                <Row label="Risque IA" value={<RiskBadge risk={a.hallucination_risk} />} />
                <Row label="Confiance IA" value={a.ai_confidence != null ? `${a.ai_confidence}%` : null} />
              </Section>
            )}

            {canValidate && (
              <ValidationPanel
                analysis={{ ...a, validated_by_name: validatedByName }}
                corrections={corrections}
                auditLog={auditLog}
                canEdit={canValidate}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
