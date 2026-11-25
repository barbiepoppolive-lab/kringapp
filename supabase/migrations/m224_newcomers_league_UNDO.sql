-- m224 UNDO: stop the weekly job, remove the Rising Local tags and the league functions.
begin;
select cron.unschedule('kr8_newcomers_close') where exists (select 1 from cron.job where jobname = 'kr8_newcomers_close');
delete from public.kr8_member_badges where badge = 'rising_local';
drop function if exists public.kr8_newcomers_close(boolean);
drop function if exists public.kr8_newcomers_board(int);
drop table if exists public.kr8_newcomer_results;
commit;
