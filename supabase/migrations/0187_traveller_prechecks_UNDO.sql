-- UNDO 0187 · traveller pre-checks. Safe at any time; traveller requests, decisions and passport deletion (0138) are untouched.
begin;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_traveller_checks';
  end if;
end $$;
drop trigger if exists kr8_traveller_check_new on public.kr8_traveller_requests;
drop function if exists public.kr8_traveller_check_on_new(), public.kr8_traveller_check_kick(),
  public.kr8_traveller_check_todo(int), public.kr8_traveller_check_record(uuid, jsonb), public.kr8_admin_traveller_checks(uuid[]);
drop table if exists public.kr8_traveller_checks;
commit;
