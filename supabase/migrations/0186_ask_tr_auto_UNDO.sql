begin;
select cron.unschedule('kr8_ask_tr_sweep') where exists (select 1 from cron.job where jobname = 'kr8_ask_tr_sweep');
drop trigger if exists kr8_ask_tr_answers on public.kr8_ask_answers;
drop trigger if exists kr8_ask_tr_posts on public.kr8_posts;
drop trigger if exists kr8_ask_tr_bios on public.kr8_members;
drop function if exists public.kr8_ask_tr_on_save();
drop function if exists public.kr8_ask_tr_sweep();
drop function if exists public.kr8_ask_tr_call(jsonb);
commit;
