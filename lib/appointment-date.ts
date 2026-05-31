export type AppointmentDateConfidence = 'high' | 'medium' | 'low'

export interface AppointmentDateExtraction {
  text: string | null
  datetime: string | null
  confidence: AppointmentDateConfidence | null
}

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
}

const DATE_TEXT_PATTERN =
  /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?(?:\s+(?:à|a)\s+|\s+)(\d{1,2})(?:h|:)(\d{2})?\b/i

export function normalizeAppointmentConfidence(value: unknown): AppointmentDateConfidence | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null
}

export function cleanAppointmentDateText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') return null
  return trimmed
}

export function parseIsoDatetime(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function extractAppointmentDateText(text: string): string | null {
  const match = text.match(DATE_TEXT_PATTERN)
  return match?.[0]?.trim() ?? null
}

export function normalizeFrenchAppointmentDate(
  text: string | null,
  referenceDatetime: string | null
): string | null {
  if (!text || !referenceDatetime) return null
  const match = text.match(DATE_TEXT_PATTERN)
  if (!match) return null

  const weekday = WEEKDAYS[match[1].toLowerCase()]
  const hour = Number(match[2])
  const minute = match[3] ? Number(match[3]) : 0
  if (weekday === undefined || hour > 23 || minute > 59) return null

  const ref = new Date(referenceDatetime)
  if (Number.isNaN(ref.getTime())) return null

  const daysUntil = (weekday - ref.getUTCDay() + 7) % 7 || 7
  const normalized = new Date(ref)
  normalized.setUTCDate(ref.getUTCDate() + daysUntil)
  normalized.setUTCHours(hour, minute, 0, 0)
  return normalized.toISOString()
}

export function resolveAppointmentDate(params: {
  aiDatetime: unknown
  aiDateText: unknown
  transcript: string
  callDatetime: string | null
  aiConfidence: unknown
}): AppointmentDateExtraction {
  const parsedIso = parseIsoDatetime(params.aiDatetime)
  const aiText = cleanAppointmentDateText(params.aiDateText)
  const rawAiDatetimeText = cleanAppointmentDateText(params.aiDatetime)
  const text = aiText ?? extractAppointmentDateText(rawAiDatetimeText ?? '') ?? extractAppointmentDateText(params.transcript)
  const normalizedFromText = normalizeFrenchAppointmentDate(text, params.callDatetime)
  const confidence =
    normalizeAppointmentConfidence(params.aiConfidence)
    ?? (text && (parsedIso || normalizedFromText) ? 'high' : text ? 'medium' : null)

  return {
    text,
    datetime: parsedIso ?? normalizedFromText,
    confidence,
  }
}

export function hasQualifiedAppointmentDate(value: {
  appointment_datetime?: string | null
  appointment_date_text?: string | null
  appointment_date_confidence?: string | null
}): boolean {
  if (value.appointment_datetime) return true
  if (!value.appointment_date_text?.trim()) return false
  return value.appointment_date_confidence === 'high' || value.appointment_date_confidence === 'medium'
}

export function cleanMissingInformationForAppointmentDate(
  missingInformation: unknown,
  appointmentDate: AppointmentDateExtraction
): string[] {
  const source = Array.isArray(missingInformation) ? missingInformation : []
  const filtered = source
    .filter((item): item is string => typeof item === 'string')
    .filter(item => !/date|horaire|créneau|creneau/i.test(item) || !appointmentDate.text)

  if (appointmentDate.text && !appointmentDate.datetime && !filtered.some(item => /date.*confirm/i.test(item))) {
    filtered.push('Date à confirmer')
  }

  return filtered
}
