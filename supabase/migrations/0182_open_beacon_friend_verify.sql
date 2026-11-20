-- 0182 (20 Nov): share-link opens count only after a real browser shows the page, plus the friend-verify nudge.
--
-- TASK 1, link-open anti-farming. Before: the open was counted on the server GET of /r/<short>. Any script that sent a browser-like
-- name and a fake "Referer: instagram.com" from a Thai network earned the Reel owner +5 Rings (one per network per day).
-- Now:
--   * kr8_share_open (server GET) stores the open as 'pending' (ok = false). Robots, LINE, non-Thai networks and repeats are decided
--     there as before and never become pending.
--   * kr8_share_open_confirm (called by the site function /r/ok, which the app calls after the page was VISIBLE for 2 seconds) turns
--     a pending open into a counted one, only when: same browser cookie and same network as the GET, at least 1.5 s after it and
--     within 30 min, no webdriver/headless signal, not the owner's (or a linked account's) phone, not a repeat (cookie, network or
--     phone id), and no burst (12 counted per Reel per hour; 3 counted for one member's Reels from one IP range in 10 minutes).
--   * Pending opens that never get the beacon never count (curl, link-preview fetchers, scripts that don't run the page).
--   * Old counted opens are not touched (no mid-week re-score).
--   * QA: hidden Reels of test members can be opened (nobody else sees them) and their opens skip the Thai-network rule, so the
--     whole path can be tested from outside Thailand without touching any real member. Test members never reach the real board.
--
-- TASK 2, friend-verify nudge: kr8_my_activity gets one 'friend_verify' row per Bangkok day when an unverified member liked one of
-- my board-v2 Reels (from board_v2_from, 23 Nov); kr8_reel_unv_likes(post) tells the owner's "My Reel stats" whether to show the line.
-- Switch: kr8_rings_config friend_verify_nudge_on (1 = on).

begin;

alter table public.kr8_share_opens add column if not exists app_did text;
alter table public.kr8_share_opens add column if not exists net_range text;
alter table public.kr8_share_opens add column if not exists confirmed_at timestamptz;
create index if not exists kr8_share_opens_range on public.kr8_share_opens (net_range, created_at desc) where net_range is not null;
create index if not exists kr8_share_opens_pending on public.kr8_share_opens (created_at) where why = 'pending';

insert into public.kr8_rings_config (key, value) values ('friend_verify_nudge_on', 1), ('opens_range_burst', 3), ('opens_beacon_on', 1)
on conflict (key) do nothing;

drop function if exists public.kr8_share_open(text, text, text, text, text, text, text);
create or replace function public.kr8_share_open(p_short text, p_ref text, p_ua text, p_session text, p_device text, p_country text,
                                                 p_key text, p_range text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare k text; pid uuid; oid uuid; v_ok boolean := true; v_why text; v_src text := 'other';
        ref text := left(coalesce(p_ref, ''), 300); ua text := left(coalesce(p_ua, ''), 300); po record; v_test boolean;
        d date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if k is null or p_key is null or p_key <> k then raise exception 'KR8_FORBIDDEN'; end if;
  select post_id into pid from public.kr8_reel_links where short = lower(coalesce(p_short, ''));
  if pid is null then return null; end if;
  select p.id, p.author, p.area, left(p.body, 160) as body, m.first_name into po
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  where p.id = pid and p.kind = 'reel'
    and ((not p.hidden and p.status = 'approved') or public.kr8_is_test_member(p.author));   -- 0182: QA path, test members only
  if po.id is null then return jsonb_build_object('post_id', null); end if;
  v_test := public.kr8_is_test_member(po.author);
  if coalesce(p_session, '') !~ '^[A-Za-z0-9-]{16,64}$' or coalesce(p_device, '') !~ '^[0-9a-f]{32,64}$' then
    return jsonb_build_object('post_id', pid, 'name', po.first_name, 'area', po.area, 'body', po.body);
  end if;
  v_src := case
    when ref ~* '(^|[/.])(line\.me|line\.naver\.jp|lin\.ee|liff\.line\.me)' or ua ~* '(^|[^a-z])line/' or ua ~* 'liff' then 'line'
    when ref ~* 'instagram\.' or ua ~* 'instagram' then 'instagram'
    when ref ~* 'tiktok\.' or ua ~* 'tiktok|musical_ly|bytedancewebview|trill' then 'tiktok'
    when ref ~* 'facebook\.|fb\.me|messenger\.' or ua ~* 'FBAN|FBAV|FB_IAB' then 'facebook'
    when ref ~* '(^|[/.])(t\.co|x\.com|twitter\.com)' then 'x'
    when ref ~* 'youtube\.|youtu\.be' then 'youtube'
    else 'other' end;
  if v_src = 'line' then v_ok := false; v_why := 'line';
  elsif public.kr8_open_is_robot(ua, case when v_test then null else p_country end) then v_ok := false; v_why := 'robot';
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_open:' || pid::text));
  if (select count(*) from public.kr8_share_opens where post_id = pid and bkk_date = d) >= 3000 then   -- flood guard: stop storing, still redirect
    return jsonb_build_object('post_id', pid, 'name', po.first_name, 'area', po.area, 'body', po.body);
  end if;
  if v_ok and exists (select 1 from public.kr8_share_opens where post_id = pid and bkk_date = d and ok and (session = p_session or device = p_device)) then
    v_ok := false; v_why := 'repeat';
  end if;
  -- 0136: one device / browser counts at most N times a day for the same member, across all of their Reels
  if v_ok and (select count(*) from public.kr8_share_opens o join public.kr8_posts p on p.id = o.post_id
               where p.author = po.author and o.bkk_date = d and o.ok and (o.session = p_session or o.device = p_device))
              >= greatest(public.kr8_rcfg('opens_device_member_day', 1), 1) then
    v_ok := false; v_why := 'repeat';
  end if;
  -- 0182: a would-be counted open waits for the browser beacon (kr8_share_open_confirm). Switch off → old behaviour (counted at once).
  if v_ok and public.kr8_rcfg('opens_beacon_on', 1) = 1 then v_ok := false; v_why := 'pending'; end if;
  if v_ok and (select count(*) from public.kr8_share_opens where post_id = pid and ok and created_at > now() - interval '1 hour') >= 12 then
    v_ok := false; v_why := 'burst';
  end if;
  insert into public.kr8_share_opens (post_id, bkk_date, session, device, referrer, ua, country, source, ok, why, net_range)
  values (pid, d, p_session, p_device, nullif(ref, ''), nullif(ua, ''), nullif(left(coalesce(p_country, ''), 2), ''), v_src, v_ok, v_why,
          case when coalesce(p_range, '') ~ '^[0-9a-f]{32,64}$' then p_range end)
  returning id into oid;
  return jsonb_build_object('post_id', pid, 'open_id', oid, 'ok', v_ok, 'name', po.first_name, 'area', po.area, 'body', po.body);
end $function$;
revoke all on function public.kr8_share_open(text, text, text, text, text, text, text, text) from public;
grant execute on function public.kr8_share_open(text, text, text, text, text, text, text, text) to anon, authenticated;

-- the browser beacon: only the site function knows p_key (same vault secret as kr8_share_open)
create or replace function public.kr8_share_open_confirm(p_open uuid, p_session text, p_device text, p_range text, p_did text,
                                                         p_ua text, p_sig jsonb, p_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare k text; o record; v_author uuid; v_why text; v_did text := nullif(left(btrim(coalesce(p_did, '')), 64), '');
        v_age interval; v_vis int; v_rng text := case when coalesce(p_range, '') ~ '^[0-9a-f]{32,64}$' then p_range end;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if k is null or p_key is null or p_key <> k then raise exception 'KR8_FORBIDDEN'; end if;
  if v_did is not null and v_did !~ '^[A-Za-z0-9-]{16,64}$' then v_did := null; end if;
  select so.* into o from public.kr8_share_opens so where so.id = p_open;
  if o.id is null then return jsonb_build_object('ok', false, 'why', 'unknown'); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_open:' || o.post_id::text));
  select so.* into o from public.kr8_share_opens so where so.id = p_open for update;
  if o.why is distinct from 'pending' then return jsonb_build_object('ok', o.ok, 'why', o.why); end if;
  select p.author into v_author from public.kr8_posts p where p.id = o.post_id;
  v_age := now() - o.created_at;
  begin v_vis := coalesce((p_sig ->> 'vis')::int, 0); exception when others then v_vis := 0; end;
  v_why := case
    when coalesce(p_session, '') <> o.session or coalesce(p_device, '') <> o.device then 'mismatch'     -- other browser / other network
    when v_age < interval '1500 milliseconds' then 'fast'
    when v_age > interval '30 minutes' then 'late'
    when coalesce(p_sig ->> 'wd', '') <> '0' or v_vis < 2000 then 'headless'                               -- webdriver on / no visible time
    when public.kr8_open_is_robot(coalesce(p_ua, ''), null) then 'robot'
    when v_did is not null and exists (select 1 from public.kr8_client_events e where e.did = v_did and e.user_id is not null
                                       and (e.user_id = v_author or public.kr8_linked(e.user_id, v_author))) then 'own'
    when exists (select 1 from public.kr8_share_opens x where x.post_id = o.post_id and x.bkk_date = o.bkk_date and x.ok and x.id <> o.id
                 and (x.session = o.session or x.device = o.device or (v_did is not null and x.app_did = v_did))) then 'repeat'
    when (select count(*) from public.kr8_share_opens x join public.kr8_posts p on p.id = x.post_id
          where p.author = v_author and x.bkk_date = o.bkk_date and x.ok and x.id <> o.id
            and (x.session = o.session or x.device = o.device or (v_did is not null and x.app_did = v_did)))
         >= greatest(public.kr8_rcfg('opens_device_member_day', 1), 1) then 'repeat'
    when (select count(*) from public.kr8_share_opens x where x.post_id = o.post_id and x.ok and x.created_at > now() - interval '1 hour') >= 12 then 'burst'
    when v_rng is not null and (select count(*) from public.kr8_share_opens x join public.kr8_posts p on p.id = x.post_id
          where p.author = v_author and x.ok and x.net_range = v_rng and x.created_at > now() - interval '10 minutes')
         >= greatest(public.kr8_rcfg('opens_range_burst', 3), 1) then 'burst'
    else null end;
  update public.kr8_share_opens set ok = (v_why is null), why = v_why, app_did = v_did, confirmed_at = now(),
         net_range = coalesce(net_range, v_rng)
  where id = o.id;
  return jsonb_build_object('ok', v_why is null, 'why', v_why);
end $function$;
revoke all on function public.kr8_share_open_confirm(uuid, text, text, text, text, text, jsonb, text) from public;
grant execute on function public.kr8_share_open_confirm(uuid, text, text, text, text, text, jsonb, text) to anon, authenticated;

-- TASK 2: the Reel owner's "My Reel stats": how many unverified members liked this Reel (board v2 Reels; test members always)
create or replace function public.kr8_reel_unv_likes(p_post uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when public.kr8_rcfg('friend_verify_nudge_on', 1) <> 1 then 0 else (
    select count(*)::int from public.kr8_posts p join public.kr8_post_likes l on l.post_id = p.id
    join public.kr8_members m on m.user_id = l.user_id
    where p.id = p_post and p.author = auth.uid() and l.user_id <> p.author
      and not coalesce(m.verified, false) and not coalesce(m.ghost, false) and not public.kr8_is_team(l.user_id)
      and not public.kr8_linked(l.user_id, p.author)
      and (p.created_at >= to_timestamp(public.kr8_rcfg('board_v2_from', 2147483647)) or public.kr8_is_test_member(p.author))
  ) end
$function$;
revoke all on function public.kr8_reel_unv_likes(uuid) from public;
grant execute on function public.kr8_reel_unv_likes(uuid) to authenticated;

create or replace function public.kr8_my_activity(p_limit integer default 50)
 returns table(kind text, at timestamp with time zone, actor_id uuid, actor_name text, actor_photo text, post_id uuid, poster_path text, n integer, rank integer, prize text, i_follow boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  return query
  select * from (
    -- someone followed me
    select 'follow'::text, f.created_at, f.follower, m.first_name, m.photo, null::uuid, null::text, 1, null::int, null::text,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = f.follower)
    from public.kr8_follows f join public.kr8_members m on m.user_id = f.follower
    where f.followee = uid and not public.kr8_is_blocked(uid, f.follower)
    union all
    -- likes on my Reels, one line per Reel per Bangkok day: latest liker + how many
    select 'like', max(l.created_at), (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and not public.kr8_is_blocked(uid, l.user_id)
    group by p.id, p.poster_path, (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- 0182: at most ONE friend-verify line per Bangkok day: an unverified member liked one of my board-v2 Reels
    select 'friend_verify', max(l.created_at) + interval '1 second', (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           (array_agg(p.id order by l.created_at desc))[1], (array_agg(p.poster_path order by l.created_at desc))[1],
           count(distinct l.user_id)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and l.user_id <> uid and public.kr8_rcfg('friend_verify_nudge_on', 1) = 1
      and not coalesce(m.verified, false) and not coalesce(m.ghost, false) and not public.kr8_is_team(l.user_id)
      and not public.kr8_is_blocked(uid, l.user_id) and not public.kr8_linked(l.user_id, uid)
      and (p.created_at >= to_timestamp(public.kr8_rcfg('board_v2_from', 2147483647)) or public.kr8_is_test_member(uid))
    group by (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- Top 5 gifts won (old manual awards)
    select 'gift', a.awarded_at, null, null, null, p.id, p.poster_path, 1, a.rank, a.prize, null
    from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = uid
    union all
    -- my Reel was approved by the team
    select 'approved', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, null, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'approved' and p.reviewed_at is not null and not p.hidden
    union all
    -- my Reel was hidden by the team (audit P2-3): the reason travels in "prize"
    select 'hidden', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, p.review_note, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'hidden' and p.reviewed_at is not null
  ) a
  order by 2 desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $function$;

commit;
