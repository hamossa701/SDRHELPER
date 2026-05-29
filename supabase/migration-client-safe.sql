-- ============================================================
-- SDRHelper — Client Safety Migration
-- Enforce server-side column isolation for the client role.
-- Run AFTER all previous migrations.
-- ============================================================

-- ============================================================
-- SECTION 1: TIGHTEN BASE TABLE RLS
-- Remove client role from direct access to calls, call_analyses,
-- campaigns, users (other rows), and analysis_jobs.
-- All client data flows through SECURITY DEFINER RPCs or the
-- server component (service role key with manual org filters).
-- ============================================================

-- call_analyses: owner / manager / sdr only
DROP POLICY IF EXISTS "call_analyses_select" ON public.call_analyses;
CREATE POLICY "call_analyses_select" ON public.call_analyses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id
        AND c.organization_id = get_my_org_id()
        AND get_my_role() IN ('owner', 'manager', 'sdr')
        AND (
          get_my_role() IN ('owner', 'manager')
          OR c.sdr_id = auth.uid()
        )
    )
  );

-- calls: owner / manager / sdr only (client clause removed)
DROP POLICY IF EXISTS "calls_select" ON public.calls;
CREATE POLICY "calls_select" ON public.calls
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner', 'manager', 'sdr')
    AND (
      get_my_role() IN ('owner', 'manager')
      OR sdr_id = auth.uid()
    )
  );

-- campaigns: owner / manager / sdr only (client clause removed)
DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
CREATE POLICY "campaigns_select" ON public.campaigns
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner', 'manager', 'sdr')
  );

-- users: owner / manager / sdr see all org users; client sees only own row
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() IN ('owner', 'manager', 'sdr')
      OR id = auth.uid()
    )
  );

-- analysis_jobs: owner / manager / sdr only (was unrestricted for all org members)
DROP POLICY IF EXISTS "analysis_jobs_select" ON public.analysis_jobs;
CREATE POLICY "analysis_jobs_select" ON public.analysis_jobs
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner', 'manager', 'sdr')
  );

-- ============================================================
-- SECTION 2: FIX campaign_clients POLICY DEPENDENCY
-- The old policy verified membership via a campaigns subquery,
-- which now returns nothing for clients (they are removed from
-- campaigns_select). Clients need to read their own assignments
-- to load the portal — allow it directly via user_id = auth.uid().
-- ============================================================
DROP POLICY IF EXISTS "campaign_clients_select" ON public.campaign_clients;
CREATE POLICY "campaign_clients_select" ON public.campaign_clients
  FOR SELECT USING (
    -- owner / manager / sdr: all assignments inside their org
    (
      get_my_role() IN ('owner', 'manager', 'sdr')
      AND EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_id AND c.organization_id = get_my_org_id()
      )
    )
    OR
    -- client: own assignments only — role is explicitly gated so no other
    -- role can reach this branch by accident
    (
      get_my_role() = 'client'
      AND user_id = auth.uid()
    )
  );

