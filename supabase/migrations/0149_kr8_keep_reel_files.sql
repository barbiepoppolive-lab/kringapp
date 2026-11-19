-- 0149 (19 Nov 2026, PROPOSAL — NOT applied): keep the video files of hidden / flagged Reels (evidence for the founder).
--
-- What deletes Reel files today (19 Nov audit; no cron job deletes a hidden Reel whose row is still there):
--  a) "Delete my account" in the app (v5DeleteMe, src/v8/v5Live.ts): the phone deletes every video + poster in
--     kr8_my_reel_files() straight from Storage (hidden Reels included), then kr8_delete_me2 queues the rest of the member's
--     kr8-reels folder in kr8_storage_trash.
--  b) The admin page's trash sweep (src/venue/adminV2.ts, kr8_admin_storage_trash): removes every queued kr8-reels file.
--  c) The self-fix robot (kr8_robot_self_fix_run, part E): queues kr8-reels files no kr8_posts row points at (after an
--     account is deleted its rows are gone) → b) deletes them.
--  d) Storage policy kr8_reels_owner_delete: any member can delete their own Reel files with the Storage API at any time.
--  (kr8-cleanup, the nightly edge function, only removes kr8-verify / kr8-passport files: not Reels.)
--
-- THE ONE-LINE FIX (b): the trash sweep never removes Reel videos or posters (the 0148 scan frames <video>.s1/.s2.jpg may go):
create or replace function public.kr8_admin_storage_trash()
returns table(id uuid, bucket text, name text) language plpgsql stable security definer set search_path = public, pg_temp as $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query select t.id, t.bucket, t.name from public.kr8_storage_trash t
   where t.removed_at is null and t.bucket <> 'kr8-verify'
     and (t.bucket <> 'kr8-reels' or t.name ~ '\.s[12]\.jpg$')   -- 0149: keep Reel videos + posters
   order by t.queued_at limit 500;
end $function$;

-- (a) the phone no longer deletes the files of hidden / copied Reels when a member deletes their account
create or replace function public.kr8_my_reel_files()
returns text[] language sql stable security definer set search_path = public, pg_temp as $function$
  select coalesce(array_agg(x), '{}') from (
    select video_path as x from public.kr8_posts p where author = auth.uid() and video_path is not null
       and not p.hidden and p.status <> 'hidden' and not exists (select 1 from public.kr8_reel_copy_checks c where c.post_id = p.id and c.copied)
    union select poster_path from public.kr8_posts p where author = auth.uid() and poster_path is not null
       and not p.hidden and p.status <> 'hidden' and not exists (select 1 from public.kr8_reel_copy_checks c where c.post_id = p.id and c.copied)
  ) f
$function$;

-- (d) a member cannot delete the files of their own hidden / copied Reel through the Storage API
drop policy if exists kr8_reels_owner_delete on storage.objects;
create policy kr8_reels_owner_delete on storage.objects for delete to authenticated using (
  bucket_id = 'kr8-reels' and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (select 1 from public.kr8_posts p
                   where (p.hidden or p.status = 'hidden' or exists (select 1 from public.kr8_reel_copy_checks c where c.post_id = p.id and c.copied))
                     and storage.objects.name in (p.video_path, p.poster_path)));
-- Note (PDPA): with (b) the Reel files of a deleted account stay in the private bucket. If the founder wants only flagged
-- Reels kept, keep (a) + (d) and narrow (b) to files listed in a keep list instead.
