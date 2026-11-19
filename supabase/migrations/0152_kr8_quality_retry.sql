-- 0152 (19 Nov 2026): Feed quality — read a Reel once more when its first read had fewer than 3 pictures (the scan frames
-- the phone uploads can land a little after the video), at most once, 10+ minutes after it was posted.
create or replace function public.kr8_quality_todo(p_reels int default 6, p_people int default 8, p_post uuid default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'video_path', x.video_path, 'poster_path', x.poster_path)) from (
        select p.id, p.video_path, p.poster_path from public.kr8_posts p
          left join public.kr8_reel_quality q on q.post_id = p.id
         where p.kind = 'reel' and not p.hidden and p.status in ('pending', 'approved')
           and (p_post is null or p.id = p_post)
           and (p_post is not null or (p.created_at < now() - interval '2 minutes'
                and (q.post_id is null
                     or (q.frames < 3 and p.video_path is not null and coalesce((q.features ->> 'retried')::boolean, false) = false
                         and p.created_at < now() - interval '10 minutes'))))
         order by (q.post_id is null) desc, p.created_at desc limit least(greatest(coalesce(p_reels, 6), 0), 12)) x), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('user_id', y.user_id, 'photo', y.photo, 'md5', y.md5)) from (
        select m.user_id, m.photo, md5(coalesce(m.photo, '')) md5 from public.kr8_members m
         where p_post is null and m.photo is not null and m.photo !~ '^https://kringapp\.com/'
           and not exists (select 1 from public.kr8_people_quality q where q.user_id = m.user_id and q.photo_md5 = md5(m.photo))
         order by m.updated_at desc limit least(greatest(coalesce(p_people, 8), 0), 20)) y), '[]'::jsonb))
$$;
revoke all on function public.kr8_quality_todo(int, int, uuid) from public, anon, authenticated;

-- a second read is marked, so a Reel without scan frames is not read every 5 minutes
create or replace function public.kr8_reel_quality_record(p_post uuid, p_features jsonb, p_copy jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f jsonb := coalesce(p_features, '{}'::jsonb) || jsonb_build_object('copy', coalesce(p_copy, '{}'::jsonb) - 'evidence');
        n int := jsonb_array_length(coalesce(p_features -> 'frames', '[]'::jsonb)); r record;
begin
  insert into public.kr8_reel_quality (post_id, scanned_at, frames, features) values (p_post, now(), n, f)
  on conflict (post_id) do update set scanned_at = now(), frames = excluded.frames,
    features = excluded.features || jsonb_build_object('retried', true);
  perform public.kr8_reel_quality_rescore(p_post);
  if to_regprocedure('public.kr8_reel_copy_record(uuid,boolean,text,text,text,jsonb,integer)') is not null then
    perform public.kr8_reel_copy_record(p_post, coalesce((p_copy ->> 'copied')::boolean, false), p_copy ->> 'kind', p_copy ->> 'watermark',
                                        p_copy ->> 'app', coalesce(p_copy -> 'evidence', '[]'::jsonb), n);
  end if;
  select score, suggest, reasons into r from public.kr8_reel_quality where post_id = p_post;
  return jsonb_build_object('score', r.score, 'suggest', r.suggest, 'reasons', r.reasons);
end $$;
revoke all on function public.kr8_reel_quality_record(uuid, jsonb, jsonb) from public, anon, authenticated;

-- first pass (19 Nov): Reels read before their scan frames were uploaded are read again
delete from public.kr8_reel_quality where frames < 3;
