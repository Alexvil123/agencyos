-- Month projects. Work now lives in one Jira project per month (JAN … DEC) plus SOURCE, so a new month (for example NOV) is accepted
-- as soon as it exists in Jira. Before this, only OCT, SEP and SOURCE were accepted and a task from any other project made the whole sync fail.
-- The rules only get wider: every row that is valid today stays valid.
begin;
alter table public.jira_issues drop constraint jira_issues_project_key_check, add constraint jira_issues_project_key_check CHECK ((project_key = ANY (ARRAY['JAN'::text, 'FEB'::text, 'MAR'::text, 'APR'::text, 'MAY'::text, 'JUN'::text, 'JUL'::text, 'AUG'::text, 'SEP'::text, 'OCT'::text, 'NOV'::text, 'DEC'::text, 'SOURCE'::text])));
alter table public.time_tasks drop constraint time_tasks_jira_key_check, add constraint time_tasks_jira_key_check CHECK ((jira_key ~ '^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SOURCE)-[1-9][0-9]*$'::text));
alter table public.work_project_config drop constraint work_project_config_jira_project_check, add constraint work_project_config_jira_project_check CHECK ((jira_project = ANY (ARRAY['JAN'::text, 'FEB'::text, 'MAR'::text, 'APR'::text, 'MAY'::text, 'JUN'::text, 'JUL'::text, 'AUG'::text, 'SEP'::text, 'OCT'::text, 'NOV'::text, 'DEC'::text, 'SOURCE'::text])));
alter table public.work_workflow_mappings drop constraint work_workflow_mappings_project_check, add constraint work_workflow_mappings_project_check CHECK ((project = ANY (ARRAY['JAN'::text, 'FEB'::text, 'MAR'::text, 'APR'::text, 'MAY'::text, 'JUN'::text, 'JUL'::text, 'AUG'::text, 'SEP'::text, 'OCT'::text, 'NOV'::text, 'DEC'::text, 'SOURCE'::text])));
alter table public.sales_conversion_settings drop constraint sales_conversion_settings_jira_project_check, add constraint sales_conversion_settings_jira_project_check CHECK ((jira_project = ANY (ARRAY['JAN'::text, 'FEB'::text, 'MAR'::text, 'APR'::text, 'MAY'::text, 'JUN'::text, 'JUL'::text, 'AUG'::text, 'SEP'::text, 'OCT'::text, 'NOV'::text, 'DEC'::text])));

