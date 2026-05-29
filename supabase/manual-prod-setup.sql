-- ============================================================
-- SDRHelper — COMPLETE PRODUCTION SETUP
-- Single safe file. Run once in Supabase SQL Editor.
--
-- Safe to re-run: every statement uses IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, or
-- DROP IF EXISTS before recreating. No data is dropped.
--
-- Dependency order is handled inside this file — you do not
-- need to run any other migration file.
-- ============================================================


-- ============================================================
-- SECTION 1: EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- SECTION 2: BASE TABLES
-- These are safe to run even if the tables already exist.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  plan       text        NOT NULL DEFAULT 'starter'
                         CHECK (plan IN ('starter', 'pro', 'enterprise')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  email           text        NOT NULL,
  role            text        NOT NULL DEFAULT 'sdr'
                              CHECK (role IN ('owner', 'manager', 'sdr', 'client')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_name       text        NOT NULL,
  campaign_name     text        NOT NULL,
  sector            text,
  target_persona    text,
  offer_description text,
  script_notes      text,
  status            text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused', 'completed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_clients (
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.users(id)     ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campaign_sdrs (
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.users(id)     ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.calls (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id)     ON DELETE CASCADE,
  sdr_id          uuid        NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  transcript      text,
  audio_url       text,
  call_datetime   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.call_analyses (
  id                               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id                          uuid        NOT NULL UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  call_summary                     text,
  prospect_company                 text,
  contact_name                     text,
  contact_role                     text,
  decision_maker_detected          boolean,
  pain_point_detected              boolean,
  pain_point_details               text,
  urgency                          text,
  current_solution                 text,
  interest_level                   text        CHECK (interest_level IN ('cold','warm','hot','unclear')),
  objection_detected               boolean     DEFAULT false,
  objection_type                   text,
  objection_details                text,
  appointment_booked               boolean     DEFAULT false,
  appointment_datetime             timestamptz,
  appointment_quality_score        integer     CHECK (appointment_quality_score BETWEEN 0 AND 100),
  appointment_quality_reason       text,
  next_step                        text,
  sdr_quality_score                integer     CHECK (sdr_quality_score BETWEEN 0 AND 100),
  qualification_completeness_score integer     CHECK (qualification_completeness_score BETWEEN 0 AND 100),
  strengths                        jsonb       DEFAULT '[]',
  weaknesses                       jsonb       DEFAULT '[]',
  coaching_recommendations         jsonb       DEFAULT '[]',
  ai_confidence                    integer     CHECK (ai_confidence BETWEEN 0 AND 100),
  hallucination_risk               text        CHECK (hallucination_risk IN ('low','medium','high')),
  missing_information              jsonb       DEFAULT '[]',
  uncertain_fields                 jsonb       DEFAULT '[]',
  human_validated                  boolean     DEFAULT false,
  correction_notes                 text,
  created_at                       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.field_corrections (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_id     uuid        NOT NULL REFERENCES public.call_analyses(id) ON DELETE CASCADE,
  field_name      text        NOT NULL,
  original_value  text,
  corrected_value text,
  corrected_by    uuid        NOT NULL REFERENCES public.users(id),
  corrected_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, field_name)
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  analysis_id     uuid        REFERENCES public.call_analyses(id) ON DELETE SET NULL,
  field_name      text,
  old_value       text,
  new_value       text,
  action          text        NOT NULL
                              CHECK (action IN ('validate_field','correct_field','approve_analysis')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Tracks every AI analysis request, its progress, and outcome
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_id         uuid        REFERENCES public.calls(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','completed','failed')),
  error_message   text,
  retry_count     int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

-- Tracks token usage and estimated USD cost per AI call
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                 uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_id            uuid          REFERENCES public.calls(id)         ON DELETE SET NULL,
  job_id             uuid          REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  model              text          NOT NULL,
  input_tokens       int           NOT NULL,
  output_tokens      int           NOT NULL,
  estimated_cost_usd numeric(10,6) NOT NULL,
  created_at         timestamptz   NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 3: ADD MISSING COLUMNS TO EXISTING TABLES
-- Safe: ADD COLUMN IF NOT EXISTS never errors on re-run.
-- ============================================================

-- call_analyses: human validation workflow (migration-validation.sql)
ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS field_validations jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validated_by      uuid  REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS validated_at      timestamptz;

-- calls: manager review queue (migration-hardening.sql)
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'open'
    CHECK (review_status IN ('open','in_review','resolved')),
  ADD COLUMN IF NOT EXISTS assigned_to  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz;

-- analysis_jobs: retry backoff timestamp (migration-async-jobs.sql)
ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;


-- ============================================================
-- SECTION 4: ENABLE ROW LEVEL SECURITY
-- Safe to run on tables that already have RLS enabled.
-- ============================================================

ALTER TABLE public.organizations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sdrs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_analyses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log      ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 5: HELPER FUNCTIONS
-- Used by all RLS policies. SECURITY DEFINER so they can read
-- public.users regardless of the caller's own RLS context.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;


-- ============================================================
-- SECTION 6: RLS POLICIES
-- Every policy is dropped (IF EXISTS) then recreated fresh.
-- This replaces any old versions from earlier partial migrations
-- with the final hardened versions without needing run order.
-- ============================================================

-- ── organizations ────────────────────────────────────────────
DROP POLICY IF EXISTS "org_select" ON public.organizations;
CREATE POLICY "org_select" ON public.organizations
  FOR SELECT USING (id = get_my_org_id());

-- ── users ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select"                  ON public.users;
DROP POLICY IF EXISTS "users_insert"                  ON public.users;
DROP POLICY IF EXISTS "users_update"                  ON public.users;
DROP POLICY IF EXISTS "users_update_admin"            ON public.users;
DROP POLICY IF EXISTS "users_update_self"             ON public.users;
DROP POLICY IF EXISTS "users_no_privilege_escalation" ON public.users;

-- owner/manager/sdr see all users in their org; client sees only their own row
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() IN ('owner','manager','sdr')
      OR id = auth.uid()
    )
  );

CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (organization_id = get_my_org_id());

-- owner/manager can update any user in their org; cannot move users to another org
CREATE POLICY "users_update_admin" ON public.users
  FOR UPDATE
  USING  (organization_id = get_my_org_id() AND get_my_role() IN ('owner','manager'))
  WITH CHECK (organization_id = get_my_org_id());

-- any user can update their own row (role/org changes blocked by restrictive policy below)
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE
  USING  (id = auth.uid() AND organization_id = get_my_org_id())
  WITH CHECK (id = auth.uid() AND organization_id = get_my_org_id());

-- RESTRICTIVE: nobody except owner/manager can change role or organization_id.
-- AS RESTRICTIVE means this ANDs with every permissive policy — it cannot be bypassed.
CREATE POLICY "users_no_privilege_escalation" ON public.users
  AS RESTRICTIVE FOR UPDATE
  WITH CHECK (
    get_my_role() IN ('owner','manager')
    OR (
      role            = (SELECT role FROM public.users WHERE id = auth.uid())
      AND organization_id = get_my_org_id()
    )
  );

-- ── campaigns ────────────────────────────────────────────────
DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update" ON public.campaigns;

-- Clients cannot read campaigns directly; all client data flows via SECURITY DEFINER RPCs
CREATE POLICY "campaigns_select" ON public.campaigns
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager','sdr')
  );

CREATE POLICY "campaigns_insert" ON public.campaigns
  FOR INSERT WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager')
  );

CREATE POLICY "campaigns_update" ON public.campaigns
  FOR UPDATE USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager')
  );

-- ── campaign_clients ─────────────────────────────────────────
DROP POLICY IF EXISTS "campaign_clients_select" ON public.campaign_clients;
DROP POLICY IF EXISTS "campaign_clients_insert" ON public.campaign_clients;

-- Two explicit branches: staff verify via org; client reads only their own assignments
CREATE POLICY "campaign_clients_select" ON public.campaign_clients
  FOR SELECT USING (
    (
      get_my_role() IN ('owner','manager','sdr')
      AND EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_id AND c.organization_id = get_my_org_id()
      )
    )
    OR
    (
      get_my_role() = 'client'
      AND user_id = auth.uid()
    )
  );

-- Both the campaign and the user being linked must belong to the caller's org
CREATE POLICY "campaign_clients_insert" ON public.campaign_clients
  FOR INSERT WITH CHECK (
    get_my_role() IN ('owner','manager')
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.organization_id = get_my_org_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_id AND u.organization_id = get_my_org_id()
    )
  );

