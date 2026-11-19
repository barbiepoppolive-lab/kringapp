-- 0123 (19 Nov 2026) · Ring-farming check — founder: "These ring farming reports from members should be highlighted with ample data
-- in admin panel for me to assess."
--
-- What this adds (admin-only, nothing is ever deleted; every decision is logged and can be changed back with one tap):
--   1. kr8_admin_farming_cases()  READ-ONLY. One case per suspected beneficiary THIS week (Bangkok week, kr8_week_start(now())):
--        the beneficiary (no, name, rank, Rings now, applied cut) + every flagged giver (joined time, invite link used and whose,
--        face-verified, phone user-agent, likes / saves / opens given and to whom, share going to the beneficiary, own Reels,
--        minutes from joining to the first like, the Rings they gave and what one like is worth) + same-phone / same-Wi-Fi links
--        inside the group + the founder's decision. The admin page turns this into plain-English lines and a verdict.
--      Detection (any one is enough):
--        a) >= 3 givers this week each sent >= 80% of their likes + saves (and >= 2 of them) to this one member;
--        b) >= 2 givers joined with this member's invite link (ref_code k000NN) and liked them within 24 h of joining
--           (with >= 50% of their likes + saves going to them);
--        c) an open protect 'ring_farming' flag (0102) names this member as the partner;
--        d) the founder already decided on this member this week (the case stays visible so it can be changed).
--   2. kr8_farm_decisions + kr8_farm_log + kr8_admin_farming_decide(p_beneficiary, p_action, p_givers, p_note)
--        p_action 'full'   = Count fully (dismiss; any earlier cut is lifted)
--                 'once'   = Count each friend once: each flagged giver's Rings to this member this week = the value of ONE like
--                 'none'   = Don't count these: the flagged givers' likes and saves to this member earn 0 Rings this week
--                 'hold' / 'unhold' = Hold prize: a weekly prize claim for this member and week is held for review (no code sent)
--   3. Scoring: kr8_farm_cut / kr8_farm_minus(week, test) = the Rings to take off each Reel; kr8_reel_scores_adj = kr8_reel_scores minus that.
--      kr8_week_board and kr8_score_breakdown read kr8_reel_scores_adj instead of kr8_reel_scores (one word each), so the board,
--      the member's own "how my Rings add up", lifetime week line, and the Monday close (kr8_close_week → kr8_week_board) all agree.
--      kr8_claim_prize gets ONE line: a held case adds 'ring_farming' to the review reasons → the claim is held (no code) like a
--      face-check review; the founder pays or refuses it in Needs you as usual.
--      These three are patched IN PLACE from the live function text (pg_get_functiondef), only when the exact anchor text is found
--      exactly once; otherwise the function is left as it is and a WARNING says so (see the NOTE at the end). Re-runnable.
--
-- Rollback: supabase/undo/0123_ring_farming_cases_UNDO.sql (puts the three original lines back, drops the new functions; the two
-- tables are kept so the decision history is not lost).

begin;

-- ───────── 1. decisions (one row per week + beneficiary) and the log of every tap ─────────
create table if not exists public.kr8_farm_decisions (
  week_start  timestamptz not null,
  beneficiary uuid not null references auth.users(id) on delete cascade,
  score_mode  text not null default 'full' check (score_mode in ('full', 'once', 'none')),
  givers      uuid[] not null default '{}',     -- the flagged givers the founder saw when deciding (the cut applies to these only)
  hold        boolean not null default false,
  note        text,
  decided_by  uuid,
  decided_at  timestamptz not null default now(),
  primary key (week_start, beneficiary)
);
alter table public.kr8_farm_decisions enable row level security;
revoke all on public.kr8_farm_decisions from public, anon, authenticated;

create table if not exists public.kr8_farm_log (
  id          bigserial primary key,
  week_start  timestamptz not null,
  beneficiary uuid not null,
  action      text not null,
  before      jsonb,
  after       jsonb,
  by          uuid,
  at          timestamptz not null default now()
);
create index if not exists kr8_farm_log_who on public.kr8_farm_log (beneficiary, at desc);
alter table public.kr8_farm_log enable row level security;
revoke all on public.kr8_farm_log from public, anon, authenticated;

