import type { CallAnalysis } from '@/types'

export interface TrustScoreResult {
  score: number | null
  validated: number
  corrected: number
  total: number
  label: string
  labelClass: string
  labelBg: string
}

// Part 4 — AI Trust Score = validated_fields / (validated + corrected fields)
export function computeTrustScore(analyses: CallAnalysis[]): TrustScoreResult {
  let validated = 0
  let corrected = 0

  for (const a of analyses) {
    const vals = a.field_validations || {}
    for (const status of Object.values(vals)) {
      if (status === 'validated') validated++
      else if (status === 'corrected') corrected++
    }
  }

  const total = validated + corrected

  if (total === 0) {
    return { score: null, validated, corrected, total, label: 'Pas de données', labelClass: 'text-gray-400', labelBg: 'bg-gray-100 text-gray-500 border-gray-200' }
  }

  const score = Math.round((validated / total) * 100)

  if (score >= 80) return { score, validated, corrected, total, label: 'Excellent',    labelClass: 'text-emerald-600', labelBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 60) return { score, validated, corrected, total, label: 'Bon',          labelClass: 'text-blue-600',    labelBg: 'bg-blue-50 text-blue-700 border-blue-200' }
  return               { score, validated, corrected, total, label: 'À améliorer', labelClass: 'text-amber-600',   labelBg: 'bg-amber-50 text-amber-700 border-amber-200' }
}
