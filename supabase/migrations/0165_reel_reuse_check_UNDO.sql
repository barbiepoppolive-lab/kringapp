-- UNDO 0165: back to the 0154 Feed quality score, no re-used clip check.
CREATE OR REPLACE FUNCTION public.kr8_reel_quality_calc(p_post uuid, OUT score integer, OUT suggest text, OUT reasons text[])
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  q public.kr8_reel_quality; p public.kr8_posts; fr jsonb; n int;
  b numeric; s numeric; person boolean; face_clear boolean; home_n int; place boolean; dur numeric; vert boolean; bars_n int; sbar boolean;
  sc int := 0; rs text[] := '{}'; ck text; wm text; app text;
  dark int := public.kr8_rcfg('fq_dark', 30); dim int := public.kr8_rcfg('fq_dim', 45);
  blur int := public.kr8_rcfg('fq_blur', 20); soft int := public.kr8_rcfg('fq_soft', 35); fmin int := public.kr8_rcfg('fq_feed_min', 55);
begin
  select * into q from public.kr8_reel_quality where post_id = p_post;
  select * into p from public.kr8_posts where id = p_post;
  fr := coalesce(q.features -> 'frames', '[]'::jsonb);
  n := jsonb_array_length(fr);
  if p.id is null or n = 0 then score := null; suggest := null; reasons := array['no picture of this Reel could be read']; return; end if;

  select percentile_cont(0.5) within group (order by (x ->> 'b')::numeric),
         percentile_cont(0.5) within group (order by (x ->> 's')::numeric),
         bool_or(coalesce((x ->> 'person')::numeric, 0) >= 80
                 or exists (select 1 from jsonb_array_elements(coalesce(x -> 'faces', '[]')) f where (f ->> 'conf')::numeric >= 90 and (f ->> 'a')::numeric >= 0.004)),
         bool_or(exists (select 1 from jsonb_array_elements(coalesce(x -> 'faces', '[]')) f where (f ->> 'conf')::numeric >= 95 and (f ->> 'a')::numeric >= 0.02)),
         count(*) filter (where exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'labels', '[]')) l
                                         where l in ('Bedroom', 'Bed', 'Couch', 'Living Room', 'Bathroom', 'Toilet', 'Bathtub', 'Pillow', 'Cushion', 'Home Decor'))
                            and not exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'labels', '[]')) l
                                         where l in ('Restaurant', 'Cafe', 'Cafeteria', 'Shop', 'Market', 'Bar', 'Pub', 'Street', 'City', 'Road', 'Outdoors',
                                                     'Nature', 'Temple', 'Shopping Mall', 'Mall', 'Urban', 'Hotel', 'Food Court', 'Bazaar', 'Night Life', 'Club')))
    into b, s, person, face_clear, home_n
    from jsonb_array_elements(fr) x;
  -- 0153: black bars (AWS brightness 0 on a sharp picture = the video does not fill the screen) are not "dark";
  -- a phone status bar (a clock + a battery %) on the picture = a screen recording of another app
  select count(*) filter (where (x ->> 'b')::numeric < 3 and coalesce((x ->> 's')::numeric, 0) >= 25),
         bool_or(exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'text', '[]')) t where t ~ '^[0-2]?[0-9]:[0-5][0-9]$')
                 and exists (select 1 from jsonb_array_elements_text(coalesce(x -> 'text', '[]')) t where t ~ '^[0-9]{1,3} ?%$'))
    into bars_n, sbar from jsonb_array_elements(fr) x;
  if bars_n * 2 >= n and bars_n > 0 then
    select percentile_cont(0.5) within group (order by (x ->> 'b')::numeric) into b from jsonb_array_elements(fr) x where (x ->> 'b')::numeric >= 3;
  end if;

  ck := q.features #>> '{copy,kind}'; wm := q.features #>> '{copy,watermark}'; app := q.features #>> '{copy,app}';
  -- 0153: a watermark found once (the 19 Nov 5-frame audit or an earlier read) counts even if these 3 frames miss it
  if ck is null then
    select c.copy_kind, c.watermark into ck, wm from public.kr8_reel_copy_checks c where c.post_id = p_post and c.copied;
    if ck = 'app_watermark' then
      app := case when wm ~* 'tiktok' then 'TikTok' when wm ~* 'capcut' then 'CapCut' when wm ~* 'lemon8' then 'Lemon8' when wm ~* 'instagram' then 'Instagram' when wm ~* 'douyin' then 'Douyin' end;
    end if;
  end if;
  if (ck is null or ck = 'handle_only') and sbar then ck := 'screen_recording'; wm := 'phone status bar'; end if;
  place := p.venue_id is not null or exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id);
  dur := p.duration_ms / 1000.0;
  vert := coalesce(p.height > p.width, true);

  -- points (100): a person 30 (+10 face clearly visible) · light 20 · sharp 20 · place 10 · vertical 5 · 7–60 s 5
  if person then sc := sc + 30; else rs := array_append(rs, 'no person on camera'::text); end if;
  if face_clear then sc := sc + 10; end if;
  if b is null then null; elsif b >= dim then sc := sc + 20; elsif b >= dark then sc := sc + 10; rs := array_append(rs, 'a bit dark'::text); else rs := array_append(rs, 'too dark'::text); end if;
  if s is null then null; elsif s >= soft then sc := sc + 20; elsif s >= blur then sc := sc + 10; rs := array_append(rs, 'a bit soft'::text); else rs := array_append(rs, 'blurry'::text); end if;
  if place then sc := sc + 10; else rs := array_append(rs, 'no place tagged'::text); end if;
  if vert then sc := sc + 5; else rs := array_append(rs, 'not vertical'::text); end if;
  if dur is null then null; elsif dur between 7 and 60 then sc := sc + 5; elsif dur < 6 then sc := sc - 10; rs := rs || format('very short (%ss)', round(dur)); end if;
  if home_n * 2 >= n and home_n > 0 then sc := sc - 10; rs := array_append(rs, 'filmed at home'::text); end if;
  if bars_n * 2 >= n and bars_n > 0 then sc := sc - 15; rs := array_append(rs, 'black bars: not filmed full-screen (maybe a screen recording)'::text); end if;
  if ck = 'handle_only' then sc := sc - 10; rs := rs || format('shows someone''s @name (%s)', left(coalesce(wm, ''), 30)); end if;
  if ck in ('app_watermark', 'stock_watermark', 'ai_watermark', 'screen_recording') then
    sc := least(sc, 10);
    rs := array[case ck when 'app_watermark' then format('looks copied from %s (watermark ''%s'')', coalesce(app, 'another app'), left(coalesce(wm, ''), 30))
                        when 'stock_watermark' then format('stock video, not filmed by them (''%s'')', left(coalesce(wm, ''), 30))
                        when 'screen_recording' then 'screen recording of another app (phone status bar on the video)'
                        else format('AI-made video (''%s'')', left(coalesce(wm, ''), 30)) end] || rs;
  end if;
  score := greatest(0, least(100, sc));

  -- suggestion: copied / too dark / blurry → Not yet (ask for their own, clearer video); no person or at home → Profile only;
  -- otherwise Feed when the score is good enough
  suggest := case when ck in ('app_watermark', 'stock_watermark', 'ai_watermark', 'screen_recording') then 'not_yet'
                  when b is not null and b < dark then 'not_yet'
                  when s is not null and s < blur then 'not_yet'
                  when not person then 'profile'
                  when home_n * 2 >= n and home_n > 0 then 'profile'
                  when bars_n * 2 >= n and bars_n > 0 then 'profile'
                  when score >= fmin then 'feed'
                  else 'profile' end;
  -- 0154 strict: a Reel the bot would not put in the Feed never ranks high in it (the founder still decides where it goes)
  score := case suggest when 'not_yet' then least(score, 30) when 'profile' then least(score, 50) else score end;
  reasons := rs;
end $function$;
revoke all on function public.kr8_reel_quality_calc(uuid) from public, anon, authenticated;
drop function if exists public.kr8_reel_reuse_check(uuid, jsonb, jsonb, boolean);
drop function if exists public.kr8_reel_prints_add(jsonb);
drop table if exists public.kr8_reel_reuse;
drop table if exists public.kr8_reel_prints;
drop function if exists public.kr8_print_rich(bigint);
