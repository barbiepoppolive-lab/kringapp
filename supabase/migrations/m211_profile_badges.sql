-- m211 (25 Nov 2026): profile badges. Founder: "I want previous week winner to have a tag in their profile,
-- alongwith founding local badge on Otop and Pich."
-- Additive only: one new table, two new fields on kr8_profile (badges, last_week) and two new columns on
-- kr8_people_extras (badges, last_rank). Every field the live app reads stays the same; old apps ignore the new ones.
-- Rollback: m211_profile_badges_UNDO.sql (the exact pre-m211 definitions).
begin;

-- 1 · badges the team grants by hand (only 'founding_local' for now). Read only through the SECURITY DEFINER functions below.
create table if not exists public.kr8_member_badges (
  user_id    uuid not null references public.kr8_members(user_id) on delete cascade,
  badge      text not null check (badge in ('founding_local')),
  granted_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.kr8_member_badges enable row level security;   -- no policies: members cannot read or write it directly
revoke all on table public.kr8_member_badges from public, anon, authenticated;

-- Founding Locals: Otop (#16) and Pich (#14)
insert into public.kr8_member_badges (user_id, badge) values
  ('0a21313a-b688-43d2-87ce-2d611fc7dbed', 'founding_local'),   -- #16 Otop  "โอท็อปไงจะใครหล่ะ"
  ('474b8497-2bad-47d1-9b39-68ebc780f717', 'founding_local')    -- #14 Pich  "Pichy Review💗"
on conflict do nothing;

-- 2 · kr8_profile: same body as before + 'badges' and 'last_week'
--   last_week = {rank, week, week_no} when the member placed 1-8 in the most recent closed, non-test week of kr8_week_results.
--   It moves on by itself every Sunday close (no hardcoded date).
create or replace function public.kr8_profile(p_user uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; r jsonb; gated boolean;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  gated := public.kr8_face_gate(uid);   -- m207: an unchecked viewer sees no socials, not even on their own card's screen
  select jsonb_build_object(
    'user_id', m.user_id, 'first_name', m.first_name,
    'photo', case when uid is null then null else m.photo end,
    'langs', m.langs, 'bio', m.bio, 'area', m.area, 'who', m.who, 'verified', m.verified,
    'ig_handle', case when gated and tgt <> uid then null else m.ig_handle end,
    'interests', m.interests, 'member_no', 'KR ' || lpad(((('x' || substr(md5(m.user_id::text), 1, 8))::bit(32)::bigint % 9000) + 1000)::text, 4, '0'),
    'online', case when uid is null then null else coalesce(m.last_active_at > now() - interval '5 minutes', false) end,
    'here', case when uid is null then null else coalesce(m.here_until > now(), false) end,
    'mine', uid is not null and tgt = uid,
    -- m207: the app reads this to show "you are hidden" on the member's own profile
    'gated', case when uid is not null and tgt = uid then gated end,
    'level', public.kr8_level_of(tgt),
    'followers', (select count(*) from public.kr8_follows f where f.followee = tgt),
    'following', (select count(*) from public.kr8_follows f where f.follower = tgt),
    'likes', (select coalesce(sum(p.likes_count), 0) from public.kr8_posts p where p.author = tgt and p.kind = 'reel' and not p.hidden),
    'gifts', (select count(*) from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = tgt),
    'i_follow', uid is not null and exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = tgt),
    'follows_me', uid is not null and exists (select 1 from public.kr8_follows f where f.follower = tgt and f.followee = uid),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'poster_path', p.poster_path, 'likes', p.likes_count,
                                                           'status', p.status) order by p.created_at desc)
                       from (select * from public.kr8_posts p where p.author = tgt and p.kind = 'reel' and not p.hidden
                               and (p.status = 'approved' or (uid is not null and tgt = uid))
                             order by p.created_at desc limit 12) p), '[]'::jsonb),
    -- 0184: the member keeps the followers / following lists to themself (the counts stay)
    'lists_private', coalesce(m.lists_private, false),
    -- 0251: profile builder step 6 (one question + the member's answer)
    'qa_q', m.qa_q, 'qa_answer', m.qa_answer,
    -- m211: profile badges
    'badges', coalesce((select jsonb_agg(b.badge order by b.granted_at) from public.kr8_member_badges b where b.user_id = tgt), '[]'::jsonb),
    'last_week', (select jsonb_build_object('rank', w.rank, 'week', w.week, 'week_no', extract(week from w.week)::int)
                    from public.kr8_week_results w
                   where w.member_id = tgt and not w.is_test and w.rank between 1 and 8
                     and w.week = (select max(x.week) from public.kr8_week_results x where not x.is_test)
                   limit 1)
  ) into r;
  return r;
end $function$;

-- 3 · kr8_people_extras: + badges, last_rank (for a tiny icon on People cards). The return type changes, so drop + create
--     inside this transaction and put back the same grants (postgres, authenticated, service_role; never anon or PUBLIC).
drop function if exists public.kr8_people_extras(uuid[]);
create function public.kr8_people_extras(p_ids uuid[])
 returns table(user_id uuid, interests text[], reels integer, badges text[], last_rank integer)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select m.user_id, coalesce(m.interests, '{}'::text[]),
         (select count(*)::int from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and not p.hidden and p.status = 'approved'),
         coalesce((select array_agg(b.badge order by b.granted_at) from public.kr8_member_badges b where b.user_id = m.user_id), '{}'::text[]),
         (select w.rank from public.kr8_week_results w
           where w.member_id = m.user_id and not w.is_test and w.rank between 1 and 8
             and w.week = (select max(x.week) from public.kr8_week_results x where not x.is_test) limit 1)
  from public.kr8_members m
  where auth.uid() is not null
    and exists (select 1 from public.kr8_members me where me.user_id = auth.uid() or public.kr8_is_admin())
    and m.user_id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
    and m.user_id <> auth.uid()
    and not public.kr8_is_blocked(auth.uid(), m.user_id)
$function$;
revoke execute on function public.kr8_people_extras(uuid[]) from public, anon;
grant execute on function public.kr8_people_extras(uuid[]) to authenticated, service_role;

commit;