-- ── campaign_sdrs ─────────────────────────────────────────────
DROP POLICY IF EXISTS "campaign_sdrs_select" ON public.campaign_sdrs;
DROP POLICY IF EXISTS "campaign_sdrs_insert" ON public.campaign_sdrs;

CREATE POLICY "campaign_sdrs_select" ON public.campaign_sdrs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.organization_id = get_my_org_id()
    )
  );

CREATE POLICY "campaign_sdrs_insert" ON public.campaign_sdrs
  FOR INSERT WITH CHECK (get_my_role() IN ('owner','manager'));

-- ── calls ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "calls_select" ON public.calls;
DROP POLICY IF EXISTS "calls_insert" ON public.calls;

-- Clients cannot read calls directly — served via server component with service role key
CREATE POLICY "calls_select" ON public.calls
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager','sdr')
    AND (
      get_my_role() IN ('owner','manager')
      OR sdr_id = auth.uid()
    )
  );

CREATE POLICY "calls_insert" ON public.calls
  FOR INSERT WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager','sdr')
  );

-- ── call_analyses ─────────────────────────────────────────────
DROP POLICY IF EXISTS "call_analyses_select" ON public.call_analyses;
DROP POLICY IF EXISTS "call_analyses_insert" ON public.call_analyses;
DROP POLICY IF EXISTS "call_analyses_update" ON public.call_analyses;

