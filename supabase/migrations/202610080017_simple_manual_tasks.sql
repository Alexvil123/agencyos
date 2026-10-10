begin;
alter table public.time_tasks add column manual_client_name text check(length(manual_client_name) between 1 and 255), add column manual_client_source text check(manual_client_source in ('jira_label','other')), add column work_date date;
create or replace function public.work_task_save(org_id uuid,target uuid,title_value text,description_value text,client uuid,department uuid,priority_value text,due timestamptz,estimate integer,type_value text,task_id uuid default null,expected timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.time_manage(org_id) and (private.time_member(org_id) is null or target<>private.time_member(org_id)) then raise exception 'Own task or authorized manager required';end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required';end if;
 if department is not null and not exists(select 1 from public.departments where id=department and organization_id=org_id) then raise exception 'Invalid department';end if;
 if length(trim(title_value)) not between 1 and 255 or length(description_value)>20000 or length(trim(type_value)) not between 1 and 100 then raise exception 'Invalid task';end if;
 if client is not null and not private.time_manage(org_id) and not exists(select 1 from public.time_clients(org_id) c where c.id=client) then raise exception 'Client scope denied';end if;
 if task_id is null then
 insert into public.time_tasks(organization_id,membership_id,title,description,client_id,department_id,priority,due_at,estimated_seconds,task_type) values(org_id,target,trim(title_value),description_value,client,department,priority_value,due,estimate,trim(type_value)) returning id into result;
 else
 perform 1 from public.time_tasks where id=task_id and organization_id=org_id and source='manual' and canonical_id is null and updated_at=expected and (membership_id=private.time_member(org_id) or private.time_manage(org_id)) for update;if not found then raise exception 'Task changed or is Jira-synced';end if;
 if exists(select 1 from public.time_logs l where l.task_id=work_task_save.task_id and l.state='running') then raise exception 'Hold the task before editing';end if;
 update public.time_tasks set membership_id=target,title=trim(title_value),description=description_value,client_id=client,department_id=department,priority=priority_value,due_at=due,estimated_seconds=estimate,task_type=trim(type_value),assigned_at=case when membership_id is distinct from target then now() else assigned_at end,updated_at=now() where id=task_id;result:=task_id;
 end if;return result;
end $$;
create function public.work_manual_save(org_id uuid,title_value text,client_name text,client_source text,work_day date,task_id uuid default null,expected timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); previous public.time_tasks; result uuid; target uuid;
begin
 if actor is null then raise exception 'Active employee required';end if;
 if task_id is not null then
 select * into previous from public.time_tasks where id=task_id and organization_id=org_id and source='manual' and (membership_id=actor or private.time_manage(org_id));
 if previous.id is null then raise exception 'Own task or authorized manager required';end if;
 end if;
 if client_source not in ('jira_label','other') or client_source is null or client_name is null or length(trim(client_name)) not between 1 and 255 or work_day is null then raise exception 'Client name and work date required';end if;
 if client_source='jira_label' and not coalesce((previous.manual_client_source='jira_label' and previous.manual_client_name=client_name),false) and not exists(select 1 from public.time_tasks t where t.organization_id=org_id and t.source='jira' and (t.membership_id=actor or private.time_manage(org_id)) and t.jira_metadata->'labels' @> jsonb_build_array(client_name)) then raise exception 'Select an available Jira client label';end if;
 target:=coalesce(previous.membership_id,actor);
 result:=public.work_task_save(org_id,target,title_value,coalesce(previous.description,''),previous.client_id,previous.department_id,coalesce(previous.priority,'medium'),(work_day+time '23:59:59') at time zone 'Asia/Kolkata',previous.estimated_seconds,coalesce(previous.task_type,'General'),task_id,expected);
 update public.time_tasks set manual_client_name=case when client_source='other' then trim(client_name) else client_name end,manual_client_source=client_source,work_date=work_day where id=result;
 return result;
end $$;
revoke all on function public.work_manual_save(uuid,text,text,text,date,uuid,timestamptz) from public,anon;
grant execute on function public.work_manual_save(uuid,text,text,text,date,uuid,timestamptz) to authenticated;
commit;
