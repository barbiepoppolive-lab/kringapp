-- 0137 (19 Nov): Reels whose video file is gone stop counting, and the founder gets a red alert.
-- Reels are uploaded into Kring (Storage bucket kr8-reels), not Instagram/TikTok links. The app has no "delete one Reel" button,
-- but the Storage rule kr8_reels_owner_delete lets a member delete their own video file straight through the Storage API
-- (that is how "delete my account" removes videos). So a member could delete the video after approval / after a prize claim
-- and the Reel would keep its place and its Rings with nothing to watch. On 19 Nov one approved, visible Reel already has no file
-- (#24 Joob, post e99b93d2, posted 16 Nov: last week, so this week's board is unaffected).
-- Daily robot "reel_file_watch" (23:43 Bangkok, before the Monday 00:01 week close): every approved, visible Reel whose video
-- file is missing is hidden (hidden = true, board_off = true, board_off_reason = 'video_missing') so it leaves the feed and the
-- board, and a red admin alert names the member. Every hide is logged with its undo in kr8_robot_log.
-- Mode: kr8_robot 'reel_file_watch' (on / dry_run = alert only / off). Starts ON (anti-fraud checks run without the founder).
-- Rollback: select cron.unschedule('kr8_reel_file_watch'); update public.kr8_robot set mode = 'off'
--   where name = 'reel_file_watch'; undo a hide: update public.kr8_posts set hidden = false, board_off = false, board_off_reason = null where id = '<post>'.

insert into public.kr8_robot (name, title, note, schedule, mode, daily_cap) values
  ('reel_file_watch', 'Reel video watch', 'Daily: an approved Reel whose video file was deleted is hidden (off the feed and the board) and raises a red alert.',
   '43 16 * * *', 'on', 50)
on conflict (name) do update set title = excluded.title, note = excluded.note, schedule = excluded.schedule;

create or replace function public.kr8_reel_file_watch_run() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare mode text := public.kr8_robot_can_act('reel_file_watch'); r record; n_found int := 0; n_hid int := 0;
begin
  if mode = 'off' then return jsonb_build_object('mode', mode, 'found', 0, 'hidden', 0); end if;
  for r in
    select p.id, p.author, p.video_path, p.board_off, p.board_off_reason, p.created_at, m.member_no, m.first_name
    from public.kr8_posts p left join public.kr8_members m on m.user_id = p.author
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden and coalesce(p.video_path, '') <> ''
      and p.created_at < now() - interval '1 hour'
      and not exists (select 1 from storage.objects o where o.bucket_id = 'kr8-reels' and o.name = p.video_path)
    order by p.created_at
  loop
    n_found := n_found + 1;
    if mode = 'on' then
      update public.kr8_posts set hidden = true, board_off = true, board_off_reason = 'video_missing' where id = r.id and not hidden;
      n_hid := n_hid + 1;
    end if;
    perform public.kr8_robot_record('reel_file_watch', case when mode = 'on' then 'hid_reel_video_missing' else 'would_hide_reel_video_missing' end,
      r.id::text,
      jsonb_build_object('member_no', r.member_no, 'video_path', r.video_path, 'posted_at', r.created_at),
      jsonb_build_object('sql', format('update public.kr8_posts set hidden = false, board_off = %L, board_off_reason = %L where id = %L',
                                       r.board_off, r.board_off_reason, r.id)),
      mode <> 'on');
    perform public.kr8_alert_raise('reel_gone:' || r.id, 'reel_file_watch', 'red',
      format('Reel video deleted · #%s %s', coalesce(r.member_no::text, '?'), coalesce(r.first_name, '')),
      format('The video of this approved Reel (posted %s) is no longer in Kring. %s Check whether a prize was claimed with it.',
             to_char(r.created_at at time zone 'Asia/Bangkok', 'DD Mon'),
             case when mode = 'on' then 'It was hidden and its Rings no longer count.' else 'Dry run: nothing was hidden.' end),
      '#inbox',
      jsonb_build_object('post_id', r.id, 'member_no', r.member_no, 'video_path', r.video_path, 'hidden', mode = 'on'));
  end loop;
  perform public.kr8_robot_beat('reel_file_watch', true,
    jsonb_build_object('note', format('%s Reel(s) without a video, %s hidden', n_found, n_hid), 'found', n_found, 'hidden', n_hid), 86400);
  return jsonb_build_object('mode', mode, 'found', n_found, 'hidden', n_hid);
end $$;
revoke all on function public.kr8_reel_file_watch_run() from public, anon, authenticated;

select public.kr8_schedule_job('kr8_reel_file_watch', '43 16 * * *', 'select public.kr8_reel_file_watch_run()');