-- ============================================================
-- SECTION 3: INTERNAL DASHBOARD RPC
-- The owner dashboard needs avg_sdr_quality and avg_ai_confidence
-- for its campaign health score. Rather than exposing those through
-- the client-facing RPC, we give the dashboard its own function
-- with SECURITY INVOKER (RLS restricts to the caller's org).
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_campaign_stats(
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
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true
      AND ca.decision_maker_detected = true AND ca.pain_point_detected = true
      AND ca.appointment_datetime IS NOT NULL AND ca.appointment_quality_score >= 60)::bigint,
    ROUND(AVG(ca.appointment_quality_score))::integer,
    ROUND(AVG(ca.sdr_quality_score))::integer,
    ROUND(AVG(ca.ai_confidence))::integer
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.campaign_id    = ANY(p_campaign_ids)
    AND c.organization_id = p_org_id
  GROUP BY c.campaign_id;
$$;

-- ============================================================
-- SECTION 4: HARDEN CLIENT RPCs — SECURITY DEFINER
-- These functions bypass base-table RLS (which now blocks
-- clients from calling tables directly), but enforce access
-- internally by intersecting p_campaign_ids with the caller's
-- actual assignments via auth.uid().
-- auth.uid() always reflects the JWT caller even in SECURITY
-- DEFINER context in Supabase.
-- ============================================================

-- 5. CLIENT KPIs
CREATE OR REPLACE FUNCTION get_client_kpis(
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
      ROUND(
        COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true
          AND ca.decision_maker_detected=true AND ca.pain_point_detected=true
          AND ca.appointment_datetime IS NOT NULL AND ca.appointment_quality_score>=60)::numeric
        / COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true) * 100
      )::integer
    ELSE NULL END,
    CASE WHEN COUNT(ca.id) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE ca.decision_maker_detected=true)::numeric / COUNT(ca.id) * 100)::integer
    ELSE NULL END,
    CASE WHEN COUNT(c.id) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE ca.appointment_booked=true)::numeric / COUNT(c.id) * 100)::integer
    ELSE NULL END
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  -- Intersect with the caller's actual assignments — rejects forged campaign IDs
  WHERE c.campaign_id = ANY(
    ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
  )
    AND c.campaign_id    = ANY(p_campaign_ids)
    AND c.organization_id = p_org_id
    AND c.call_datetime   >= p_since
    AND c.call_datetime   <= p_until;
$$;

-- 6. CLIENT VALUE REPORT
CREATE OR REPLACE FUNCTION get_client_value_report(
  p_campaign_ids uuid[],
  p_org_id       uuid,
  p_since        timestamptz,
  p_until        timestamptz
)
RETURNS TABLE (label text, cnt bigint, kind text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  (
    SELECT LEFT(ca.pain_point_details, 80), COUNT(*)::bigint, 'pain_point'::text
    FROM calls c
    JOIN call_analyses ca ON ca.call_id = c.id
    WHERE c.campaign_id = ANY(
      ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
    )
      AND c.campaign_id    = ANY(p_campaign_ids)
      AND c.organization_id = p_org_id
      AND c.call_datetime   >= p_since
      AND c.call_datetime   <= p_until
      AND ca.pain_point_detected = true
      AND ca.pain_point_details IS NOT NULL
    GROUP BY LEFT(ca.pain_point_details, 80)
    ORDER BY COUNT(*) DESC
    LIMIT 5
  )
  UNION ALL
  (
    SELECT ca.objection_type, COUNT(*)::bigint, 'objection'::text
    FROM calls c
    JOIN call_analyses ca ON ca.call_id = c.id
    WHERE c.campaign_id = ANY(
      ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
    )
      AND c.campaign_id    = ANY(p_campaign_ids)
      AND c.organization_id = p_org_id
      AND c.call_datetime   >= p_since
      AND c.call_datetime   <= p_until
      AND ca.objection_detected = true
      AND ca.objection_type IS NOT NULL
    GROUP BY ca.objection_type
    ORDER BY COUNT(*) DESC
    LIMIT 5
  );
$$;

-- 7. CLIENT CAMPAIGN STATS — UPDATED
-- Removes avg_sdr_quality and avg_ai_confidence (internal fields).
-- Health label is computed inside the function using client-safe
-- signals only: appointment quality + qualification rate.
CREATE OR REPLACE FUNCTION get_client_campaign_stats(
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
      COUNT(c.id)::bigint                                                          AS total_calls,
      COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint            AS appointments_booked,
      COUNT(ca.id) FILTER (WHERE
          ca.appointment_booked = true AND ca.decision_maker_detected = true
        AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
        AND ca.appointment_quality_score >= 60)::bigint                           AS qualified_appointments,
      ROUND(AVG(ca.appointment_quality_score))::integer                           AS avg_appt_q
    FROM calls c
    LEFT JOIN call_analyses ca ON ca.call_id = c.id
    WHERE c.campaign_id = ANY(
      ARRAY(SELECT cc.campaign_id FROM campaign_clients cc WHERE cc.user_id = auth.uid())
    )
      AND c.campaign_id    = ANY(p_campaign_ids)
      AND c.organization_id = p_org_id
    GROUP BY c.campaign_id
  ),
  scored AS (
    SELECT *,
      -- Client-safe health score: 65% appointment quality + 35% qualification rate
      0.65 * COALESCE(avg_appt_q, 0)
      + 0.35 * CASE WHEN appointments_booked > 0
                    THEN (qualified_appointments::numeric / appointments_booked) * 100
                    ELSE 0
               END AS health_score
    FROM stats
  )
  SELECT
    campaign_id,
    total_calls,
    appointments_booked,
    qualified_appointments,
    avg_appt_q,
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

-- ============================================================
-- SECTION 5: users_update — PREVENT PRIVILEGE ESCALATION
-- The original schema.sql policy had no WITH CHECK clause and
-- allowed any user to update their own row, including changing
-- role and organization_id.
--
-- Strategy: replace the single permissive policy with two
-- narrowly-scoped permissive policies (admin vs self), then add
-- one RESTRICTIVE policy that hard-blocks role/org changes for
-- non-admin callers regardless of what permissive policies allow.
--
-- Permissive policies are OR-combined; RESTRICTIVE policies are
-- AND-combined with the permissive result. Using a restrictive
-- policy avoids the OR-leakage problem where one permissive
-- policy's WITH CHECK can be satisfied to bypass another's.
-- ============================================================
DROP POLICY IF EXISTS "users_update"      ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_self"  ON public.users;
DROP POLICY IF EXISTS "users_no_privilege_escalation" ON public.users;

-- Admin update: owner / manager may change any field for any user
-- in their org. WITH CHECK ensures users cannot be moved to a
-- different organization.
CREATE POLICY "users_update_admin" ON public.users
  FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    organization_id = get_my_org_id()
  );

