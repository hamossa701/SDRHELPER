'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, Badge, Button } from '@/components/ui'
import type { CallAnalysis, FieldCorrection, FieldValidationStatus, AuditEntry } from '@/types'
import { formatDate } from '@/lib/utils'
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

  return (
    <div className="space-y-4 h3a-review-panel">
      <style>{`
        .h3a-review-panel .text-gray-900,
        .h3a-review-panel .text-gray-800 { color: var(--text) !important; }
        .h3a-review-panel .text-gray-600,
        .h3a-review-panel .text-gray-500,
        .h3a-review-panel .text-gray-400 { color: var(--muted) !important; }
        .h3a-review-panel .bg-gray-100,
        .h3a-review-panel .bg-emerald-50,
        .h3a-review-panel .bg-blue-50 { background: rgba(2,6,23,.34) !important; }
        .h3a-review-panel .text-emerald-700,
        .h3a-review-panel .text-emerald-600 { color: #86efac !important; }
        .h3a-review-panel .text-blue-700,
        .h3a-review-panel .text-blue-600 { color: var(--cyan) !important; }
        .h3a-review-panel .border-gray-300,
        .h3a-review-panel .border-gray-200,
        .h3a-review-panel .border-blue-200,
        .h3a-review-panel .border-emerald-200,
        .h3a-review-panel .divide-gray-50 > :not([hidden]) ~ :not([hidden]) { border-color: var(--border) !important; }
        .h3a-review-panel input,
        .h3a-review-panel textarea {
          background: var(--input-bg) !important;
          border-color: var(--border) !important;
          color: var(--text) !important;
          font-family: Geist, system-ui, sans-serif;
        }
        .h3a-review-panel input:focus,
        .h3a-review-panel textarea:focus {
          border-color: var(--border-strong) !important;
          box-shadow: 0 0 0 3px rgba(125,211,252,.10) !important;
        }
      `}</style>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Panneau de révision</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {trust.validated + trust.corrected} champ(s) révisé(s) · {trust.validated} validé(s) · {trust.corrected} corrigé(s)
              </p>
              {approved && approvedBy && (
                <p className="text-xs text-emerald-600 mt-1">
                  Validé par {approvedBy}{approvedAt ? ` · ${formatDate(approvedAt)}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {trust.score !== null && (
                <Badge className={trust.labelBg}>Fiabilité IA : {trust.label} ({trust.score}%)</Badge>
              )}
              {approved
                ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Approuvé</Badge>
                : canEdit && <Button size="sm" onClick={handleApprove} loading={approving}>Approuver l&apos;analyse</Button>
              }
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y divide-gray-50">
            {REVIEW_FIELDS.map(field => {
              const key     = field.key as string
              const status  = getStatus(key)
              const sc      = STATUS_CFG[status]
              const display = getDisplayValue(field.key)
              const corr    = corrMap[key]
              const isEditing = editingField === key
              const isSaving  = saving === key

              return (
                <div key={key} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Part 1 — label + validation status badge + confidence */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{field.label}</span>
                        <Badge className={sc.cls + ' text-xs'}>{sc.label}</Badge>
                        {analysis.ai_confidence !== null && (
                          <span className="text-xs text-gray-400">Confiance : {analysis.ai_confidence}%</span>
                        )}
                      </div>

                      {!isEditing ? (
                        <>
                          <p className="text-sm text-gray-800">{display || <span className="text-gray-400 italic">—</span>}</p>
                          {corr && corr.original_value !== corr.corrected_value && (
                            <p className="text-xs text-gray-400 mt-0.5 italic">Original IA : {corr.original_value || '—'}</p>
                          )}
                        </>
                      ) : (
                        <div className="mt-1 space-y-2">
                          {field.multiline
                            ? <textarea rows={3} value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none" />
                            : <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
                          }
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleCorrect(field.key)} loading={isSaving}>Sauvegarder</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>Annuler</Button>
                          </div>
                          {corr && <p className="text-xs text-gray-400">Original IA : {corr.original_value || '—'}</p>}
                        </div>
                      )}
                    </div>

                    {/* Part 3 — validate / correct buttons */}
                    {canEdit && !isEditing && (
                      <div className="flex gap-1 shrink-0 mt-1">
                        {status !== 'validated' && (
                          <Button size="sm" variant="secondary" onClick={() => handleValidate(key)} loading={isSaving}>Valider</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { setEditingField(key); setEditValue(display) }}>Corriger</Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Part 6 — Audit log: collapsible, managers/owners only */}
      {canEdit && (
        <Card>
          <CardHeader>
            <button onClick={() => setShowAudit(v => !v)} className="flex items-center justify-between w-full text-left">
              <h3 className="text-sm font-semibold text-gray-900">Historique des modifications</h3>
              <span className="text-xs text-gray-400">{showAudit ? '▲ Masquer' : `▼ Voir (${auditEntries.length})`}</span>
            </button>
          </CardHeader>
          {showAudit && (
            <CardContent className="p-0">
              {auditEntries.length === 0
                ? <p className="px-6 py-4 text-sm text-gray-400">Aucune modification enregistrée.</p>
                : (
                  <div className="divide-y divide-gray-50">
                    {auditEntries.map(entry => (
                      <div key={entry.id} className="px-6 py-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-800">{entry.user?.name || 'Manager'}</span>
                            <span className="text-gray-400 mx-1">·</span>
                            <span className="text-gray-600">{AUDIT_LABELS[entry.action] || entry.action}</span>
                            {entry.field_name && <span className="text-gray-400 ml-1">({entry.field_name})</span>}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{formatDate(entry.created_at)}</span>
                        </div>
                        {entry.action === 'correct_field' && entry.old_value && entry.new_value && (
                          <div className="mt-0.5 text-xs">
                            <span className="line-through text-red-400">{entry.old_value}</span>
                            <span className="mx-1 text-gray-400">→</span>
                            <span className="text-emerald-600">{entry.new_value}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
