begin;
alter table public.chat_conversations add column photo_path text;
alter table public.chat_conversations add constraint chat_photo_group_only check(kind='group' or photo_path is null);
create function public.chat_group_photo(org_id uuid,chat uuid,path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.chat_conversations c where c.id=chat and c.organization_id=org_id and c.kind='group' and c.created_by=private.time_member(org_id) and private.chat_access(c.id)) then raise exception 'Only the group creator can change its photo';end if;
 if path is not null and (path not like org_id::text||'/groups/%' or path like '%..%') then raise exception 'Invalid group photo';end if;
 update public.chat_conversations set photo_path=path where id=chat;
end $$;
create function public.chat_create_group(org_id uuid,chat_name text,people uuid[],path text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare chat uuid;
begin
 chat:=public.chat_create(org_id,'group',chat_name,people);
 perform public.chat_group_photo(org_id,chat,path);
 return chat;
end $$;
revoke all on function public.chat_group_photo(uuid,uuid,text),public.chat_create_group(uuid,text,uuid[],text) from public,anon;
grant execute on function public.chat_group_photo(uuid,uuid,text),public.chat_create_group(uuid,text,uuid[],text) to authenticated;
commit;
