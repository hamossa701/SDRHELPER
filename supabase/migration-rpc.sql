-- ============================================================
-- SDRHelper — RPC Aggregation Functions
-- Run AFTER migration-hardening.sql
-- All functions use SECURITY INVOKER so RLS applies automatically.
-- Org boundary is enforced by both RLS and the p_org_id parameter.
-- ============================================================

-- ============================================================
-- 1. OWNER DASHBOARD KPIs  (all-time, org-wide)
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_org_id uuid)
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
        ca.appointment_booked        = true
      AND ca.decision_maker_detected = true
      AND ca.pain_point_detected     = true
      AND ca.appointment_datetime    IS NOT NULL
      AND ca.appointment_quality_score >= 60
    )::bigint,
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

-- ============================================================
-- 2. SDR LEADERBOARD  (owner dashboard right column)
-- ============================================================
CREATE OR REPLACE FUNCTION get_sdr_leaderboard(p_org_id uuid, p_manager_id uuid DEFAULT NULL)
RETURNS TABLE (
  sdr_id          uuid,
  sdr_name        text,
  total_calls     bigint,
  rdv_booked      bigint,
  avg_sdr_quality integer
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    u.id,
    u.name,
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    ROUND(AVG(ca.sdr_quality_score))::integer
  FROM users u
  LEFT JOIN calls c  ON c.sdr_id = u.id AND c.organization_id = p_org_id
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE u.organization_id = p_org_id
    AND u.role = 'sdr'
    AND (p_manager_id IS NULL OR u.manager_id = p_manager_id)
  GROUP BY u.id, u.name
  ORDER BY ROUND(AVG(ca.sdr_quality_score)) DESC NULLS LAST;
$$;

-- ============================================================
-- 3. MANAGER DASHBOARD KPIs  (all-time, org-wide)
-- ============================================================
CREATE OR REPLACE FUNCTION get_manager_kpis(p_org_id uuid, p_manager_id uuid DEFAULT NULL)
RETURNS TABLE (
  team_sdr_count         bigint,
  today_calls            bigint,
  calls_requiring_review bigint,
  appointments_booked    bigint,
  qualified_appointments bigint,
  qualification_rate     integer,
  weak_appointments      bigint,
  calls_reviewed         bigint,
  calls_pending          bigint,
  coaching_opportunities bigint,
  ai_trust_validated     bigint,
  ai_trust_corrected     bigint
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH team_sdrs AS (
    SELECT id
    FROM users
    WHERE organization_id = p_org_id
      AND role = 'sdr'
      AND (p_manager_id IS NULL OR manager_id = p_manager_id)
  ),
  scoped_calls AS (
    SELECT c.*
    FROM calls c
    JOIN team_sdrs s ON s.id = c.sdr_id
    WHERE c.organization_id = p_org_id
  ),
  sdr_avgs AS (
    SELECT s.id, ROUND(AVG(ca.sdr_quality_score))::integer AS avg_q
    FROM team_sdrs s
    LEFT JOIN scoped_calls c ON c.sdr_id = s.id
    LEFT JOIN call_analyses ca ON ca.call_id = c.id
    GROUP BY s.id
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM team_sdrs),
    (SELECT COUNT(*)::bigint FROM scoped_calls
     WHERE organization_id = p_org_id
       AND call_datetime >= current_date::timestamptz),
    -- Flags mirror computeReviewFlags() in lib/review-flags.ts
    COUNT(ca.id) FILTER (WHERE
        ca.id IS NOT NULL
      AND c.review_status != 'resolved'
      AND (
          (ca.appointment_booked = true AND ca.decision_maker_detected IS NOT TRUE)
        OR (ca.appointment_booked = true AND ca.appointment_quality_score < 60)
        OR (ca.appointment_booked = true AND ca.appointment_datetime IS NULL)
        OR (ca.appointment_booked = true AND ca.pain_point_detected IS NOT TRUE)
        OR (ca.ai_confidence IS NOT NULL AND ca.ai_confidence < 70)
        OR (ca.hallucination_risk IN ('medium','high'))
        OR (ca.qualification_completeness_score IS NOT NULL AND ca.qualification_completeness_score < 60)
        OR (ca.objection_detected = true AND ca.objection_details IS NULL)
        OR (ca.next_step IS NULL)
      )
    )::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    COUNT(ca.id) FILTER (WHERE
        ca.appointment_booked        = true
      AND ca.decision_maker_detected = true
      AND ca.pain_point_detected     = true
      AND ca.appointment_datetime    IS NOT NULL
      AND ca.appointment_quality_score >= 60
    )::bigint,
    CASE WHEN COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true) > 0 THEN
      ROUND(COUNT(ca.id) FILTER (WHERE
          ca.appointment_booked = true AND ca.decision_maker_detected = true
        AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
        AND ca.appointment_quality_score >= 60
      )::numeric / COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true) * 100)::integer
    ELSE 0 END,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true AND COALESCE(ca.appointment_quality_score, 0) < 60)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.human_validated = true)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.id IS NOT NULL AND ca.human_validated = false)::bigint,
    (SELECT COUNT(*)::bigint FROM sdr_avgs WHERE avg_q IS NULL OR avg_q < 55),
    (SELECT COUNT(*)::bigint
     FROM scoped_calls c2 JOIN call_analyses ca2 ON ca2.call_id = c2.id
     CROSS JOIN LATERAL jsonb_each_text(COALESCE(ca2.field_validations,'{}')) fv(k,v)
     WHERE c2.organization_id = p_org_id AND fv.v = 'validated'),
    (SELECT COUNT(*)::bigint
     FROM scoped_calls c2 JOIN call_analyses ca2 ON ca2.call_id = c2.id
     CROSS JOIN LATERAL jsonb_each_text(COALESCE(ca2.field_validations,'{}')) fv(k,v)
     WHERE c2.organization_id = p_org_id AND fv.v = 'corrected')
  FROM scoped_calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.organization_id = p_org_id;
