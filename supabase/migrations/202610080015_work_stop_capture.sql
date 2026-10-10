begin;
alter table public.time_logs add column stopped_at timestamptz;
-- Capture the actual END / clock-out action, even if its work session was already held.
-- Historical stops remain unknown; never backfill them from Jira completion timestamps.
create function private.capture_work_log_stop() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='stopped' and old.state<>'stopped' then new.stopped_at:=now();
 elsif new.state<>'stopped' then new.stopped_at:=null;end if;
 return new;
end;
$$;
revoke all on function private.capture_work_log_stop() from public,anon,authenticated;
create trigger capture_work_log_stop before update of state on public.time_logs for each row execute function private.capture_work_log_stop();
commit;
