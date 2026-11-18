-- 0121 (18 Nov): kr8_admin_explain — "tap anything in admin and see who and why".
-- Founder rule: "Everything inside admin must be tappable further so I can see things and take decisions."
-- ONE admin-only, READ-ONLY function. It returns the detail behind a number or a row, as plain data the admin page words in English.
--   p_kind 'rings'  p_id = member user_id   → this week's likes, saves and share-link opens on their Reels: who gave each, counted or not, and why
--   p_kind 'reel'   p_id = post id          → the Reel (video + poster paths, status, places, counts)
--   p_kind 'place'  p_id = place id         → the place, who added it, the Reels that use it
--   p_kind 'codes'  p_id = 'truemoney:100' | 'all' → every code in that stock (masked) and who got it
--   p_kind 'claim'  p_id = claim id         → one prize claim, its hold, its code (masked)
--   p_kind 'errors' p_id = member user_id   → the member's last 15 phone-side problems (kr8_client_events)
--   p_kind 'alert'  p_id = dedupe_key       → the alert row, plus the flagged members for protect:* alerts
--   p_kind 'robot_log' p_id = log id        → one robot action (what, to whom, can it be undone)
-- Writes nothing. Rollback: drop function if exists public.kr8_admin_explain(text, text);

create or replace function public.kr8_admin_explain(p_kind text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  w0 timestamptz := public.kr8_week_start(now());
  uid uuid;
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_kind is null or p_id is null or length(p_id) > 200 then raise exception 'KR8_BAD_INPUT'; end if;

  -- ───────── Rings this week: who gave what, counted or not, and why ─────────
  if p_kind = 'rings' then
    uid := p_id::uuid;
    with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('open', 5) w_open,
                        public.kr8_rcfg('traveller_mult', 2) mult, public.kr8_rcfg('opens_day_cap', 30) cap,
                        public.kr8_rcfg('liker_min_age_hours', 72) min_age),
    au as (select m.user_id, coalesce(m.ghost, false) as ghost from public.kr8_members m where m.user_id = uid),
    reels as (
      select p.id, p.status, p.hidden, coalesce(p.board_off, false) as board_off, p.created_at, p.poster_path,
             case
               when p.status <> 'approved' then 'not_approved'
               when p.hidden then 'hidden'
               when coalesce(p.board_off, false) then 'board_off'
               when (select ghost from au) then 'author_hidden_duplicate'
               when not exists (select 1 from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                where pp.post_id = p.id and not pl.outside_bkk) then 'no_bangkok_place'
             end as off_why
      from public.kr8_posts p
      where p.author = uid and p.kind = 'reel' and p.created_at >= w0 and p.created_at < w0 + interval '7 days'
    ),
    gv as (
      select 'like'::text as what, l.post_id, l.user_id as giver, l.created_at from public.kr8_post_likes l join reels r on r.id = l.post_id
      union all
      select 'save', s.post_id, s.user_id, s.created_at from public.kr8_post_saves s join reels r on r.id = s.post_id
    ),
    gv2 as (
      select g.*, m.member_no, m.first_name, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav,
             case
               when g.giver = uid then 'own'
               when rr.off_why is not null then 'reel_' || rr.off_why
               when m.user_id is null then 'no_card'
               when public.kr8_is_test_member(g.giver) or public.kr8_is_team(g.giver) then 'test_or_team'
               when coalesce(m.ghost, false) then 'hidden_duplicate'
               when coalesce(m.photo, '') = '' or btrim(coalesce(m.first_name, '')) = '' then 'no_photo'
               when not coalesce(m.verified, false) and m.created_at >= now() - make_interval(hours => (select min_age from cfg)) then 'new_account'
               when public.kr8_linked(g.giver, uid) then 'linked'
             end as why
      from gv g join reels rr on rr.id = g.post_id left join public.kr8_members m on m.user_id = g.giver
    ),
    op as (
      select o.post_id, o.bkk_date, o.created_at, o.source, o.country, o.ok, o.opener, om.member_no as opener_no, om.first_name as opener_name,
             case
               when not o.ok then coalesce(o.why, 'not_counted')
               when rr.off_why is not null then 'reel_' || rr.off_why
               when o.opener = uid then 'own'
               when o.opener is not null and public.kr8_linked(o.opener, uid) then 'linked'
               when exists (select 1 from public.kr8_share_opens mine where mine.opener = uid and (mine.session = o.session or mine.device = o.device)) then 'own_phone'
             end as why,
             row_number() over (partition by o.post_id, o.bkk_date, (o.ok) order by o.created_at) as nth_ok
      from public.kr8_share_opens o join reels rr on rr.id = o.post_id left join public.kr8_members om on om.user_id = o.opener
    )
    select jsonb_build_object(
      'kind', 'rings', 'user_id', uid, 'week_start', w0,
      'weights', (select jsonb_build_object('like', w_like, 'save', w_save, 'open', w_open, 'traveller_mult', mult, 'opens_day_cap', cap) from cfg),
      'reels', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'hidden', hidden, 'board_off', board_off, 'at', created_at,
                 'poster_path', poster_path, 'off_why', off_why) order by created_at desc) from reels), '[]'::jsonb),
      'gives', coalesce((select jsonb_agg(jsonb_build_object('what', what, 'post_id', post_id, 'user_id', giver, 'no', member_no, 'name', first_name,
                 'at', created_at, 'traveller', coalesce(trav, false), 'counted', why is null, 'why', why) order by created_at desc)
                 from (select * from gv2 order by created_at desc limit 300) z), '[]'::jsonb),
      'opens', coalesce((select jsonb_agg(jsonb_build_object('post_id', post_id, 'day', bkk_date, 'at', created_at, 'source', source, 'country', country,
                 'opener', opener, 'opener_no', opener_no, 'opener_name', opener_name,
                 'counted', why is null and (not ok or nth_ok <= (select cap from cfg)),
                 'why', coalesce(why, case when ok and nth_ok > (select cap from cfg) then 'day_cap' end)) order by created_at desc)
                 from (select * from op order by created_at desc limit 300) z), '[]'::jsonb)
    ) into r;
    return r;
  end if;

  -- ───────── one Reel ─────────
  if p_kind = 'reel' then
    select jsonb_build_object('kind', 'reel', 'id', p.id, 'author', p.author, 'no', m.member_no, 'name', m.first_name,
             'status', p.status, 'hidden', p.hidden, 'board_off', coalesce(p.board_off, false), 'board_off_reason', p.board_off_reason,
             'note', p.review_note, 'video_path', p.video_path, 'poster_path', p.poster_path, 'at', p.created_at, 'body', p.body,
             'likes', p.likes_count, 'saves', p.saves_count,
             'places', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'name', pl.name_en, 'outside_bkk', pl.outside_bkk) order by pp.position)
                       from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = p.id), '[]'::jsonb))
      into r
      from public.kr8_posts p left join public.kr8_members m on m.user_id = p.author
     where p.id = p_id::uuid and p.kind = 'reel';
    return r;
  end if;

  -- ───────── one place ─────────
  if p_kind = 'place' then
    select jsonb_build_object('kind', 'place', 'id', pl.id, 'name_en', pl.name_en, 'name_th', pl.name_th, 'area', pl.area, 'status', pl.status,
             'added_how', pl.added_how, 'outside_bkk', pl.outside_bkk, 'lat', pl.lat, 'lng', pl.lng, 'created_at', pl.created_at,
             'by', pl.created_by, 'by_no', m.member_no, 'by_name', m.first_name,
             'reels', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'author', p.author, 'no', am.member_no, 'name', am.first_name,
                       'status', p.status, 'hidden', p.hidden, 'poster_path', p.poster_path, 'at', p.created_at) order by p.created_at desc)
                       from public.kr8_post_places pp join public.kr8_posts p on p.id = pp.post_id left join public.kr8_members am on am.user_id = p.author
                       where pp.place_id = pl.id), '[]'::jsonb))
      into r
      from public.kr8_places pl left join public.kr8_members m on m.user_id = pl.created_by
     where pl.id = p_id::uuid;
    return r;
  end if;

  -- ───────── code stock (codes masked: first 2 + last 2) ─────────
  if p_kind = 'codes' then
    select jsonb_build_object('kind', 'codes', 'stock', p_id,
             'codes', coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'brand', k.brand, 'amount', k.amount_thb, 'status', k.status, 'is_test', k.is_test,
                 'masked', left(k.code, 2) || '••••' || right(k.code, 2), 'added_at', k.added_at, 'assigned_at', k.assigned_at,
                 'user_id', k.assigned_to, 'no', m.member_no, 'name', m.first_name, 'claim_id', k.claim_id, 'used_at', c.used_at)
                 order by (k.status = 'available') desc, k.assigned_at desc nulls last, k.added_at desc), '[]'::jsonb))
      into r
      from (select * from public.kr8_reward_codes x
             where p_id = 'all' or (x.brand = split_part(p_id, ':', 1) and x.amount_thb::text = split_part(p_id, ':', 2))
             order by x.added_at desc limit 400) k
      left join public.kr8_members m on m.user_id = k.assigned_to
      left join public.kr8_reward_claims c on c.id = k.claim_id;
    return r;
  end if;

  -- ───────── one claim ─────────
  if p_kind = 'claim' then
    select jsonb_build_object('kind', 'claim', 'id', c.id, 'user_id', c.member_id, 'no', m.member_no, 'name', m.first_name,
             'brand', c.brand, 'amount', c.amount_thb, 'rings', c.rings, 'status', c.status, 'is_test', c.is_test,
             'created_at', c.created_at, 'assigned_at', c.assigned_at, 'used_at', c.used_at,
             'hold', case when h.claim_id is null then null else jsonb_build_object('reason', h.reason, 'detail', h.detail, 'face_dist', h.face_dist,
                     'decided', h.decided, 'decided_at', h.decided_at, 'note', h.decide_note) end,
             'code', case when k.id is null then null else jsonb_build_object('masked', left(k.code, 2) || '••••' || right(k.code, 2), 'status', k.status) end,
             'same_phone', coalesce((select jsonb_agg(distinct jsonb_build_object('user_id', o.member_id, 'no', om.member_no, 'name', om.first_name))
                       from public.kr8_reward_claims o left join public.kr8_members om on om.user_id = o.member_id
                       where o.id <> c.id and o.member_id is distinct from c.member_id and c.device is not null and o.device = c.device), '[]'::jsonb))
      into r
      from public.kr8_reward_claims c
      left join public.kr8_members m on m.user_id = c.member_id
      left join public.kr8_claim_holds h on h.claim_id = c.id
      left join public.kr8_reward_codes k on k.id = c.code_id
     where c.id = p_id::uuid;
    return r;
  end if;

  -- ───────── a member's last phone-side problems ─────────
  if p_kind = 'errors' then
    uid := p_id::uuid;
    select jsonb_build_object('kind', 'errors', 'user_id', uid, 'no', m.member_no, 'name', m.first_name,
             'rows', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'code', e.code, 'detail', left(e.detail, 160), 'ua', left(e.ua, 160), 'at', e.created_at) order by e.created_at desc)
                     from (select * from public.kr8_client_events where user_id = uid order by created_at desc limit 15) e), '[]'::jsonb))
      into r
      from (select uid as user_id) x left join public.kr8_members m on m.user_id = x.user_id;
    return r;
  end if;

  -- ───────── one alert (+ flagged members behind protect:* alerts) ─────────
  if p_kind = 'alert' then
    select jsonb_build_object('kind', 'alert', 'dedupe_key', a.dedupe_key, 'robot', a.robot, 'severity', a.severity, 'title', a.title, 'body', a.body,
             'href', a.href, 'detail', a.detail, 'first_at', a.first_at, 'last_at', a.last_at, 'cleared_at', a.cleared_at,
             'flags', case when a.dedupe_key like 'protect:%' then coalesce((
                     select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'no', m.member_no, 'name', m.first_name, 'flag_key', f.flag_key,
                       'severity', f.severity, 'summary', f.summary, 'detail', f.detail, 'last_at', f.last_at,
                       'partner_name', (select pm.first_name from public.kr8_members pm where pm.user_id = nullif(f.detail ->> 'partner_id', '')::uuid)) order by f.last_at desc)
                     from public.kr8_protect_flags f left join public.kr8_members m on m.user_id = f.user_id
                     where f.dismissed_at is null and f.flag_key = split_part(a.dedupe_key, ':', 2)), '[]'::jsonb) end)
      into r
      from public.kr8_robot_alerts a
     where a.dedupe_key = p_id;
    return r;
  end if;

  -- ───────── one robot action ─────────
  if p_kind = 'robot_log' then
    select jsonb_build_object('kind', 'robot_log', 'id', l.id, 'robot', l.robot, 'action', l.action, 'target', l.target, 'detail', l.detail,
             'can_undo', l.undo is not null and l.undone_at is null, 'undone_at', l.undone_at, 'dry_run', l.dry_run, 'at', l.at)
      into r
      from public.kr8_robot_log l
     where l.id = p_id::bigint;
    return r;
  end if;

  raise exception 'KR8_BAD_KIND';
end $$;
revoke all on function public.kr8_admin_explain(text, text) from public, anon;
grant execute on function public.kr8_admin_explain(text, text) to authenticated;
