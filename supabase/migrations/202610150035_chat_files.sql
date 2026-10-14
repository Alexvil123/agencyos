-- Team Chat files and pictures.
-- A message can carry one file (a picture, PDF, Office, text or CSV file). The file lives in a private storage bucket, under
-- <organization>/<conversation>/<random id>; people only ever receive short-lived signed links, created by the server after the
-- database confirmed they belong to that conversation. A message may have no text when it has a file.
begin;
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chat-files','chat-files',false,5242880,array[
      'image/jpeg','image/png','image/gif','image/webp','application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
      'text/plain','text/csv'])
    on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  end if;
end $$;

alter table public.chat_messages
  add column file_path text, add column file_name text, add column file_type text, add column file_size integer;
alter table public.chat_messages drop constraint chat_messages_body_check;
alter table public.chat_messages
  add constraint chat_messages_body_check check (length(trim(body)) <= 4000 and (length(trim(body)) > 0 or file_path is not null)),
  add constraint chat_messages_file_check check (
    (file_path is null and file_name is null and file_type is null and file_size is null)
    or (file_path is not null and length(file_name) between 1 and 100 and length(file_type) between 3 and 120 and file_size between 1 and 5242880));

create function public.chat_send_file(org_id uuid, chat uuid, message text, request_key uuid, f_path text, f_name text, f_type text, f_size integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); saved uuid;
begin
  if actor is null or not private.chat_access(chat) or not exists(select 1 from public.chat_conversations where id=chat and organization_id=org_id) then raise exception 'Chat access denied';end if;
  -- The file must sit in this conversation's own folder, so a link can never point at someone else's file.
  if f_path is null or f_path !~ ('^'||org_id::text||'/'||chat::text||'/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then raise exception 'Invalid file';end if;
  perform 1 from public.memberships where id=actor for update;
  select id into saved from public.chat_messages where author_id=actor and client_id=request_key;if saved is not null then return saved;end if;
  if (select count(*) from public.chat_messages where author_id=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait before sending more messages';end if;
  insert into public.chat_messages(conversation_id,author_id,body,client_id,file_path,file_name,file_type,file_size)
    values(chat,actor,trim(coalesce(message,'')),request_key,f_path,f_name,f_type,f_size) returning id into saved;
  return saved;
end $$;
revoke all on function public.chat_send_file(uuid,uuid,text,uuid,text,text,text,integer) from public, anon;
grant execute on function public.chat_send_file(uuid,uuid,text,uuid,text,text,text,integer) to authenticated;
commit;
