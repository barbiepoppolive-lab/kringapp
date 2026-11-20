CREATE OR REPLACE FUNCTION public.kr8_admin_v2_snapshot(p_include_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with acc as materialized (
    select u.id as user_id, public.kr8_admin_v2_kind(u.id) as kind, u.created_at as auth_at, u.email
    from auth.users u
    union all
    select m.user_id, public.kr8_admin_v2_kind(m.user_id), m.created_at, null
    from public.kr8_members m where not exists (select 1 from auth.users u where u.id = m.user_id)
  ),
  shown as materialized (select * from acc where p_include_test or kind in ('real', 'nocard')),
  lk as materialized (
    select l.a, l.b, l.reason, l.detail, l.first_at from public.kr8_account_links l
    where l.dismissed_at is null and l.a in (select user_id from shown) and l.b in (select user_id from shown)
      -- 0169 (20 Nov): a 'same phone' link is settled by the face robot (0168), never a founder card
      and l.reason <> 'device'
  ),
  cl as materialized (
    select c.*, h.reason as hold_reason, h.decided, h.decided_at, h.face_dist, h.detail as hold_detail
    from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id
    where (p_include_test or not c.is_test) and (c.member_id is null or c.member_id in (select user_id from shown))
  ),
  -- T-398 [A-02]: single O(N) pass for invite refs + single O(N) pass for Reel counts instead of O(N^2) per-member subqueries
  ref_agg as materialized (
    select substring(lower(r.ref_code) from 2)::int as inviter_no, count(*)::int as cnt
      from public.kr8_members r
     where lower(coalesce(r.ref_code, '')) ~ '^k0*[0-9]{1,7}$'
     group by 1
  ),
  reel_agg as materialized (
    select x.author,
           count(*) filter (where x.status = 'approved' and not x.hidden)::int as live,
           count(*) filter (where x.status = 'pending' and not x.hidden)::int as waiting,
           count(*) filter (where x.status = 'hidden' or x.hidden)::int as hidden,
           count(*) filter (where x.board_off and x.status = 'approved' and not x.hidden)::int as board_off,
           max(x.board_off_reason) as board_off_reason
      from public.kr8_posts x
     where x.kind = 'reel' and x.author in (select user_id from shown)
     group by x.author
  ),
  board as materialized (select b.* from public.kr8_week_board(w0, false) b),
  sc as materialized (
    select s.author, sum(s.l_local + s.l_trav)::int as likes, sum(s.s_local + s.s_trav)::int as saves, sum(s.opens)::int as opens, sum(s.score)::int as score
    from public.kr8_reel_scores(w0, w0 + interval '7 days', now(), false) s group by s.author
  ),
  ver as materialized (
    select distinct on (v.user_id) v.user_id, v.id, v.status, v.created_at, v.live_check ->> 'auto' as auto, v.reject_reason,
           case when v.selfie_deleted_at is null then v.selfie_path end as selfie_path
    from public.kr8_verifications v order by v.user_id, v.created_at desc
  ),
  ppl as (
    select a.user_id, a.kind, m.member_no, coalesce(m.first_name, '') as first_name, m.who, m.area, coalesce(m.created_at, a.auth_at) as joined_at,
           m.last_active_at, nullif(m.ref_code, '') as ref_code, nullif(m.src_code, '') as src_code, coalesce(m.verified, false) as verified,
           m.ig_handle, m.tiktok_handle, (m.photo is not null and m.photo <> '') as has_photo, m.photo_check,
           case when m.user_id is null and a.email is not null then left(split_part(a.email, '@', 1), 2) || '…@' || split_part(a.email, '@', 2) end as email_hint,
           exists (select 1 from public.kr8_line_links k where k.user_id = a.user_id) as line
    from shown a left join public.kr8_members m on m.user_id = a.user_id
  )
  select jsonb_build_object(
    'at', now(), 'day_start', d0, 'week_start', w0, 'include_test', p_include_test,
    'counts', (select jsonb_build_object(
        'real', count(*) filter (where kind = 'real'),
        'real_today', count(*) filter (where kind = 'real' and m.created_at >= d0),
        'test', count(*) filter (where kind = 'test'), 'team', count(*) filter (where kind = 'team'),
        'ghost', count(*) filter (where kind = 'ghost'), 'admin', count(*) filter (where kind = 'admin'),
        'nocard', count(*) filter (where kind = 'nocard'))
        from acc a left join public.kr8_members m on m.user_id = a.user_id),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'kind', p.kind, 'no', p.member_no, 'name', p.first_name, 'who', p.who, 'area', p.area,
        'joined_at', p.joined_at, 'last_active_at', p.last_active_at, 'ref', p.ref_code, 'src', p.src_code, 'verified', p.verified,
        'ig', p.ig_handle, 'tt', p.tiktok_handle, 'has_photo', p.has_photo, 'photo_check', p.photo_check, 'email_hint', p.email_hint, 'line', p.line,
        'trust', case when p.kind in ('nocard', 'admin', 'team') then null else public.kr8_trust(p.user_id) end,
        'check', (select jsonb_build_object('id', v.id, 'status', v.status, 'at', v.created_at, 'auto', v.auto, 'reason', v.reject_reason, 'selfie_path', v.selfie_path) from ver v where v.user_id = p.user_id),
        'reels', jsonb_build_object(
                    'live', coalesce(ra.live, 0),
                    'waiting', coalesce(ra.waiting, 0),
                    'hidden', coalesce(ra.hidden, 0),
                    'board_off', coalesce(ra.board_off, 0),
                    'board_off_reason', ra.board_off_reason),
        'claims', (select jsonb_build_object('n', count(*), 'paid', count(*) filter (where c.status = 'assigned'),
                    'held', count(*) filter (where c.held and c.status = 'pending'), 'thb', coalesce(sum(c.amount_thb) filter (where c.status = 'assigned'), 0),
                    'first_at', min(c.created_at))
                   from cl c where c.member_id = p.user_id),
        'links', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'no', om.member_no, 'name', om.first_name, 'reason', l.reason,
                    'dist', (l.detail ->> 'dist')::real, 'sface_sim', (l.detail ->> 'sface_sim')::real, 'at', l.first_at) order by l.first_at)
                  from lk l cross join lateral (select case when l.a = p.user_id then l.b else l.a end as user_id) o
                  left join public.kr8_members om on om.user_id = o.user_id
                  where p.user_id in (l.a, l.b)), '[]'::jsonb),
        'shared_net', (select count(distinct c2.member_id) from cl c1 join cl c2 on c2.member_id <> c1.member_id
                        and ((c1.ip_hash is not null and c1.ip_hash = c2.ip_hash) or (c1.device is not null and c1.device = c2.device))
                       where c1.member_id = p.user_id),
        'refs', coalesce(rf.cnt, 0),
        'board', (select jsonb_build_object('rank', b.rk, 'rings', b.rings) from board b where b.member_id = p.user_id),
        'score', (select jsonb_build_object('likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'score', s.score) from sc s where s.author = p.user_id)
      ) order by p.joined_at desc)
      from ppl p
      left join reel_agg ra on ra.author = p.user_id
      left join ref_agg rf on rf.inviter_no = p.member_no), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.member_id, 'no', coalesce(m.member_no, c.member_no_copy), 'name', m.first_name, 'brand', c.brand, 'amount', c.amount_thb,
        'status', c.status, 'held', c.held, 'used', c.used_at is not null, 'created_at', c.created_at, 'assigned_at', c.assigned_at, 'is_test', c.is_test,
        'hold_reason', c.hold_reason, 'decided', c.decided, 'decided_at', c.decided_at, 'face_dist', c.face_dist,
        'hold_others', c.hold_detail -> 'others', 'joined_at', m.created_at,
        'prize', (select jsonb_build_object('kind', z.kind, 'week', z.week, 'rank', z.rank) from public.kr8_prizes z where z.id = c.prize_id)
      ) order by c.created_at desc) from cl c left join public.kr8_members m on m.user_id = c.member_id), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('brand', k.brand, 'amount', k.amount_thb, 'available', k.av, 'assigned', k.asg, 'used', k.used) order by k.brand, k.amount_thb desc)
        from (select brand, amount_thb, count(*) filter (where status = 'available')::int av, count(*) filter (where status = 'assigned')::int asg,
                     count(*) filter (where status not in ('available', 'assigned'))::int used
              from public.kr8_reward_codes where p_include_test or not is_test group by 1, 2) k), '[]'::jsonb),
    'board', jsonb_build_object('week_start', w0, 'paid_ranks', public.kr8_paid_ranks(), 'floor', public.kr8_rcfg('min_rings_for_paid_seat', 25),
        'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rk, 'user_id', b.member_id, 'rings', b.rings, 'prize', public.kr8_prize_for(b.rk),
                     'likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'is_new', m.created_at >= w0, 'no', m.member_no, 'name', m.first_name) order by b.rk)
                   from board b left join sc s on s.author = b.member_id left join public.kr8_members m on m.user_id = b.member_id where b.rk <= 20), '[]'::jsonb)),
    'pending', jsonb_build_object(
        'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.author, 'at', x.created_at, 'poster_path', x.poster_path, 'video_path', x.video_path, 'body', left(x.body, 140)) order by x.created_at)
                   from public.kr8_posts x where x.kind = 'reel' and x.status = 'pending' and not x.hidden and x.author in (select user_id from shown)), '[]'::jsonb),
        'checks', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'user_id', v.user_id, 'at', v.created_at, 'auto', v.live_check ->> 'auto',
                     'review', v.live_check -> 'review', 'selfie_path', v.selfie_path) order by v.created_at)
                   from public.kr8_verifications v where v.status = 'pending' and v.user_id in (select user_id from shown)), '[]'::jsonb),
        'reports', (select count(*) from public.kr8_reports t where t.handled_at is null),
        'places', (select count(*) from public.kr8_places pl where pl.status = 'pending')),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('kind', o.kind, 'subject', o.subject, 'at', o.created_at, 'sent', o.sent_at is not null, 'error', o.last_error) order by o.created_at desc)
        from (select * from public.kr8_outbox order by created_at desc limit 20) o), '[]'::jsonb),
    'dups_auto', public.kr8_admin_dups_auto(14),
    'autopilot', jsonb_build_object(
        'paused', public.kr8_autopilot_paused(),
        'actions_today', (select count(*)::int from public.kr8_robot_log l where not l.dry_run and l.at >= d0),
        'dry_runs_today', (select count(*)::int from public.kr8_robot_log l where l.dry_run and l.at >= d0),
        'stale_heartbeats', (
          select count(*)::int
            from public.kr8_heartbeat h
            left join public.kr8_robot r2 on r2.name = regexp_replace(h.job, '^kr8_', '')
           where not public.kr8_autopilot_paused()
             and h.job not in ('health_watch', 'kr8_health_watch')
             and not (h.job in ('kr8_nightly_selftest', 'nightly_selftest') and coalesce(r2.mode, 'dry_run') <> 'on')
             and coalesce(r2.mode, 'on') <> 'off'
             and ((h.last_beat is not null and h.last_beat < now() - make_interval(secs => greatest(h.every_sec * 2, 1800)))
                  or h.last_ok = false)
        ))
  ) into r;
  return r;
end $function$;
