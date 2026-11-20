-- UNDO 0180 (founder ghost bookmark). The app then shows "Couldn't send" on ?me=ghost and works as before otherwise.
begin;
drop function if exists public.kr8_am_founder();
drop function if exists public.kr8_founder_ghost_gate(text);
drop table if exists public.kr8_founder_ghost_log;
commit;
