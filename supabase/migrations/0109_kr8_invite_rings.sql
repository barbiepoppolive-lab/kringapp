-- 0109_kr8_invite_rings.sql  (18 Nov 2026) · one-tap invite sharing: +X Rings for BOTH people when a friend joins with your link
--
-- Every share the app makes now carries the member's own invite code (?ref=k00184, the same code kr8_set_ref already stores in
-- kr8_members.ref_code). When the new member ALSO passes the face check (kr8_members.verified = true, the 0093 face gate), the
-- inviter gets +invite Rings ('invite' row) and the new member gets +invite Rings ('invite_welcome' row) in kr8_rings_ledger.
--
-- Rules (all in the database, nothing trusted from the phone):
--   · X = kr8_rings_config.invite (default 10; 0 = off). Daily cap per inviter = kr8_rings_config.invite_day_cap (default 20, Bangkok day).
--   · once per pair: the ledger's unique (member_id, reason, ref_id) + ref_code is set once (kr8_set_ref) → one pair, one credit.
--   · no self-invites (inviter = friend), no circles (A invites B, then B "invites" A: only the first counts), no test accounts (kr8_is_test_member), no ghost accounts (kr8_members.ghost, dup robot),
--     no duplicate / look-alike accounts: the friend has an open kr8_account_links row (face, face_maybe or device) with anyone.
--     Shared Wi-Fi (network) and LINE rows are flags only and never block (founder 16 Nov).
--   · the same check runs again when the board is read (kr8_invite_pair_ok), so if the dup robot ghosts an account LATER, its invite
--     Rings drop off the board without deleting anything (the ledger is append-only).
--
-- Board: the weekly board was Reel-only (kr8_reel_scores → kr8_week_board, 0094). Invite Rings earned this week are now ADDED to a
-- member's board score. A member still needs an approved Reel this week to be ON the board (it stays a Reel board, and prize seats
-- stay tied to a Reel); their invite Rings then count in full. kr8_score_breakdown shows them as "invites" so the public math adds up,
-- kr8_member_rings counts them in lifetime, and kr8_my_invites feeds the Me line "Friends joined: 2 · +20 Rings".
--
-- Re-runnable: create or replace, on conflict do nothing, drop/create trigger, constraint dropped and re-added.
--
-- UNDO: supabase/undo/0109_kr8_invite_rings_UNDO.sql (one block, full pre-0109 bodies of kr8_week_board / kr8_score_breakdown /
-- kr8_member_rings; tried on TEST in a rolled-back transaction, audit 18 Nov). Quick off-switch without UNDO:
--   update kr8_rings_config set value = 0 where key = 'invite';   (no new invite Rings; earned ones still count)

begin;

-- 1. config (the founder changes X here; the app reads it through kr8_rings_rules / kr8_my_rewards.rules)
insert into public.kr8_rings_config (key, value, note) values
  ('invite', 10, 'Rings for BOTH people when a friend joins with your invite link and passes the face check (0 = off)'),
  ('invite_day_cap', 20, 'max invite rewards per inviter per Bangkok day (anti-abuse)')
on conflict (key) do nothing;

-- kr8_set_ref stamps ref_set_at (used by the no-circle rule below); present on TEST, kept safe if a copy lacks it
alter table public.kr8_members add column if not exists ref_set_at timestamptz;

-- 2. two new ledger reasons
alter table public.kr8_rings_ledger drop constraint if exists kr8_rings_ledger_reason_check;
alter table public.kr8_rings_ledger add constraint kr8_rings_ledger_reason_check check (reason in
  ('reel_place', 'likes_50', 'friend_join', 'friend_welcome', 'checkin', 'streak', 'react3', 'weekly_top', 'reel_removed', 'claim',
   'invite', 'invite_welcome'));
create or replace function public.kr8_rings_earn_reason(r text) returns boolean language sql immutable as $$
  select r in ('reel_place', 'likes_50', 'friend_join', 'friend_welcome', 'checkin', 'streak', 'react3', 'reel_removed', 'invite', 'invite_welcome')
$$;

