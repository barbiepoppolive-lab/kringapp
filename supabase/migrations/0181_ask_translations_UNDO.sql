begin;
drop table if exists public.kr8_ask_tr;
delete from public.kr8_translate_config where key = 'ask_daily_total';
commit;
