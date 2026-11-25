-- m218 (26 Nov 2026, founder-approved via CoS): two rules for paid recruiters, generic for any future one.
--   A. Paid recruiters (already paid per sign-up) earn NO invite Rings: kr8_invite_rings() returns 0 for anyone in
--      kr8_paid_recruiters. Ledger rows stay (append-only, they remain the record of friends brought in). Every board /
--      breakdown / lifetime / invites screen reads invite Rings only through kr8_invite_rings, so all of them follow.
--      The friend's own +10 welcome (invite_welcome) is unchanged.
--   B. Honorary Founding Local badge without a prize: kr8_honorary_founding. kr8_card_extras.founding_no (the
--      "★ Founding Local #NN" badge on the member card) reads a real founding prize first, then the honorary row.
--      No kr8_prizes row, so seats left / payouts / claims are untouched. kr8_founding_try never gives an honorary
--      member a ฿100 seat and never re-uses an honorary number; the "Not yet" note never promises them the ฿100.
-- Switches (QA first): rings_config 'paid_recruiter_on' and 'honorary_founding_on' (0 = off for real members; test
-- accounts follow the rule always so QA can see it). Turn on at go-live:
--   insert into kr8_rings_config(key, value) values ('paid_recruiter_on', 1), ('honorary_founding_on', 1)
--     on conflict (key) do update set value = excluded.value;
-- Rollback: m218_paid_recruiter_honorary_founding_UNDO.sql
begin;

create table if not exists public.kr8_paid_recruiters (
  user_id uuid primary key references public.kr8_members(user_id) on delete cascade,
  since timestamptz not null default now(),
  note text
);
alter table public.kr8_paid_recruiters enable row level security;
revoke all on public.kr8_paid_recruiters from public, anon, authenticated;

create table if not exists public.kr8_honorary_founding (
  user_id uuid primary key references public.kr8_members(user_id) on delete cascade,
  founding_no int not null unique,
  granted_at timestamptz not null default now(),
  note text
);
alter table public.kr8_honorary_founding enable row level security;
revoke all on public.kr8_honorary_founding from public, anon, authenticated;

create or replace function public.kr8_is_paid_recruiter(p_user uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.kr8_paid_recruiters r where r.user_id = p_user)
     and (public.kr8_rcfg('paid_recruiter_on', 0) = 1 or public.kr8_is_test_member(p_user))
$function$;
revoke execute on function public.kr8_is_paid_recruiter(uuid) from public, anon, authenticated;

create or replace function public.kr8_honorary_founding_no(p_user uuid)
 returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select h.founding_no from public.kr8_honorary_founding h
   where h.user_id = p_user and (public.kr8_rcfg('honorary_founding_on', 0) = 1 or public.kr8_is_test_member(p_user))
$function$;
revoke execute on function public.kr8_honorary_founding_no(uuid) from public, anon, authenticated;

-- A ── invite Rings: 0 for a paid recruiter (the only place invite Rings are summed)
create or replace function public.kr8_invite_rings(p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select case when public.kr8_is_paid_recruiter(p_user) then 0 else (
  select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
  where l.member_id = p_user and l.reason in ('invite', 'invite_welcome') and l.created_at >= p_from and l.created_at < p_to
    and l.ref_id ~ '^[0-9a-f-]{36}$'
    and case when l.reason = 'invite' then public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)
             else public.kr8_invite_pair_ok(l.ref_id::uuid, l.member_id) end) end
$function$;

-- the Invite screen: a paid recruiter is told 0 Rings per friend (friends count unchanged)
create or replace function public.kr8_my_invites()
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select case when auth.uid() is null then null else jsonb_build_object(
    'friends', (select count(*)::int from public.kr8_rings_ledger l where l.member_id = auth.uid() and l.reason = 'invite'
                  and l.ref_id ~ '^[0-9a-f-]{36}$' and public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)),
    'rings', public.kr8_invite_rings(auth.uid(), '-infinity', 'infinity'),
    'x', case when public.kr8_is_paid_recruiter(auth.uid()) then 0 else public.kr8_rcfg('invite', 10) end,
    'paid_recruiter', public.kr8_is_paid_recruiter(auth.uid())) end
$function$;