-- Self update: any authenticated user may update their own row
-- (e.g., display name, email). Role and organization_id are
-- protected by the restrictive policy below; they are not
-- restricted here so the restrictive policy remains the single
-- point of truth for those invariants.
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid()
    AND organization_id = get_my_org_id()
  )
  WITH CHECK (
    id = auth.uid()
    AND organization_id = get_my_org_id()
  );

-- Restrictive policy: non-admin callers cannot change role or
-- organization_id on any row, even their own.
-- This ANDs with every permissive policy above so it cannot be
-- bypassed by satisfying a different permissive WITH CHECK.
--
-- The subquery (SELECT role FROM users WHERE id = auth.uid())
-- reads the PRE-UPDATE snapshot value inside the same command,
-- ensuring the comparison is always against the original role.
CREATE POLICY "users_no_privilege_escalation" ON public.users
  AS RESTRICTIVE
  FOR UPDATE
  WITH CHECK (
    -- Owner / manager may change any field (subject to permissive policies)
    get_my_role() IN ('owner', 'manager')
    OR
    -- Everyone else: role and organization_id must remain unchanged
    (
      role            = (SELECT role            FROM public.users WHERE id = auth.uid())
      AND organization_id = get_my_org_id()
    )
  );

-- ============================================================
-- SECTION 6: campaign_clients_insert — ADD ORG BOUNDARY
-- The original schema.sql policy checked only the caller's role.
-- A manager in org A could link any campaign_id (including org B)
-- to any user_id (including org B users).
--
-- Fix: both campaign_id and user_id must belong to the caller's
-- organization. This closes the cross-org assignment vector that
-- was the upstream precondition for the FAIL 2 policy gap.
-- ============================================================
DROP POLICY IF EXISTS "campaign_clients_insert" ON public.campaign_clients;
CREATE POLICY "campaign_clients_insert" ON public.campaign_clients
  FOR INSERT WITH CHECK (
    -- Caller must be owner or manager
    get_my_role() IN ('owner', 'manager')
    -- Campaign being linked must belong to the caller's org
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND c.organization_id = get_my_org_id()
    )
    -- User being linked must also belong to the caller's org
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_id
        AND u.organization_id = get_my_org_id()
    )
  );
