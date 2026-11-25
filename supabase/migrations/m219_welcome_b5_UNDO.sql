-- m219 UNDO: drop the Welcome / Bangkok at 5 functions and tables. Ledger rows already written ('task', 'YYYY-MM-DD:welcome' /
-- ':b5') stay (append-only ledger) and keep counting as task Rings on the board, like any claimed task.
begin;
drop function if exists public.kr8_admin_b5_ids(uuid[]);
drop function if exists public.kr8_b5_row();
drop function if exists public.kr8_b5_mark(uuid);
drop function if exists public.kr8_task_extra_claim(text);
drop function if exists public.kr8_task_extra();
drop function if exists public.kr8_b5_open(timestamptz);
drop function if exists public.kr8_task_welcome_pool(uuid, int);
drop function if exists public.kr8_r10_reel_json(uuid, uuid);
drop function if exists public.kr8_r10_reel_ok(uuid, uuid);
drop function if exists public.kr8_task_cap_left(uuid, date);
drop table if exists public.kr8_b5_clips;
drop table if exists public.kr8_task_welcome_picks;
delete from public.kr8_rings_config where key in ('task_welcome_max', 'task_b5', 'b5_hour', 'b5_hours_open');
commit;
