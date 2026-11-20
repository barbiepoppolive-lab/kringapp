-- UNDO 0182: back to counting share-link opens on the server GET, no friend-verify nudge. Restores the exact functions from before 0182.
begin;
drop function if exists public.kr8_share_open_confirm(uuid, text, text, text, text, text, jsonb, text);
drop function if exists public.kr8_reel_unv_likes(uuid);
drop function if exists public.kr8_share_open(text, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.kr8_my_activity(p_limit integer DEFAULT 50)
 RETURNS TABLE(kind text, at timestamp with time zone, actor_id uuid, actor_name text, actor_photo text, post_id uuid, poster_path text, n integer, rank integer, prize text, i_follow boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.kr8_share_open(p_short text, p_ref text, p_ua text, p_session text, p_device text, p_country text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare k text; pid uuid; oid uuid; v_ok boolean := true; v_why text; v_src text := 'other';
        ref text := left(coalesce(p_ref, ''), 300); ua text := left(coalesce(p_ua, ''), 300); po record;
        d date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if k is null or p_key is null or p_key <> k then raise exception 'KR8_FORBIDDEN'; end if;
  select post_id into pid from public.kr8_reel_links where short = lower(coalesce(p_short, ''));
  if pid is null then return null; end if;
  select p.id, p.author, p.area, left(p.body, 160) as body, m.first_name into po
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  where p.id = pid and p.kind = 'reel' and not p.hidden and p.status = 'approved';
  if po.id is null then return jsonb_build_object('post_id', null); end if;
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
  elsif public.kr8_open_is_robot(ua, p_country) then v_ok := false; v_why := 'robot';
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
  -- burst guard: at most 12 counted opens per Reel per hour
  if v_ok and (select count(*) from public.kr8_share_opens where post_id = pid and ok and created_at > now() - interval '1 hour') >= 12 then
    v_ok := false; v_why := 'burst';
  end if;
  insert into public.kr8_share_opens (post_id, bkk_date, session, device, referrer, ua, country, source, ok, why)
  values (pid, d, p_session, p_device, nullif(ref, ''), nullif(ua, ''), nullif(left(coalesce(p_country, ''), 2), ''), v_src, v_ok, v_why)
  returning id into oid;
  return jsonb_build_object('post_id', pid, 'open_id', oid, 'ok', v_ok, 'name', po.first_name, 'area', po.area, 'body', po.body);
end $function$
;
grant execute on function public.kr8_share_open(text, text, text, text, text, text, text) to anon, authenticated;
delete from public.kr8_rings_config where key in ('friend_verify_nudge_on', 'opens_range_burst', 'opens_beacon_on');
drop index if exists public.kr8_share_opens_range; drop index if exists public.kr8_share_opens_pending;
alter table public.kr8_share_opens drop column if exists app_did, drop column if exists net_range, drop column if exists confirmed_at;
commit;
