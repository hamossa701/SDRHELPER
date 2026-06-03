-- ============================================================
-- Manager -> SDR Team Structure
-- Adds users.manager_id and scopes manager visibility to assigned SDRs.
-- ============================================================

alter table public.users
  add column if not exists manager_id uuid references public.users(id) on delete set null;

create index if not exists users_manager_id_idx on public.users(manager_id);
create index if not exists users_org_role_manager_idx on public.users(organization_id, role, manager_id);

create or replace function public.validate_user_manager_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_org uuid;
  manager_role text;
begin
  if new.role = 'sdr' then
    if new.manager_id is not null then
      select organization_id, role
        into manager_org, manager_role
        from public.users
        where id = new.manager_id;

      if manager_role is distinct from 'manager' or manager_org is distinct from new.organization_id then
        raise exception 'manager_id must reference a manager in the same organization';
      end if;
    end if;
  elsif new.manager_id is not null then
    raise exception 'Only SDR users can have manager_id set';
  end if;

  return new;
end;
$$;

drop trigger if exists users_validate_manager_assignment on public.users;
create trigger users_validate_manager_assignment
  before insert or update of organization_id, role, manager_id on public.users
  for each row
  execute function public.validate_user_manager_assignment();

alter table public.users
  drop constraint if exists users_manager_assignment_shape,
  add constraint users_manager_assignment_shape
  check (
    role = 'sdr'
    or manager_id is null
  ) not valid;

create or replace function public.is_manager_of_sdr(p_sdr_id uuid, p_manager_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users s
    where s.id = p_sdr_id
      and s.role = 'sdr'
      and s.manager_id = p_manager_id
      and s.organization_id = public.get_my_org_id()
  )
$$;

create or replace function public.manager_can_access_campaign(p_campaign_id uuid, p_manager_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_sdrs cs
    join public.users s on s.id = cs.user_id
    where cs.campaign_id = p_campaign_id
      and s.role = 'sdr'
      and s.manager_id = p_manager_id
      and s.organization_id = public.get_my_org_id()
  )
  or exists (
    select 1
    from public.calls c
    join public.users s on s.id = c.sdr_id
    where c.campaign_id = p_campaign_id
      and c.organization_id = public.get_my_org_id()
      and s.role = 'sdr'
      and s.manager_id = p_manager_id
  )
$$;

-- Demo team assignments.
update public.users
set name = 'David El Mansouri', manager_id = null
where email = 'manager@gmail.com'
  and role = 'manager';

update public.users s
set manager_id = m.id
from public.users m
where s.role = 'sdr'
  and m.role = 'manager'
  and s.organization_id = m.organization_id
  and s.email = 'sara@callforce.ma'
  and m.email = 'yasmine@callforce.ma';

update public.users s
set manager_id = m.id
from public.users m
where s.role = 'sdr'
  and m.role = 'manager'
  and s.organization_id = m.organization_id
  and s.email = 'amine@callforce.ma'
  and m.email = 'manager@gmail.com';

-- USERS
drop policy if exists "users_select" on public.users;
create policy "users_select" on public.users
  for select using (
    organization_id = get_my_org_id() and (
      get_my_role() = 'owner'
      or id = auth.uid()
      or (get_my_role() = 'manager' and role = 'sdr' and manager_id = auth.uid())
    )
  );

drop policy if exists "users_update" on public.users;
create policy "users_update" on public.users
  for update using (
    organization_id = get_my_org_id()
    and get_my_role() = 'owner'
  )
  with check (
    organization_id = get_my_org_id()
    and get_my_role() = 'owner'
  );

-- CAMPAIGNS
drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns
  for select using (
    organization_id = get_my_org_id() and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.manager_can_access_campaign(campaigns.id))
      or (get_my_role() = 'sdr' and exists (
        select 1 from public.campaign_sdrs
        where campaign_id = campaigns.id and user_id = auth.uid()
      ))
      or (get_my_role() = 'client' and exists (
        select 1 from public.campaign_clients
        where campaign_id = campaigns.id and user_id = auth.uid()
      ))
    )
  );

drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns
  for insert with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('owner', 'manager')
  );

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns
  for update using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.manager_can_access_campaign(campaigns.id))
    )
  );

-- CAMPAIGN_SDRS
drop policy if exists "campaign_sdrs_select" on public.campaign_sdrs;
create policy "campaign_sdrs_select" on public.campaign_sdrs
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or user_id = auth.uid()
          or public.is_manager_of_sdr(user_id)
        )
    )
  );

drop policy if exists "campaign_sdrs_insert" on public.campaign_sdrs;
create policy "campaign_sdrs_insert" on public.campaign_sdrs
  for insert with check (
    get_my_role() = 'owner'
    or (get_my_role() = 'manager' and public.is_manager_of_sdr(user_id))
  );

