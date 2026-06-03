-- Manager team structure verification queries.
-- Run after supabase/migration-manager-team-structure.sql.

-- 1. Audit users and manager assignments.
select
  u.id,
  u.email,
  u.name,
  u.role,
  u.manager_id,
  m.email as manager_email,
  m.name as manager_name,
  u.organization_id
from public.users u
left join public.users m on m.id = u.manager_id
order by u.role, u.name;

-- 2. Expected demo assignments.
select
  s.email as sdr_email,
  s.name as sdr_name,
  m.email as manager_email,
  m.name as manager_name,
  case
    when s.email = 'sara@callforce.ma' and m.email = 'yasmine@callforce.ma' then 'ok'
    when s.email = 'amine@callforce.ma' and m.email = 'manager@gmail.com' then 'ok'
    else 'check'
  end as assignment_status
from public.users s
left join public.users m on m.id = s.manager_id
where s.email in ('sara@callforce.ma', 'amine@callforce.ma')
order by s.email;

-- 3. Manager team call and analysis counts.
select
  mgr.email as manager_email,
  mgr.name as manager_name,
  count(distinct s.id) as assigned_sdrs,
  count(distinct c.id) as team_calls,
  count(distinct ca.id) as team_analyses
from public.users mgr
left join public.users s
  on s.manager_id = mgr.id
 and s.role = 'sdr'
left join public.calls c
  on c.sdr_id = s.id
left join public.call_analyses ca
  on ca.call_id = c.id
where mgr.email in ('yasmine@callforce.ma', 'manager@gmail.com')
group by mgr.email, mgr.name
order by mgr.email;

-- 4. RPC verification for manager dashboard inputs.
select 'yasmine@callforce.ma' as manager_email, *
from public.get_manager_kpis(
  (select organization_id from public.users where email = 'yasmine@callforce.ma' limit 1),
  (select id from public.users where email = 'yasmine@callforce.ma' limit 1)
);

select 'manager@gmail.com' as manager_email, *
from public.get_manager_kpis(
  (select organization_id from public.users where email = 'manager@gmail.com' limit 1),
  (select id from public.users where email = 'manager@gmail.com' limit 1)
);
