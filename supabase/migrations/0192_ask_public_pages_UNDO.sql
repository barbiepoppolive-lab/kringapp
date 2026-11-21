-- UNDO 0192: the Ask BKK public page functions (read-only; nothing else changed)
begin;
drop function if exists public.kr8_ask_public_list();
drop function if exists public.kr8_ask_public_page(uuid);
drop function if exists public.kr8_ask_pub_answers(uuid);
drop function if exists public.kr8_ask_pub_author_ok(uuid);
commit;