-- 3. is this inviter → friend pair (still) good? Used when crediting AND every time the board is read.
create or replace function public.kr8_invite_pair_ok(p_inviter uuid, p_friend uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_inviter is not null and p_friend is not null and p_inviter <> p_friend
     and exists (select 1 from public.kr8_members f where f.user_id = p_friend and coalesce(f.verified, false) and not coalesce(f.ghost, false))
     and exists (select 1 from public.kr8_members i where i.user_id = p_inviter and not coalesce(i.ghost, false))
     and not public.kr8_is_test_member(p_inviter) and not public.kr8_is_test_member(p_friend)
     -- audit 18 Nov: no circle. Two brand-new members can't "invite" each other for a second pair of Rewards: when the inviter
     -- was themselves invited by this friend first, only the first direction counts.
     and not exists (select 1 from public.kr8_members i, public.kr8_members f
                     where i.user_id = p_inviter and f.user_id = p_friend and coalesce(i.ref_code, '') ~ '^k[0-9]{5,7}$'
                       and substring(i.ref_code from 2)::int = f.member_no
                       and coalesce(i.ref_set_at, i.created_at) <= coalesce(f.ref_set_at, f.created_at))
     and not exists (select 1 from public.kr8_account_links l
                     where l.dismissed_at is null and l.reason in ('face', 'face_maybe', 'device')
                       and (l.a = p_friend or l.b = p_friend or (l.a = least(p_inviter, p_friend) and l.b = greatest(p_inviter, p_friend))))
$$;

-- 4. credit (idempotent; never raises into the caller)
create or replace function public.kr8_invite_try(p_friend uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.kr8_members; inv uuid; x int := public.kr8_rcfg('invite', 10); cap int := public.kr8_rcfg('invite_day_cap', 20); n int := 0;
begin
  if x <= 0 then return 0; end if;
  select * into f from public.kr8_members where user_id = p_friend;
  if f.user_id is null or not coalesce(f.verified, false) or coalesce(f.ref_code, '') !~ '^k[0-9]{5,7}$' then return 0; end if;
  select user_id into inv from public.kr8_members where member_no = substring(f.ref_code from 2)::int;
  if not coalesce(public.kr8_invite_pair_ok(inv, p_friend), false) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_invite:' || inv::text));
  if exists (select 1 from public.kr8_rings_ledger where member_id = inv and reason = 'invite' and ref_id = p_friend::text) then return 0; end if;
  if (select count(*) from public.kr8_rings_ledger where member_id = inv and reason = 'invite'
        and created_at >= public.kr8_bkk_day_start(now())) >= greatest(cap, 0) then return 0; end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (inv, x, 'invite', p_friend::text) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (p_friend, x, 'invite_welcome', inv::text) on conflict do nothing;
  end if;
  return case when n > 0 then x else 0 end;
end $$;

create or replace function public.kr8_invite_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.verified, false) and coalesce(new.ref_code, '') ~ '^k[0-9]{5,7}$'
     and (tg_op = 'INSERT' or old.verified is distinct from new.verified or old.ref_code is distinct from new.ref_code) then
    begin perform public.kr8_invite_try(new.user_id); exception when others then raise warning 'kr8_invite_trg: %', sqlerrm; end;
  end if;
  return new;
end $$;
drop trigger if exists kr8_invite_trg on public.kr8_members;
create trigger kr8_invite_trg after insert or update of verified, ref_code on public.kr8_members
  for each row execute function public.kr8_invite_trg();

-- 5. invite Rings a member earned in [p_from, p_to) that still pass the pair check
create or replace function public.kr8_invite_rings(p_user uuid, p_from timestamptz, p_to timestamptz) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
  where l.member_id = p_user and l.reason in ('invite', 'invite_welcome') and l.created_at >= p_from and l.created_at < p_to
    and l.ref_id ~ '^[0-9a-f-]{36}$'
    and case when l.reason = 'invite' then public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)
             else public.kr8_invite_pair_ok(l.ref_id::uuid, l.member_id) end
$$;

-- 6. board = best Reel score (0094) + invite Rings of the same week (members with a Reel this week)
create or replace function public.kr8_week_board(p_w0 timestamptz, p_test boolean)
returns table(member_id uuid, rings int, rk int, first_at timestamptz, reels jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select * from public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s),
  -- 0094: a member whose best Reel has 0 Rings still shows (their best = earliest Reel this week); a 0-Ring Reel never fills a 2nd/3rd best slot
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) and (r.n = 1 or r.score > 0) group by r.author),
  -- 0109: + invite Rings earned this week (test boards never get any: kr8_invite_pair_ok excludes test accounts)
  t as (select m.author, m.rings + case when p_test then 0 else public.kr8_invite_rings(m.author, p_w0, p_w0 + interval '7 days') end rings,
               m.first_at, m.reels from m)
  select t.author, t.rings, (row_number() over (order by t.rings desc, t.first_at asc, mm.member_no asc))::int, t.first_at, t.reels
  from t join public.kr8_members mm on mm.user_id = t.author
