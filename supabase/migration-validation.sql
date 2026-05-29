-- ============================================================
-- SDRHelper — Human Validation Workflow Migration
-- Run this in your Supabase SQL editor AFTER the base schema.
-- ============================================================

-- Add validation columns to call_analyses
alter table public.call_analyses
  add column if not exists field_validations jsonb not null default '{}',
  add column if not exists validated_by uuid references public.users(id),
  add column if not exists validated_at timestamptz;

-- ============================================================
-- FIELD CORRECTIONS
-- Preserves original AI value; stores manager correction.
-- ============================================================
create table if not exists public.field_corrections (
  id uuid primary key default uuid_generate_v4(),
  analysis_id uuid not null references public.call_analyses(id) on delete cascade,
  field_name text not null,
  original_value text,
  corrected_value text,
  corrected_by uuid not null references public.users(id),
  corrected_at timestamptz not null default now(),
  unique (analysis_id, field_name)
);

-- ============================================================
-- AUDIT LOG
-- Immutable history of every validation / correction action.
-- ============================================================
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  analysis_id uuid references public.call_analyses(id) on delete set null,
  field_name text,
  old_value text,
  new_value text,
  action text not null check (action in ('validate_field', 'correct_field', 'approve_analysis')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.field_corrections enable row level security;
alter table public.audit_log enable row level security;

-- field_corrections: owner/manager only
create policy "field_corrections_select" on public.field_corrections
  for select using (
    get_my_role() in ('owner', 'manager') and
    exists (
      select 1 from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id and c.organization_id = get_my_org_id()
    )
  );

create policy "field_corrections_insert" on public.field_corrections
  for insert with check (
    get_my_role() in ('owner', 'manager') and
    exists (
      select 1 from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id and c.organization_id = get_my_org_id()
    )
  );

create policy "field_corrections_update" on public.field_corrections
  for update using (
    get_my_role() in ('owner', 'manager')
  );

-- audit_log: owner/manager can read; SDRs and clients cannot
create policy "audit_log_select" on public.audit_log
  for select using (
    organization_id = get_my_org_id() and
    get_my_role() in ('owner', 'manager')
  );

create policy "audit_log_insert" on public.audit_log
  for insert with check (
    organization_id = get_my_org_id() and
    get_my_role() in ('owner', 'manager')
  );
