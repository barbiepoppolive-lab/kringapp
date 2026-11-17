-- 0082 · Admin v2 (17 Nov 2026): one snapshot that every new admin screen reads, so Today, Needs you, People, Money and Board
--        can never disagree with each other ("so confusing, non updated, multiple entries" — founder, 17 Nov).
--
-- READ-ONLY and ADDITIVE. Nothing is dropped, renamed or written. No table, trigger, policy or existing function changes.
--   · kr8_admin_v2_kind(uuid)            internal: 'real' | 'test' | 'team' | 'ghost' | 'admin' | 'nocard'
--   · kr8_admin_v2_snapshot(bool)        everything the panel shows (no photos), real members only unless p_include_test
--   · kr8_admin_v2_photos(uuid[])        card photos for up to 80 people (fetched once, cached on the phone)
--   · kr8_admin_v2_member(uuid)          the member 360 page (Reels, Rings, claims, referrals, links, consents, checks, admin history)
--   · kr8_admin_v2_activity(int, bool)   one activity log, newest first (sign-ups, Reels, checks, claims, look-alikes, admin actions)
-- Every function starts with kr8_is_admin() (staff admin or a confirmed kr8_admin_emails address, read from the caller's sign-in).
-- Unlike kr8_admin_dup_overview it does NOT call kr8_refresh_links (that one writes); the panel only reads.
-- Writes stay on the existing admin RPCs (kr8_admin_release_claim, kr8_admin_refuse_claim, kr8_admin_dup_resolve,
-- kr8_admin_review_verification, kr8_admin_review_reel).
--
-- "Real member" = has a card, not kr8_is_test_member, not kr8_is_team (Kring Team), not ghost. Same rule everywhere.
-- Days are India days (Asia/Kolkata) for the founder; prize weeks stay Bangkok Mondays (kr8_week_start).
--
-- UNDO: drop function public.kr8_admin_v2_activity(int, boolean), public.kr8_admin_v2_member(uuid),
--       public.kr8_admin_v2_photos(uuid[]), public.kr8_admin_v2_snapshot(boolean), public.kr8_admin_v2_kind(uuid);

begin;

create or replace function public.kr8_admin_v2_kind(p uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not exists (select 1 from public.kr8_members m where m.user_id = p) then
      case when exists (select 1 from public.kr6_staff s where s.user_id = p and s.role = 'admin')
             or exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = p)
           then 'admin' else 'nocard' end
    when public.kr8_is_team(p) then 'team'
    when public.kr8_is_test_member(p) then 'test'
    when exists (select 1 from public.kr8_members g where g.user_id = p and g.ghost) then 'ghost'
    else 'real' end
$$;
revoke all on function public.kr8_admin_v2_kind(uuid) from public, anon, authenticated;

-- ───────────────────────── the snapshot ─────────────────────────
create or replace function public.kr8_admin_v2_snapshot(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with acc as materialized (
    select u.id as user_id, public.kr8_admin_v2_kind(u.id) as kind, u.created_at as auth_at, u.email
    from auth.users u
    union all   -- a card whose sign-in is gone (deleted login) still shows
    select m.user_id, public.kr8_admin_v2_kind(m.user_id), m.created_at, null
    from public.kr8_members m where not exists (select 1 from auth.users u where u.id = m.user_id)
  ),
  shown as materialized (select * from acc where p_include_test or kind in ('real', 'nocard')),
  lk as materialized (
    select l.a, l.b, l.reason, l.detail, l.first_at from public.kr8_account_links l
    where l.dismissed_at is null and l.a in (select user_id from shown) and l.b in (select user_id from shown)
  ),
  cl as materialized (
    select c.*, h.reason as hold_reason, h.decided, h.decided_at, h.face_dist, h.detail as hold_detail
    from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id
    where (p_include_test or not c.is_test) and (c.member_id is null or c.member_id in (select user_id from shown))
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
        'check', (select jsonb_build_object('id', v.id, 'status', v.status, 'at', v.created_at, 'auto', v.auto, 'reason', v.reject_reason, 'selfie_path', v.selfie_path) from ver v where v.user_id = p.user_id),
        'reels', (select jsonb_build_object(
                    'live', count(*) filter (where x.status = 'approved' and not x.hidden),
                    'waiting', count(*) filter (where x.status = 'pending' and not x.hidden),
                    'hidden', count(*) filter (where x.status = 'hidden' or x.hidden),
                    'board_off', count(*) filter (where x.board_off and x.status = 'approved' and not x.hidden),
                    'board_off_reason', max(x.board_off_reason))
                  from public.kr8_posts x where x.author = p.user_id and x.kind = 'reel'),
        'claims', (select jsonb_build_object('n', count(*), 'paid', count(*) filter (where c.status = 'assigned'),
                    'held', count(*) filter (where c.held and c.status = 'pending'), 'thb', coalesce(sum(c.amount_thb) filter (where c.status = 'assigned'), 0),
                    'first_at', min(c.created_at))
                   from cl c where c.member_id = p.user_id),
        'links', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'no', om.member_no, 'name', om.first_name, 'reason', l.reason,
                    'dist', (l.detail ->> 'dist')::real, 'at', l.first_at) order by l.first_at)
                  from lk l cross join lateral (select case when l.a = p.user_id then l.b else l.a end as user_id) o
                  left join public.kr8_members om on om.user_id = o.user_id
                  where p.user_id in (l.a, l.b)), '[]'::jsonb),
        'shared_net', (select count(distinct c2.member_id) from cl c1 join cl c2 on c2.member_id <> c1.member_id
                        and ((c1.ip_hash is not null and c1.ip_hash = c2.ip_hash) or (c1.device is not null and c1.device = c2.device))
                       where c1.member_id = p.user_id),
        'refs', (select count(*) from public.kr8_members r where p.member_no is not null and lower(coalesce(r.ref_code, '')) ~ ('^k0*' || p.member_no || '$')),
        'board', (select jsonb_build_object('rank', b.rk, 'rings', b.rings) from board b where b.member_id = p.user_id),
        'score', (select jsonb_build_object('likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'score', s.score) from sc s where s.author = p.user_id)
      ) order by p.joined_at desc) from ppl p), '[]'::jsonb),
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
        from (select * from public.kr8_outbox order by created_at desc limit 20) o), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_v2_snapshot(boolean) from public, anon;