-- Clients cannot read call_analyses directly
CREATE POLICY "call_analyses_select" ON public.call_analyses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id
        AND c.organization_id = get_my_org_id()
        AND get_my_role() IN ('owner','manager','sdr')
        AND (
          get_my_role() IN ('owner','manager')
          OR c.sdr_id = auth.uid()
        )
    )
  );

CREATE POLICY "call_analyses_insert" ON public.call_analyses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id AND c.organization_id = get_my_org_id()
    )
  );

CREATE POLICY "call_analyses_update" ON public.call_analyses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id
        AND c.organization_id = get_my_org_id()
        AND get_my_role() IN ('owner','manager')
    )
  );

-- ── field_corrections ─────────────────────────────────────────
DROP POLICY IF EXISTS "field_corrections_select" ON public.field_corrections;
DROP POLICY IF EXISTS "field_corrections_insert" ON public.field_corrections;
DROP POLICY IF EXISTS "field_corrections_update" ON public.field_corrections;

CREATE POLICY "field_corrections_select" ON public.field_corrections
  FOR SELECT USING (
    get_my_role() IN ('owner','manager')
    AND EXISTS (
      SELECT 1 FROM public.call_analyses ca
      JOIN public.calls c ON c.id = ca.call_id
      WHERE ca.id = analysis_id AND c.organization_id = get_my_org_id()
    )
  );

CREATE POLICY "field_corrections_insert" ON public.field_corrections
  FOR INSERT WITH CHECK (
    get_my_role() IN ('owner','manager')
    AND EXISTS (
      SELECT 1 FROM public.call_analyses ca
      JOIN public.calls c ON c.id = ca.call_id
      WHERE ca.id = analysis_id AND c.organization_id = get_my_org_id()
    )
  );

CREATE POLICY "field_corrections_update" ON public.field_corrections
  FOR UPDATE USING (get_my_role() IN ('owner','manager'));

-- ── audit_log ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;

CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager')
  );

CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager')
  );

-- ── analysis_jobs ─────────────────────────────────────────────
DROP POLICY IF EXISTS "analysis_jobs_select" ON public.analysis_jobs;
DROP POLICY IF EXISTS "analysis_jobs_insert" ON public.analysis_jobs;
DROP POLICY IF EXISTS "analysis_jobs_update" ON public.analysis_jobs;

-- Clients cannot see job records
CREATE POLICY "analysis_jobs_select" ON public.analysis_jobs
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager','sdr')
  );

CREATE POLICY "analysis_jobs_insert" ON public.analysis_jobs
  FOR INSERT WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "analysis_jobs_update" ON public.analysis_jobs
  FOR UPDATE USING (organization_id = get_my_org_id());

-- ── ai_usage_log ──────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_usage_log_select" ON public.ai_usage_log;
DROP POLICY IF EXISTS "ai_usage_log_insert" ON public.ai_usage_log;

CREATE POLICY "ai_usage_log_select" ON public.ai_usage_log
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner','manager')
  );

CREATE POLICY "ai_usage_log_insert" ON public.ai_usage_log
  FOR INSERT WITH CHECK (organization_id = get_my_org_id());


