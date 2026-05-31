-- SDRHelper - Client accounts and campaign visibility model
-- Separates call-center agency organizations from client donneur d'ordre accounts.

create table if not exists public.client_accounts (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists client_accounts_org_name_unique
  on public.client_accounts (organization_id, lower(name));

create unique index if not exists client_accounts_id_org_unique
  on public.client_accounts (id, organization_id);

alter table public.client_accounts enable row level security;

alter table public.users
  add column if not exists client_id uuid references public.client_accounts(id) on delete set null;

alter table public.campaigns
  add column if not exists client_id uuid references public.client_accounts(id) on delete restrict;

create index if not exists idx_users_client_id on public.users(client_id);
create index if not exists idx_campaigns_client_id on public.campaigns(client_id);
create index if not exists idx_campaigns_org_client on public.campaigns(organization_id, client_id);

-- Current production repair: PROSPECTION is the Praize campaign operated by the agency.
update public.campaigns
set client_name = 'Praize'
where campaign_name = 'PROSPECTION'
  and client_name in ('SALESAGENCYTEAM', 'Praize')
  and organization_id = (select id from public.organizations where name = 'CallForce Maroc' limit 1);

insert into public.client_accounts (organization_id, name)
select distinct organization_id, client_name
from public.campaigns
where client_name is not null and btrim(client_name) <> ''
on conflict (organization_id, lower(name)) do nothing;

update public.campaigns c
set client_id = ca.id
from public.client_accounts ca
where ca.organization_id = c.organization_id
  and lower(ca.name) = lower(c.client_name)
  and c.client_id is null;

update public.users u
set client_id = ca.id
from public.client_accounts ca
where u.email = 'pierre@clientcorp.fr'
  and u.role = 'client'
  and ca.name = 'Praize'
  and ca.organization_id = u.organization_id;

insert into public.campaign_sdrs (campaign_id, user_id)
select distinct c.campaign_id, c.sdr_id
from public.calls c
join public.analysis_jobs aj on aj.call_id = c.id and aj.status = 'completed'
join public.call_analyses ca on ca.call_id = c.id and ca.prospect_company is not null and ca.prospect_company not in ('En attente...', 'En attente…')
join public.users u on u.id = c.sdr_id and u.role = 'sdr'
join public.campaigns camp on camp.id = c.campaign_id and camp.organization_id = u.organization_id
on conflict do nothing;

delete from public.campaign_sdrs cs
where not exists (
  select 1
  from public.calls c
  join public.analysis_jobs aj on aj.call_id = c.id and aj.status = 'completed'
  join public.call_analyses ca on ca.call_id = c.id and ca.prospect_company is not null and ca.prospect_company not in ('En attente...', 'En attente…')
  where c.campaign_id = cs.campaign_id
    and c.sdr_id = cs.user_id
);

alter table public.campaigns
  alter column client_id set not null;

alter table public.users
  drop constraint if exists users_client_role_requires_client_id;
alter table public.users
  add constraint users_client_role_requires_client_id
  check (role <> 'client' or client_id is not null);

alter table public.campaigns
  drop constraint if exists campaigns_client_same_org;
alter table public.campaigns
  add constraint campaigns_client_same_org
  foreign key (client_id, organization_id)
  references public.client_accounts(id, organization_id);

create or replace function public.get_my_client_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select client_id from public.users where id = auth.uid()
$$;

create or replace function public.is_campaign_sdr(p_campaign_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaign_sdrs cs
    where cs.campaign_id = p_campaign_id and cs.user_id = p_user_id
  )
$$;

revoke execute on function public.get_my_client_id() from public, anon, authenticated;
revoke execute on function public.is_campaign_sdr(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_my_client_id() to authenticated;
grant execute on function public.is_campaign_sdr(uuid, uuid) to authenticated;

drop policy if exists "client_accounts_select" on public.client_accounts;
create policy "client_accounts_select" on public.client_accounts
  for select using (
    organization_id = get_my_org_id()
    and (
      get_my_role() in ('owner', 'manager')
      or (get_my_role() = 'client' and id = get_my_client_id())
    )
  );

drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns
  for select using (
    organization_id = get_my_org_id()
    and (
      get_my_role() in ('owner', 'manager')
      or (get_my_role() = 'sdr' and public.is_campaign_sdr(campaigns.id, auth.uid()))
      or (get_my_role() = 'client' and client_id = get_my_client_id())
    )
  );

drop policy if exists "campaign_sdrs_select" on public.campaign_sdrs;
create policy "campaign_sdrs_select" on public.campaign_sdrs
  for select using (
    (get_my_role() = 'sdr' and user_id = auth.uid())
    or (
      get_my_role() in ('owner', 'manager')
      and exists (
        select 1 from public.campaigns c
        where c.id = campaign_id and c.organization_id = get_my_org_id()
      )
    )
  );

drop policy if exists "campaign_clients_select" on public.campaign_clients;
create policy "campaign_clients_select" on public.campaign_clients
  for select using (
    (
      get_my_role() in ('owner', 'manager')
      and exists (
        select 1 from public.campaigns c
        where c.id = campaign_id and c.organization_id = get_my_org_id()
      )
    )
    or (get_my_role() = 'client' and user_id = auth.uid())
  );

drop policy if exists "calls_select" on public.calls;
create policy "calls_select" on public.calls
  for select using (
    organization_id = get_my_org_id()
    and (
      get_my_role() in ('owner', 'manager')
      or (
        get_my_role() = 'sdr'
        and sdr_id = auth.uid()
        and public.is_campaign_sdr(calls.campaign_id, auth.uid())
      )
    )
  );

drop policy if exists "calls_insert" on public.calls;
create policy "calls_insert" on public.calls
  for insert with check (
    organization_id = get_my_org_id()
    and (
      get_my_role() in ('owner', 'manager')
      or (
        get_my_role() = 'sdr'
        and sdr_id = auth.uid()
        and public.is_campaign_sdr(calls.campaign_id, auth.uid())
      )
    )
  );

drop policy if exists "call_analyses_select" on public.call_analyses;
create policy "call_analyses_select" on public.call_analyses
  for select using (
    exists (
      select 1 from public.calls c
      where c.id = call_analyses.call_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() in ('owner', 'manager')
          or (
            get_my_role() = 'sdr'
            and c.sdr_id = auth.uid()
            and public.is_campaign_sdr(c.campaign_id, auth.uid())
          )
        )
    )
  );
