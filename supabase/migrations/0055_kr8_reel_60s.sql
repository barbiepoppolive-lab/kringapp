-- 0055 · Reels can be 5–60 seconds (founder decision, 15 Nov 2026; was 5–30).
--
-- 1. kr8_posts: new check kr8_posts_duration_ms_60s (duration_ms null or 4500–61000), added NOT VALID, then the old
--    kr8_posts_duration_ms_check (4500–31000) is dropped, in one transaction. Existing rows are all ≤ 31000, so they pass.
--    (Run the optional VALIDATE at the bottom any time later; it only reads.)
-- 2. kr8_create_reel: same function, same arguments and return type, copied from the LIVE definition (15 Nov) with one
--    change: the length check 31000 → 61000.
-- Not changed (checked): storage bucket kr8-reels stays 50 MB (52428800). The app re-records clips at ~2 Mbit/s video +
-- 96 kbit/s sound, so 60 s ≈ 16 MB; the original-file path is only used when it is already ≤ 50 MB. No edge function checks length.
--
-- APPLY ONLY TOGETHER WITH (or before) the app build that allows 60 s; until then the app shows
-- "Reels can be up to 30 seconds for now" for 31–60 s clips.
-- UNDO: begin; alter table public.kr8_posts add constraint kr8_posts_duration_ms_check check (duration_ms is null or duration_ms between 4500 and 31000) not valid;
--       alter table public.kr8_posts drop constraint kr8_posts_duration_ms_60s; (and re-run kr8_create_reel with 31000) commit;
--       (only if no Reel longer than 31 s was posted meanwhile)

begin;

alter table public.kr8_posts add constraint kr8_posts_duration_ms_60s
  check (duration_ms is null or duration_ms between 4500 and 61000) not valid;
alter table public.kr8_posts drop constraint if exists kr8_posts_duration_ms_check;

CREATE OR REPLACE FUNCTION public.kr8_create_reel(p_video_path text, p_poster_path text, p_duration_ms integer, p_width integer, p_height integer, p_area text, p_body text DEFAULT NULL::text, p_here boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); n int; v_size bigint; v_mime text; v_status text; pid uuid; approved_n int; hidden_n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_area is null or not public.kr8_area_ok(p_area) then raise exception 'KR8_BAD_AREA'; end if;   -- area pin is required
  if coalesce(btrim(p_body), '') <> '' and not public.kr8_text_ok(p_body, 280) then raise exception 'KR8_BAD_TEXT'; end if;
  if p_duration_ms is null or p_duration_ms not between 4500 and 61000 then raise exception 'KR8_REEL_LENGTH'; end if;
  if p_width is null or p_height is null or p_height <= p_width then raise exception 'KR8_REEL_VERTICAL'; end if;
  if p_video_path is null or split_part(p_video_path, '/', 1) <> uid::text
     or p_video_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm|mov)$' then raise exception 'KR8_REEL_FILE'; end if;
  if p_poster_path is null or split_part(p_poster_path, '/', 1) <> uid::text
     or p_poster_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then raise exception 'KR8_REEL_FILE'; end if;
  if to_regclass('storage.objects') is not null then
    execute $q$select (metadata->>'size')::bigint, metadata->>'mimetype' from storage.objects
               where bucket_id = 'kr8-reels' and name = $1$q$ into v_size, v_mime using p_video_path;
    if v_mime is null or v_mime !~ '^video/' or coalesce(v_size, 0) > 52428800 then raise exception 'KR8_REEL_FILE'; end if;
    execute $q$select metadata->>'mimetype' from storage.objects where bucket_id = 'kr8-reels' and name = $1$q$ into v_mime using p_poster_path;
    if v_mime is distinct from 'image/jpeg' then raise exception 'KR8_REEL_FILE'; end if;
  end if;
  if exists (select 1 from public.kr8_posts where video_path = p_video_path) then raise exception 'KR8_REEL_FILE'; end if;
  select count(*) into n from public.kr8_posts where author = uid and kind = 'reel' and created_at > now() - interval '1 day';
  if n >= 10 then raise exception 'KR8_SLOW_DOWN'; end if;

  -- trusted creators (3+ approved Reels, none hidden) go straight to the feed; everyone else waits for review
  select count(*) filter (where status = 'approved' and not hidden), count(*) filter (where status = 'hidden' or hidden)
    into approved_n, hidden_n from public.kr8_posts where author = uid and kind = 'reel';
  v_status := case when approved_n >= 3 and hidden_n = 0 then 'approved' else 'pending' end;

  insert into public.kr8_posts (author, kind, area, body, video_path, poster_path, duration_ms, width, height, status, here_until)
  values (uid, 'reel', p_area, coalesce(btrim(p_body), ''), p_video_path, p_poster_path, p_duration_ms, p_width, p_height, v_status,
          case when p_here then now() + interval '2 hours' end)
  returning id into pid;
  return jsonb_build_object('id', pid, 'status', v_status);
end $function$

;

commit;

-- optional, later (reads every Reel row once, takes no write lock):
-- alter table public.kr8_posts validate constraint kr8_posts_duration_ms_60s;