-- ============================================================
-- SECTION 7: INDEXES
-- IF NOT EXISTS makes all of these safe to re-run.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_calls_org_datetime
  ON public.calls(organization_id, call_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_calls_sdr_id
  ON public.calls(sdr_id);

CREATE INDEX IF NOT EXISTS idx_calls_campaign_id
  ON public.calls(campaign_id);

-- Partial index: excludes resolved rows for manager review queue performance
CREATE INDEX IF NOT EXISTS idx_calls_review_open
  ON public.calls(organization_id, review_status)
  WHERE review_status != 'resolved';

CREATE INDEX IF NOT EXISTS idx_call_analyses_call_id
  ON public.call_analyses(call_id);

CREATE INDEX IF NOT EXISTS idx_call_analyses_validated
  ON public.call_analyses(human_validated);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_org_status
  ON public.analysis_jobs(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_call_id
  ON public.analysis_jobs(call_id);

-- Partial index: used by the worker to efficiently find pending jobs
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_pending_queue
  ON public.analysis_jobs(created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_org
  ON public.ai_usage_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_analysis_id
  ON public.audit_log(analysis_id);


-- ============================================================
-- SECTION 8: CLAIM FUNCTION FOR ASYNC PIPELINE
-- Called only by the server-side worker via the service role key.
-- FOR UPDATE SKIP LOCKED ensures concurrent worker invocations
-- never claim the same job. EXECUTE revoked from all SDK roles
-- so no browser caller can touch the queue directly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_analysis_jobs(p_batch_size int DEFAULT 3)
RETURNS SETOF public.analysis_jobs
LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE public.analysis_jobs
  SET    status     = 'processing',
         started_at = now()
  WHERE  id IN (
    SELECT id
    FROM   public.analysis_jobs
    WHERE  status = 'pending'
      AND  (retry_after IS NULL OR retry_after <= now())
    ORDER  BY created_at ASC
    LIMIT  p_batch_size
    FOR    UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_analysis_jobs(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_analysis_jobs(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_analysis_jobs(int) FROM anon;


-- ============================================================
-- SECTION 9: AGGREGATION RPCs
-- CREATE OR REPLACE is safe to re-run on existing functions.
-- ============================================================

-- Owner dashboard: org-wide KPIs
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_org_id uuid)
RETURNS TABLE (
  total_calls             bigint,
  appointments_booked     bigint,
  qualified_appointments  bigint,
  avg_appointment_quality integer,
  avg_sdr_quality         integer,
  active_campaigns        bigint,
  sdrs_needing_coaching   bigint,
  team_trend              text
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH sdr_avgs AS (
    SELECT u.id,
           ROUND(AVG(ca.sdr_quality_score))::integer AS avg_q
    FROM   users u
    LEFT JOIN calls c  ON c.sdr_id = u.id AND c.organization_id = p_org_id
    LEFT JOIN call_analyses ca ON ca.call_id = c.id
    WHERE  u.organization_id = p_org_id AND u.role = 'sdr'
    GROUP  BY u.id
  ),
  ranked_team AS (
    SELECT ca.sdr_quality_score,
           ROW_NUMBER() OVER (ORDER BY c.call_datetime DESC) AS rn
    FROM   calls c
    JOIN   call_analyses ca ON ca.call_id = c.id
    WHERE  c.organization_id = p_org_id AND ca.sdr_quality_score IS NOT NULL
  ),
  team_avgs AS (
    SELECT AVG(sdr_quality_score) FILTER (WHERE rn <= 10)             AS recent_avg,
           AVG(sdr_quality_score) FILTER (WHERE rn > 10 AND rn <= 20) AS prior_avg
    FROM   ranked_team
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM calls WHERE organization_id = p_org_id),
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    COUNT(ca.id) FILTER (WHERE
        ca.appointment_booked = true AND ca.decision_maker_detected = true
      AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
      AND ca.appointment_quality_score >= 60)::bigint,
    ROUND(AVG(ca.appointment_quality_score))::integer,
    ROUND(AVG(ca.sdr_quality_score))::integer,
    (SELECT COUNT(*)::bigint FROM campaigns WHERE organization_id = p_org_id AND status = 'active'),
    (SELECT COUNT(*)::bigint FROM sdr_avgs WHERE avg_q IS NULL OR avg_q < 55),
    (SELECT CASE
       WHEN ta.recent_avg IS NULL OR ta.prior_avg IS NULL THEN 'stable'
       WHEN ta.recent_avg > ta.prior_avg + 5             THEN 'improving'
       WHEN ta.recent_avg < ta.prior_avg - 5             THEN 'declining'
       ELSE 'stable'
     END FROM team_avgs ta)
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.organization_id = p_org_id;
$$;

-- SDR leaderboard for owner dashboard
CREATE OR REPLACE FUNCTION public.get_sdr_leaderboard(p_org_id uuid)
RETURNS TABLE (
  sdr_id          uuid,
  sdr_name        text,
  total_calls     bigint,
  rdv_booked      bigint,
  avg_sdr_quality integer
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    u.id, u.name,
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    ROUND(AVG(ca.sdr_quality_score))::integer
  FROM users u
  LEFT JOIN calls c  ON c.sdr_id = u.id AND c.organization_id = p_org_id
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE u.organization_id = p_org_id AND u.role = 'sdr'
  GROUP BY u.id, u.name
  ORDER BY ROUND(AVG(ca.sdr_quality_score)) DESC NULLS LAST;
$$;

-- Manager dashboard KPIs
CREATE OR REPLACE FUNCTION public.get_manager_kpis(p_org_id uuid)
RETURNS TABLE (
  today_calls            bigint,
  calls_requiring_review bigint,
  appointments_booked    bigint,
  qualified_appointments bigint,
  qualification_rate     integer,
  calls_reviewed         bigint,
  calls_pending          bigint,
  ai_trust_validated     bigint,
  ai_trust_corrected     bigint
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM calls
     WHERE organization_id = p_org_id
       AND call_datetime >= current_date::timestamptz),
    COUNT(ca.id) FILTER (WHERE
        ca.id IS NOT NULL AND c.review_status != 'resolved'
      AND (
          (ca.appointment_booked = true AND ca.decision_maker_detected IS NOT TRUE)
        OR(ca.appointment_booked = true AND ca.appointment_quality_score < 60)
        OR(ca.appointment_booked = true AND ca.appointment_datetime IS NULL)
        OR(ca.appointment_booked = true AND ca.pain_point_detected IS NOT TRUE)
        OR(ca.ai_confidence IS NOT NULL AND ca.ai_confidence < 70)
        OR(ca.hallucination_risk IN ('medium','high'))
        OR(ca.qualification_completeness_score IS NOT NULL AND ca.qualification_completeness_score < 60)
        OR(ca.objection_detected = true AND ca.objection_details IS NULL)
        OR(ca.next_step IS NULL)
      ))::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    COUNT(ca.id) FILTER (WHERE
        ca.appointment_booked = true AND ca.decision_maker_detected = true
      AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
      AND ca.appointment_quality_score >= 60)::bigint,
    CASE WHEN COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE
          ca.appointment_booked = true AND ca.decision_maker_detected = true
        AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
        AND ca.appointment_quality_score >= 60)::numeric
        / COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true) * 100)::integer
    ELSE 0 END,
    COUNT(ca.id) FILTER (WHERE ca.human_validated = true)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.id IS NOT NULL AND ca.human_validated = false)::bigint,
    (SELECT COUNT(*)::bigint
     FROM calls c2 JOIN call_analyses ca2 ON ca2.call_id = c2.id
     CROSS JOIN LATERAL jsonb_each_text(COALESCE(ca2.field_validations,'{}')) fv(k,v)
     WHERE c2.organization_id = p_org_id AND fv.v = 'validated'),
    (SELECT COUNT(*)::bigint
     FROM calls c2 JOIN call_analyses ca2 ON ca2.call_id = c2.id
     CROSS JOIN LATERAL jsonb_each_text(COALESCE(ca2.field_validations,'{}')) fv(k,v)
     WHERE c2.organization_id = p_org_id AND fv.v = 'corrected')
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.organization_id = p_org_id;
$$;

-- SDR personal dashboard KPIs
CREATE OR REPLACE FUNCTION public.get_sdr_dashboard_kpis(p_sdr_id uuid)
RETURNS TABLE (
  total_calls     bigint,
  rdv_booked      bigint,
  avg_rdv_quality integer,
  avg_sdr_quality integer,
  conversion_rate integer
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    ROUND(AVG(ca.appointment_quality_score))::integer,
    ROUND(AVG(ca.sdr_quality_score))::integer,
    CASE WHEN COUNT(c.id) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::numeric / COUNT(c.id) * 100)::integer
    ELSE 0 END
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.sdr_id = p_sdr_id;
$$;

-- Per-SDR coaching stats (org-wide, optional date filter)
CREATE OR REPLACE FUNCTION public.get_sdr_coaching_stats(
  p_org_id uuid,
  p_since  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  sdr_id                   uuid,
  sdr_name                 text,
  total_calls              bigint,
  avg_sdr_quality          integer,
  avg_appointment_quality  integer,
  appointments_booked      bigint,
  qualified_appointments   bigint,
  qualification_rate       integer,
  calls_reviewed           bigint,
  calls_requiring_review   bigint,
  review_flag_rate         integer,
  avg_ai_confidence        integer,
  skill_opening            integer,
  skill_discovery          integer,
  skill_pain_point         integer,
  skill_objection_handling integer,
  skill_qualification      integer,
  skill_closing            integer,
  trend                    text,
  booked_without_dm_rate   numeric,
  booked_without_pain_rate numeric,
  missing_next_step_rate   numeric,
  objection_no_detail_rate numeric,
  category                 text,
  best_call_id             uuid,
  worst_call_id            uuid
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH cr AS (
    SELECT c.sdr_id, c.id AS call_id, c.call_datetime,
           ca.id AS analysis_id,
           ca.sdr_quality_score, ca.appointment_quality_score,
           ca.appointment_booked, ca.decision_maker_detected,
           ca.pain_point_detected, ca.appointment_datetime,
           ca.ai_confidence, ca.hallucination_risk,
           ca.qualification_completeness_score,
           ca.objection_detected, ca.objection_details,
           ca.next_step, ca.human_validated,
           ca.urgency, ca.current_solution,
           ca.pain_point_details, ca.interest_level
    FROM calls c
    LEFT JOIN call_analyses ca ON ca.call_id = c.id
    WHERE c.organization_id = p_org_id
      AND (p_since IS NULL OR c.call_datetime >= p_since)
  ),
  rnk AS (
    SELECT sdr_id, sdr_quality_score,
           ROW_NUMBER() OVER (PARTITION BY sdr_id ORDER BY call_datetime DESC) AS rn
    FROM cr WHERE analysis_id IS NOT NULL AND sdr_quality_score IS NOT NULL
  ),
  td AS (
    SELECT sdr_id,
           AVG(sdr_quality_score) FILTER (WHERE rn <= 5)             AS recent_avg,
           AVG(sdr_quality_score) FILTER (WHERE rn > 5 AND rn <= 10) AS prior_avg
    FROM rnk GROUP BY sdr_id
  ),
  bc AS (
    SELECT DISTINCT ON (sdr_id) sdr_id, call_id AS best_call_id
    FROM cr WHERE analysis_id IS NOT NULL AND sdr_quality_score IS NOT NULL
    ORDER BY sdr_id, sdr_quality_score DESC
  ),
  wc AS (
    SELECT DISTINCT ON (sdr_id) sdr_id, call_id AS worst_call_id
    FROM cr WHERE analysis_id IS NOT NULL AND sdr_quality_score IS NOT NULL
    ORDER BY sdr_id, sdr_quality_score ASC
  )
  SELECT
    u.id, u.name,
    COUNT(DISTINCT cr.call_id)::bigint,
    ROUND(AVG(cr.sdr_quality_score))::integer,
    ROUND(AVG(cr.appointment_quality_score))::integer,
    COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked = true)::bigint,
    COUNT(cr.analysis_id) FILTER (WHERE
        cr.appointment_booked = true AND cr.decision_maker_detected = true
      AND cr.pain_point_detected = true AND cr.appointment_datetime IS NOT NULL
      AND cr.appointment_quality_score >= 60)::bigint,
    CASE WHEN COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked = true) > 0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER (WHERE
          cr.appointment_booked = true AND cr.decision_maker_detected = true
        AND cr.pain_point_detected = true AND cr.appointment_datetime IS NOT NULL
        AND cr.appointment_quality_score >= 60)::numeric
        / COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked = true) * 100)::integer
    ELSE 0 END,
    COUNT(cr.analysis_id) FILTER (WHERE cr.human_validated = true)::bigint,
    COUNT(cr.analysis_id) FILTER (WHERE cr.analysis_id IS NOT NULL AND (
        (cr.appointment_booked = true AND cr.decision_maker_detected IS NOT TRUE)
      OR(cr.appointment_booked = true AND cr.appointment_quality_score < 60)
      OR(cr.appointment_booked = true AND cr.appointment_datetime IS NULL)
      OR(cr.appointment_booked = true AND cr.pain_point_detected IS NOT TRUE)
      OR(cr.ai_confidence IS NOT NULL AND cr.ai_confidence < 70)
      OR(cr.hallucination_risk IN ('medium','high'))
      OR(cr.qualification_completeness_score IS NOT NULL AND cr.qualification_completeness_score < 60)
      OR(cr.objection_detected = true AND cr.objection_details IS NULL)
      OR(cr.next_step IS NULL)))::bigint,
    CASE WHEN COUNT(DISTINCT cr.call_id) > 0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER (WHERE cr.analysis_id IS NOT NULL AND (
          (cr.appointment_booked = true AND cr.decision_maker_detected IS NOT TRUE)
        OR(cr.appointment_booked = true AND cr.appointment_quality_score < 60)
        OR(cr.appointment_booked = true AND cr.appointment_datetime IS NULL)
        OR(cr.appointment_booked = true AND cr.pain_point_detected IS NOT TRUE)
        OR(cr.ai_confidence IS NOT NULL AND cr.ai_confidence < 70)
        OR(cr.hallucination_risk IN ('medium','high'))
        OR(cr.qualification_completeness_score IS NOT NULL AND cr.qualification_completeness_score < 60)
        OR(cr.objection_detected = true AND cr.objection_details IS NULL)
        OR(cr.next_step IS NULL)))::numeric / COUNT(DISTINCT cr.call_id) * 100)::integer
    ELSE 0 END,
    ROUND(AVG(cr.ai_confidence))::integer,
    ROUND(AVG(
      (CASE cr.interest_level WHEN 'hot' THEN 90 WHEN 'warm' THEN 65 WHEN 'cold' THEN 30 ELSE 15 END * 0.5)
      + COALESCE(cr.sdr_quality_score,50) * 0.5))::integer,
    ROUND(AVG(
      CASE WHEN cr.decision_maker_detected    THEN 25 ELSE 0 END +
      CASE WHEN cr.pain_point_detected        THEN 25 ELSE 0 END +
      CASE WHEN cr.urgency IS NOT NULL        THEN 25 ELSE 0 END +
      CASE WHEN cr.current_solution IS NOT NULL THEN 25 ELSE 0 END))::integer,
    ROUND(AVG(
      CASE WHEN cr.pain_point_detected           THEN 50 ELSE 0 END +
      CASE WHEN cr.pain_point_details IS NOT NULL THEN 30 ELSE 0 END +
      CASE WHEN cr.urgency IS NOT NULL            THEN 20 ELSE 0 END))::integer,
    ROUND(AVG(CASE
      WHEN NOT cr.objection_detected        THEN 70
      WHEN cr.objection_details IS NOT NULL THEN LEAST(90, COALESCE(cr.sdr_quality_score,50)+10)
      ELSE 25 END))::integer,
    ROUND(AVG(COALESCE(cr.qualification_completeness_score,0)))::integer,
    ROUND(AVG(
      CASE WHEN cr.appointment_booked    THEN 60 ELSE 0 END +
      CASE WHEN cr.next_step IS NOT NULL THEN 40 ELSE 0 END))::integer,
    COALESCE((SELECT CASE
        WHEN t.recent_avg IS NULL OR t.prior_avg IS NULL THEN 'stable'
        WHEN t.recent_avg > t.prior_avg + 5             THEN 'improving'
        WHEN t.recent_avg < t.prior_avg - 5             THEN 'declining'
        ELSE 'stable' END FROM td t WHERE t.sdr_id = u.id), 'stable'),
    CASE WHEN COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked=true)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked=true AND cr.decision_maker_detected IS NOT TRUE)::numeric
        / COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked=true),2) ELSE 0 END,
    CASE WHEN COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked=true)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked=true AND cr.pain_point_detected IS NOT TRUE)::numeric
        / COUNT(cr.analysis_id) FILTER (WHERE cr.appointment_booked=true),2) ELSE 0 END,
    CASE WHEN COUNT(cr.analysis_id)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER (WHERE cr.next_step IS NULL)::numeric / COUNT(cr.analysis_id),2) ELSE 0 END,
    CASE WHEN COUNT(cr.analysis_id) FILTER (WHERE cr.objection_detected=true)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER (WHERE cr.objection_detected=true AND cr.objection_details IS NULL)::numeric
        / COUNT(cr.analysis_id) FILTER (WHERE cr.objection_detected=true),2) ELSE 0 END,
    CASE WHEN ROUND(AVG(cr.sdr_quality_score)) >= 75 THEN 'top'
         WHEN ROUND(AVG(cr.sdr_quality_score)) < 55  THEN 'needs_coaching'
         ELSE 'stable' END,
    (ARRAY_AGG(bc.best_call_id))[1],
    (ARRAY_AGG(wc.worst_call_id))[1]
  FROM users u
  LEFT JOIN cr ON cr.sdr_id = u.id
  LEFT JOIN bc ON bc.sdr_id = u.id
  LEFT JOIN wc ON wc.sdr_id = u.id
  WHERE u.organization_id = p_org_id AND u.role = 'sdr'
  GROUP BY u.id, u.name
  ORDER BY ROUND(AVG(cr.sdr_quality_score)) DESC NULLS LAST;
