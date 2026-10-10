-- One-time owner activation. Prepared for Alex's explicitly confirmed account.
-- Run only after confirming Owner access for alexvilpower@gmail.com.
-- Uses the existing mycrm organization name as the editable workspace display name.
begin;
do $$
begin
  if not exists (
    select 1 from auth.users
    where id = '33852255-e6b8-4de4-acd4-e96429fd35fd'::uuid
      and lower(email) = 'alexvilpower@gmail.com'
      and email_confirmed_at is not null
  ) then
    raise exception 'Confirmed Alex authentication account not found';
  end if;
end;
$$;
select public.bootstrap_owner(
  '33852255-e6b8-4de4-acd4-e96429fd35fd'::uuid,
  'mycrm',
  'Alex'
) as created_organization_id;
commit;
