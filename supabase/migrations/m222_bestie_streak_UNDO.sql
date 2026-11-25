-- m222 UNDO: drop the bestie streak (no Rings were ever attached to it).
begin;
drop function if exists public.kr8_bestie_of(uuid);
drop function if exists public.kr8_bestie_state();
drop function if exists public.kr8_bestie_seen();
drop function if exists public.kr8_bestie_nudge(uuid);
drop function if exists public.kr8_bestie_act(uuid, text);
drop function if exists public.kr8_bestie_invite(uuid);
drop function if exists public.kr8_bestie_pair_ok(uuid, uuid);
drop function if exists public.kr8_bestie_count(uuid, uuid, date);
drop function if exists public.kr8_task_days_of(uuid, date);
drop table if exists public.kr8_bestie_nudges;
drop table if exists public.kr8_besties;
commit;
