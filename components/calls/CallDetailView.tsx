'use client'

import { useState } from 'react'
import Link from 'next/link'
import { InterestBadge, RiskBadge } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { ValidationPanel } from '@/components/calls/ValidationPanel'
import { JobStatusBanner } from '@/components/calls/JobStatusBanner'
import type { AnalysisExplainability, ExplainabilityItem, ScoreBreakdownItem } from '@/lib/analysis-explainability'
import type { AnalysisJobStatus, AuditEntry, CallAnalysis, FieldCorrection, InterestLevel, ReviewFlagsResult, UserRole } from '@/types'

type ToneType = 'good' | 'warn' | 'bad' | 'neutral' | 'info'

function Pill({ children, tone }: { children: React.ReactNode; tone: ToneType }) {
  const s: Record<ToneType, { bg: string; color: string; border: string }> = {
    good:    { bg: 'rgba(34,197,94,.10)',   color: '#86efac',         border: 'rgba(34,197,94,.35)' },
    warn:    { bg: 'rgba(245,158,11,.12)',  color: '#fcd34d',         border: 'rgba(245,158,11,.32)' },
    bad:     { bg: 'rgba(239,68,68,.10)',   color: '#fca5a5',         border: 'rgba(239,68,68,.35)' },
    neutral: { bg: 'rgba(2,6,23,.28)',      color: 'var(--muted)',    border: 'var(--border)' },
    info:    { bg: 'rgba(125,211,252,.10)', color: 'var(--cyan)',     border: 'rgba(125,211,252,.35)' },
  }
  const { bg, color, border } = s[tone]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function temperatureLabel(level: InterestLevel | null | undefined): string {
  if (level === 'hot') return 'Chaud'
  if (level === 'warm') return 'Tiède'
  if (level === 'cold') return 'Froid'
  return 'Indéfini'
}

function Accordion({ title, icon, defaultOpen = false, children }: {
  title: string; icon?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid var(--border)' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon && <span className="mat" style={{ fontSize: 16, color: 'var(--muted)' }}>{icon}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>{title}</span>
        </div>
        <span className="mat" style={{ fontSize: 16, color: 'var(--muted-2)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>expand_more</span>
      </button>
      {open && <div style={{ padding: '12px 16px' }}>{children}</div>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, flexShrink: 0, minWidth: 140 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right' }}>{value || <span style={{ color: 'var(--muted-2)' }}>—</span>}</span>
    </div>
  )
}

function ReasonList({ items, limit }: { items: ExplainabilityItem[]; limit?: number }) {
  const visible = limit ? items.slice(0, limit) : items
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {visible.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 7 }}>
          <span style={{ color: item.positive === false ? '#fcd34d' : '#86efac', fontSize: 13, fontWeight: 800, lineHeight: '20px' }}>
            {item.positive === false ? '!' : '✓'}
          </span>
          <div>
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{item.label}</div>
            {item.evidence && item.evidence !== "Non détecté dans l'appel" && (
              <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>{item.evidence}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreBreakdownList({ items }: { items: ScoreBreakdownItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(item => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            <span>{item.label}</span>
            <span style={{ color: item.points > 0 ? '#86efac' : 'var(--muted-2)' }}>+{item.points}/{item.max}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'rgba(2,6,23,.42)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((item.points / item.max) * 100)}%`, background: item.points > 0 ? 'linear-gradient(90deg,#22c55e,#7dd3fc)' : 'transparent' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>{children}</div>
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>
      {title}
    </div>
  )
}

export interface CallDetailViewProps {
  call: {
    id: string
    transcript: string | null
    call_datetime: string
    users: { name: string } | null
    campaigns: { campaign_name: string; client_name: string } | null
  }
  a: (CallAnalysis & { validated_by_name?: string | null }) | null
  profile: { role: UserRole }
  corrections: FieldCorrection[]
  auditLog: AuditEntry[]
  validatedByName: string | null
  canValidate: boolean
  isClient: boolean
  qualifiedAppt: boolean
  reviewResult: ReviewFlagsResult | null
  explanation: AnalysisExplainability | null
  analysisJob: { id: string; status: AnalysisJobStatus; error_message: string | null; retry_count: number } | null
}

export function CallDetailView({
  call, a, corrections, auditLog, validatedByName,
  canValidate, isClient, qualifiedAppt, reviewResult, explanation, analysisJob,
}: CallDetailViewProps) {
  const [explainExpanded, setExplainExpanded] = useState(false)

  const hasCoaching = !isClient && (
    (a?.strengths?.length ?? 0) > 0 ||
    (a?.weaknesses?.length ?? 0) > 0 ||
    (a?.coaching_recommendations?.length ?? 0) > 0
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Header nav */}
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
          {a?.human_validated && <Pill tone="good">✓ Approuvé</Pill>}
          {qualifiedAppt && <Pill tone="info">✓ RDV qualifié</Pill>}
          {reviewResult?.review_required && <Pill tone="bad">À réviser</Pill>}
          {a?.hallucination_risk && <RiskBadge risk={a.hallucination_risk} />}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!a ? (
          <Card>
            {isClient
              ? <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>L&apos;analyse de cet appel n&apos;est pas encore disponible.</div>
              : <div style={{ padding: 20 }}><JobStatusBanner job={analysisJob} /></div>
            }
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto' }}>

            {/* 1 — Hero */}
            <Card>
              <div style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(125,211,252,.55),transparent)', opacity: .7 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                      {a.prospect_company || 'Prospect non identifié'}
                    </div>
                    {(a.contact_name || a.contact_role) && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
                        {[a.contact_name, a.contact_role].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 4 }}>
                      {[call.users?.name, call.campaigns?.campaign_name, formatDate(call.call_datetime)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {qualifiedAppt
                        ? <Pill tone="info">✓ RDV qualifié</Pill>
                        : <Pill tone="neutral">Non qualifié</Pill>
                      }
                      <Pill tone={explanation?.temperature.level === 'hot' ? 'good' : explanation?.temperature.level === 'warm' ? 'warn' : 'neutral'}>
                        {temperatureLabel(explanation?.temperature.level)}
                      </Pill>
                    </div>
                    {a.appointment_quality_score != null && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 2 }}>Score RDV</span>
                        <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{a.appointment_quality_score}</span>
                      </div>
                    )}
                  </div>
                </div>

                {(a.appointment_booked || a.next_step) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Pill tone={a.appointment_booked ? 'good' : 'neutral'}>
                      {a.appointment_booked ? 'RDV posé' : 'Pas de RDV'}
                    </Pill>
                    {(a.appointment_datetime || a.appointment_date_text) && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cyan)' }}>
                        {a.appointment_datetime ? formatDate(a.appointment_datetime) : a.appointment_date_text}
                      </span>
                    )}
                    {a.next_step && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--muted-2)' }}>Prochaine étape : </span>{a.next_step}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* 2 — Pourquoi (simplified, expandable) */}
            {explanation && (
              <Card>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Pourquoi cette analyse ?</span>
                    <Pill tone={explanation.qualification.qualified ? 'info' : 'warn'}>
                      RDV {explanation.qualification.qualified ? 'qualifié' : 'non qualifié'}
                    </Pill>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: explanation.missingInfo.length > 0 ? '1fr 1fr' : '1fr', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Qualification</div>
                      <ReasonList items={explanation.qualification.reasons} limit={explainExpanded ? undefined : 3} />
                    </div>
                    {explanation.missingInfo.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>À compléter</div>
                        <ReasonList items={explanation.missingInfo} limit={explainExpanded ? undefined : 2} />
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Recommandation : </span>
                    {explanation.recommendation}
                  </div>

                  {explainExpanded && (
                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                          Température : <span style={{ color: 'var(--text)', textTransform: 'none' }}>{temperatureLabel(explanation.temperature.level)}</span>
                        </div>
                        <ReasonList items={explanation.temperature.reasons} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Score détaillé</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{explanation.score.value ?? '–'}/100</span>
                        </div>
                        <ScoreBreakdownList items={explanation.score.breakdown} />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setExplainExpanded(v => !v)}
                    style={{ marginTop: 12, fontSize: 12, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {explainExpanded ? 'Masquer le détail' : 'Voir le détail du score'}
                    <span className="mat" style={{ fontSize: 14, transform: explainExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>expand_more</span>
                  </button>
                </div>
              </Card>
            )}

            {/* 3 — Business Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Card>
                <SectionHeader title="Prospect" />
                <div style={{ padding: '4px 16px 12px' }}>
                  <Row label="Entreprise" value={a.prospect_company} />
                  <Row label="Contact" value={a.contact_name} />
                  <Row label="Fonction" value={a.contact_role} />
                  <Row label="Décideur" value={
                    a.decision_maker_detected === true
                      ? <Pill tone="good">Confirmé</Pill>
                      : a.decision_maker_detected === false
                      ? <Pill tone="bad">Non confirmé</Pill>
                      : null
                  } />
                  {a.call_summary && (
                    <Row label="Résumé" value={
                      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, textAlign: 'right', display: 'block' }}>
                        {a.call_summary.length > 100 ? a.call_summary.slice(0, 97) + '…' : a.call_summary}
                      </span>
                    } />
                  )}
                </div>
              </Card>

              <Card>
                <SectionHeader title="Qualification" />
                <div style={{ padding: '4px 16px 12px' }}>
                  <Row label="Intérêt" value={<InterestBadge level={a.interest_level} />} />
                  <Row label="Besoin" value={
                    a.pain_point_detected === true
                      ? <Pill tone="good">Identifié</Pill>
                      : a.pain_point_detected === false
                      ? <Pill tone="bad">Non identifié</Pill>
                      : null
                  } />
                  {a.pain_point_details && <Row label="Détail besoin" value={a.pain_point_details} />}
                  <Row label="Urgence" value={a.urgency} />
                  <Row label="Solution actuelle" value={a.current_solution} />
                  {a.objection_detected && (
                    <Row label="Objection" value={
                      <span style={{ color: '#fcd34d', fontSize: 12 }}>
                        {a.objection_type || 'Détectée'}{a.objection_details ? ` — ${a.objection_details}` : ''}
                      </span>
                    } />
                  )}
                </div>
              </Card>
            </div>

            {/* 4 — Appointment */}
            <Card>
              <SectionHeader title="Rendez-vous" />
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Pill tone={a.appointment_booked ? 'good' : 'neutral'}>
                    {a.appointment_booked ? 'RDV posé' : 'Pas de RDV'}
                  </Pill>
                  {(a.appointment_datetime || a.appointment_date_text) && (
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>
                      {a.appointment_datetime ? formatDate(a.appointment_datetime) : a.appointment_date_text}
                    </span>
                  )}
                  {a.appointment_date_confidence && (
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Confiance : {a.appointment_date_confidence}</span>
                  )}
                </div>
                {a.next_step && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--muted-2)' }}>Prochaine étape : </span>{a.next_step}
                  </div>
                )}
              </div>
            </Card>

            {/* 5 — Coaching (collapsed, non-client) */}
            {hasCoaching && (
              <Accordion title="Coaching SDR" icon="school">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {(a.strengths?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Points forts</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {a.strengths.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: '#86efac', display: 'flex', gap: 8 }}><span style={{ color: 'var(--muted-2)' }}>+</span>{s}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(a.weaknesses?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Axes d&apos;amélioration</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {a.weaknesses.map((w: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: '#fcd34d', display: 'flex', gap: 8 }}><span style={{ color: 'var(--muted-2)' }}>−</span>{w}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(a.coaching_recommendations?.length ?? 0) > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Recommandations coaching</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {a.coaching_recommendations.map((r: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: 'var(--cyan)', display: 'flex', gap: 8 }}><span style={{ color: 'var(--muted-2)' }}>→</span>{r}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Accordion>
            )}

            {/* 6 — Transcript (collapsed, non-client) */}
            {!isClient && call.transcript && (
              <Accordion title="Transcription" icon="article">
                <pre style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, maxHeight: 400, overflowY: 'auto', margin: 0 }}>
                  {call.transcript}
                </pre>
              </Accordion>
            )}

            {/* 7 — Technical / Validation (collapsed, canValidate) */}
            {canValidate && (
              <Accordion title="Détails techniques" icon="settings">
                {(reviewResult?.flags?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Signalements automatiques</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {reviewResult!.flags.map((flag: string, i: number) => <Pill key={i} tone="bad">{flag}</Pill>)}
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Indicateurs IA</div>
                  <Row label="Risque IA" value={a.hallucination_risk ? <RiskBadge risk={a.hallucination_risk} /> : null} />
                  <Row label="Confiance IA" value={a.ai_confidence != null ? `${a.ai_confidence}%` : null} />
                </div>
                <ValidationPanel
                  analysis={{ ...a, validated_by_name: validatedByName }}
                  corrections={corrections}
                  auditLog={auditLog}
                  canEdit={canValidate}
                />
              </Accordion>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
