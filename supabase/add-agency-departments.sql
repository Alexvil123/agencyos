begin;
select set_config('request.jwt.claim.sub','33852255-e6b8-4de4-acd4-e96429fd35fd',true);
set local role authenticated;
do $$
declare org uuid; department_name text;
begin
 select organization_id into org from public.memberships where user_id=auth.uid() and active;
 if org is null or not private.is_owner(org) then raise exception 'Alex Owner access required'; end if;
 foreach department_name in array array['Web Developer Associate','Bussiness Development Executive','Senior Video Edior','Social Media & Content Accounts','Digital Execution & Delivery','Social Media Analyst Associate','Content Writter','Graphic Designer','Video Editor'] loop
  if not exists(select 1 from public.departments where organization_id=org and name=department_name) then perform public.create_department(org,department_name); end if;
 end loop;
end;
$$;
commit;