CREATE OR REPLACE FUNCTION public.time_jira_begin(org_id uuid, actor_user uuid, issue_key text, issue_assignee text, title_value text, operation text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare member uuid; tracked_task uuid;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 member:=private.time_member(org_id);
 if member is null or not exists(select 1 from public.jira_account_links where organization_id=org_id and membership_id=member and account_id=issue_assignee) then raise exception 'Current Jira assignment required';end if;
 if issue_key !~ '^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SOURCE)-[1-9][0-9]*$' or operation not in ('timer_start','timer_resume') then raise exception 'Invalid Jira timer action';end if;
 perform 1 from public.memberships where id=member for update;
 insert into public.time_tasks(organization_id,membership_id,title,jira_key) values(org_id,member,title_value,issue_key)
 on conflict(organization_id,membership_id,jira_key) where jira_key is not null do update set title=excluded.title
 returning id into tracked_task;
 if operation='timer_resume' and not exists(select 1 from public.time_logs where membership_id=member and task_id=tracked_task and state='paused') then raise exception 'No paused timer';end if;
 perform private.time_event_core(org_id,operation,tracked_task);
 return tracked_task;
end $function$;

CREATE OR REPLACE FUNCTION public.work_import_core(org_id uuid, actor_user uuid, issues jsonb, system_event boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare x jsonb; assigned uuid; existing public.time_tasks; status_value text;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 if jsonb_typeof(issues)<>'array' or jsonb_array_length(issues)>100 then raise exception 'Invalid batch';end if;
 for x in select * from jsonb_array_elements(issues) loop
 if not system_event and not private.can_access_jira(org_id,x->>'assignee_id') then raise exception 'Assigned Jira access required';end if;
 if x->>'project_key' not in ('JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','SOURCE') or x->>'key' !~ '^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SOURCE)-[1-9][0-9]*$' then raise exception 'Invalid Jira identity';end if;
 select m.id into assigned from public.jira_account_links l join public.memberships m on m.id=l.membership_id and m.active where l.organization_id=org_id and l.account_id=x->>'assignee_id';
 select * into existing from public.time_tasks where organization_id=org_id and jira_key=x->>'key' and canonical_id is null for update;
 if existing.id is not null and (existing.jira_updated_at>(x->>'jira_updated')::timestamptz or existing.jira_updated_at=(x->>'jira_updated')::timestamptz and existing.membership_id is not distinct from assigned) then continue;end if;
 status_value:=case when x->>'status_category'='done' then 'completed' when existing.id is not null and existing.jira_status_id=x->>'status_id' then existing.work_status when exists(select 1 from public.work_workflow_mappings where organization_id=org_id and project=x->>'project_key' and hold_status=x->>'status_id' and enabled) then 'on_hold' when x->>'status_category'='indeterminate' then 'in_progress' else 'pending' end;
 insert into public.time_tasks(organization_id,membership_id,title,description,source,jira_key,jira_issue_id,jira_project,jira_status,jira_status_id,jira_assignee_account_id,jira_updated_at,work_status,completed_at,task_type,due_at)
 values(org_id,assigned,x->>'summary',coalesce(x->>'description_text',''),'jira',x->>'key',x->>'id',x->>'project_key',x->>'status_name',x->>'status_id',x->>'assignee_id',(x->>'jira_updated')::timestamptz,status_value,case when status_value='completed' then (x->>'jira_updated')::timestamptz else null end,coalesce(x->>'task_type','General'),case when x->>'due_date' ~ '^\d{4}-\d{2}-\d{2}$' then ((x->>'due_date')||'T23:59:59+05:30')::timestamptz else null end)
 on conflict(organization_id,jira_key) where jira_key is not null and canonical_id is null do update set membership_id=excluded.membership_id,title=excluded.title,description=excluded.description,jira_issue_id=excluded.jira_issue_id,jira_project=excluded.jira_project,jira_status=excluded.jira_status,jira_status_id=excluded.jira_status_id,jira_assignee_account_id=excluded.jira_assignee_account_id,jira_updated_at=excluded.jira_updated_at,work_status=excluded.work_status,completed_at=case when excluded.work_status='completed' then coalesce(public.time_tasks.completed_at,excluded.completed_at) else null end,task_type=case when public.time_tasks.task_type='General' then excluded.task_type else public.time_tasks.task_type end,due_at=excluded.due_at,assigned_at=case when public.time_tasks.membership_id is distinct from excluded.membership_id then now() else public.time_tasks.assigned_at end,updated_at=now();
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.work_jira_attach(org_id uuid, actor_user uuid, task uuid, issue jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.time_tasks; member uuid;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 select * into t from public.time_tasks where id=task and organization_id=org_id and source='manual' for update;if t.id is null then raise exception 'Manual task required';end if;
 select membership_id into member from public.jira_account_links where organization_id=org_id and account_id=issue->>'assignee_id';if member is distinct from t.membership_id then raise exception 'Issue assignee mismatch';end if;
 if issue->>'project_key' not in ('JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','SOURCE') or issue->>'key' !~ '^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SOURCE)-[1-9][0-9]*$' then raise exception 'Invalid Jira identity';end if;
 update public.time_tasks set source='jira',jira_key=issue->>'key',jira_issue_id=issue->>'id',jira_project=issue->>'project_key',jira_status=issue->>'status_name',jira_status_id=issue->>'status_id',jira_assignee_account_id=issue->>'assignee_id',jira_updated_at=(issue->>'jira_updated')::timestamptz,jira_creation_state='created',updated_at=now() where id=t.id;
end $function$;

commit;