-- CALLS
drop policy if exists "calls_select" on public.calls;
create policy "calls_select" on public.calls
  for select using (
    organization_id = get_my_org_id() and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(calls.sdr_id))
      or (get_my_role() = 'sdr' and sdr_id = auth.uid())
      or (get_my_role() = 'client' and exists (
        select 1 from public.campaign_clients
        where campaign_id = calls.campaign_id and user_id = auth.uid()
      ))
    )
  );

drop policy if exists "calls_insert" on public.calls;
create policy "calls_insert" on public.calls
  for insert with check (
    organization_id = get_my_org_id() and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(calls.sdr_id))
      or (get_my_role() = 'sdr' and sdr_id = auth.uid())
    )
  );

drop policy if exists "calls_update" on public.calls;
create policy "calls_update" on public.calls
  for update using (
    organization_id = get_my_org_id() and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(calls.sdr_id))
    )
  )
  with check (
    organization_id = get_my_org_id() and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(calls.sdr_id))
    )
  );

-- ANALYSIS_JOBS
drop policy if exists "analysis_jobs_select" on public.analysis_jobs;
create policy "analysis_jobs_select" on public.analysis_jobs
  for select using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (get_my_role() = 'sdr' and exists (
        select 1 from public.calls c
        where c.id = analysis_jobs.call_id
          and c.sdr_id = auth.uid()
      ))
      or (get_my_role() = 'manager' and exists (
        select 1 from public.calls c
        where c.id = analysis_jobs.call_id
          and public.is_manager_of_sdr(c.sdr_id)
      ))
    )
  );

drop policy if exists "analysis_jobs_insert" on public.analysis_jobs;
create policy "analysis_jobs_insert" on public.analysis_jobs
  for insert with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('owner', 'manager', 'sdr')
  );

drop policy if exists "analysis_jobs_update" on public.analysis_jobs;
create policy "analysis_jobs_update" on public.analysis_jobs
  for update using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and exists (
        select 1 from public.calls c
        where c.id = analysis_jobs.call_id
          and public.is_manager_of_sdr(c.sdr_id)
      ))
    )
  );

-- CAMPAIGN_ASSIGNMENTS
drop policy if exists "owner_manager_assignments_all" on public.campaign_assignments;
drop policy if exists "sdr_own_assignments_select" on public.campaign_assignments;

create policy "campaign_assignments_select" on public.campaign_assignments
  for select using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or sdr_id = auth.uid()
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(sdr_id))
    )
  );

create policy "campaign_assignments_insert" on public.campaign_assignments
  for insert with check (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(sdr_id))
    )
  );

create policy "campaign_assignments_update" on public.campaign_assignments
  for update using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (get_my_role() = 'manager' and public.is_manager_of_sdr(sdr_id))
    )
  );

-- CALL_ANALYSES
drop policy if exists "call_analyses_select" on public.call_analyses;
create policy "call_analyses_select" on public.call_analyses
  for select using (
    exists (
      select 1 from public.calls c
      where c.id = call_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and public.is_manager_of_sdr(c.sdr_id))
          or (get_my_role() = 'sdr' and c.sdr_id = auth.uid())
          or (get_my_role() = 'client' and exists (
            select 1 from public.campaign_clients
            where campaign_id = c.campaign_id and user_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists "call_analyses_insert" on public.call_analyses;
create policy "call_analyses_insert" on public.call_analyses
  for insert with check (
    exists (
      select 1 from public.calls c
      where c.id = call_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and public.is_manager_of_sdr(c.sdr_id))
          or (get_my_role() = 'sdr' and c.sdr_id = auth.uid())
        )
    )
  );

drop policy if exists "call_analyses_update" on public.call_analyses;
create policy "call_analyses_update" on public.call_analyses
  for update using (
    exists (
      select 1 from public.calls c
      where c.id = call_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and public.is_manager_of_sdr(c.sdr_id))
        )
    )
  );

-- VALIDATION TABLES
drop policy if exists "field_corrections_select" on public.field_corrections;
create policy "field_corrections_select" on public.field_corrections
  for select using (
    exists (
      select 1 from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and public.is_manager_of_sdr(c.sdr_id))
        )
    )
  );

drop policy if exists "field_corrections_insert" on public.field_corrections;
create policy "field_corrections_insert" on public.field_corrections
  for insert with check (
    exists (
      select 1 from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and public.is_manager_of_sdr(c.sdr_id))
        )
    )
  );

drop policy if exists "field_corrections_update" on public.field_corrections;
create policy "field_corrections_update" on public.field_corrections
  for update using (
    exists (
      select 1 from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and public.is_manager_of_sdr(c.sdr_id))
        )
    )
  );

drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (
        get_my_role() = 'manager'
        and exists (
          select 1 from public.call_analyses ca
          join public.calls c on c.id = ca.call_id
          where ca.id = audit_log.analysis_id
            and public.is_manager_of_sdr(c.sdr_id)
        )
      )
    )
  );

drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert" on public.audit_log
  for insert with check (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (
        get_my_role() = 'manager'
        and exists (
          select 1 from public.call_analyses ca
          join public.calls c on c.id = ca.call_id
          where ca.id = audit_log.analysis_id
            and public.is_manager_of_sdr(c.sdr_id)
        )
      )
    )
  );

-- RPC overloads used by the app after introducing manager team scope.
create or replace function public.get_sdr_leaderboard(p_org_id uuid, p_manager_id uuid)
returns table (
  sdr_id uuid,
  sdr_name text,
  total_calls bigint,
  rdv_booked bigint,
  avg_sdr_quality integer
)
language sql stable security invoker as $$
  select base.sdr_id, base.sdr_name, base.total_calls, base.rdv_booked, base.avg_sdr_quality
  from public.get_sdr_leaderboard(p_org_id) base
  join public.users u on u.id = base.sdr_id
  where p_manager_id is null or u.manager_id = p_manager_id
$$;

create or replace function public.get_manager_kpis(p_org_id uuid, p_manager_id uuid)
returns table (
  team_sdr_count bigint,
  today_calls bigint,
  calls_requiring_review bigint,
  appointments_booked bigint,
  qualified_appointments bigint,
  qualification_rate integer,
  weak_appointments bigint,
  calls_reviewed bigint,
  calls_pending bigint,
  coaching_opportunities bigint,
  ai_trust_validated bigint,
  ai_trust_corrected bigint
)
language sql stable security invoker as $$
  with team_sdrs as (
    select id
    from public.users
    where organization_id = p_org_id
      and role = 'sdr'
      and (p_manager_id is null or manager_id = p_manager_id)
  ),
  scoped_calls as (
    select c.*
    from public.calls c
    join team_sdrs s on s.id = c.sdr_id
    where c.organization_id = p_org_id
  ),
  sdr_avgs as (
    select s.id, round(avg(ca.sdr_quality_score))::integer as avg_q
    from team_sdrs s
    left join scoped_calls c on c.sdr_id = s.id
    left join public.call_analyses ca on ca.call_id = c.id
    group by s.id
  )
  select
    (select count(*)::bigint from team_sdrs),
    (select count(*)::bigint from scoped_calls where call_datetime >= current_date::timestamptz),
    count(ca.id) filter (where ca.id is not null and c.review_status != 'resolved' and (
      (ca.appointment_booked = true and ca.decision_maker_detected is not true)
      or (ca.appointment_booked = true and ca.appointment_quality_score < 60)
      or (ca.appointment_booked = true and ca.appointment_datetime is null)
      or (ca.appointment_booked = true and ca.pain_point_detected is not true)
      or (ca.ai_confidence is not null and ca.ai_confidence < 70)
      or (ca.hallucination_risk in ('medium','high'))
      or (ca.qualification_completeness_score is not null and ca.qualification_completeness_score < 60)
      or (ca.objection_detected = true and ca.objection_details is null)
      or (ca.next_step is null)
    ))::bigint,
    count(ca.id) filter (where ca.appointment_booked = true)::bigint,
    count(ca.id) filter (where
      ca.appointment_booked = true
      and ca.decision_maker_detected = true
      and ca.pain_point_detected = true
      and ca.appointment_datetime is not null
      and ca.appointment_quality_score >= 60
    )::bigint,
    case when count(ca.id) filter (where ca.appointment_booked = true) > 0 then
      round(count(ca.id) filter (where
        ca.appointment_booked = true
        and ca.decision_maker_detected = true
        and ca.pain_point_detected = true
        and ca.appointment_datetime is not null
        and ca.appointment_quality_score >= 60
      )::numeric / count(ca.id) filter (where ca.appointment_booked = true) * 100)::integer
    else 0 end,
    count(ca.id) filter (where ca.appointment_booked = true and coalesce(ca.appointment_quality_score, 0) < 60)::bigint,
    count(ca.id) filter (where ca.human_validated = true)::bigint,
    count(ca.id) filter (where ca.id is not null and ca.human_validated = false)::bigint,
    (select count(*)::bigint from sdr_avgs where avg_q is null or avg_q < 55),
    (select count(*)::bigint
     from scoped_calls c2
     join public.call_analyses ca2 on ca2.call_id = c2.id
     cross join lateral jsonb_each_text(coalesce(ca2.field_validations,'{}')) fv(k,v)
     where fv.v = 'validated'),
    (select count(*)::bigint
     from scoped_calls c2
     join public.call_analyses ca2 on ca2.call_id = c2.id
     cross join lateral jsonb_each_text(coalesce(ca2.field_validations,'{}')) fv(k,v)
     where fv.v = 'corrected')
  from scoped_calls c
  left join public.call_analyses ca on ca.call_id = c.id;
$$;

create or replace function public.get_sdr_coaching_stats(p_org_id uuid, p_since timestamptz default null, p_manager_id uuid default null)
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
  select base.*
  from public.get_sdr_coaching_stats(p_org_id, p_since) base
  join public.users u on u.id = base.sdr_id
  where p_manager_id is null or u.manager_id = p_manager_id
$$;
