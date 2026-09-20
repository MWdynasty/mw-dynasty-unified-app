-- MW Dynasty Founder OS v5
-- Audit every mutable Founder OS record while redacting direct contact/response text.

create or replace function private.mw_audit_founder_os_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.mw_app_role;
  v_old jsonb;
  v_new jsonb;
  v_target_id text;
begin
  select p.role into v_role from public.profiles p where p.user_id=v_actor;

  if tg_op='INSERT' then
    v_new := to_jsonb(new) - 'contact_email' - 'response_draft';
    v_target_id := coalesce(v_new->>'id',v_new->>'snapshot_date','');
  elsif tg_op='UPDATE' then
    v_old := to_jsonb(old) - 'contact_email' - 'response_draft';
    v_new := to_jsonb(new) - 'contact_email' - 'response_draft';
    v_target_id := coalesce(v_new->>'id',v_new->>'snapshot_date',v_old->>'id',v_old->>'snapshot_date','');
  else
    v_old := to_jsonb(old) - 'contact_email' - 'response_draft';
    v_target_id := coalesce(v_old->>'id',v_old->>'snapshot_date','');
  end if;

  insert into public.audit_log(
    actor_user_id,actor_role,action,target_type,target_id,old_value,new_value,reason,created_at
  ) values (
    v_actor,v_role,lower(tg_op)||'_founder_os',tg_table_name,v_target_id,
    v_old,v_new,'Founder OS change',now()
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

do $$
declare
  t text;
  trg text;
begin
  foreach t in array array[
    'founder_ai_tasks','founder_approvals','founder_knowledge_proposals','founder_crm_leads',
    'founder_marketing_campaigns','founder_program_releases','founder_ai_runs','founder_cost_entries',
    'founder_risk_register','founder_people_roles','founder_sops','founder_support_triage',
    'founder_kpi_snapshots'
  ]
  loop
    trg := 'mw_audit_'||t;
    execute format('drop trigger if exists %I on public.%I',trg,t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.mw_audit_founder_os_change()',
      trg,t
    );
  end loop;
end $$;
