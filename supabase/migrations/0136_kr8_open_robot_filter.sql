-- 0136 (19 Nov): robot / VPN / foreign opens of Reel share links never count, decided when the open is recorded.
-- This week the founder had to mark such opens by hand (ok = false, why = 'robot'). Every one of those 209 rows (16-19 Nov)
-- is caught by rules 1-2 below. Of this week's 58 counted opens only 3 would have been refused: two bare "Chrome" script opens
-- on #74's Reels (19 Nov) and one real phone opening a second Reel of #16 the same day (rule 3). Board change: 0 Rings.
--   1. robot browser: empty user agent, a known crawler / link-preview / script / headless browser, or any user agent that
--      does not start with "Mozilla/" (every real phone browser and in-app browser does; e.g. the bare "Chrome" agent with a
--      fake google.com referrer that opened #74's Reels on 19 Nov is a script).
--   2. not from Thailand: Cloudflare's country is set and is not TH (the same rule the manual clean-up used: every
--      non-TH open this week was marked robot). Switch: kr8_rings_config 'opens_th_only' (1 = on, 0 = off).
--   3. one device (= hashed network + browser, made by the website) counts once per member per Bangkok day, across all of
--      that member's Reels (was: once per Reel). Switch: 'opens_device_member_day' = how many count (default 1).
-- Only NEW opens are affected: nothing already stored is re-scored, so this week's board does not move.
-- Keeps the live burst guard (12 counted opens per Reel per hour) that was added on the database directly and was missing here.
-- Rollback: quick off-switches without a deploy: update kr8_rings_config set value = 0 where key = 'opens_th_only';
--   set 'opens_device_member_day' to 50. Full rollback: re-create kr8_share_open from 0047 plus the burst-guard block below.

insert into public.kr8_rings_config (key, value, note) values
  ('opens_th_only', 1, '1 = share-link opens from outside Thailand (Cloudflare country not TH) never count (0136)'),
  ('opens_device_member_day', 1, 'how many share-link opens one device can give one member per Bangkok day, across all their Reels (0136)')
on conflict (key) do nothing;

-- true = this open is a robot / tool / foreign visit and never counts. Used at insert time only.
create or replace function public.kr8_open_is_robot(p_ua text, p_country text) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare ua text := btrim(coalesce(p_ua, '')); c text := upper(btrim(coalesce(p_country, '')));
begin
  if ua = '' or ua !~* '^mozilla/' then return true; end if;
  if ua !~* 'cubot' and ua ~* ('bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|facebot|meta-external|meta-inspector|preview'
       || '|whatsapp|telegram|slack|discord|skypeuri|embed|iframely|curl|wget|python|aiohttp|httpx|go-http-client|okhttp|node-fetch|undici'
       || '|axios|java/|libwww|apache-httpclient|headless|playwright|puppeteer|phantomjs|selenium|webdriver|lighthouse|pagespeed|gtmetrix'
       || '|pingdom|uptime|monitor|scan|google-inspectiontool|google-read-aloud|googleother|feedfetcher|mediapartners|adsbot|applebot'
       || '|line-poker|linespider|chatgpt|gptbot|claude|perplexity|bytespider|petalbot|yandex|baidu|semrush|ahrefs') then
    return true;
  end if;
  if c <> '' and c <> 'TH' and public.kr8_rcfg('opens_th_only', 1) = 1 then return true; end if;
  return false;
end $$;
revoke all on function public.kr8_open_is_robot(text, text) from public, anon, authenticated;

-- Same as live (0047 + burst guard); changed: the robot rule (kr8_open_is_robot) and the per-member device rule.
create or replace function public.kr8_share_open(p_short text, p_ref text, p_ua text, p_session text, p_device text, p_country text, p_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;
