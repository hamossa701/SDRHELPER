-- ============================================================
-- SDRHelper — Hardening Migration
-- Run AFTER migration-validation.sql
-- ============================================================

-- ============================================================
-- PART 1: ANALYSIS JOB TRACKING
-- Prevents silent failures on concurrent AI submissions.
-- ============================================================
create table if not exists public.analysis_jobs (
  id              uuid        primary key default uuid_generate_v4(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  call_id         uuid        references public.calls(id) on delete set null,
  status          text        not null default 'pending'
                              check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message   text,
  retry_count     int         not null default 0,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

-- ============================================================
-- PART 4: REVIEW QUEUE OWNERSHIP
-- Prevents duplicate manager work on the same flagged call.
-- ============================================================
alter table public.calls
  add column if not exists review_status text not null default 'open'
    check (review_status in ('open', 'in_review', 'resolved')),
  add column if not exists assigned_to   uuid references public.users(id),
  add column if not exists reviewed_by   uuid references public.users(id),
  add column if not exists reviewed_at   timestamptz;

-- ============================================================
-- PART 6: AI USAGE TRACKING
-- Owner-visible cost log per analysis.
-- ============================================================
create table if not exists public.ai_usage_log (
  id                 uuid           primary key default uuid_generate_v4(),
  organization_id    uuid           not null references public.organizations(id) on delete cascade,
  call_id            uuid           references public.calls(id) on delete set null,
  job_id             uuid           references public.analysis_jobs(id) on delete set null,
  model              text           not null,
  input_tokens       int            not null,
  output_tokens      int            not null,
  estimated_cost_usd numeric(10,6)  not null,
  created_at         timestamptz    not null default now()
);

-- ============================================================
-- PART 8: INDEXES
-- Supports all common dashboard queries and RLS evaluation.
-- ============================================================

-- Core access pattern: org + datetime DESC (used by every dashboard)
create index if not exists idx_calls_org_datetime
  on public.calls(organization_id, call_datetime desc);

-- SDR dashboard and coaching page
create index if not exists idx_calls_sdr_id
  on public.calls(sdr_id);

-- Campaign detail page
create index if not exists idx_calls_campaign_id
  on public.calls(campaign_id);

-- Manager review queue — partial index excludes resolved rows
create index if not exists idx_calls_review_open
  on public.calls(organization_id, review_status)
  where review_status != 'resolved';

-- Validation panel and trust score
create index if not exists idx_call_analyses_call_id
  on public.call_analyses(call_id);

-- Executive summary: validated data path
create index if not exists idx_call_analyses_validated
  on public.call_analyses(human_validated);

-- Job status lookups
create index if not exists idx_analysis_jobs_org_status
  on public.analysis_jobs(organization_id, status, created_at desc);

create index if not exists idx_analysis_jobs_call_id
  on public.analysis_jobs(call_id);

-- AI cost dashboard
create index if not exists idx_ai_usage_log_org
  on public.ai_usage_log(organization_id, created_at desc);

-- Audit log (ValidationPanel fetches by analysis_id)
create index if not exists idx_audit_log_analysis_id
  on public.audit_log(analysis_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.analysis_jobs enable row level security;
alter table public.ai_usage_log   enable row level security;

-- analysis_jobs: all org members can read/insert; org members can update (server-side)
create policy "analysis_jobs_select" on public.analysis_jobs
  for select using (organization_id = get_my_org_id());

create policy "analysis_jobs_insert" on public.analysis_jobs
  for insert with check (organization_id = get_my_org_id());

create policy "analysis_jobs_update" on public.analysis_jobs
  for update using (organization_id = get_my_org_id());

-- ai_usage_log: owner/manager read only; server-side insert allowed
create policy "ai_usage_log_select" on public.ai_usage_log
  for select using (
    organization_id = get_my_org_id()
    and get_my_role() in ('owner', 'manager')
  );

create policy "ai_usage_log_insert" on public.ai_usage_log
  for insert with check (organization_id = get_my_org_id());