$$;

-- 7. the public math: rings = best Reel(s) + invites (shown as its own line)
create or replace function public.kr8_score_breakdown(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); m public.kr8_members; t boolean; best int := greatest(public.kr8_rcfg('best_reels', 2), 1); r jsonb; inv int;
begin
  select * into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or (uid is not null and uid <> p_user and public.kr8_is_blocked(uid, p_user)) then raise exception 'KR8_NO_PERSON'; end if;
  t := public.kr8_is_test_member(p_user);
  inv := case when t then 0 else public.kr8_invite_rings(p_user, w0, w0 + interval '7 days') end;
  with s as (select x.*, row_number() over (order by x.score desc, x.posted_at asc, x.post_id) n
             from public.kr8_reel_scores(w0, w0 + interval '7 days', w0 + interval '7 days', t, p_user) x where x.score > 0)
  select jsonb_build_object(
    'user_id', p_user, 'first_name', m.first_name, 'is_me', uid = p_user,
    'rings', coalesce((select sum(score) from s where n <= best), 0) + inv,
    'invites', inv,
    'rank', (select rk from public.kr8_week_board(w0, t) where member_id = p_user),
    'weights', jsonb_build_object('like', public.kr8_rcfg('like', 1), 'save', public.kr8_rcfg('save', 3), 'open', public.kr8_rcfg('open', 5),
                                  'mult', public.kr8_rcfg('traveller_mult', 2), 'cap', public.kr8_rcfg('opens_day_cap', 30), 'best', best,
                                  'invite', public.kr8_rcfg('invite', 10)),
    'more', (select count(*) from s where n > best),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('post_id', s.post_id, 'posted_at', s.posted_at, 'poster_path', p.poster_path,
                 'place', (select pl.name_en from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = s.post_id order by pp.position limit 1),
                 'place_th', (select pl.name_th from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = s.post_id order by pp.position limit 1),
                 'l_local', s.l_local, 'l_trav', s.l_trav, 's_local', s.s_local, 's_trav', s.s_trav, 'opens', s.opens, 'score', s.score) order by s.n)
               from s join public.kr8_posts p on p.id = s.post_id where s.n <= best), '[]'::jsonb))
  into r;
  return r;
end $$;

-- 8. lifetime counts invite Rings too
create or replace function public.kr8_member_rings(p_user uuid)
returns table(lifetime int, week int, week_rank int) language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select public.kr8_is_test_member(p_user) v)
  select coalesce((select sum(s.score)::int from t, public.kr8_reel_scores('-infinity', 'infinity', 'infinity', t.v, p_user) s), 0)
           + public.kr8_invite_rings(p_user, '-infinity', 'infinity'),
         coalesce((select b.rings from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user), 0),
         (select b.rk from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user)
$$;

-- 9. the Me line: "Friends joined: 2 · +20 Rings"
create or replace function public.kr8_my_invites() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'friends', (select count(*)::int from public.kr8_rings_ledger l where l.member_id = auth.uid() and l.reason = 'invite'
                  and l.ref_id ~ '^[0-9a-f-]{36}$' and public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)),
    'rings', public.kr8_invite_rings(auth.uid(), '-infinity', 'infinity'),
    'x', public.kr8_rcfg('invite', 10)) end
$$;

revoke all on function public.kr8_invite_pair_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kr8_invite_try(uuid) from public, anon, authenticated;
revoke all on function public.kr8_invite_trg() from public, anon, authenticated;
revoke all on function public.kr8_invite_rings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.kr8_my_invites() from public, anon;
grant execute on function public.kr8_my_invites() to authenticated;

commit;

-- Live copies before 0109 (for UNDO), as read from the test database on 18 Nov 2026:
-- kr8_week_board            = the 0094_kr8_board_show_all.sql version.
-- kr8_score_breakdown       = this file's version without `inv` ('rings' = best Reel sum only, no 'invites' / weights.invite).
-- kr8_member_rings          = this file's version without `+ public.kr8_invite_rings(p_user, '-infinity', 'infinity')`.
