-- ============================================================
-- Coaching role scope fix
-- Owner: organization-wide SDR coaching.
-- Manager: only SDRs assigned through users.manager_id.
-- Replaces the recursive wrapper introduced by migration-manager-team-structure.sql.
-- ============================================================

create or replace function public.get_sdr_coaching_stats(
  p_org_id uuid,
  p_since timestamptz default null,
  p_manager_id uuid default null
)
returns table (
  sdr_id uuid,
  sdr_name text,
  total_calls bigint,
  avg_sdr_quality integer,
  avg_appointment_quality integer,
  appointments_booked bigint,
  qualified_appointments bigint,
  qualification_rate integer,
  calls_reviewed bigint,
  calls_requiring_review bigint,
  review_flag_rate integer,
  avg_ai_confidence integer,
  skill_opening integer,
  skill_discovery integer,
  skill_pain_point integer,
  skill_objection_handling integer,
  skill_qualification integer,
  skill_closing integer,
  trend text,
  booked_without_dm_rate numeric,
  booked_without_pain_rate numeric,
  missing_next_step_rate numeric,
  objection_no_detail_rate numeric,
  category text,
  best_call_id uuid,
  worst_call_id uuid
)
language sql stable security invoker as $$
  with scoped_sdrs as (
    select u.id, u.name
    from public.users u
    where u.organization_id = p_org_id
      and u.role = 'sdr'
      and (p_manager_id is null or u.manager_id = p_manager_id)
  ),
  cr as (
    select c.sdr_id, c.id as call_id, c.call_datetime,
           ca.id as analysis_id,
           ca.sdr_quality_score, ca.appointment_quality_score,
           ca.appointment_booked, ca.decision_maker_detected,
           ca.pain_point_detected, ca.appointment_datetime,
           ca.ai_confidence, ca.hallucination_risk,
           ca.qualification_completeness_score,
           ca.objection_detected, ca.objection_details,
           ca.next_step, ca.human_validated,
           ca.urgency, ca.current_solution,
           ca.pain_point_details, ca.interest_level
    from public.calls c
    join scoped_sdrs s on s.id = c.sdr_id
    left join public.call_analyses ca on ca.call_id = c.id
    where c.organization_id = p_org_id
      and (p_since is null or c.call_datetime >= p_since)
  ),
  rnk as (
    select sdr_id, sdr_quality_score,
           row_number() over (partition by sdr_id order by call_datetime desc) as rn
    from cr
    where analysis_id is not null and sdr_quality_score is not null
  ),
  td as (
    select sdr_id,
           avg(sdr_quality_score) filter (where rn <= 5) as recent_avg,
           avg(sdr_quality_score) filter (where rn > 5 and rn <= 10) as prior_avg
    from rnk
    group by sdr_id
  ),
  bc as (
    select distinct on (sdr_id) sdr_id, call_id as best_call_id
    from cr
    where analysis_id is not null and sdr_quality_score is not null
    order by sdr_id, sdr_quality_score desc
  ),
  wc as (
    select distinct on (sdr_id) sdr_id, call_id as worst_call_id
    from cr
    where analysis_id is not null and sdr_quality_score is not null
    order by sdr_id, sdr_quality_score asc
  )
  select
    u.id,
    u.name,
    count(distinct cr.call_id)::bigint,
    round(avg(cr.sdr_quality_score))::integer,
    round(avg(cr.appointment_quality_score))::integer,
    count(cr.analysis_id) filter (where cr.appointment_booked = true)::bigint,
    count(cr.analysis_id) filter (where
      cr.appointment_booked = true
      and cr.decision_maker_detected = true
      and cr.pain_point_detected = true
      and cr.appointment_datetime is not null
      and cr.appointment_quality_score >= 60
    )::bigint,
    case when count(cr.analysis_id) filter (where cr.appointment_booked = true) > 0 then
      round(count(cr.analysis_id) filter (where
        cr.appointment_booked = true
        and cr.decision_maker_detected = true
        and cr.pain_point_detected = true
        and cr.appointment_datetime is not null
        and cr.appointment_quality_score >= 60
      )::numeric / count(cr.analysis_id) filter (where cr.appointment_booked = true) * 100)::integer
    else 0 end,
    count(cr.analysis_id) filter (where cr.human_validated = true)::bigint,
    count(cr.analysis_id) filter (where cr.analysis_id is not null and (
      (cr.appointment_booked = true and cr.decision_maker_detected is not true)
      or (cr.appointment_booked = true and cr.appointment_quality_score < 60)
      or (cr.appointment_booked = true and cr.appointment_datetime is null)
      or (cr.appointment_booked = true and cr.pain_point_detected is not true)
      or (cr.ai_confidence is not null and cr.ai_confidence < 70)
      or (cr.hallucination_risk in ('medium','high'))
      or (cr.qualification_completeness_score is not null and cr.qualification_completeness_score < 60)
      or (cr.objection_detected = true and cr.objection_details is null)
      or (cr.next_step is null)
    ))::bigint,
    case when count(distinct cr.call_id) > 0 then
      round(count(cr.analysis_id) filter (where cr.analysis_id is not null and (
        (cr.appointment_booked = true and cr.decision_maker_detected is not true)
        or (cr.appointment_booked = true and cr.appointment_quality_score < 60)
        or (cr.appointment_booked = true and cr.appointment_datetime is null)
        or (cr.appointment_booked = true and cr.pain_point_detected is not true)
        or (cr.ai_confidence is not null and cr.ai_confidence < 70)
        or (cr.hallucination_risk in ('medium','high'))
        or (cr.qualification_completeness_score is not null and cr.qualification_completeness_score < 60)
        or (cr.objection_detected = true and cr.objection_details is null)
        or (cr.next_step is null)
      ))::numeric / count(distinct cr.call_id) * 100)::integer
    else 0 end,
    round(avg(cr.ai_confidence))::integer,
    round(avg(
      (case cr.interest_level when 'hot' then 90 when 'warm' then 65 when 'cold' then 30 else 15 end * 0.5)
      + coalesce(cr.sdr_quality_score, 50) * 0.5
    ))::integer,
    round(avg(
      case when cr.decision_maker_detected then 25 else 0 end +
      case when cr.pain_point_detected then 25 else 0 end +
      case when cr.urgency is not null then 25 else 0 end +
      case when cr.current_solution is not null then 25 else 0 end
    ))::integer,
    round(avg(
      case when cr.pain_point_detected then 50 else 0 end +
      case when cr.pain_point_details is not null then 30 else 0 end +
      case when cr.urgency is not null then 20 else 0 end
    ))::integer,
    round(avg(case
      when not cr.objection_detected then 70
      when cr.objection_details is not null then least(90, coalesce(cr.sdr_quality_score, 50) + 10)
      else 25
    end))::integer,
    round(avg(coalesce(cr.qualification_completeness_score, 0)))::integer,
    round(avg(
      case when cr.appointment_booked then 60 else 0 end +
      case when cr.next_step is not null then 40 else 0 end
    ))::integer,
    coalesce((select case
      when t.recent_avg is null or t.prior_avg is null then 'stable'
      when t.recent_avg > t.prior_avg + 5 then 'improving'
      when t.recent_avg < t.prior_avg - 5 then 'declining'
      else 'stable'
    end from td t where t.sdr_id = u.id), 'stable'),
    case when count(cr.analysis_id) filter (where cr.appointment_booked = true) > 0 then
      round(count(cr.analysis_id) filter (where cr.appointment_booked = true and cr.decision_maker_detected is not true)::numeric
        / count(cr.analysis_id) filter (where cr.appointment_booked = true), 2)
    else 0 end,
    case when count(cr.analysis_id) filter (where cr.appointment_booked = true) > 0 then
      round(count(cr.analysis_id) filter (where cr.appointment_booked = true and cr.pain_point_detected is not true)::numeric
        / count(cr.analysis_id) filter (where cr.appointment_booked = true), 2)
    else 0 end,
    case when count(cr.analysis_id) > 0 then
      round(count(cr.analysis_id) filter (where cr.next_step is null)::numeric / count(cr.analysis_id), 2)
    else 0 end,
    case when count(cr.analysis_id) filter (where cr.objection_detected = true) > 0 then
      round(count(cr.analysis_id) filter (where cr.objection_detected = true and cr.objection_details is null)::numeric
        / count(cr.analysis_id) filter (where cr.objection_detected = true), 2)
    else 0 end,
    case when round(avg(cr.sdr_quality_score)) >= 75 then 'top'
         when round(avg(cr.sdr_quality_score)) < 55 then 'needs_coaching'
         else 'stable' end,
    max(bc.best_call_id),
    max(wc.worst_call_id)
  from scoped_sdrs u
  left join cr on cr.sdr_id = u.id
  left join bc on bc.sdr_id = u.id
  left join wc on wc.sdr_id = u.id
  group by u.id, u.name
  order by round(avg(cr.sdr_quality_score)) desc nulls last;
$$;