$$;

-- Client KPIs — SECURITY DEFINER intersects p_campaign_ids with real assignments
CREATE OR REPLACE FUNCTION public.get_client_kpis(
  p_campaign_ids uuid[],
  p_org_id       uuid,
  p_since        timestamptz,
  p_until        timestamptz
)
RETURNS TABLE (
  total_calls                 bigint,
  hot_warm_contacts           bigint,
  appointments_booked         bigint,
  qualified_appointments      bigint,
  qualification_rate          integer,
  decision_maker_rate         integer,
  appointment_conversion_rate integer
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.interest_level IN ('hot','warm'))::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    COUNT(ca.id) FILTER (WHERE
        ca.appointment_booked = true AND ca.decision_maker_detected = true
      AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
      AND ca.appointment_quality_score >= 60)::bigint,
    CASE WHEN COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true
          AND ca.decision_maker_detected=true AND ca.pain_point_detected=true
          AND ca.appointment_datetime IS NOT NULL AND ca.appointment_quality_score>=60)::numeric
        / COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true) * 100)::integer
    ELSE NULL END,
    CASE WHEN COUNT(ca.id) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE ca.decision_maker_detected=true)::numeric / COUNT(ca.id) * 100)::integer
    ELSE NULL END,
    CASE WHEN COUNT(c.id) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true)::numeric / COUNT(c.id) * 100)::integer
    ELSE NULL END
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.campaign_id = ANY(
    ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
  )
    AND c.campaign_id    = ANY(p_campaign_ids)
    AND c.organization_id = p_org_id
    AND c.call_datetime   >= p_since
    AND c.call_datetime   <= p_until;