grant execute on function public.kr8_admin_v2_snapshot(boolean) to authenticated;

-- ───────────────────────── photos (once, cached) ─────────────────────────
create or replace function public.kr8_admin_v2_photos(p_users uuid[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_object_agg(m.user_id, m.photo) from public.kr8_members m
                   where m.user_id = any ((coalesce(p_users, '{}'))[1:80]) and m.photo is not null and m.photo <> ''), '{}'::jsonb);
end $$;
revoke all on function public.kr8_admin_v2_photos(uuid[]) from public, anon;
grant execute on function public.kr8_admin_v2_photos(uuid[]) to authenticated;

-- ───────────────────────── member 360 ─────────────────────────
create or replace function public.kr8_admin_v2_member(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.kr8_members; w0 timestamptz := public.kr8_week_start(now()); r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into m from public.kr8_members where user_id = p_user;
  select jsonb_build_object(
    'user_id', p_user, 'kind', public.kr8_admin_v2_kind(p_user),
    'card', case when m.user_id is null then null else jsonb_build_object('no', m.member_no, 'name', m.first_name, 'photo', nullif(m.photo, ''), 'who', m.who,
            'area', m.area, 'bio', m.bio, 'langs', to_jsonb(m.langs), 'interests', to_jsonb(m.interests), 'gender', m.gender, 'show_gender', m.show_gender,
            'ig', m.ig_handle, 'tt', m.tiktok_handle, 'verified', m.verified, 'photo_check', m.photo_check, 'ref', m.ref_code, 'src', m.src_code,
            'joined_at', m.created_at, 'last_active_at', m.last_active_at, 'age_ok_at', m.age_ok_at, 'ghost', m.ghost) end,
    'email_hint', (select left(split_part(u.email, '@', 1), 2) || '…@' || split_part(u.email, '@', 2) from auth.users u where u.id = p_user),
    'signed_up_at', (select u.created_at from auth.users u where u.id = p_user),
    'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = p_user),
    'line', exists (select 1 from public.kr8_line_links k where k.user_id = p_user),
    'consents', jsonb_build_object('terms_version', m.terms_version, 'terms_at', m.terms_accepted_at, 'promo_ok', m.promo_ok, 'promo_at', m.promo_ok_at,
            'web_reels', m.web_reels, 'web_reels_at', m.web_reels_at,
            'log', coalesce((select jsonb_agg(jsonb_build_object('at', t.at, 'version', t.terms_version, 'kind', t.kind, 'promo', t.promo, 'source', t.source) order by t.at desc)
                    from public.kr8_terms_log t where t.user_id = p_user), '[]'::jsonb)),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'hidden', x.hidden, 'board_off', x.board_off, 'board_off_reason', x.board_off_reason,
            'likes', x.likes_count, 'saves', x.saves_count, 'shares', x.shares_count, 'views', x.views_count, 'at', x.created_at, 'poster_path', x.poster_path,
            'reviewed_at', x.reviewed_at, 'note', x.review_note) order by x.created_at desc)
            from public.kr8_posts x where x.author = p_user and x.kind = 'reel'), '[]'::jsonb),
    'rings_week', (select jsonb_build_object('likes', sum(s.l_local + s.l_trav), 'saves', sum(s.s_local + s.s_trav), 'opens', sum(s.opens), 'score', sum(s.score))
            from public.kr8_reel_scores(w0, w0 + interval '7 days', now(), false, p_user) s),
    'board', (select jsonb_build_object('rank', b.rk, 'rings', b.rings) from public.kr8_week_board(w0, false) b where b.member_id = p_user),
    'rings_ledger', coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'delta', l.delta, 'reason', l.reason) order by l.created_at desc)
            from (select * from public.kr8_rings_ledger where member_id = p_user order by created_at desc limit 40) l), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'rank', w.rank, 'rings', w.rings) order by w.week desc)
            from public.kr8_week_results w where w.member_id = p_user and not w.is_test), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand, 'amount', c.amount_thb, 'status', c.status, 'held', c.held,
            'used', c.used_at is not null, 'created_at', c.created_at, 'assigned_at', c.assigned_at, 'hold_reason', h.reason, 'decided', h.decided,
            'decided_at', h.decided_at, 'decide_note', h.decide_note) order by c.created_at desc)
            from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id where c.member_id = p_user), '[]'::jsonb),
    'referrals', coalesce((select jsonb_agg(jsonb_build_object('user_id', r2.user_id, 'no', r2.member_no, 'name', r2.first_name, 'joined_at', r2.created_at) order by r2.created_at desc)
            from public.kr8_members r2 where m.member_no is not null and lower(coalesce(r2.ref_code, '')) ~ ('^k0*' || m.member_no || '$')), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.uid, 'no', om.member_no, 'name', om.first_name, 'reason', l.reason, 'dist', (l.detail ->> 'dist')::real,
            'detail', l.detail, 'at', l.first_at, 'dismissed', l.dismissed_at is not null) order by l.first_at)
            from public.kr8_account_links l cross join lateral (select case when l.a = p_user then l.b else l.a end as uid) o
            left join public.kr8_members om on om.user_id = o.uid where p_user in (l.a, l.b)), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'status', v.status, 'auto', v.live_check ->> 'auto', 'reason', v.reject_reason,
            'at', v.created_at, 'reviewed_at', v.reviewed_at, 'by_admin', v.reviewed_by is not null) order by v.created_at desc)
            from public.kr8_verifications v where v.user_id = p_user), '[]'::jsonb),
    'admin_log', coalesce((select jsonb_agg(jsonb_build_object('at', g.at, 'action', g.action) order by g.at desc) from public.kr8_admin_actions_log g
            where g.detail::text ilike '%' || p_user::text || '%' or (m.member_no is not null and g.detail::text ~ ('#' || m.member_no || '([^0-9]|$)'))), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_v2_member(uuid) from public, anon;
grant execute on function public.kr8_admin_v2_member(uuid) to authenticated;

-- ───────────────────────── activity log ─────────────────────────
create or replace function public.kr8_admin_v2_activity(p_limit integer default 150, p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n int := least(greatest(coalesce(p_limit, 150), 1), 500);
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(e order by (e ->> 'at') desc) from (
    select jsonb_build_object('at', x.at, 'kind', x.kind, 'auto', x.auto, 'user_id', x.uid, 'no', m.member_no, 'name', m.first_name, 'text', x.txt, 'other_no', x.other_no) e
    from (
      select m0.created_at at, 'signup' kind, true auto, m0.user_id uid, coalesce('via ' || nullif(m0.ref_code, ''), 'no referrer') txt, null::int other_no from public.kr8_members m0
      union all select p.created_at, 'reel', true, p.author, 'posted a Reel', null from public.kr8_posts p where p.kind = 'reel'
      union all select p.reviewed_at, 'reel_review', p.reviewed_by is not null, p.author, 'Reel ' || case when p.hidden or p.status = 'hidden' then 'hidden' else p.status end
                  || coalesce(' · ' || nullif(p.review_note, ''), ''), null from public.kr8_posts p where p.kind = 'reel' and p.reviewed_at is not null
      union all select v.created_at, 'check', true, v.user_id, 'face check sent' || coalesce(' · auto ' || (v.live_check ->> 'auto'), ''), null from public.kr8_verifications v
      union all select v.reviewed_at, 'check_done', v.reviewed_by is null, v.user_id, 'face check ' || v.status || coalesce(' · ' || left(split_part(v.reject_reason, E'\n', 1), 60), ''), null
                  from public.kr8_verifications v where v.reviewed_at is not null
      union all select c.created_at, 'claim', true, c.member_id, '฿' || c.amount_thb || ' ' || c.brand || ' claim · ' || case when c.held and c.status = 'pending' then 'held' else c.status end, null
                  from public.kr8_reward_claims c where p_include_test or not c.is_test
      union all select h.decided_at, 'hold_decided', false, c.member_id, 'held claim ' || coalesce(h.decided, 'decided'), null
                  from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where h.decided_at is not null
      union all select l.first_at, 'link', true, l.a, 'looks like / linked to (' || l.reason || ')', (select member_no from public.kr8_members where user_id = l.b) from public.kr8_account_links l
      union all select l.dismissed_at, 'link_dismissed', false, l.a, 'marked "different people"', (select member_no from public.kr8_members where user_id = l.b) from public.kr8_account_links l where l.dismissed_at is not null
      union all select g.at, 'admin', false, null, replace(g.action, '_', ' '), null from public.kr8_admin_actions_log g
    ) x left join public.kr8_members m on m.user_id = x.uid
    where x.at is not null and (p_include_test or x.uid is null or public.kr8_admin_v2_kind(x.uid) in ('real', 'nocard'))
    order by x.at desc limit n) z), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_v2_activity(integer, boolean) from public, anon;
grant execute on function public.kr8_admin_v2_activity(integer, boolean) to authenticated;

commit;
