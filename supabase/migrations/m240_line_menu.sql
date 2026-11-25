-- m240 (26 Nov 2026): LINE rich menu on @194hsqbc (Kring! Café). Data for the four answer buttons
-- (My Rings / This week's board / Today's question / Today's vote), read by the edge function `line-menu`
-- with the service role only. Replies are LINE reply messages (free, not counted in the 500/month push quota).
-- Reuses: kr8_week_start, kr8_week_board_fast, kr8_rank_gap, kr8_is_test_member, kr8_is_blocked,
--         kr8_help_team_id, kr8_bkk_day, kr8_task_votes / kr8_task_vote_picks, kr8_line_links.
-- UNDO: m240_line_menu_UNDO.sql

create table if not exists public.kr8_line_menu_taps (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,              -- null = LINE user not linked to a Kring member
  kind text not null
);
alter table public.kr8_line_menu_taps enable row level security;   -- no policies: service role / admins via SQL only
revoke all on public.kr8_line_menu_taps from public, anon, authenticated;

create or replace function public.kr8_line_menu_data(p_line_sub text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid; nm text; t boolean; w0 timestamptz; ends timestamptz; d date := public.kr8_bkk_day();
  gap jsonb; top jsonb; me jsonb; n int; q record; v record; vp text; vn int;
begin
  if p_kind is null or p_kind not in ('rings', 'board', 'ask', 'vote') then raise exception 'KR8_BAD_KIND'; end if;
  if p_line_sub is null or p_line_sub !~ '^U[0-9a-f]{32}$' then raise exception 'KR8_BAD_LINE_ID'; end if;

  select l.user_id, m.first_name into uid, nm
    from public.kr8_line_links l join public.kr8_members m on m.user_id = l.user_id
   where l.line_sub = p_line_sub
   order by l.last_login_at desc nulls last limit 1;

  insert into public.kr8_line_menu_taps (user_id, kind) values (uid, p_kind);

  if uid is null then
    return jsonb_build_object('linked', false, 'kind', p_kind);
  end if;

  t := public.kr8_is_test_member(uid);
  w0 := public.kr8_week_start(now());
  ends := w0 + interval '7 days';

  if p_kind = 'rings' then
    gap := public.kr8_rank_gap(w0, t, uid);
    return jsonb_build_object('linked', true, 'kind', p_kind, 'name', nm,
      'rings', coalesce((gap->>'rings')::int, 0), 'rank', (gap->>'rank')::int, 'state', gap->>'state',
      'floor', (gap->>'floor')::int,
      'target_rank', (gap->'target'->>'rank')::int, 'target_need', (gap->'target'->>'need')::int,
      'target_open', coalesce((gap->'target'->>'open')::boolean, false),
      'days_left', greatest(0, ceil(extract(epoch from (ends - now())) / 86400.0))::int);
  end if;

  if p_kind = 'board' then
    with b as materialized (select * from public.kr8_week_board_fast(w0, t)),
         v as (select b.member_id, b.rings, b.rk, m.first_name
                 from b join public.kr8_members m on m.user_id = b.member_id
                where b.member_id = uid or not public.kr8_is_blocked(uid, b.member_id))
    select (select coalesce(jsonb_agg(jsonb_build_object('rank', x.rk, 'name', coalesce(nullif(trim(x.first_name), ''), 'Kring Local'), 'rings', x.rings, 'is_me', x.member_id = uid) order by x.rk), '[]'::jsonb)
              from (select * from v order by rk limit 5) x),
           (select jsonb_build_object('rank', x.rk, 'rings', x.rings) from v x where x.member_id = uid),
           (select count(*)::int from b)
      into top, me, n;
    return jsonb_build_object('linked', true, 'kind', p_kind, 'top', top, 'me', me, 'total', n,
      'days_left', greatest(0, ceil(extract(epoch from (ends - now())) / 86400.0))::int);
  end if;

  if p_kind = 'ask' then
    select p.id, p.body, (public.kr8_bkk_day(p.created_at) = d) as is_today into q
      from public.kr8_posts p
     where p.kind = 'ask' and p.author = public.kr8_help_team_id() and not coalesce(p.hidden, false)
     order by p.created_at desc limit 1;
    if q.id is null then return jsonb_build_object('linked', true, 'kind', p_kind, 'none', true); end if;
    return jsonb_build_object('linked', true, 'kind', p_kind, 'none', false, 'id', q.id, 'body', q.body, 'is_today', q.is_today);
  end if;

  -- vote: today's This-or-That (the daily pair, not the one-off roast row)
  select tv.q_th, tv.a_th, tv.b_th, tv.c_th into v
    from public.kr8_task_votes tv where tv.day = d and tv.kind <> 'roast' limit 1;
  if v.q_th is null then return jsonb_build_object('linked', true, 'kind', p_kind, 'none', true); end if;
  select pick into vp from public.kr8_task_vote_picks where day = d and member_id = uid;
  select count(*)::int into vn from public.kr8_task_vote_picks where day = d;
  return jsonb_build_object('linked', true, 'kind', p_kind, 'none', false, 'q', v.q_th, 'a', v.a_th, 'b', v.b_th, 'c', v.c_th,
    'my_pick', vp, 'votes', vn);
end $function$;

revoke execute on function public.kr8_line_menu_data(text, text) from public, anon, authenticated;
grant execute on function public.kr8_line_menu_data(text, text) to service_role;
