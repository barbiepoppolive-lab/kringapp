-- 0073 · The "Kring Team" account is a SENDER only (17 Nov 2026, founder). WRITTEN, NOT APPLIED. Apply after 0072.
-- The team account (kr8_team_accounts, 0066: fd5cca36-…) sends chats and notifications. Members must never browse it.
--
-- How: kr8_is_blocked (0061 body, the one gate every member list / search / filter / profile / online-here list / feed author /
-- ranking / tagging / follow list / Activity / kr8_members read policy goes through) now ALSO answers "hidden" when the other
-- person is a Kring Team account, EXCEPT inside the member's own chat and Ask a Thai calls, so:
--   · chat threads the team opened still show in the inbox, open, translate, and the member can reply
--     (kr8_inbox, kr8_thread_messages, kr8_send_message, kr8_thread_translations, kr8_translate_claim, kr8_threads / kr8_messages
--      reads and Realtime, which carry no PostgREST path);
--   · Ask a Thai posts and answers by the team still show (kr8_ask_*), and kr8_ask_person marks them 'official'.
-- The exception is decided by PostgREST's request.path (set on every API call since PostgREST 9; empty for Realtime, SQL and
-- triggers, which keep the old behaviour). Starting a NEW hello to the team, its profile, People, search, filters, tagging,
-- follow lists, boards etc. all see it as hidden. The weekly board already left the team out (0066 kr8_reel_scores).
-- Admin: "New members today" and Recruiters leave the team out.
--   kr8_team_ids()  → the team account ids (official accounts, not private), so the app can show "Kring Team · Official".
-- ADDITIVE + RE-RUNNABLE. Same arguments and return types for every redefined function. Nothing is dropped.
-- UNDO: re-run kr8_is_blocked from 0061, kr8_ask_person from 0064, kr8_admin_recruiters from 0065, kr8_admin_new_members_today
--       from 0043 (body), then drop function kr8_team_ids(), kr8_team_visible_here().
begin;

-- the calls in which a Kring Team account stays visible to a member: the member's own chats and Ask a Thai
create or replace function public.kr8_team_visible_here()
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(current_setting('request.path', true), '') = ''
      or current_setting('request.path', true) in ('/rpc/kr8_inbox', '/rpc/kr8_thread_messages', '/rpc/kr8_send_message',
           '/rpc/kr8_thread_translations', '/rpc/kr8_translate_claim', '/kr8_threads', '/kr8_messages')
      or current_setting('request.path', true) like '/rpc/kr8\_ask\_%'
$$;
revoke all on function public.kr8_team_visible_here() from public, anon, authenticated;

-- 0061 body + the Kring Team line
create or replace function public.kr8_is_blocked(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.uid() is not null and auth.uid() in (x, y)
          and exists (select 1 from public.kr8_blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x)))
      or (auth.uid() is not null and auth.uid() in (x, y) and x is distinct from y
          and public.kr8_is_ghost(case when auth.uid() = x then y else x end))
      or (auth.uid() is not null and auth.uid() in (x, y) and x is distinct from y
          and public.kr8_is_team(case when auth.uid() = x then y else x end)
          and not public.kr8_is_team(auth.uid())
          and not public.kr8_team_visible_here())
$$;

create or replace function public.kr8_team_ids()
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(user_id order by user_id), '{}'::uuid[]) from public.kr8_team_accounts
$$;
revoke all on function public.kr8_team_ids() from public, anon;
grant execute on function public.kr8_team_ids() to authenticated;

-- Ask a Thai author card (0064 body): the team shows as "Kring Team", official, never "Thai Local"
create or replace function public.kr8_ask_person(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.kr8_is_team(p_uid)
    then jsonb_build_object('name', 'Kring Team', 'photo', null, 'local', false, 'official', true)
    else jsonb_build_object('name', coalesce(m.first_name, ''), 'photo', case when auth.uid() is null then null else nullif(m.photo, '') end, 'local', m.who = 'local')
  end
  from public.kr8_members m where m.user_id = p_uid
$$;

create or replace function public.kr8_admin_new_members_today() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d0 timestamptz := ((now() at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok';
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return (select jsonb_build_object(
    'real', count(*) filter (where not public.kr8_is_test_member(m.user_id)),
    'test', count(*) filter (where public.kr8_is_test_member(m.user_id)))
    from public.kr8_members m where m.created_at >= d0 and not public.kr8_is_team(m.user_id));   -- 0073
end $$;
revoke all on function public.kr8_admin_new_members_today() from public, anon;
grant execute on function public.kr8_admin_new_members_today() to authenticated;

create or replace function public.kr8_admin_recruiters(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with m as (
    select m.user_id, m.member_no, m.first_name, m.created_at, nullif(btrim(m.src_code), '') as src_code, coalesce(m.verified, false) as verified,
           nullif(lower(btrim(m.ref_code)), '') as link_code, c.ref_code as credit_code, c.credited_by_email, c.credited_at,
           coalesce(nullif(lower(btrim(m.ref_code)), ''), c.ref_code) as code
    from public.kr8_members m left join public.kr8_ref_credits c on c.user_id = m.user_id
    where (p_include_test or not public.kr8_is_test_member(m.user_id)) and not public.kr8_is_team(m.user_id)   -- 0073
  ),
  reels as (
    select p.author, count(*)::int as approved
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false)
    group by p.author
  ),
  mm as (select m.*, coalesce(r.approved, 0) as approved from m left join reels r on r.author = m.user_id),
  person as (
    select mm.*, jsonb_build_object('user_id', user_id, 'member_no', member_no, 'first_name', first_name, 'joined_at', created_at,
      'src_code', src_code, 'verified', verified, 'approved_reels', approved,
      'how', case when link_code is not null then 'link' when credit_code is not null then 'credited' else 'none' end,
      'credited_by', credited_by_email, 'credited_at', credited_at) as j
    from mm
  )
  select jsonb_build_object(
    'codes', coalesce((select jsonb_agg(x order by (x ->> 'signups')::int desc, x ->> 'code') from (
        select jsonb_build_object('code', code,
          'signups', count(*), 'via_link', count(*) filter (where link_code is not null), 'credited', count(*) filter (where link_code is null),
          'posted', count(*) filter (where approved > 0), 'verified', count(*) filter (where verified),
          'members', jsonb_agg(j order by created_at desc)) as x
        from person where code is not null group by code) s), '[]'::jsonb),
    'no_code', coalesce((select jsonb_agg(j order by created_at desc) from person where code is null), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'ref_code', l.ref_code, 'prev_code', l.prev_code,
        'by', l.by_email, 'member_no', mb.member_no, 'first_name', mb.first_name) order by l.at desc, l.id desc)
      from (select * from public.kr8_ref_credit_log order by at desc, id desc limit 30) l left join public.kr8_members mb on mb.user_id = l.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;

commit;
