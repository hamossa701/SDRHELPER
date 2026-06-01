export type AppointmentDateConfidence = 'high' | 'medium' | 'low'

export interface AppointmentDateExtraction {
  text: string | null
  datetime: string | null
  confidence: AppointmentDateConfidence | null
}

export const DEFAULT_APPOINTMENT_TIME_ZONE = 'Europe/Paris'

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

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  )

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone)
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  return zonedAsUtc - date.getTime()
}

function zonedWallTimeToIso(params: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  timeZone: string
}): string {
  const wallTimeUtc = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute, 0, 0)
  let utcTime = wallTimeUtc

  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMs(new Date(utcTime), params.timeZone)
    utcTime = wallTimeUtc - offset
  }

  return new Date(utcTime).toISOString()
}

export function normalizeFrenchAppointmentDate(
  text: string | null,
  referenceDatetime: string | null,
  timeZone = DEFAULT_APPOINTMENT_TIME_ZONE
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

  const refParts = getZonedDateParts(ref, timeZone)
  const refLocalDate = new Date(Date.UTC(refParts.year, refParts.month - 1, refParts.day))
  const daysUntil = (weekday - refLocalDate.getUTCDay() + 7) % 7 || 7
  const appointmentLocalDate = new Date(refLocalDate)
  appointmentLocalDate.setUTCDate(refLocalDate.getUTCDate() + daysUntil)

  return zonedWallTimeToIso({
    year: appointmentLocalDate.getUTCFullYear(),
    month: appointmentLocalDate.getUTCMonth() + 1,
    day: appointmentLocalDate.getUTCDate(),
    hour,
    minute,
    timeZone,
  })
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
    datetime: normalizedFromText ?? parsedIso,
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