$$;

-- ============================================================
-- 4. PER-SDR COACHING STATS
-- One row per SDR. p_since = NULL means all-time.
-- ============================================================
CREATE OR REPLACE FUNCTION get_sdr_coaching_stats(p_org_id uuid, p_since timestamptz DEFAULT NULL, p_manager_id uuid DEFAULT NULL)
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
    JOIN users s ON s.id = c.sdr_id
    WHERE c.organization_id = p_org_id
      AND s.organization_id = p_org_id
      AND s.role = 'sdr'
      AND (p_manager_id IS NULL OR s.manager_id = p_manager_id)
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
    -- Opening: interestToScore * 0.5 + sdr_quality * 0.5
    ROUND(AVG(
      (CASE cr.interest_level WHEN 'hot' THEN 90 WHEN 'warm' THEN 65 WHEN 'cold' THEN 30 ELSE 15 END * 0.5)
      + COALESCE(cr.sdr_quality_score,50) * 0.5))::integer,
    -- Discovery
    ROUND(AVG(
      CASE WHEN cr.decision_maker_detected   THEN 25 ELSE 0 END +
      CASE WHEN cr.pain_point_detected       THEN 25 ELSE 0 END +
      CASE WHEN cr.urgency         IS NOT NULL THEN 25 ELSE 0 END +
      CASE WHEN cr.current_solution IS NOT NULL THEN 25 ELSE 0 END))::integer,
    -- Pain point
    ROUND(AVG(
      CASE WHEN cr.pain_point_detected          THEN 50 ELSE 0 END +
      CASE WHEN cr.pain_point_details IS NOT NULL THEN 30 ELSE 0 END +
      CASE WHEN cr.urgency IS NOT NULL           THEN 20 ELSE 0 END))::integer,
    -- Objection handling
    ROUND(AVG(CASE
      WHEN NOT cr.objection_detected       THEN 70
      WHEN cr.objection_details IS NOT NULL THEN LEAST(90, COALESCE(cr.sdr_quality_score,50)+10)
      ELSE 25 END))::integer,
    -- Qualification
    ROUND(AVG(COALESCE(cr.qualification_completeness_score,0)))::integer,
    -- Closing
    ROUND(AVG(
      CASE WHEN cr.appointment_booked    THEN 60 ELSE 0 END +
      CASE WHEN cr.next_step IS NOT NULL THEN 40 ELSE 0 END))::integer,
    -- Trend
    COALESCE((SELECT CASE
        WHEN t.recent_avg IS NULL OR t.prior_avg IS NULL THEN 'stable'
        WHEN t.recent_avg > t.prior_avg + 5             THEN 'improving'
        WHEN t.recent_avg < t.prior_avg - 5             THEN 'declining'
        ELSE 'stable' END FROM td t WHERE t.sdr_id = u.id), 'stable'),
    -- Priority rates
    CASE WHEN COUNT(cr.analysis_id) FILTER(WHERE cr.appointment_booked=true)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER(WHERE cr.appointment_booked=true AND cr.decision_maker_detected IS NOT TRUE)::numeric
        / COUNT(cr.analysis_id) FILTER(WHERE cr.appointment_booked=true),2) ELSE 0 END,
    CASE WHEN COUNT(cr.analysis_id) FILTER(WHERE cr.appointment_booked=true)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER(WHERE cr.appointment_booked=true AND cr.pain_point_detected IS NOT TRUE)::numeric
        / COUNT(cr.analysis_id) FILTER(WHERE cr.appointment_booked=true),2) ELSE 0 END,
    CASE WHEN COUNT(cr.analysis_id)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER(WHERE cr.next_step IS NULL)::numeric / COUNT(cr.analysis_id),2) ELSE 0 END,
    CASE WHEN COUNT(cr.analysis_id) FILTER(WHERE cr.objection_detected=true)>0 THEN
      ROUND(COUNT(cr.analysis_id) FILTER(WHERE cr.objection_detected=true AND cr.objection_details IS NULL)::numeric
        / COUNT(cr.analysis_id) FILTER(WHERE cr.objection_detected=true),2) ELSE 0 END,
    -- Category base (TypeScript may override if high-severity priorities detected)
    CASE WHEN ROUND(AVG(cr.sdr_quality_score)) >= 75 THEN 'top'
         WHEN ROUND(AVG(cr.sdr_quality_score)) < 55  THEN 'needs_coaching'
         ELSE 'stable' END,
    MAX(bc.best_call_id),
    MAX(wc.worst_call_id)
  FROM users u
  LEFT JOIN cr ON cr.sdr_id = u.id
  LEFT JOIN bc ON bc.sdr_id = u.id
  LEFT JOIN wc ON wc.sdr_id = u.id
  WHERE u.organization_id = p_org_id
    AND u.role = 'sdr'
    AND (p_manager_id IS NULL OR u.manager_id = p_manager_id)
  GROUP BY u.id, u.name
  ORDER BY ROUND(AVG(cr.sdr_quality_score)) DESC NULLS LAST;
