begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employee-photos','employee-photos',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
commit;
