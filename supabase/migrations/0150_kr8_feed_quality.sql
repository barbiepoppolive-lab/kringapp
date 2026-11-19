-- 0150 (19 Nov 2026): Feed quality autopilot.
-- Founder: "We will be strict henceforth. Arrange the Reels and People feed on quality and appearance, and one autopilot bot
-- that does the same for every new file." Founder change 23:25: HE decides Feed vs Profile only for every Reel. The bot never
-- hides, approves or moves a Reel. It scores, orders the feed by the score, and SUGGESTS: Feed / Profile only / Not yet + why.
-- Safety stays automatic: a possible under-18 member is kept out of the public Reels and People feeds until the founder clears them.
--
--  * face-check-aws { action: 'quality_scan' } (robot key, every 5 min): poster + 2 scan frames of each new Reel and every new or
--    changed profile photo → AWS DetectLabels (labels + brightness / sharpness), DetectFaces (+ age), DetectText (watermarks)
--    → kr8_reel_quality_record / kr8_people_quality_record. ≈ US$0.009 a Reel, $0.003 a photo.
--  * Scores here (tunable in kr8_rings_config, keys fq_*), like TikTok / Instagram: original (no other app's watermark), a real
--    person on camera, bright, sharp, vertical, 7–60 s, a place tagged. Engagement (per view, saves and opens above likes) and
--    freshness stay in kr8_feed_order; the quality score is a multiplier on top (score 50 = ×1.0, 100 = ×1.6, 0 = ×0.4).
--  * People: AWS-verified first, then the profile photo (one clear face, bright, sharp, not a screenshot), an approved Reel,
--    bio, recent activity. "Appearance" = how good the photo is, never looks.
--  * Hourly: re-score, under-18 holds, heartbeat kr8_feed_quality (a late / failing bot → the canary's ⏳ push, ✅ when fine).

-- ───────── tables (no direct access: security definer functions only) ─────────
create table if not exists public.kr8_reel_quality (
  post_id uuid primary key references public.kr8_posts(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  frames int not null default 0,
  features jsonb not null default '{}'::jsonb,
  score int,
  suggest text check (suggest in ('feed', 'profile', 'not_yet')),
  reasons text[] not null default '{}',
  scored_at timestamptz
);
create table if not exists public.kr8_people_quality (
  user_id uuid primary key references public.kr8_members(user_id) on delete cascade,
  photo_md5 text,
  scanned_at timestamptz not null default now(),
  features jsonb not null default '{}'::jsonb,
  photo_score int,
  reasons text[] not null default '{}'
);
create table if not exists public.kr8_minor_holds (
  user_id uuid primary key references public.kr8_members(user_id) on delete cascade,
  member_no int,
  reason text not null,
  source text not null default 'aws',
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid
);
alter table public.kr8_reel_quality enable row level security;
alter table public.kr8_people_quality enable row level security;
alter table public.kr8_minor_holds enable row level security;
revoke all on public.kr8_reel_quality, public.kr8_people_quality, public.kr8_minor_holds from anon, authenticated;

-- limits (kr8_rings_config: integer values)
insert into public.kr8_rings_config (key, value) values
  ('fq_on', 1),              -- 0 = feed order ignores the quality score (kill switch)
  ('fq_dark', 30),           -- AWS brightness (0–100, middle frame of the Reel) below this = too dark
  ('fq_dim', 45),
  ('fq_blur', 20),           -- AWS sharpness (0–100) below this = blurry
  ('fq_soft', 35),
  ('fq_feed_min', 55),       -- score at or above this → suggest Feed
  ('fq_unscored_pct', 90),   -- feed multiplier (%) for a Reel the bot has not read yet
  ('minor_hold_high', 16)    -- AWS age range top below this on a card photo / selfie / profile photo → kept out of public feeds
on conflict (key) do nothing;

insert into public.kr8_robot (name, title, note, schedule, mode, daily_cap) values
  ('feed_quality', 'Feed quality',
   'Every 5 min AWS reads each new Reel (3 frames) and each new profile photo. It orders the Reels and People feeds by quality (own video, a real person, bright, sharp, a place) and suggests Feed / Profile only / Not yet on each Reel card. It never hides or approves a Reel: you decide. A member who may be under 18 is kept out of public feeds until you clear them.',
   '*/5 * * * *', 'on', 2000)
on conflict (name) do update set title = excluded.title, note = excluded.note, schedule = excluded.schedule;

-- ───────── what still needs reading ─────────
create or replace function public.kr8_quality_todo(p_reels int default 6, p_people int default 8, p_post uuid default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'video_path', x.video_path, 'poster_path', x.poster_path)) from (
        select p.id, p.video_path, p.poster_path from public.kr8_posts p
         where p.kind = 'reel' and not p.hidden and p.status in ('pending', 'approved')
           and (p_post is null or p.id = p_post)
           and (p_post is not null or (p.created_at < now() - interval '2 minutes'    -- the scan frames land just after the video
                and not exists (select 1 from public.kr8_reel_quality q where q.post_id = p.id)))
         order by p.created_at desc limit least(greatest(coalesce(p_reels, 6), 0), 12)) x), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('user_id', y.user_id, 'photo', y.photo, 'md5', y.md5)) from (
        select m.user_id, m.photo, md5(coalesce(m.photo, '')) md5 from public.kr8_members m
         where p_post is null and m.photo is not null and m.photo !~ '^https://kringapp\.com/'
           and not exists (select 1 from public.kr8_people_quality q where q.user_id = m.user_id and q.photo_md5 = md5(m.photo))
         order by m.updated_at desc limit least(greatest(coalesce(p_people, 8), 0), 20)) y), '[]'::jsonb))
