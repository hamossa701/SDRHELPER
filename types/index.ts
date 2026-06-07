// ============================================================
// SDRHelper - Core Types
// ============================================================

export type UserRole = 'owner' | 'manager' | 'sdr' | 'client'
export type FieldValidationStatus = 'pending' | 'validated' | 'corrected'
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'
export type AssignmentType = '1_day' | '2_days' | '3_days' | '4_days' | 'full_week' | 'custom'
export type AssignmentStatus = 'active' | 'cancelled'
export type InterestLevel = 'cold' | 'warm' | 'hot' | 'unclear'
export type HallucinationRisk = 'low' | 'medium' | 'high'
export type Plan = 'starter' | 'pro' | 'enterprise'
export type ReviewStatus = 'open' | 'in_review' | 'resolved'
export type AnalysisJobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type EvaluationCategory =
  | 'qualified_appointment'
  | 'unqualified_appointment'
  | 'gatekeeper'
  | 'voicemail'
  | 'wrong_contact'
  | 'budget_objection'
  | 'competitor_locked'
  | 'interested_no_meeting'
  | 'strong_opportunity'
  | 'no_need'
export type EvaluationDifficulty = 'easy' | 'medium' | 'hard'

export interface Organization {
  id: string
  name: string
  plan: Plan
  created_at: string
}

export interface ClientAccount {
  id: string
  organization_id: string
  name: string
  created_at: string
}

export interface User {
  id: string
  organization_id: string
  client_id: string | null
  manager_id: string | null
  name: string
  email: string
  role: UserRole
  created_at: string
}

export interface Campaign {
  id: string
  organization_id: string
  client_id: string
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
  external_call_id: string | null
  call_duration_seconds: number | null
  call_datetime: string
  source: string | null
  created_at: string
  review_status: ReviewStatus
  assigned_to: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  // Joined fields
  campaign?: Campaign
  sdr?: User
  analysis?: CallAnalysis
}

export interface AnalysisJob {
  id: string
  organization_id: string
  call_id: string | null
  status: AnalysisJobStatus
  error_message: string | null
  retry_count: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface AIUsageLog {
  id: string
  organization_id: string
  call_id: string | null
  job_id: string | null
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  created_at: string
}

export interface EvaluationCase {
  id: string
  title: string
  transcript: string
  expected_decision_maker: boolean
  expected_rdv_pose: boolean
  expected_rdv_qualifie: boolean
  expected_temperature: InterestLevel
  expected_reason: string
  category: EvaluationCategory
  difficulty: EvaluationDifficulty
  created_at: string
}

export interface EvaluationResult {
  id: string
  case_id: string
  run_id: string
  model: string
  actual_decision_maker: boolean | null
  actual_rdv_pose: boolean | null
  actual_rdv_qualifie: boolean | null
  actual_temperature: InterestLevel | null
  score: number | null
  passed: boolean
  mismatches: string[]
  ai_summary: string | null
  ai_reason: string | null
  error_message: string | null
  input_tokens: number | null
  output_tokens: number | null
  created_by: string | null
  created_at: string
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
  appointment_date_text: string | null
  appointment_datetime: string | null
  appointment_date_confidence: 'high' | 'medium' | 'low' | null
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
    appointment_date_text: string | null
    appointment_datetime: string | null
    appointment_date_confidence: 'high' | 'medium' | 'low' | null
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

// ── RPC return types ──────────────────────────────────────────────────────────

export interface DashboardKPIs {
  total_calls: number
  appointments_booked: number
  qualified_appointments: number
  avg_appointment_quality: number | null
  avg_sdr_quality: number | null
  active_campaigns: number
  sdrs_needing_coaching: number
  team_trend: 'improving' | 'stable' | 'declining'
}

export interface SDRLeaderboardRow {
  sdr_id: string
  sdr_name: string
  total_calls: number
  rdv_booked: number
  avg_sdr_quality: number | null
}

export interface ManagerKPIs {
  team_sdr_count: number
  today_calls: number
  calls_requiring_review: number
  appointments_booked: number
  qualified_appointments: number
  qualification_rate: number
  weak_appointments: number
  calls_reviewed: number
  calls_pending: number
  coaching_opportunities: number
  ai_trust_validated: number
  ai_trust_corrected: number
}

export interface SDRCoachingStatsRow {
  sdr_id: string
  sdr_name: string
  total_calls: number
  avg_sdr_quality: number | null
  avg_appointment_quality: number | null
  appointments_booked: number
  qualified_appointments: number
  qualification_rate: number
  calls_reviewed: number
  calls_requiring_review: number
  review_flag_rate: number | null
  avg_ai_confidence: number | null
  skill_opening: number
  skill_discovery: number
  skill_pain_point: number
  skill_objection_handling: number
  skill_qualification: number
  skill_closing: number
  trend: 'improving' | 'stable' | 'declining'
  booked_without_dm_rate: number
  booked_without_pain_rate: number
  missing_next_step_rate: number
  objection_no_detail_rate: number
  category: 'top' | 'stable' | 'needs_coaching'
  best_call_id: string | null
  worst_call_id: string | null
}

export interface ClientKPIsRow {
  total_calls: number
  hot_warm_contacts: number
  appointments_booked: number
  qualified_appointments: number
  qualification_rate: number | null
  decision_maker_rate: number | null
  appointment_conversion_rate: number | null
  validated_count: number
}

export interface ClientValueReportRow {
  label: string
  cnt: number
  kind: 'pain_point' | 'objection'
}

export interface ClientCampaignStatsRow {
  campaign_id: string
  total_calls: number
  appointments_booked: number
  qualified_appointments: number
  avg_appointment_quality: number | null
  health_label: string
  health_bg: string
}

// Internal-only: used by the owner dashboard which is allowed to see SDR/AI metrics
export interface DashboardCampaignStatsRow {
  campaign_id: string
  total_calls: number
  appointments_booked: number
  qualified_appointments: number
  avg_appointment_quality: number | null
  avg_sdr_quality: number | null
  avg_ai_confidence: number | null
}

export interface SDRDashboardKPIs {
  total_calls: number
  rdv_booked: number
  avg_rdv_quality: number | null
  avg_sdr_quality: number | null
  conversion_rate: number
}

export interface CampaignAssignment {
  id: string
  organization_id: string
  campaign_id: string
  sdr_id: string
  assigned_by: string
  starts_at: string  // 'YYYY-MM-DD'
  ends_at: string    // 'YYYY-MM-DD'
  assignment_type: AssignmentType
  status: AssignmentStatus
  created_at: string
}
