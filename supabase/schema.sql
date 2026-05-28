-- ============================================================
-- SDRHelper - Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
create table public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'enterprise')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'sdr' check (role in ('owner', 'manager', 'sdr', 'client')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
create table public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_name text not null,
  campaign_name text not null,
  sector text,
  target_persona text,
  offer_description text,
  script_notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now()
);

-- Campaign <-> Client user assignment
create table public.campaign_clients (
  campaign_id uuid references public.campaigns(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  primary key (campaign_id, user_id)
);

-- Campaign <-> SDR assignment
create table public.campaign_sdrs (
  campaign_id uuid references public.campaigns(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  primary key (campaign_id, user_id)
);

-- ============================================================
-- CALLS
-- ============================================================
create table public.calls (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sdr_id uuid not null references public.users(id) on delete cascade,
  transcript text,
  audio_url text,
  call_datetime timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CALL ANALYSES
-- ============================================================
create table public.call_analyses (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  
  -- Summary
  call_summary text,
  
  -- Prospect
  prospect_company text,
  contact_name text,
  contact_role text,
  decision_maker_detected boolean,
  
  -- Qualification
  pain_point_detected boolean,
  pain_point_details text,
  urgency text,
  current_solution text,
  interest_level text check (interest_level in ('cold', 'warm', 'hot', 'unclear')),
  
  -- Objections
  objection_detected boolean default false,
  objection_type text,
  objection_details text,
  
  -- Appointment
  appointment_booked boolean default false,
  appointment_datetime timestamptz,
  appointment_quality_score integer check (appointment_quality_score between 0 and 100),
  appointment_quality_reason text,
  next_step text,
  
  -- SDR Performance
  sdr_quality_score integer check (sdr_quality_score between 0 and 100),
  qualification_completeness_score integer check (qualification_completeness_score between 0 and 100),
  strengths jsonb default '[]',
  weaknesses jsonb default '[]',
  coaching_recommendations jsonb default '[]',
  
  -- Risk Control
  ai_confidence integer check (ai_confidence between 0 and 100),
  hallucination_risk text check (hallucination_risk in ('low', 'medium', 'high')),
  missing_information jsonb default '[]',
  uncertain_fields jsonb default '[]',
  
  -- Human validation
  human_validated boolean default false,
  correction_notes text,
  
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_clients enable row level security;
alter table public.campaign_sdrs enable row level security;
alter table public.calls enable row level security;
alter table public.call_analyses enable row level security;

-- Helper function: get current user's organization_id
create or replace function public.get_my_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from public.users where id = auth.uid()
$$;

-- Helper function: get current user's role
create or replace function public.get_my_role()
returns text language sql stable security definer as $$
  select role from public.users where id = auth.uid()
$$;

-- ORGANIZATIONS: users see only their own org
create policy "org_select" on public.organizations
  for select using (id = get_my_org_id());

-- USERS: see users in same org
create policy "users_select" on public.users
  for select using (organization_id = get_my_org_id());

create policy "users_insert" on public.users
  for insert with check (organization_id = get_my_org_id());

create policy "users_update" on public.users
  for update using (
    organization_id = get_my_org_id() and
    (get_my_role() in ('owner', 'manager') or id = auth.uid())
  );

-- CAMPAIGNS: org scoped, clients see only assigned campaigns
create policy "campaigns_select" on public.campaigns
  for select using (
    organization_id = get_my_org_id() and (
      get_my_role() in ('owner', 'manager', 'sdr') or
      exists (
        select 1 from public.campaign_clients
        where campaign_id = campaigns.id and user_id = auth.uid()
      )
    )
  );

create policy "campaigns_insert" on public.campaigns
  for insert with check (
    organization_id = get_my_org_id() and
    get_my_role() in ('owner', 'manager')
  );

create policy "campaigns_update" on public.campaigns
  for update using (
    organization_id = get_my_org_id() and
    get_my_role() in ('owner', 'manager')
  );

-- CAMPAIGN_CLIENTS: org members only
create policy "campaign_clients_select" on public.campaign_clients
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.organization_id = get_my_org_id()
    )
  );

create policy "campaign_clients_insert" on public.campaign_clients
  for insert with check (
    get_my_role() in ('owner', 'manager')
  );

-- CAMPAIGN_SDRS: org members only
create policy "campaign_sdrs_select" on public.campaign_sdrs
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.organization_id = get_my_org_id()
    )
  );

create policy "campaign_sdrs_insert" on public.campaign_sdrs
  for insert with check (
    get_my_role() in ('owner', 'manager')
  );

-- CALLS: org scoped; SDRs see only own calls; clients see calls in their campaigns
create policy "calls_select" on public.calls
  for select using (
    organization_id = get_my_org_id() and (
      get_my_role() in ('owner', 'manager') or
      (get_my_role() = 'sdr' and sdr_id = auth.uid()) or
      (get_my_role() = 'client' and exists (
        select 1 from public.campaign_clients
        where campaign_id = calls.campaign_id and user_id = auth.uid()
      ))
    )
  );

create policy "calls_insert" on public.calls
  for insert with check (
    organization_id = get_my_org_id() and
    get_my_role() in ('owner', 'manager', 'sdr')
  );

-- CALL_ANALYSES: same rules as calls via join
create policy "call_analyses_select" on public.call_analyses
  for select using (
    exists (
      select 1 from public.calls c
      where c.id = call_id and
        c.organization_id = get_my_org_id() and (
          get_my_role() in ('owner', 'manager') or
          (get_my_role() = 'sdr' and c.sdr_id = auth.uid()) or
          (get_my_role() = 'client' and exists (
            select 1 from public.campaign_clients
            where campaign_id = c.campaign_id and user_id = auth.uid()
          ))
        )
    )
  );

create policy "call_analyses_insert" on public.call_analyses
  for insert with check (
    exists (
      select 1 from public.calls c
      where c.id = call_id and c.organization_id = get_my_org_id()
    )
  );

create policy "call_analyses_update" on public.call_analyses
  for update using (
    exists (
      select 1 from public.calls c
      where c.id = call_id and c.organization_id = get_my_org_id()
      and get_my_role() in ('owner', 'manager')
    )
  );