$$;
revoke all on function public.kr8_quality_todo(int, int, uuid) from public, anon, authenticated;

-- ───────── Reel score ─────────
create or replace function public.kr8_reel_quality_calc(p_post uuid, out score int, out suggest text, out reasons text[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  q public.kr8_reel_quality; p public.kr8_posts; fr jsonb; n int;
  b numeric; s numeric; person boolean; face_clear boolean; home_n int; place boolean; dur numeric; vert boolean;
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

  ck := q.features #>> '{copy,kind}'; wm := q.features #>> '{copy,watermark}'; app := q.features #>> '{copy,app}';
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
  if ck = 'handle_only' then sc := sc - 10; rs := rs || format('shows someone''s @name (%s)', left(coalesce(wm, ''), 30)); end if;
  if ck in ('app_watermark', 'stock_watermark', 'ai_watermark') then
    sc := least(sc, 10);
    rs := array[case ck when 'app_watermark' then format('looks copied from %s (watermark ''%s'')', coalesce(app, 'another app'), left(coalesce(wm, ''), 30))
                        when 'stock_watermark' then format('stock video, not filmed by them (''%s'')', left(coalesce(wm, ''), 30))
                        else format('AI-made video (''%s'')', left(coalesce(wm, ''), 30)) end] || rs;
  end if;
  score := greatest(0, least(100, sc));

  -- suggestion: copied / too dark / blurry → Not yet (ask for their own, clearer video); no person or at home → Profile only;
  -- otherwise Feed when the score is good enough
  suggest := case when ck in ('app_watermark', 'stock_watermark', 'ai_watermark') then 'not_yet'
                  when b is not null and b < dark then 'not_yet'
                  when s is not null and s < blur then 'not_yet'
                  when not person then 'profile'
                  when home_n * 2 >= n and home_n > 0 then 'profile'
                  when score >= fmin then 'feed'
                  else 'profile' end;
  reasons := rs;
end $$;
revoke all on function public.kr8_reel_quality_calc(uuid) from public, anon, authenticated;

create or replace function public.kr8_reel_quality_rescore(p_post uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  select * into c from public.kr8_reel_quality_calc(p_post);
  update public.kr8_reel_quality set score = c.score, suggest = c.suggest, reasons = coalesce(c.reasons, '{}'), scored_at = now() where post_id = p_post;
end $$;
revoke all on function public.kr8_reel_quality_rescore(uuid) from public, anon, authenticated;

-- edge function → here (service key only)
create or replace function public.kr8_reel_quality_record(p_post uuid, p_features jsonb, p_copy jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f jsonb := coalesce(p_features, '{}'::jsonb) || jsonb_build_object('copy', coalesce(p_copy, '{}'::jsonb) - 'evidence');
        n int := jsonb_array_length(coalesce(p_features -> 'frames', '[]'::jsonb)); r record;
begin
  insert into public.kr8_reel_quality (post_id, scanned_at, frames, features) values (p_post, now(), n, f)
  on conflict (post_id) do update set scanned_at = now(), frames = excluded.frames, features = excluded.features;
  perform public.kr8_reel_quality_rescore(p_post);
  -- the admin's "Looks copied from TikTok" line + amber alert (0148); never hides anything
  if to_regprocedure('public.kr8_reel_copy_record(uuid,boolean,text,text,text,jsonb,integer)') is not null then
    perform public.kr8_reel_copy_record(p_post, coalesce((p_copy ->> 'copied')::boolean, false), p_copy ->> 'kind', p_copy ->> 'watermark',
                                        p_copy ->> 'app', coalesce(p_copy -> 'evidence', '[]'::jsonb), n);
  end if;
  select score, suggest, reasons into r from public.kr8_reel_quality where post_id = p_post;
  return jsonb_build_object('score', r.score, 'suggest', r.suggest, 'reasons', r.reasons);
end $$;
revoke all on function public.kr8_reel_quality_record(uuid, jsonb, jsonb) from public, anon, authenticated;

-- ───────── possible under 18: kept out of public feeds ─────────
create or replace function public.kr8_minor_hold_add(p_user uuid, p_reason text, p_source text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare m record;
begin
  if p_user is null then return false; end if;
  -- once the founder cleared someone, the bot never holds them again on its own
  if exists (select 1 from public.kr8_minor_holds h where h.user_id = p_user) then return false; end if;
  select member_no, first_name into m from public.kr8_members where user_id = p_user;
  insert into public.kr8_minor_holds (user_id, member_no, reason, source) values (p_user, m.member_no, left(p_reason, 300), p_source);
  perform public.kr8_robot_record('feed_quality', 'minor_hold', '#' || coalesce(m.member_no::text, '?'),
    jsonb_build_object('member_no', m.member_no, 'why', p_reason, 'note', 'Out of the public Reels and People feeds until you clear them. Nothing was sent to them.'), null, false);
  perform public.kr8_alert_raise('minor_hold:' || p_user, 'feed_quality', 'amber',
    format('May be under 18 · #%s %s · out of public feeds', coalesce(m.member_no::text, '?'), coalesce(m.first_name, '')),
    format('%s. Their Reels and profile are kept out of the public feeds (they still see their own). Look at their photo: tap Clear if they are an adult. Nothing was sent to them.', p_reason),
    '#autopilot', jsonb_build_object('user_id', p_user, 'member_no', m.member_no));
  return true;
end $$;
revoke all on function public.kr8_minor_hold_add(uuid, text, text) from public, anon, authenticated;

create or replace function public.kr8_minor_held(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_minor_holds h where h.user_id = p_user and h.cleared_at is null)
$$;
grant execute on function public.kr8_minor_held(uuid) to anon, authenticated;

-- ───────── people photo score (0–35) ─────────
create or replace function public.kr8_people_quality_record(p_user uuid, p_md5 text, p_features jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f jsonb := p_features -> 'photo'; nf int; big numeric; b numeric; s numeric; words int; hi int; lo int;
        sc int := 0; rs text[] := '{}'; texty boolean;
begin
  if f is null then
    sc := 0; rs := array['photo could not be read'];
  else
    nf := (select count(*) from jsonb_array_elements(coalesce(f -> 'faces', '[]')) x where (x ->> 'conf')::numeric >= 90);
    big := coalesce((f #>> '{faces,0,a}')::numeric, 0);
    b := (f ->> 'b')::numeric; s := (f ->> 's')::numeric; words := coalesce((f ->> 'words')::int, 0);
    texty := words >= 8 or exists (select 1 from jsonb_array_elements_text(coalesce(f -> 'labels', '[]')) l where l in ('Screenshot', 'Text', 'Poster', 'Document', 'Advertisement', 'Flyer', 'Page'));
    if nf = 0 then rs := array_append(rs, 'no face in the photo'::text);
    elsif nf >= 3 then sc := sc + 8; rs := array_append(rs, 'group photo'::text);
    elsif big >= 0.05 then sc := sc + 15;
    else sc := sc + 8; rs := array_append(rs, 'face is small'::text); end if;
    if b is null then null; elsif b >= 40 then sc := sc + 10; elsif b >= 25 then sc := sc + 5; rs := array_append(rs, 'photo a bit dark'::text); else rs := array_append(rs, 'photo too dark'::text); end if;
    if s is null then null; elsif s >= 30 then sc := sc + 10; elsif s >= 15 then sc := sc + 5; rs := array_append(rs, 'photo a bit soft'::text); else rs := array_append(rs, 'photo blurry'::text); end if;
    if texty then sc := sc - 10; rs := array_append(rs, 'text / screenshot'::text); end if;
    hi := (f #>> '{faces,0,high}')::int; lo := (f #>> '{faces,0,low}')::int;
    if nf between 1 and 2 and hi is not null and hi < public.kr8_rcfg('minor_hold_high', 16) then
      perform public.kr8_minor_hold_add(p_user, format('AWS reads their profile photo as %s–%s years old', lo, hi), 'aws_photo');
    end if;
  end if;
  insert into public.kr8_people_quality (user_id, photo_md5, scanned_at, features, photo_score, reasons)
  values (p_user, p_md5, now(), coalesce(p_features, '{}'::jsonb), greatest(0, least(35, sc)), rs)
  on conflict (user_id) do update set photo_md5 = excluded.photo_md5, scanned_at = now(), features = excluded.features,
    photo_score = excluded.photo_score, reasons = excluded.reasons;
  return jsonb_build_object('photo_score', greatest(0, least(35, sc)), 'reasons', rs);
end $$;
revoke all on function public.kr8_people_quality_record(uuid, text, jsonb) from public, anon, authenticated;

-- People score 0–100 (+ penalties): verified 30 · photo 35 · approved Reel 15 · recent 10 · bio 5 · here now 5
create or replace function public.kr8_people_score(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select (case when coalesce(m.verified, false) then 30 else 0 end)
       + coalesce(q.photo_score, case when m.photo is null or m.photo ~ '^https://kringapp\.com/' then 0 else 12 end)
       + case when exists (select 1 from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved' and not p.hidden) then 15 else 0 end
       + case when m.last_active_at > now() - interval '3 days' then 10 when m.last_active_at > now() - interval '7 days' then 5 else 0 end
       + case when length(btrim(coalesce(m.bio, ''))) >= 20 then 5 else 0 end
       + case when m.here_until > now() then 5 else 0 end
       - case when coalesce(m.ghost, false) then 100 else 0 end
       - case when exists (select 1 from public.kr8_prize_bans b where b.user_id = m.user_id) then 40 else 0 end
       - case when public.kr8_fake_level(m.user_id) = 'amber' then 20 else 0 end
       - case when exists (select 1 from public.kr8_account_links l where (l.a = m.user_id or l.b = m.user_id) and l.dismissed_at is null and l.reason = 'device') then 20 else 0 end
  from public.kr8_members m left join public.kr8_people_quality q on q.user_id = m.user_id
  where m.user_id = p_user
$$;
revoke all on function public.kr8_people_score(uuid) from public, anon, authenticated;

-- ───────── the under-18 reading from face checks (0148) also holds ─────────
do $$ begin
  if to_regprocedure('public.kr8_age_check_record(uuid,integer,integer,text)') is not null then
    execute $f$
    create or replace function public.kr8_age_hold_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $t$
    begin
      if new.high is not null and new.high < public.kr8_rcfg('minor_hold_high', 16) then
        perform public.kr8_minor_hold_add(new.user_id, format('AWS reads their %s as %s–%s years old', case new.source when 'card' then 'card photo' when 'selfie' then 'selfie' else 'face check' end, new.low, new.high), 'aws_' || coalesce(new.source, 'check'));
      end if;
      return new;
    end $t$;
    $f$;
    drop trigger if exists kr8_age_hold on public.kr8_age_checks;
    create trigger kr8_age_hold after insert or update of high on public.kr8_age_checks for each row execute function public.kr8_age_hold_trg();
  end if;
end $$;

-- ───────── hourly: re-score, holds, heartbeat ─────────
create or replace function public.kr8_feed_quality_hourly()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; r record; held int := 0; late int; latep int; ok boolean; v_note text;
begin
  for r in select post_id from public.kr8_reel_quality loop perform public.kr8_reel_quality_rescore(r.post_id); n := n + 1; end loop;
  for r in select a.user_id, a.low, a.high, a.source from public.kr8_age_checks a
            where a.high < public.kr8_rcfg('minor_hold_high', 16) and not exists (select 1 from public.kr8_minor_holds h where h.user_id = a.user_id) loop
    if public.kr8_minor_hold_add(r.user_id, format('AWS reads their %s as %s–%s years old', case r.source when 'card' then 'card photo' else r.source end, r.low, r.high), 'aws_' || coalesce(r.source, 'check')) then held := held + 1; end if;
  end loop;
  select count(*) into late from public.kr8_posts p
   where p.kind = 'reel' and not p.hidden and p.status in ('pending', 'approved') and p.created_at < now() - interval '30 minutes'
     and p.created_at > now() - interval '30 days' and not exists (select 1 from public.kr8_reel_quality q where q.post_id = p.id);
  select count(*) into latep from public.kr8_members m
   where m.photo is not null and m.photo !~ '^https://kringapp\.com/' and m.updated_at < now() - interval '30 minutes'
     and not exists (select 1 from public.kr8_people_quality q where q.user_id = m.user_id and q.photo_md5 = md5(m.photo));
  ok := late = 0 and latep <= 3;
  v_note := case when ok then format('%s Reels scored · %s people photos · %s held (maybe under 18)', (select count(*) from public.kr8_reel_quality where score is not null),
                                   (select count(*) from public.kr8_people_quality), (select count(*) from public.kr8_minor_holds where cleared_at is null))
               else format('Behind: %s Reels and %s photos waiting over 30 min (AWS or the robot key?)', late, latep) end;
  perform public.kr8_robot_beat('kr8_feed_quality', ok, jsonb_build_object('note', v_note, 'rescored', n, 'held', held), 3600);
  update public.kr8_robot set last_run = now(), last_ok = ok, last_note = v_note where name = 'feed_quality';
  return jsonb_build_object('ok', ok, 'rescored', n, 'held', held, 'late_reels', late, 'late_photos', latep);
end $$;
revoke all on function public.kr8_feed_quality_hourly() from public, anon, authenticated;

-- every 5 min: wake the scanner when something is waiting (robot key from Vault 'face_robot_key')
create or replace function public.kr8_feed_quality_kick()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; t jsonb;
begin
  if public.kr8_robot_mode('feed_quality') = 'off' or public.kr8_autopilot_paused() then return; end if;
  t := public.kr8_quality_todo(1, 1, null);
  if jsonb_array_length(t -> 'reels') = 0 and jsonb_array_length(t -> 'people') = 0 then return; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'face_robot_key' limit 1;
  if k is null or length(k) < 32 then return; end if;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/face-check-aws',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kring-robot', k),
    body := '{"action":"quality_scan","reels":6,"people":8}'::jsonb,
    timeout_milliseconds := 120000);
exception when others then null;
end $$;
revoke all on function public.kr8_feed_quality_kick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('kr8_feed_quality_kick', 'kr8_feed_quality_hourly', 'kr8_reel_copy_scan');
select cron.schedule('kr8_feed_quality_kick', '*/5 * * * *', 'select public.kr8_feed_quality_kick()');
select cron.schedule('kr8_feed_quality_hourly', '11 * * * *', 'select public.kr8_feed_quality_hourly()');

-- ───────── admin ─────────
-- Reel cards: the bot's suggestion next to the copied line (replaces the 19 Nov one-off verdict when the bot has read the Reel)
drop function if exists public.kr8_admin_reel_checks(uuid[]);
create or replace function public.kr8_admin_reel_checks(p_ids uuid[])
returns table(post_id uuid, copied boolean, copy_kind text, watermark text, verdict text, reasons text[], feed_off boolean, feed_off_reason text,
              checked_at timestamptz, score int, suggest text, author_held boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
    select p.id, coalesce(c.copied, false), c.copy_kind, c.watermark,
           case when q.suggest is null then c.verdict when q.suggest = 'feed' then 'KEEP_IN_FEED' else 'SUGGEST_FEED_OFF' end,
           coalesce(case when q.suggest is not null then q.reasons end, c.reasons, '{}'), coalesce(p.feed_off, false), p.feed_off_reason,
           coalesce(q.scored_at, c.checked_at), q.score, q.suggest, public.kr8_minor_held(p.author)
      from public.kr8_posts p
      left join public.kr8_reel_copy_checks c on c.post_id = p.id
      left join public.kr8_reel_quality q on q.post_id = p.id
     where p.id = any (coalesce(p_ids, '{}')) and p.kind = 'reel'
     limit 500;
end $$;
revoke all on function public.kr8_admin_reel_checks(uuid[]) from public, anon;
grant execute on function public.kr8_admin_reel_checks(uuid[]) to authenticated;

-- the Autopilot card: counts, approved Reels where the bot disagrees with where they are, members held as possibly under 18
create or replace function public.kr8_admin_feed_quality()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'reels_scored', (select count(*) from public.kr8_reel_quality where score is not null),
    'reels_waiting', (select count(*) from public.kr8_posts p where p.kind = 'reel' and not p.hidden and p.status in ('pending', 'approved')
                        and not exists (select 1 from public.kr8_reel_quality q where q.post_id = p.id)),
    'people_scored', (select count(*) from public.kr8_people_quality),
    'suggest', (select jsonb_object_agg(s, n) from (select coalesce(q.suggest, 'none') s, count(*) n from public.kr8_reel_quality q join public.kr8_posts p on p.id = q.post_id
                                                     where p.status = 'approved' and not p.hidden group by 1) x),
    'disagree', coalesce((select jsonb_agg(jsonb_build_object('post_id', p.id, 'member_no', m.member_no, 'name', m.first_name, 'score', q.score,
                          'suggest', q.suggest, 'in_feed', not coalesce(p.feed_off, false), 'reasons', q.reasons, 'poster_path', p.poster_path, 'video_path', p.video_path)
                          order by q.score nulls first)
                         from public.kr8_reel_quality q join public.kr8_posts p on p.id = q.post_id join public.kr8_members m on m.user_id = p.author
                        where p.status = 'approved' and not p.hidden
                          and ((q.suggest <> 'feed' and not coalesce(p.feed_off, false)) or (q.suggest = 'feed' and coalesce(p.feed_off, false)))), '[]'::jsonb),
    'held', coalesce((select jsonb_agg(jsonb_build_object('user_id', h.user_id, 'member_no', h.member_no, 'name', m.first_name, 'reason', h.reason,
                       'since', h.created_at, 'photo', m.photo) order by h.created_at desc)
                      from public.kr8_minor_holds h join public.kr8_members m on m.user_id = h.user_id where h.cleared_at is null), '[]'::jsonb),
    'last_run', (select last_run from public.kr8_robot where name = 'feed_quality'),
    'last_scan', (select max(scanned_at) from public.kr8_reel_quality));
end $$;
revoke all on function public.kr8_admin_feed_quality() from public, anon;
grant execute on function public.kr8_admin_feed_quality() to authenticated;

create or replace function public.kr8_admin_minor_clear(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_minor_holds set cleared_at = now(), cleared_by = auth.uid() where user_id = p_user and cleared_at is null;
  get diagnostics n = row_count;
  perform public.kr8_alert_clear('minor_hold:' || p_user, 'founder');
  perform public.kr8_robot_record('feed_quality', 'minor_cleared', (select '#' || member_no from public.kr8_members where user_id = p_user),
                                  jsonb_build_object('by', 'founder'), null, false);
  return jsonb_build_object('cleared', n);
end $$;
revoke all on function public.kr8_admin_minor_clear(uuid) from public, anon;
grant execute on function public.kr8_admin_minor_clear(uuid) to authenticated;

-- admin: read one Reel again now (after the member re-uploads, or to test)
create or replace function public.kr8_admin_feed_quality_scan(p_post uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'face_robot_key' limit 1;
  if k is null then raise exception 'KR8_NOT_CONFIGURED'; end if;
  perform net.http_post(url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/face-check-aws',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kring-robot', k),
    body := jsonb_build_object('action', 'quality_scan', 'reels', 6, 'people', 8, 'post', p_post), timeout_milliseconds := 120000);
end $$;
revoke all on function public.kr8_admin_feed_quality_scan(uuid) from public, anon;
grant execute on function public.kr8_admin_feed_quality_scan(uuid) to authenticated;
