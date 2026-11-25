-- UNDO m208: drop the stats function and the two config keys it added.
begin;
drop function if exists public.kr8_my_unv_stats();
delete from public.kr8_rings_config where key in ('open_join_like_prompt', 'open_join_on');
commit;
