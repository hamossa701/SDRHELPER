-- Add missing INSERT and UPDATE RLS policies for client_accounts.
-- SELECT policy already exists (migration-client-accounts.sql).
-- Owners and managers can create/edit client accounts within their own org.

drop policy if exists "client_accounts_insert" on public.client_accounts;
create policy "client_accounts_insert" on public.client_accounts
  for insert with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('owner', 'manager')
  );

drop policy if exists "client_accounts_update" on public.client_accounts;
create policy "client_accounts_update" on public.client_accounts
  for update using (
    organization_id = get_my_org_id()
    and get_my_role() in ('owner', 'manager')
  ) with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('owner', 'manager')
  );
