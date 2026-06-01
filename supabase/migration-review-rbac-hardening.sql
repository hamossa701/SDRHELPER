-- Review RBAC hardening.
-- Owners can update review/validation data across their organization.
-- Managers can update only unassigned reviews they claim, or reviews assigned to themselves.

drop policy if exists "calls_update" on public.calls;
create policy "calls_update" on public.calls
  for update
  using (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (
        get_my_role() = 'manager'
        and (assigned_to is null or assigned_to = auth.uid())
      )
    )
  )
  with check (
    organization_id = get_my_org_id()
    and (
      get_my_role() = 'owner'
      or (
        get_my_role() = 'manager'
        and assigned_to = auth.uid()
      )
    )
  );

drop policy if exists "call_analyses_update" on public.call_analyses;
create policy "call_analyses_update" on public.call_analyses
  for update
  using (
    exists (
      select 1
      from public.calls c
      where c.id = call_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and c.assigned_to = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.calls c
      where c.id = call_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and c.assigned_to = auth.uid())
        )
    )
  );

drop policy if exists "field_corrections_insert" on public.field_corrections;
create policy "field_corrections_insert" on public.field_corrections
  for insert
  with check (
    exists (
      select 1
      from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and c.assigned_to = auth.uid())
        )
    )
  );

drop policy if exists "field_corrections_update" on public.field_corrections;
create policy "field_corrections_update" on public.field_corrections
  for update
  using (
    exists (
      select 1
      from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and c.assigned_to = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.call_analyses ca
      join public.calls c on c.id = ca.call_id
      where ca.id = analysis_id
        and c.organization_id = get_my_org_id()
        and (
          get_my_role() = 'owner'
          or (get_my_role() = 'manager' and c.assigned_to = auth.uid())
        )
    )
  );