-- ───────── 2. the Rings to take off each Reel (same "does this like count" rules as kr8_reel_scores 0095) ─────────
-- one member, one mode, one set of givers: what to take off each of their Reels that week
create or replace function public.kr8_farm_cut(p_w0 timestamptz, p_test boolean, p_who uuid, p_mode text, p_givers uuid[])
returns table (post_id uuid, minus int)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('traveller_mult', 2) mult),
  g as (
    select x.what, x.post_id, x.giver, x.created_at
      from public.kr8_posts p
      cross join lateral (
        select 'like'::text as what, l.post_id, l.user_id as giver, l.created_at from public.kr8_post_likes l
         where l.post_id = p.id and l.user_id = any (p_givers) and l.created_at < p_w0 + interval '7 days'
        union all
        select 'save'::text, s.post_id, s.user_id, s.created_at from public.kr8_post_saves s
         where s.post_id = p.id and s.user_id = any (p_givers) and s.created_at < p_w0 + interval '7 days') x
     where p_mode in ('once', 'none') and p.author = p_who and p.kind = 'reel'
       and p.created_at >= p_w0 and p.created_at < p_w0 + interval '7 days'
  ),
  v as (
    select g.*, (case when g.what = 'like' then cfg.w_like else cfg.w_save end) * (case when c.trav then cfg.mult else 1 end) as val,
           cfg.w_like * (case when c.trav then cfg.mult else 1 end) as one_like,
           row_number() over (partition by g.giver order by g.created_at, g.what, g.post_id) as n
      from g cross join cfg
      join lateral (select (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
                      from public.kr8_members m
                     where m.user_id = g.giver and g.giver <> p_who
                       and coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> ''
                       and public.kr8_is_test_member(m.user_id) = p_test and not public.kr8_is_team(m.user_id) and not coalesce(m.ghost, false)
                       and (m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('liker_min_age_hours', 72)))) c on true
     where not public.kr8_linked(g.giver, p_who)
  )
  -- 'none': every counted give is taken off; 'once': the giver's first give is cut down to one like, the rest are taken off
  select v.post_id, sum(case when p_mode = 'none' then v.val when v.n = 1 then greatest(v.val - v.one_like, 0) else v.val end)::int
    from v group by v.post_id
$$;
revoke all on function public.kr8_farm_cut(timestamptz, boolean, uuid, text, uuid[]) from public, anon, authenticated;

-- every decision of that week together
create or replace function public.kr8_farm_minus(p_w0 timestamptz, p_test boolean)
returns table (post_id uuid, minus int)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.post_id, sum(c.minus)::int
    from public.kr8_farm_decisions f
    cross join lateral public.kr8_farm_cut(p_w0, p_test, f.beneficiary, f.score_mode, f.givers) c
   where f.week_start = p_w0 and f.score_mode in ('once', 'none') and cardinality(f.givers) > 0
     and public.kr8_is_test_member(f.beneficiary) = p_test
   group by c.post_id
$$;
revoke all on function public.kr8_farm_minus(timestamptz, boolean) from public, anon, authenticated;

-- what the member's board Rings WOULD be this week with that choice (same sum as kr8_week_board: best Reels + invite Rings)
create or replace function public.kr8_farm_rings_if(p_w0 timestamptz, p_who uuid, p_mode text, p_givers uuid[]) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select greatest(x.score - coalesce(c.minus, 0), 0) as sc
               from public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', false, p_who) x
               left join public.kr8_farm_cut(p_w0, false, p_who, p_mode, p_givers) c on c.post_id = x.post_id)
  select (coalesce((select sum(z.sc) from (select s.sc from s order by s.sc desc limit greatest(public.kr8_rcfg('best_reels', 2), 1)) z), 0)
          + public.kr8_invite_rings(p_who, p_w0, p_w0 + interval '7 days'))::int
$$;
revoke all on function public.kr8_farm_rings_if(timestamptz, uuid, text, uuid[]) from public, anon, authenticated;