$$;

-- Client value report — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_client_value_report(
  p_campaign_ids uuid[],
  p_org_id       uuid,
  p_since        timestamptz,
  p_until        timestamptz
)
RETURNS TABLE (label text, cnt bigint, kind text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  (SELECT LEFT(ca.pain_point_details,80), COUNT(*)::bigint, 'pain_point'::text
   FROM calls c JOIN call_analyses ca ON ca.call_id=c.id
   WHERE c.campaign_id = ANY(
     ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
   )
     AND c.campaign_id=ANY(p_campaign_ids) AND c.organization_id=p_org_id
     AND c.call_datetime>=p_since AND c.call_datetime<=p_until
     AND ca.pain_point_detected=true AND ca.pain_point_details IS NOT NULL
   GROUP BY LEFT(ca.pain_point_details,80) ORDER BY COUNT(*) DESC LIMIT 5)
  UNION ALL
  (SELECT ca.objection_type, COUNT(*)::bigint, 'objection'::text
   FROM calls c JOIN call_analyses ca ON ca.call_id=c.id
   WHERE c.campaign_id = ANY(
     ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
   )
     AND c.campaign_id=ANY(p_campaign_ids) AND c.organization_id=p_org_id
     AND c.call_datetime>=p_since AND c.call_datetime<=p_until
     AND ca.objection_detected=true AND ca.objection_type IS NOT NULL
   GROUP BY ca.objection_type ORDER BY COUNT(*) DESC LIMIT 5);
$$;

-- Client campaign stats — no internal SDR metrics, SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_client_campaign_stats(
  p_campaign_ids uuid[],
  p_org_id       uuid
)
RETURNS TABLE (
  campaign_id             uuid,
  total_calls             bigint,
  appointments_booked     bigint,
  qualified_appointments  bigint,
  avg_appointment_quality integer,
  health_label            text,
  health_bg               text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH stats AS (
    SELECT
      c.campaign_id,
      COUNT(c.id)::bigint                                             AS total_calls,
      COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true)::bigint AS appointments_booked,
      COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true
        AND ca.decision_maker_detected=true AND ca.pain_point_detected=true
        AND ca.appointment_datetime IS NOT NULL
        AND ca.appointment_quality_score>=60)::bigint                AS qualified_appointments,
      ROUND(AVG(ca.appointment_quality_score))::integer              AS avg_appt_q
    FROM calls c
    LEFT JOIN call_analyses ca ON ca.call_id=c.id
    WHERE c.campaign_id = ANY(
      ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
    )
      AND c.campaign_id=ANY(p_campaign_ids)
      AND c.organization_id=p_org_id
    GROUP BY c.campaign_id
  ),
  scored AS (
    SELECT *,
      0.65 * COALESCE(avg_appt_q,0)
      + 0.35 * CASE WHEN appointments_booked > 0
                    THEN (qualified_appointments::numeric / appointments_booked) * 100
                    ELSE 0 END AS health_score
    FROM stats
  )
  SELECT
    campaign_id, total_calls, appointments_booked, qualified_appointments, avg_appt_q,
    CASE
      WHEN total_calls   = 0  THEN 'En cours'
      WHEN health_score >= 75 THEN 'Saine'
      WHEN health_score >= 55 THEN 'En bonne voie'
      WHEN health_score >= 40 THEN 'À surveiller'
      ELSE                         'Attention requise'
    END,
    CASE
      WHEN total_calls   = 0  THEN 'bg-gray-100 text-gray-500 border-gray-200'
      WHEN health_score >= 75 THEN 'bg-emerald-50 text-emerald-700 border-emerald-200'
      WHEN health_score >= 55 THEN 'bg-blue-50 text-blue-700 border-blue-200'
      WHEN health_score >= 40 THEN 'bg-amber-50 text-amber-700 border-amber-200'
      ELSE                         'bg-red-50 text-red-700 border-red-200'
    END
  FROM scored;
