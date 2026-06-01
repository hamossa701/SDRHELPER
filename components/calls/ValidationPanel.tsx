'use client'
import { useState } from 'react'
import { Badge, Button } from '@/components/ui'
import type { CallAnalysis, FieldCorrection, FieldValidationStatus, AuditEntry } from '@/types'
import { formatAppointmentDate, formatDate } from '@/lib/utils'
import { computeTrustScore } from '@/lib/trust-score'

const REVIEW_FIELDS: { key: keyof CallAnalysis; label: string; multiline?: boolean }[] = [
  { key: 'prospect_company',     label: 'Entreprise' },
  { key: 'contact_name',         label: 'Contact' },
  { key: 'contact_role',         label: 'Fonction' },
  { key: 'pain_point_details',   label: 'Besoin identifié', multiline: true },
  { key: 'objection_details',    label: 'Détail objection', multiline: true },
  { key: 'next_step',            label: 'Prochaine étape',  multiline: true },
  { key: 'appointment_datetime', label: 'Date RDV' },
  { key: 'call_summary',         label: 'Résumé',           multiline: true },
]

const STATUS_CFG: Record<FieldValidationStatus, { label: string; cls: string }> = {
  pending:   { label: 'En attente', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  validated: { label: 'Validé',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  corrected: { label: 'Corrigé',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

const AUDIT_LABELS: Record<string, string> = {
  validate_field:   'Champ validé',
  correct_field:    'Champ corrigé',
  approve_analysis: 'Analyse approuvée',
}

const STATUS_STYLES: Record<FieldValidationStatus, { bg: string; color: string; border: string }> = {
  pending:   { bg: 'rgba(2,6,23,.28)',      color: 'var(--muted)',    border: 'var(--border)' },
  validated: { bg: 'rgba(34,197,94,.10)',   color: '#86efac',         border: 'rgba(34,197,94,.35)' },
  corrected: { bg: 'rgba(125,211,252,.10)', color: 'var(--cyan)',     border: 'rgba(125,211,252,.35)' },
}

function StatusBadge({ status }: { status: FieldValidationStatus }) {
  const { bg, color, border } = STATUS_STYLES[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
      {STATUS_CFG[status].label}
    </span>
  )
}

interface Props {
  analysis: CallAnalysis & { validated_by_name?: string | null }
  corrections: FieldCorrection[]
  auditLog: AuditEntry[]
  canEdit: boolean
}

export function ValidationPanel({ analysis, corrections, auditLog, canEdit }: Props) {
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, FieldValidationStatus>>(
    (analysis.field_validations || {}) as Record<string, FieldValidationStatus>
  )
  const [corrMap, setCorrMap] = useState<Record<string, FieldCorrection>>(
    Object.fromEntries(corrections.map(c => [c.field_name, c]))
  )
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue,    setEditValue]    = useState('')
  const [saving,       setSaving]       = useState<string | null>(null)
  const [approved,     setApproved]     = useState(analysis.human_validated)
  const [approvedBy,   setApprovedBy]   = useState<string | null>(analysis.validated_by_name || null)
  const [approvedAt,   setApprovedAt]   = useState<string | null>(analysis.validated_at || null)
  const [approving,    setApproving]    = useState(false)
  const [showAudit,    setShowAudit]    = useState(false)
  const [auditEntries] = useState<AuditEntry[]>(auditLog)

  const trust = computeTrustScore([{ ...analysis, field_validations: fieldStatuses } as CallAnalysis])

  function getStatus(key: string): FieldValidationStatus { return fieldStatuses[key] || 'pending' }

  function getDisplayValue(key: keyof CallAnalysis): string {
    const corr = corrMap[key as string]
    if (corr) return corr.corrected_value || ''
    const v = analysis[key]
    if (key === 'appointment_datetime') return formatAppointmentDate(v as string | null)
    return v !== null && v !== undefined ? String(v) : ''
  }

  async function handleValidate(key: string) {
    if (saving) return
    setSaving(key)
    try {
      const r = await fetch('/api/validation/field', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: analysis.id, fieldName: key, action: 'validate' }),
      })
      if (r.ok) setFieldStatuses(p => ({ ...p, [key]: 'validated' }))
    } finally { setSaving(null) }
  }

  async function handleCorrect(key: keyof CallAnalysis) {
    if (!editValue.trim() || saving) return
    const k = key as string
    setSaving(k)
    try {
      const origVal = getDisplayValue(key)
      const r = await fetch('/api/validation/field', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: analysis.id, fieldName: k, action: 'correct', originalValue: origVal, correctedValue: editValue.trim() }),
      })
      if (r.ok) {
        const data = await r.json()
        setFieldStatuses(p => ({ ...p, [k]: 'corrected' }))
        if (data.correction) setCorrMap(p => ({ ...p, [k]: data.correction }))
        setEditingField(null)
      }
    } finally { setSaving(null) }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      const r = await fetch('/api/validation/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: analysis.id }),
      })
      if (r.ok) {
        const data = await r.json()
        setApproved(true)
        setApprovedBy(data.validated_by_name)
        setApprovedAt(data.validated_at)
      }
    } finally { setApproving(false) }
  }

  // column grid shared between header and rows
  const COL = '140px 1fr 110px 160px'

  return (
    <div className="h3a-review-panel">
      <style>{`
        .h3a-review-panel .text-emerald-700,
        .h3a-review-panel .text-emerald-600 { color: #86efac !important; }
        .h3a-review-panel .text-blue-700,
        .h3a-review-panel .text-blue-600 { color: var(--cyan) !important; }
        .h3a-review-panel .bg-gray-100,
        .h3a-review-panel .bg-emerald-50,
        .h3a-review-panel .bg-blue-50 { background: rgba(2,6,23,.34) !important; }
        .h3a-review-panel .border-gray-200,
        .h3a-review-panel .border-blue-200,
        .h3a-review-panel .border-emerald-200 { border-color: var(--border) !important; }
        .h3a-review-panel .text-gray-900,
        .h3a-review-panel .text-gray-800 { color: var(--text) !important; }
        .h3a-review-panel .text-gray-600,
        .h3a-review-panel .text-gray-500,
        .h3a-review-panel .text-gray-400 { color: var(--muted) !important; }
      `}</style>

      {/* ── Panel header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Panneau de révision</div>
          <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>
            {trust.validated + trust.corrected} champ(s) révisé(s) · {trust.validated} validé(s) · {trust.corrected} corrigé(s)
          </div>
          {approved && approvedBy && (
            <div style={{ fontSize: 12, color: '#86efac', marginTop: 4 }}>
              Validé par {approvedBy}{approvedAt ? ` · ${formatDate(approvedAt)}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {trust.score !== null && (
            <Badge className={trust.labelBg}>Fiabilité IA : {trust.label} ({trust.score}%)</Badge>
          )}
          {approved
            ? <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,.10)', color: '#86efac', border: '1px solid rgba(34,197,94,.35)' }}>✓ Approuvé</span>
            : canEdit && <Button size="sm" onClick={handleApprove} loading={approving}>Approuver l&apos;analyse</Button>
          }
        </div>
      </div>

      {/* ── Review table ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '8px 16px', background: 'var(--thead)', borderBottom: '1px solid var(--border)', gap: 0 }}>
          {['Champ', 'Valeur extraite', 'Statut', 'Actions'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {REVIEW_FIELDS.map((field, idx) => {
          const key       = field.key as string
          const status    = getStatus(key)
          const display   = getDisplayValue(field.key)
          const corr      = corrMap[key]
          const isEditing = editingField === key
          const isSaving  = saving === key
          const isLast    = idx === REVIEW_FIELDS.length - 1

          return (
            <div
              key={key}
              style={{ display: 'grid', gridTemplateColumns: COL, padding: '11px 16px', alignItems: isEditing ? 'flex-start' : 'center', gap: 0, borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
            >
              {/* Champ */}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', paddingRight: 12 }}>{field.label}</span>

              {/* Valeur extraite */}
              <div style={{ paddingRight: 16, minWidth: 0 }}>
                {!isEditing ? (
                  <>
                    <span style={{ fontSize: 13, color: display ? 'var(--text)' : 'var(--muted-2)', fontStyle: display ? 'normal' : 'italic', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {display || '—'}
                    </span>
                    {corr && corr.original_value !== corr.corrected_value && (
                      <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 3, fontStyle: 'italic' }}>
                        Original IA : {corr.original_value || '—'}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {field.multiline
                      ? <textarea rows={3} value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'Geist, system-ui, sans-serif', resize: 'none', outline: 'none', lineHeight: 1.5 }}
                        />
                      : <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'Geist, system-ui, sans-serif', outline: 'none' }}
                        />
                    }
                    {corr && (
                      <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 4 }}>Original IA : {corr.original_value || '—'}</div>
                    )}
                  </>
                )}
              </div>

              {/* Statut */}
              <div>
                <StatusBadge status={status} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                {!isEditing ? (
                  canEdit && (
                    <>
                      {status !== 'validated' && (
                        <Button size="sm" variant="secondary" onClick={() => handleValidate(key)} loading={isSaving}>Valider</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setEditingField(key); setEditValue(display) }}>Corriger</Button>
                    </>
                  )
                ) : (
                  <>
                    <Button size="sm" onClick={() => handleCorrect(field.key)} loading={isSaving}>Sauvegarder</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>Annuler</Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── History (collapsed by default) ── */}
      {canEdit && (
        <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <button
            onClick={() => setShowAudit(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: showAudit ? '1px solid var(--border)' : 'none' }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Historique des modifications</span>
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{showAudit ? '▲ Masquer' : `▼ Voir (${auditEntries.length})`}</span>
          </button>
          {showAudit && (
            <div>
              {auditEntries.length === 0
                ? <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted-2)' }}>Aucune modification enregistrée.</div>
                : auditEntries.map((entry, idx) => (
                  <div key={entry.id} style={{ padding: '10px 16px', borderBottom: idx < auditEntries.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{entry.user?.name || 'Manager'}</span>
                        <span style={{ color: 'var(--muted-2)', margin: '0 6px' }}>·</span>
                        <span style={{ color: 'var(--muted)' }}>{AUDIT_LABELS[entry.action] || entry.action}</span>
                        {entry.field_name && <span style={{ color: 'var(--muted-2)', marginLeft: 6, fontSize: 12 }}>({entry.field_name})</span>}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted-2)', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDate(entry.created_at)}</span>
                    </div>
                    {entry.action === 'correct_field' && entry.old_value && entry.new_value && (
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        <span style={{ textDecoration: 'line-through', color: '#fca5a5' }}>{entry.old_value}</span>
                        <span style={{ margin: '0 6px', color: 'var(--muted-2)' }}>→</span>
                        <span style={{ color: '#86efac' }}>{entry.new_value}</span>
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
