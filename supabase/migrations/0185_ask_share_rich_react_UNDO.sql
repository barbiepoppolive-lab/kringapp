-- UNDO 0185 (Ask BKK share card / rich replies / reactions). Puts the four patched functions back and drops what 0185 added.
-- Ledger rows with reason 'ask_open' are kept out of the board by the restored functions; delete them only if asked.
begin;
drop trigger if exists kr8_ask_open_ring on public.kr8_share_opens;
drop function if exists public.kr8_ask_open_ring_trg();
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kr8_share_open_confirm(uuid, text, text, text, text, text, jsonb, text)'::regprocedure);
  if position('/*ask0185*/' in d) > 0 then
    execute replace(d, 'select coalesce((select x.author from public.kr8_ask_answers x where x.id = o.ask_answer_id), p.author) into v_author from public.kr8_posts p where p.id = o.post_id;   /*ask0185*/',
                       'select p.author into v_author from public.kr8_posts p where p.id = o.post_id;');
  end if;
  d := pg_get_functiondef('public.kr8_week_board(timestamptz, boolean)'::regprocedure);
  execute replace(d, 'where l.reason in (''task'', ''ask_open'') and', 'where l.reason = ''task'' and');
  d := pg_get_functiondef('public.kr8_task_rings_in(uuid, timestamptz, timestamptz)'::regprocedure);
  execute replace(d, 'l.reason in (''task'', ''ask_open'')', 'l.reason = ''task''');
end $$;

create or replace function public.kr8_ask_a_ok(p_viewer uuid, p_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_ask_answers a
    where a.id = p_id and not a.hidden
      and (p_viewer is null or (not public.kr8_is_blocked(p_viewer, a.author)
           and not exists (select 1 from public.kr8_ask_answer_hidden h where h.user_id = p_viewer and h.answer_id = a.id))))
$$;
create or replace function public.kr8_ask_answer_json(a public.kr8_ask_answers, p_viewer uuid, p_salt text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', a.id, 'parent_id', a.parent_id, 'author_id', public.kr8_ask_key(a.author, p_salt), 'body', a.body,
    'media_path', case when p_viewer is null then null else a.media_path end, 'media_kind', case when p_viewer is null then null else a.media_kind end,
    'score', a.score, 'created_at', a.created_at,
    'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = p_viewer and v.target_kind = 'a' and v.target_id = a.id), 0))
$$;

drop function if exists public.kr8_ask_share_open(text, text, text, text, text, text, text, text);
drop function if exists public.kr8_ask_card(text, text);
drop function if exists public.kr8_ask_card_data(text);
drop function if exists public.kr8_ask_share_link(uuid);
drop function if exists public.kr8_ask_react(uuid, text);
drop function if exists public.kr8_ask_react_counts(uuid);
drop function if exists public.kr8_ask_media_record(uuid, boolean, text);
drop function if exists public.kr8_ask_media_todo(uuid);
drop trigger if exists kr8_ask_media_pending on public.kr8_ask_answers;
drop function if exists public.kr8_ask_media_pending_trg();
drop table if exists public.kr8_ask_links;
drop table if exists public.kr8_ask_reactions;
drop table if exists public.kr8_ask_react_taps;
-- kept (harmless, nullable / default): kr8_share_opens.ask_answer_id, kr8_ask_answers.media_check / media_why, the 'ask_open' ledger reason
commit;