$$;

-- Owner dashboard campaign stats — includes internal SDR metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_campaign_stats(
  p_campaign_ids uuid[],
  p_org_id       uuid
)
RETURNS TABLE (
  campaign_id             uuid,
  total_calls             bigint,
  appointments_booked     bigint,
  qualified_appointments  bigint,
  avg_appointment_quality integer,
  avg_sdr_quality         integer,
  avg_ai_confidence       integer
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    c.campaign_id,
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true
      AND ca.decision_maker_detected=true AND ca.pain_point_detected=true
      AND ca.appointment_datetime IS NOT NULL AND ca.appointment_quality_score>=60)::bigint,
    ROUND(AVG(ca.appointment_quality_score))::integer,
    ROUND(AVG(ca.sdr_quality_score))::integer,
    ROUND(AVG(ca.ai_confidence))::integer
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id=c.id
  WHERE c.campaign_id=ANY(p_campaign_ids)
    AND c.organization_id=p_org_id
  GROUP BY c.campaign_id;
$$;


-- ============================================================
-- DONE. Run this query to verify all tables exist:
--
--   SELECT table_name
--   FROM   information_schema.tables
--   WHERE  table_schema = 'public'
--   ORDER  BY table_name;
--
-- Expected tables: ai_usage_log, analysis_jobs, audit_log,
-- call_analyses, calls, campaign_clients, campaign_sdrs,
-- campaigns, field_corrections, organizations, users
-- ============================================================
