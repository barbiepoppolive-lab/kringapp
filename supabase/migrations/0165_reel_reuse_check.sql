-- 0165 (20 Nov): re-used / copied clip check. Pich found member #261 (an old man's face-verified account) posting a clip of the
-- girl from #130's hidden Reels. Watermark reading (0148) can't catch that. Two new signals, both SUGGESTIONS ONLY
-- (never hide / approve; the founder decides every Reel):
--  1. SAME CLIP: a 64-bit picture fingerprint (dHash, supabase/functions/face-check-aws/reelprint.ts) of the Reel's frames is kept
--     for every Reel forever (kr8_reel_prints, no link to the post, so deleted members' clips still count). A new Reel whose
--     frames match frames of ANOTHER member's video (Hamming distance ≤ 6 on at least 2 frames, or 3 for a long video) is marked.
--     Frames that are the same for 3+ members (black / blank placeholder posters) and low-detail pictures (dark halves, black
--     bars: kr8_print_rich) are ignored.
--  2. SOMEONE ELSE IN IT: AWS finds the face of ANOTHER member (≥ 95 %) in the Reel's frames and never the author's own face.
-- Either one: kr8_reel_reuse row → Feed quality reason "looks copied: …" (the Not yet sheet pre-selects "Not their own clip"),
-- suggestion Not yet, and one amber alert. The 20 Nov backfill fingerprinted all 173 stored videos at 1 frame per second.

create table if not exists public.kr8_reel_prints (
  id             bigserial primary key,
  video_path     text not null,
  owner          uuid not null,
  member_no_copy int,
  post_id        uuid,                          -- no foreign key: kept after the Reel / member is deleted
  at             text not null,                 -- 'poster' | 'middle' | 'end' | '12s'
  dhash          bigint not null,
  source         text not null default 'edge',  -- edge | backfill
  created_at     timestamptz not null default now(),
  unique (video_path, at));
create index if not exists kr8_reel_prints_owner on public.kr8_reel_prints (owner);
alter table public.kr8_reel_prints enable row level security;
revoke all on public.kr8_reel_prints from anon, authenticated;

create table if not exists public.kr8_reel_reuse (
  post_id         uuid primary key references public.kr8_posts(id) on delete cascade,
  kind            text not null check (kind in ('same_clip', 'other_member_face')),
  other_owner     uuid,
  other_member_no int,
  other_name      text,
  other_gone      boolean not null default false,
  other_video     text,
  frames_matched  int,
  best_dist       int,
  face_sim        numeric,
  found_at        timestamptz not null default now());
alter table public.kr8_reel_reuse enable row level security;
revoke all on public.kr8_reel_reuse from anon, authenticated;

-- a frame picture with enough detail to compare: at least 5 of the 8 rows of the hash are neither all-same nor blank
create or replace function public.kr8_print_rich(h bigint) returns boolean language sql immutable as $$
  select bit_count(h::bit(64)) between 8 and 56
     and (select count(*) from generate_series(0, 7) i where ((h >> (8 * i)) & 255) not in (0, 255)) >= 5
$$;

-- p_prints: [{at, h (16 hex)}] (null = use the prints already stored for this Reel's video);
-- p_face: {user, sim, at} from the edge function (another member in the Reel, author never in it) or null;
-- p_quiet: true = record only, no alert (backfill)
create or replace function public.kr8_reel_reuse_check(p_post uuid, p_prints jsonb default null, p_face jsonb default null, p_quiet boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.kr8_posts; me record; mine int; hit record; o record; k text; v_other uuid; v_sim numeric;
begin
  select * into p from public.kr8_posts where id = p_post;
  if p.id is null or p.video_path is null then return null; end if;
  select member_no, first_name into me from public.kr8_members where user_id = p.author;
  if p_prints is not null and jsonb_typeof(p_prints) = 'array' then
    insert into public.kr8_reel_prints (video_path, owner, member_no_copy, post_id, at, dhash, source)
    select p.video_path, p.author, me.member_no, p.id, left(x ->> 'at', 20), ('x' || lower(x ->> 'h'))::bit(64)::bigint, 'edge'
      from jsonb_array_elements(p_prints) x where (x ->> 'h') ~* '^[0-9a-f]{16}$'
    on conflict (video_path, at) do update set dhash = excluded.dhash, post_id = excluded.post_id;
  end if;
  update public.kr8_reel_prints set post_id = p.id where video_path = p.video_path and post_id is null;

  -- 1. same clip as another member's video
  with common as (select dhash from public.kr8_reel_prints group by dhash having count(distinct owner) >= 3),
       m as (select distinct r.dhash from public.kr8_reel_prints r
              where r.video_path = p.video_path and public.kr8_print_rich(r.dhash)
                and r.dhash not in (select dhash from common)),
       oth as (select r.video_path, r.owner, r.member_no_copy, r.dhash from public.kr8_reel_prints r
              where r.owner <> p.author and r.video_path <> p.video_path and public.kr8_print_rich(r.dhash)
                and r.dhash not in (select dhash from common)),
       d as (select x.video_path, x.owner, max(x.member_no_copy) member_no, m.dhash, min(bit_count((m.dhash # x.dhash)::bit(64))) dist
               from m join oth x on bit_count((m.dhash # x.dhash)::bit(64)) <= 6 group by x.video_path, x.owner, m.dhash)
  select d.video_path, d.owner, max(d.member_no) member_no, count(*) n, min(d.dist) best into hit
    from d group by d.video_path, d.owner order by count(*) desc, min(d.dist) limit 1;
  select count(*) into mine from public.kr8_reel_prints r where r.video_path = p.video_path and public.kr8_print_rich(r.dhash);

  if hit.video_path is not null and hit.n >= least(3, greatest(2, mine / 2)) then
    k := 'same_clip'; v_other := hit.owner;
  elsif p_face is not null and (p_face ->> 'user') ~* '^[0-9a-f-]{36}$' and (p_face ->> 'user')::uuid <> p.author
        and coalesce((p_face ->> 'sim')::numeric, 0) >= 95 then
    k := 'other_member_face'; v_other := (p_face ->> 'user')::uuid; v_sim := (p_face ->> 'sim')::numeric;
  end if;
  if k is null then return jsonb_build_object('reused', false); end if;

  select m2.member_no, m2.first_name into o from public.kr8_members m2 where m2.user_id = v_other;
  insert into public.kr8_reel_reuse (post_id, kind, other_owner, other_member_no, other_name, other_gone, other_video, frames_matched, best_dist, face_sim)
  values (p.id, k, v_other, coalesce(o.member_no, case when k = 'same_clip' then hit.member_no end,
                                     (select max(c.member_no_copy) from public.kr8_reward_claims c where c.member_id = v_other)),
          o.first_name, o.member_no is null,
          case when k = 'same_clip' then hit.video_path end, case when k = 'same_clip' then hit.n end,
          case when k = 'same_clip' then hit.best end, v_sim)
  on conflict (post_id) do update set kind = excluded.kind, other_owner = excluded.other_owner, other_member_no = excluded.other_member_no,
    other_name = excluded.other_name, other_gone = excluded.other_gone, other_video = excluded.other_video,
    frames_matched = excluded.frames_matched, best_dist = excluded.best_dist, face_sim = excluded.face_sim, found_at = now();

  if exists (select 1 from public.kr8_reel_quality q where q.post_id = p.id) then perform public.kr8_reel_quality_rescore(p.id); end if;
  if not coalesce(p_quiet, false) then
    perform public.kr8_alert_raise('reel_reused:' || p.id, 'reel_copy_scan', 'amber',
      format('Reel looks copied · #%s %s', coalesce(me.member_no::text, '?'), coalesce(me.first_name, '')),
      case k when 'same_clip' then format('Its pictures match a Reel of %s. Watch both before you approve. Nothing was hidden.',
                                          case when o.member_no is null then 'a deleted member' else format('#%s %s', o.member_no, coalesce(o.first_name, '')) end)
             else format('The person in it looks like %s (%s %% match), and the poster never appears. Watch it before you approve. Nothing was hidden.',
                         case when o.member_no is null then 'a deleted member' else format('#%s %s', o.member_no, coalesce(o.first_name, '')) end, round(v_sim)) end,
      '#q/reels',
      jsonb_build_object('post_id', p.id, 'member_no', me.member_no, 'kind', k, 'other_member_no', o.member_no));
  end if;
  return jsonb_build_object('reused', true, 'kind', k, 'other_member_no', o.member_no, 'frames', hit.n, 'dist', hit.best, 'sim', v_sim);
end $$;
revoke all on function public.kr8_reel_reuse_check(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.kr8_reel_reuse_check(uuid, jsonb, jsonb, boolean) to service_role;

-- backfill rows (scripts/reelprint_backfill.py): [{video_path, at, h}] — owner = the folder in the path
create or replace function public.kr8_reel_prints_add(p_rows jsonb) returns int
language sql security definer set search_path = public, pg_temp as $$
  with ins as (
    insert into public.kr8_reel_prints (video_path, owner, member_no_copy, post_id, at, dhash, source)
    select x ->> 'video_path', split_part(x ->> 'video_path', '/', 1)::uuid,
           coalesce((select m.member_no from public.kr8_members m where m.user_id = split_part(x ->> 'video_path', '/', 1)::uuid),
                    (select max(c.member_no_copy) from public.kr8_reward_claims c where c.member_id = split_part(x ->> 'video_path', '/', 1)::uuid)),
           (select p.id from public.kr8_posts p where p.video_path = x ->> 'video_path' limit 1),
           left(x ->> 'at', 20), ('x' || lower(x ->> 'h'))::bit(64)::bigint, 'backfill'
      from jsonb_array_elements(p_rows) x
     where (x ->> 'h') ~* '^[0-9a-f]{16}$' and split_part(x ->> 'video_path', '/', 1) ~* '^[0-9a-f-]{36}$'
    on conflict (video_path, at) do nothing returning 1)
  select count(*)::int from ins
$$;
revoke all on function public.kr8_reel_prints_add(jsonb) from public, anon, authenticated;
grant execute on function public.kr8_reel_prints_add(jsonb) to service_role;

-- Feed quality: a re-used clip is a 'looks copied' reason (same as a watermark)
CREATE OR REPLACE FUNCTION public.kr8_reel_quality_calc(p_post uuid, OUT score integer, OUT suggest text, OUT reasons text[])
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  q public.kr8_reel_quality; p public.kr8_posts; fr jsonb; n int;
  b numeric; s numeric; person boolean; face_clear boolean; home_n int; place boolean; dur numeric; vert boolean; bars_n int; sbar boolean;
  sc int := 0; rs text[] := '{}'; ck text; wm text; app text; ru public.kr8_reel_reuse;
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
  -- 0165: same clip as another member's video, or another member's face and never the poster's
  select * into ru from public.kr8_reel_reuse where post_id = p_post;
  if ru.post_id is not null and (ck is null or ck = 'handle_only') then
    ck := 'reused';
    wm := case when ru.other_member_no is null then 'a deleted member' else format('#%s %s', ru.other_member_no, coalesce(ru.other_name, '')) end
          || case when ru.other_gone and ru.other_member_no is not null then ' (deleted)' else '' end;
  end if;
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
  if ck in ('app_watermark', 'stock_watermark', 'ai_watermark', 'screen_recording', 'reused') then
    sc := least(sc, 10);
    rs := array[case ck when 'app_watermark' then format('looks copied from %s (watermark ''%s'')', coalesce(app, 'another app'), left(coalesce(wm, ''), 30))
                        when 'stock_watermark' then format('stock video, not filmed by them (''%s'')', left(coalesce(wm, ''), 30))
                        when 'screen_recording' then 'screen recording of another app (phone status bar on the video)'
                        when 'reused' then case ru.kind when 'same_clip' then format('looks copied: same clip as %s''s Reel', wm)
                                                        else format('looks copied: the person in it is %s, not them', wm) end
                        else format('AI-made video (''%s'')', left(coalesce(wm, ''), 30)) end] || rs;
  end if;
  score := greatest(0, least(100, sc));

  -- suggestion: copied / too dark / blurry → Not yet (ask for their own, clearer video); no person or at home → Profile only;
  -- otherwise Feed when the score is good enough
  suggest := case when ck in ('app_watermark', 'stock_watermark', 'ai_watermark', 'screen_recording', 'reused') then 'not_yet'
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