$$;

-- ============================================================
-- 5. CLIENT KPIs  (period-scoped, campaign-filtered)
-- p_org_id prevents cross-org access even if campaign_ids are forged.
-- ============================================================
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
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER (WHERE ca.interest_level IN ('hot','warm'))::bigint,
    COUNT(ca.id) FILTER (WHERE ca.appointment_booked = true)::bigint,
    COUNT(ca.id) FILTER (WHERE
        ca.appointment_booked = true AND ca.decision_maker_detected = true
      AND ca.pain_point_detected = true AND ca.appointment_datetime IS NOT NULL
      AND ca.appointment_quality_score >= 60)::bigint,
    CASE WHEN COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true)>0 THEN
      ROUND(COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true AND ca.decision_maker_detected=true
        AND ca.pain_point_detected=true AND ca.appointment_datetime IS NOT NULL
        AND ca.appointment_quality_score>=60)::numeric
        / COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true)*100)::integer
    ELSE NULL END,
    CASE WHEN COUNT(ca.id)>0 THEN
      ROUND(COUNT(ca.id) FILTER(WHERE ca.decision_maker_detected=true)::numeric/COUNT(ca.id)*100)::integer
    ELSE NULL END,
    CASE WHEN COUNT(c.id)>0 THEN
      ROUND(COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true)::numeric/COUNT(c.id)*100)::integer
    ELSE NULL END
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id = c.id
  WHERE c.campaign_id   = ANY(p_campaign_ids)
    AND c.organization_id = p_org_id
    AND c.call_datetime   >= p_since
    AND c.call_datetime   <= p_until;