-- kr8_reel_scores with the founder's Ring-farming cuts applied (p_from is the week start on the board; any other range = no cut)
create or replace function public.kr8_reel_scores_adj(p_from timestamptz, p_to timestamptz, p_until timestamptz, p_test boolean, p_author uuid default null)
returns table (post_id uuid, author uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.post_id, s.author, s.posted_at, s.l_local, s.l_trav, s.s_local, s.s_trav, s.opens, greatest(s.score - coalesce(f.minus, 0), 0)::int
    from public.kr8_reel_scores(p_from, p_to, p_until, p_test, p_author) s
    left join public.kr8_farm_minus(p_from, p_test) f on f.post_id = s.post_id
$$;
revoke all on function public.kr8_reel_scores_adj(timestamptz, timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;

-- is this member's weekly prize for that week on hold? (read by kr8_claim_prize)
create or replace function public.kr8_farm_prize_held(p_user uuid, p_week date, p_kind text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_kind = 'weekly', false) and exists (
    select 1 from public.kr8_farm_decisions f
     where f.beneficiary = p_user and f.hold and (f.week_start at time zone 'Asia/Bangkok')::date = p_week)
$$;
revoke all on function public.kr8_farm_prize_held(uuid, date, text) from public, anon, authenticated;

-- ───────── 3. the cases (read-only) ─────────
create or replace function public.kr8_admin_farming_cases() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not coalesce(public.kr8_is_admin(), false) then raise exception 'KR8_ADMIN_ONLY'; end if;

  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('traveller_mult', 2) mult,
                      public.kr8_rcfg('liker_min_age_hours', 72) min_age),
  realm as (select m.* from public.kr8_members m where not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id)),
  -- every like / save on a Reel this week, not on your own
  gv as (
    select 'like'::text as what, l.user_id as giver, p.author as recv, l.post_id, l.created_at
      from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
     where p.kind = 'reel' and l.created_at >= w0 and l.user_id <> p.author
    union all
    select 'save'::text, s.user_id, p.author, s.post_id, s.created_at
      from public.kr8_post_saves s join public.kr8_posts p on p.id = s.post_id
     where p.kind = 'reel' and s.created_at >= w0 and s.user_id <> p.author
  ),
  opn as (   -- share-link opens by a signed-in member this week
    select o.opener as giver, p.author as recv, o.post_id, o.created_at
      from public.kr8_share_opens o join public.kr8_posts p on p.id = o.post_id
     where o.opener is not null and o.opener <> p.author and o.created_at >= w0
  ),
  tot as (select giver, count(*)::int as n, count(distinct recv)::int as people from gv group by giver),
  pr as (
    select giver, recv, count(*)::int as n, count(*) filter (where what = 'like')::int as likes, count(*) filter (where what = 'save')::int as saves,
           count(distinct post_id)::int as reels, min(created_at) as first_at
      from gv group by giver, recv
  ),
  cand as (
    select pr.*, t.n as total, t.people,
           (pr.n >= 2 and pr.n::numeric / greatest(t.n, 1) >= 0.8) as by_share,
           coalesce(gm.ref_code ~ '^k[0-9]{5,7}$' and substring(gm.ref_code from 2)::int = rm.member_no
              and pr.first_at < gm.created_at + interval '24 hours' and pr.n::numeric / greatest(t.n, 1) >= 0.5, false) as by_link,
           exists (select 1 from public.kr8_protect_flags f where f.user_id = pr.giver and f.flag_key = 'ring_farming' and f.dismissed_at is null
                     and f.detail ->> 'partner_id' = pr.recv::text) as by_flag
      from pr join tot t on t.giver = pr.giver
      join realm gm on gm.user_id = pr.giver
      join realm rm on rm.user_id = pr.recv
  ),
  dec as (select * from public.kr8_farm_decisions where week_start = w0),
  flagged as (
    select c.* from cand c where c.by_share or c.by_link or c.by_flag
    union   -- givers the founder already decided on stay in the case
    select c.* from cand c join dec d on d.beneficiary = c.recv and c.giver = any (d.givers)
  ),
  cases as (
    select f.recv from flagged f group by f.recv
    having count(*) filter (where f.by_share) >= 3 or count(*) filter (where f.by_link) >= 2 or bool_or(f.by_flag)
    union
    select d.beneficiary from dec d
  ),
  board as (select b.member_id, b.rings, b.rk from public.kr8_week_board(w0, false) b),
  rv as (   -- the beneficiary's board Reels this week (what counts toward Rings)
    select p.id, p.author from public.kr8_posts p join cases k on k.recv = p.author
     where p.kind = 'reel' and p.status = 'approved' and not p.hidden and not coalesce(p.board_off, false)
       and p.created_at >= w0 and p.created_at < w0 + interval '7 days'
  ),
  val as (   -- Rings each flagged giver really added (same rules as kr8_reel_scores) and what one like from them is worth
    select f.recv, f.giver,
           coalesce(sum((case when g.what = 'like' then cfg.w_like else cfg.w_save end) * (case when c.trav then cfg.mult else 1 end))
                    filter (where g.post_id is not null and c.ok and not public.kr8_linked(f.giver, f.recv)), 0)::int as rings_from,
           max(cfg.w_like * (case when c.trav then cfg.mult else 1 end))::int as one_like
      from flagged f cross join cfg
      join lateral (select coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and not coalesce(m.ghost, false)
                           and (m.verified or m.created_at < now() - make_interval(hours => cfg.min_age)) as ok,
                           (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
                      from public.kr8_members m where m.user_id = f.giver) c on true
      left join gv g on g.giver = f.giver and g.recv = f.recv and g.post_id in (select id from rv where rv.author = f.recv)
     group by f.recv, f.giver
  ),
  grp as (select k.recv as uid, k.recv from cases k union all select f.giver, f.recv from flagged f),
  lk as (   -- same face / phone / Wi-Fi links between people inside one case
    select k.recv, jsonb_agg(distinct jsonb_build_object('a', l.a, 'b', l.b, 'reason', l.reason)) as links
      from cases k join public.kr8_account_links l on l.dismissed_at is null
       and l.a in (select uid from grp where grp.recv = k.recv) and l.b in (select uid from grp where grp.recv = k.recv)
     group by k.recv
  )
  select jsonb_build_object(
    'week_start', w0, 'now', now(),
    'weights', (select jsonb_build_object('like', w_like, 'save', w_save, 'traveller_mult', mult) from cfg),
    'paid_ranks', public.kr8_paid_ranks(),
    'board', coalesce((select jsonb_agg(jsonb_build_object('user_id', b.member_id, 'rings', b.rings, 'rank', b.rk) order by b.rk) from board b), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object(
        'beneficiary', jsonb_build_object('user_id', m.user_id, 'no', m.member_no, 'name', m.first_name, 'joined_at', m.created_at,
                        'verified', coalesce(m.verified, false), 'rank', b.rk, 'rings', coalesce(b.rings, 0),
                        'rings_full', public.kr8_farm_rings_if(w0, k.recv, 'full', '{}'),
                        'rings_once', public.kr8_farm_rings_if(w0, k.recv, 'once', (select array_agg(f.giver) from flagged f where f.recv = k.recv)),
                        'rings_none', public.kr8_farm_rings_if(w0, k.recv, 'none', (select array_agg(f.giver) from flagged f where f.recv = k.recv))),
        'decision', (select jsonb_build_object('score_mode', d.score_mode, 'givers', to_jsonb(d.givers), 'hold', d.hold, 'note', d.note, 'at', d.decided_at)
                       from dec d where d.beneficiary = k.recv),
        'links', coalesce((select lk.links from lk where lk.recv = k.recv), '[]'::jsonb),
        'givers', coalesce((select jsonb_agg(jsonb_build_object(
            'user_id', f.giver, 'no', gm.member_no, 'name', gm.first_name, 'joined_at', gm.created_at,
            'ref_code', nullif(gm.ref_code, ''), 'src_code', nullif(gm.src_code, ''),
            'ref_no', rf.member_no, 'ref_name', rf.first_name,
            'verified', coalesce(gm.verified, false), 'has_photo', coalesce(gm.photo, '') <> '', 'ghost', coalesce(gm.ghost, false),
            'ua', (select left(e.ua, 300) from public.kr8_client_events e where e.user_id = f.giver and e.ua is not null order by e.created_at desc limit 1),
            'ua2', (select left(o.ua, 300) from public.kr8_share_opens o where o.opener = f.giver and o.ua is not null order by o.created_at desc limit 1),
            'likes', f.likes, 'saves', f.saves, 'reels', f.reels,
            'opens', (select count(*)::int from opn where opn.giver = f.giver and opn.recv = k.recv),
            'given_total', f.total, 'people', f.people,
            'others', coalesce((select jsonb_agg(jsonb_build_object('no', om.member_no, 'name', om.first_name, 'n', x.n) order by x.n desc)
                                  from (select p2.recv, p2.n from pr p2 where p2.giver = f.giver and p2.recv <> k.recv order by p2.n desc limit 3) x
                                  left join public.kr8_members om on om.user_id = x.recv), '[]'::jsonb),
            'own_reels', (select count(*)::int from public.kr8_posts p where p.author = f.giver and p.kind = 'reel' and p.status = 'approved'),
            'first_give_at', f.first_at,
            'first_give_min', greatest(0, round(extract(epoch from (f.first_at - gm.created_at)) / 60))::int,
            'by_share', f.by_share, 'by_link', f.by_link, 'by_flag', f.by_flag,
            'rings_from', coalesce(v.rings_from, 0), 'one_like', coalesce(v.one_like, 1)) order by gm.created_at)
          from flagged f join public.kr8_members gm on gm.user_id = f.giver
          left join public.kr8_members rf on gm.ref_code ~ '^k[0-9]{5,7}$' and rf.member_no = substring(gm.ref_code from 2)::int
          left join val v on v.recv = f.recv and v.giver = f.giver
          where f.recv = k.recv), '[]'::jsonb))
      order by coalesce(b.rk, 9999), m.member_no)
      from cases k join public.kr8_members m on m.user_id = k.recv left join board b on b.member_id = k.recv), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_farming_cases() from public, anon;
grant execute on function public.kr8_admin_farming_cases() to authenticated;

-- ───────── 4. the founder's decision (logged; change it any time; never deletes anything) ─────────
create or replace function public.kr8_admin_farming_decide(p_beneficiary uuid, p_action text, p_givers uuid[] default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w0 timestamptz := public.kr8_week_start(now());
  b public.kr8_farm_decisions;
  a public.kr8_farm_decisions;
  gs uuid[];
begin
  if not coalesce(public.kr8_is_admin(), false) then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_beneficiary is null or p_action is null or p_action not in ('full', 'once', 'none', 'hold', 'unhold') then raise exception 'KR8_BAD_INPUT'; end if;
  if p_givers is not null and cardinality(p_givers) > 300 then raise exception 'KR8_BAD_INPUT'; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_beneficiary) then raise exception 'KR8_NO_PERSON'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_farm:' || p_beneficiary::text));
  select * into b from public.kr8_farm_decisions where week_start = w0 and beneficiary = p_beneficiary;
  gs := coalesce((select array_agg(distinct g) from unnest(p_givers) g where g is not null and g <> p_beneficiary), b.givers, '{}');

  insert into public.kr8_farm_decisions as d (week_start, beneficiary, score_mode, givers, hold, note, decided_by, decided_at)
  values (w0, p_beneficiary, case when p_action in ('full', 'once', 'none') then p_action else 'full' end, gs,
          p_action = 'hold', left(p_note, 500), auth.uid(), now())
  on conflict (week_start, beneficiary) do update set
    score_mode = case when p_action in ('full', 'once', 'none') then p_action else d.score_mode end,
    givers     = case when p_action in ('full', 'once', 'none') then excluded.givers else d.givers end,
    hold       = case when p_action = 'hold' then true when p_action = 'unhold' then false else d.hold end,
    note       = coalesce(excluded.note, d.note),
    decided_by = excluded.decided_by,
    decided_at = now()
  returning * into a;

  insert into public.kr8_farm_log (week_start, beneficiary, action, before, after, by)
  values (w0, p_beneficiary, p_action, case when b.beneficiary is null then null else to_jsonb(b) end, to_jsonb(a), auth.uid());
  insert into public.kr8_admin_actions_log (action, detail)
  values ('ring_farming_' || p_action, jsonb_build_object('user_id', p_beneficiary, 'week_start', w0, 'givers', cardinality(a.givers),
          'score_mode', a.score_mode, 'hold', a.hold, 'by', auth.uid()));

  return jsonb_build_object('ok', true, 'week_start', w0, 'score_mode', a.score_mode, 'hold', a.hold, 'givers', to_jsonb(a.givers),
    'rings', (select bb.rings from public.kr8_week_board(w0, public.kr8_is_test_member(p_beneficiary)) bb where bb.member_id = p_beneficiary));
end $$;
revoke all on function public.kr8_admin_farming_decide(uuid, text, uuid[], text) from public, anon;
grant execute on function public.kr8_admin_farming_decide(uuid, text, uuid[], text) to authenticated;

-- ───────── 5. wire the cut into the board, the member's breakdown, and the prize claim (in place, anchor-checked) ─────────
create or replace function pg_temp.kr8_patch_fn(p_sig text, p_old text, p_new text, p_mark text) returns text language plpgsql as $$
declare f regprocedure := to_regprocedure(p_sig); def text; n int;
begin
  if f is null then raise warning '0123: % not found — not patched', p_sig; return 'missing'; end if;
  def := pg_get_functiondef(f);
  if position(p_mark in def) > 0 then return 'already'; end if;
  n := (length(def) - length(replace(def, p_old, ''))) / greatest(length(p_old), 1);
  if n <> 1 then raise warning '0123: % — anchor found % times, NOT patched (patch by hand, see NOTE)', p_sig, n; return 'skipped'; end if;
  execute replace(def, p_old, p_new);
  raise notice '0123: % patched', p_sig;
  return 'patched';
end $$;

select pg_temp.kr8_patch_fn('public.kr8_week_board(timestamptz, boolean)',
  'public.kr8_reel_scores(p_w0, p_w0 + interval ''7 days'', p_w0 + interval ''7 days'', p_test)',
  'public.kr8_reel_scores_adj(p_w0, p_w0 + interval ''7 days'', p_w0 + interval ''7 days'', p_test)',
  'kr8_reel_scores_adj');
select pg_temp.kr8_patch_fn('public.kr8_score_breakdown(uuid)',
  'public.kr8_reel_scores(w0, w0 + interval ''7 days'', w0 + interval ''7 days'', t, p_user)',
  'public.kr8_reel_scores_adj(w0, w0 + interval ''7 days'', w0 + interval ''7 days'', t, p_user)',
  'kr8_reel_scores_adj');
select pg_temp.kr8_patch_fn('public.kr8_claim_prize(uuid, text, text, real[], text)',
  E'  held := others is not null or cardinality(review) > 0;',
  E'  if public.kr8_farm_prize_held(uid, pz.week, pz.kind) then review := array_append(review, ''ring_farming''); end if;   -- 0123: Hold prize (Ring-farming check)\n  held := others is not null or cardinality(review) > 0;',
  'kr8_farm_prize_held');

commit;

-- NOTE (live): the three in-place patches above look for these exact lines (from 0109 / 0111):
--   kr8_week_board      : public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)
--   kr8_score_breakdown : public.kr8_reel_scores(w0, w0 + interval '7 days', w0 + interval '7 days', t, p_user)
--   kr8_claim_prize     :   held := others is not null or cardinality(review) > 0;
-- If a WARNING says "NOT patched", open that function and make the same one-word change by hand (kr8_reel_scores → kr8_reel_scores_adj,
-- or add the one kr8_farm_prize_held line just before `held := ...`). Check with:
--   select position('kr8_reel_scores_adj' in pg_get_functiondef('public.kr8_week_board(timestamptz, boolean)'::regprocedure)) > 0;
