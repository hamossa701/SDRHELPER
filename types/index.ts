// ============================================================
// SDRHelper - Core Types
// ============================================================

export type UserRole = 'owner' | 'manager' | 'sdr' | 'client'
export type FieldValidationStatus = 'pending' | 'validated' | 'corrected'
export type CampaignStatus = 'active' | 'paused' | 'completed'
export type InterestLevel = 'cold' | 'warm' | 'hot' | 'unclear'
export type HallucinationRisk = 'low' | 'medium' | 'high'
export type Plan = 'starter' | 'pro' | 'enterprise'

export interface Organization {
  id: string
  name: string
  plan: Plan
  created_at: string
}

export interface User {
  id: string
  organization_id: string
  name: string
  email: string
  role: UserRole
  created_at: string
}

export interface Campaign {
  id: string
  organization_id: string
  client_name: string
  campaign_name: string
  sector: string | null
  target_persona: string | null
  offer_description: string | null
  script_notes: string | null
  status: CampaignStatus
  created_at: string
}

export interface Call {
  id: string
  organization_id: string
  campaign_id: string
  sdr_id: string
  transcript: string | null
  audio_url: string | null
  call_datetime: string
  created_at: string
  // Joined fields
  campaign?: Campaign
  sdr?: User
  analysis?: CallAnalysis
}

export interface CallAnalysis {
  id: string
  call_id: string

  call_summary: string | null

  prospect_company: string | null
  contact_name: string | null
  contact_role: string | null
  decision_maker_detected: boolean | null

  pain_point_detected: boolean | null
  pain_point_details: string | null
  urgency: string | null
  current_solution: string | null
  interest_level: InterestLevel | null

  objection_detected: boolean
  objection_type: string | null
  objection_details: string | null

  appointment_booked: boolean
  appointment_datetime: string | null
  appointment_quality_score: number | null
  appointment_quality_reason: string | null
  next_step: string | null

  sdr_quality_score: number | null
  qualification_completeness_score: number | null
  strengths: string[]
  weaknesses: string[]
  coaching_recommendations: string[]

  ai_confidence: number | null
  hallucination_risk: HallucinationRisk | null
  missing_information: string[]
  uncertain_fields: string[]

  human_validated: boolean
  correction_notes: string | null

  // Human validation workflow (added via migration-validation.sql)
  field_validations: Record<string, FieldValidationStatus>
  validated_by: string | null
  validated_at: string | null

  created_at: string
}

export interface FieldCorrection {
  id: string
  analysis_id: string
  field_name: string
  original_value: string | null
  corrected_value: string | null
  corrected_by: string
  corrected_at: string
}

export interface AuditEntry {
  id: string
  organization_id: string
  user_id: string
  analysis_id: string | null
  field_name: string | null
  old_value: string | null
  new_value: string | null
  action: 'validate_field' | 'correct_field' | 'approve_analysis'
  created_at: string
  // joined
  user?: { name: string }
}

// AI Analysis JSON response shape
export interface AIAnalysisResponse {
  call_summary: string
  prospect: {
    company: string | null
    contact_name: string | null
    contact_role: string | null
    decision_maker_detected: boolean | null
  }
  qualification: {
    pain_point_detected: boolean | null
    pain_point_details: string | null
    urgency: string | null
    current_solution: string | null
    interest_level: InterestLevel
    objection_detected: boolean
    objection_type: string | null
    objection_details: string | null
    missing_information: string[]
  }
  appointment: {
    appointment_booked: boolean
    appointment_datetime: string | null
    appointment_quality_score: number
    quality_reason: string
    next_step: string | null
  }
  sdr_performance: {
    sdr_quality_score: number
    qualification_completeness_score: number
    strengths: string[]
    weaknesses: string[]
    coaching_recommendations: string[]
  }
  risk_control: {
    ai_confidence: number
    hallucination_risk: HallucinationRisk
    uncertain_fields: string[]
  }
}

// Review flags + campaign health (computed at runtime from CallAnalysis fields)
export interface ReviewFlagsResult {
  flags: string[]
  review_required: boolean
}

export interface CampaignHealthResult {
  score: number
  label: string
  labelClass: string
  labelBg: string
}

// Coaching intelligence (computed from existing fields — no AI calls)
export type { TrendDirection, SkillBreakdown, CoachingPriority, CoachingCall, SDRProfile } from '@/lib/coaching'

// Dashboard stats types
export interface OwnerStats {
  total_calls: number
  appointments_booked: number
  avg_appointment_quality: number
  avg_sdr_quality: number
  active_campaigns: number
}

export interface CampaignStats {
  campaign_id: string
  campaign_name: string
  client_name: string
  total_calls: number
  appointments_booked: number
  avg_quality: number
  status: CampaignStatus
}

export interface SDRStats {
  sdr_id: string
  sdr_name: string
  total_calls: number
  appointments_booked: number
  avg_quality: number
  avg_sdr_score: number
}