$$;

-- ============================================================
-- 6. CLIENT VALUE REPORT  (top pain points + objections)
-- ============================================================
CREATE OR REPLACE FUNCTION get_client_value_report(
  p_campaign_ids uuid[],
  p_org_id       uuid,
  p_since        timestamptz,
  p_until        timestamptz
)
RETURNS TABLE (label text, cnt bigint, kind text)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  (SELECT LEFT(ca.pain_point_details,80), COUNT(*)::bigint, 'pain_point'::text
   FROM calls c JOIN call_analyses ca ON ca.call_id=c.id
   WHERE c.campaign_id=ANY(p_campaign_ids) AND c.organization_id=p_org_id
     AND c.call_datetime>=p_since AND c.call_datetime<=p_until
     AND ca.pain_point_detected=true AND ca.pain_point_details IS NOT NULL
   GROUP BY LEFT(ca.pain_point_details,80) ORDER BY COUNT(*) DESC LIMIT 5)
  UNION ALL
  (SELECT ca.objection_type, COUNT(*)::bigint, 'objection'::text
   FROM calls c JOIN call_analyses ca ON ca.call_id=c.id
   WHERE c.campaign_id=ANY(p_campaign_ids) AND c.organization_id=p_org_id
     AND c.call_datetime>=p_since AND c.call_datetime<=p_until
     AND ca.objection_detected=true AND ca.objection_type IS NOT NULL
   GROUP BY ca.objection_type ORDER BY COUNT(*) DESC LIMIT 5);
$$;

-- ============================================================
-- 7. CLIENT CAMPAIGN HEALTH INPUTS  (per-campaign aggregates)
-- ============================================================
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
  avg_sdr_quality         integer,
  avg_ai_confidence       integer
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    c.campaign_id,
    COUNT(c.id)::bigint,
    COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true)::bigint,
    COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true AND ca.decision_maker_detected=true
      AND ca.pain_point_detected=true AND ca.appointment_datetime IS NOT NULL
      AND ca.appointment_quality_score>=60)::bigint,
    ROUND(AVG(ca.appointment_quality_score))::integer,
    ROUND(AVG(ca.sdr_quality_score))::integer,
    ROUND(AVG(ca.ai_confidence))::integer
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id=c.id
  WHERE c.campaign_id=ANY(p_campaign_ids) AND c.organization_id=p_org_id
  GROUP BY c.campaign_id;
$$;

-- ============================================================
-- 8. SDR PERSONAL KPIs  (all-time, per SDR)
-- ============================================================
CREATE OR REPLACE FUNCTION get_sdr_dashboard_kpis(p_sdr_id uuid)
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
    COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true)::bigint,
    ROUND(AVG(ca.appointment_quality_score))::integer,
    ROUND(AVG(ca.sdr_quality_score))::integer,
    CASE WHEN COUNT(c.id)>0 THEN
      ROUND(COUNT(ca.id) FILTER(WHERE ca.appointment_booked=true)::numeric/COUNT(c.id)*100)::integer
    ELSE 0 END
  FROM calls c
  LEFT JOIN call_analyses ca ON ca.call_id=c.id
  WHERE c.sdr_id=p_sdr_id;
$$;