-- B ── the card badge
create or replace function public.kr8_card_extras(p_user uuid default null::uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; t record; gated boolean;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  select * into t from public.kr8_member_rings(tgt);
  gated := public.kr8_face_gate(uid) and tgt is distinct from uid;   -- m207: no socials for an unchecked viewer
  return jsonb_build_object('member_no', m.member_no,
    'ig_handle', case when gated then null else m.ig_handle end,
    'tiktok_handle', case when gated then null else m.tiktok_handle end,
    'lifetime', t.lifetime, 'level', public.kr8_rings_level(t.lifetime), 'week', t.week, 'week_rank', t.week_rank,
    -- m218: a real founding prize first, then an honorary Founding Local number (no prize, no seat)
    'founding_no', coalesce((select founding_no from public.kr8_prizes where member_id = tgt and kind = 'founding'), public.kr8_honorary_founding_no(tgt)),
    'founding_left', case when uid = tgt and public.kr8_rcfg('founding_on', 1) = 1 then greatest(0, public.kr8_rcfg('founding_slots', 50)
        - (select count(*)::int from public.kr8_prizes where kind = 'founding' and is_test = public.kr8_is_test_member(tgt) and status <> 'cancelled')) end,
    'founding_thb', public.kr8_rcfg('founding_thb', 100),
    'has_reel', case when uid = tgt then exists (select 1 from public.kr8_posts where author = tgt and kind = 'reel' and not hidden) end,
    'prizes', case when uid = tgt then (select count(*) from public.kr8_prizes where member_id = tgt and status = 'won') end);
end $function$;

-- no ฿100 seat for an honorary Founding Local; a new seat never takes an honorary number (slot rule unchanged)
create or replace function public.kr8_founding_try(p_member uuid)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare t boolean; n int; n_slot int; amt int := public.kr8_rcfg('founding_thb', 100); eh text; lh text; mx float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0; o record;
begin
  if public.kr8_rcfg('founding_on', 1) <> 1 or amt <= 0 then return null; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  if public.kr8_is_team(p_member) then return null; end if;
  if exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding') then return null; end if;
  if exists (select 1 from public.kr8_honorary_founding where user_id = p_member) then return null; end if;   -- m218
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return null; end if;
  eh := public.kr8_email_hash_of(p_member); lh := public.kr8_line_hash_of(p_member);
  if exists (select 1 from public.kr8_prizes x where x.kind = 'founding' and x.member_id is distinct from p_member
             and ((eh is not null and x.email_hash = eh) or (lh is not null and x.line_hash = lh))) then return null; end if;
  for o in select x.member_id from public.kr8_prizes x where x.kind = 'founding' and x.member_id is not null and x.member_id <> p_member
             and x.status <> 'cancelled'
             and exists (select 1 from public.kr8_face_prints a join public.kr8_face_prints b on b.user_id = x.member_id
                         where a.user_id = p_member and public.kr8_face_strength(a.source, b.source, public.kr8_face_dist(a.descriptor, b.descriptor)) = 'same'   /*fake0124*/) loop
    perform public.kr8_link_add(p_member, o.member_id, 'face', jsonb_build_object('where', 'founding check'));
    return null;
  end loop;
  if exists (select 1 from public.kr8_face_prints a join public.kr8_prize_faces k on k.kept_at > now() - interval '1 year'
             where a.user_id = p_member and public.kr8_face_strength(a.source, 'verify', public.kr8_face_dist(a.descriptor, k.descriptor)) = 'same') then return null; end if;
  t := public.kr8_is_test_member(p_member);
  perform pg_advisory_xact_lock(hashtext('kr8_founding:' || t::text));
  select coalesce(max(founding_no), 0) + 1 into n_slot from public.kr8_prizes where kind = 'founding' and is_test = t;
  if n_slot > public.kr8_rcfg('founding_slots', 50) then return null; end if;
  -- m218: the badge number skips honorary numbers (the slot rule above is unchanged)
  n := greatest(n_slot, coalesce((select max(h.founding_no) from public.kr8_honorary_founding h where public.kr8_is_test_member(h.user_id) = t), 0) + 1);
  insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (p_member, 'founding', n, amt, t) on conflict do nothing;
  if not found then return null; end if;
  return n;
end $function$;

create or replace function public.kr8_notyet_founding_open(p_member uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select public.kr8_rcfg('founding_on', 1) = 1 and public.kr8_rcfg('founding_thb', 100) > 0
     and not public.kr8_is_team(p_member)
     and not exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding')
     and not exists (select 1 from public.kr8_honorary_founding where user_id = p_member)   -- m218
     and (select coalesce(max(founding_no), 0) from public.kr8_prizes
           where kind = 'founding' and is_test = public.kr8_is_test_member(p_member)) < public.kr8_rcfg('founding_slots', 50)
$function$;

-- seed: member #14 (Pich, ref_code 'pich'): paid recruiter + honorary Founding Local, the next number after every real one
insert into public.kr8_paid_recruiters (user_id, note)
  select user_id, 'Paid per sign-up (Fastwork recruiter); founder 26 Nov: no invite Rings' from public.kr8_members where member_no = 14 and ref_code = 'pich'
  on conflict do nothing;
insert into public.kr8_honorary_founding (user_id, founding_no, note)
  select m.user_id, (select coalesce(max(founding_no), 0) + 1 from public.kr8_prizes where kind = 'founding' and not is_test),
         'Founder 26 Nov: Founding Local badge, honorary (no ฿100 prize, no seat)'
    from public.kr8_members m where m.member_no = 14 and m.ref_code = 'pich'
  on conflict do nothing;

commit;
