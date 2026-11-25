-- m218 UNDO: restore the 25 Nov bodies of kr8_invite_rings, kr8_my_invites, kr8_card_extras, kr8_founding_try,
-- kr8_notyet_founding_open; drop the m218 tables + helpers.
begin;
CREATE OR REPLACE FUNCTION public.kr8_invite_rings(p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
  where l.member_id = p_user and l.reason in ('invite', 'invite_welcome') and l.created_at >= p_from and l.created_at < p_to
    and l.ref_id ~ '^[0-9a-f-]{36}$'
    and case when l.reason = 'invite' then public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)
             else public.kr8_invite_pair_ok(l.ref_id::uuid, l.member_id) end
$function$


;

CREATE OR REPLACE FUNCTION public.kr8_my_invites()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when auth.uid() is null then null else jsonb_build_object(
    'friends', (select count(*)::int from public.kr8_rings_ledger l where l.member_id = auth.uid() and l.reason = 'invite'
                  and l.ref_id ~ '^[0-9a-f-]{36}$' and public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)),
    'rings', public.kr8_invite_rings(auth.uid(), '-infinity', 'infinity'),
    'x', public.kr8_rcfg('invite', 10)) end
$function$


;

CREATE OR REPLACE FUNCTION public.kr8_card_extras(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'founding_no', (select founding_no from public.kr8_prizes where member_id = tgt and kind = 'founding'),
    'founding_left', case when uid = tgt and public.kr8_rcfg('founding_on', 1) = 1 then greatest(0, public.kr8_rcfg('founding_slots', 50)
        - (select count(*)::int from public.kr8_prizes where kind = 'founding' and is_test = public.kr8_is_test_member(tgt) and status <> 'cancelled')) end,
    'founding_thb', public.kr8_rcfg('founding_thb', 100),
    'has_reel', case when uid = tgt then exists (select 1 from public.kr8_posts where author = tgt and kind = 'reel' and not hidden) end,
    'prizes', case when uid = tgt then (select count(*) from public.kr8_prizes where member_id = tgt and status = 'won') end);
end $function$


;

CREATE OR REPLACE FUNCTION public.kr8_founding_try(p_member uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t boolean; n int; amt int := public.kr8_rcfg('founding_thb', 100); eh text; lh text; mx float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0; o record;
begin
  if public.kr8_rcfg('founding_on', 1) <> 1 or amt <= 0 then return null; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  if public.kr8_is_team(p_member) then return null; end if;
  if exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding') then return null; end if;
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return null; end if;
  -- same person as an earlier Founding Local (also a deleted account): same email, same LINE, or same face
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
  select coalesce(max(founding_no), 0) + 1 into n from public.kr8_prizes where kind = 'founding' and is_test = t;
  if n > public.kr8_rcfg('founding_slots', 50) then return null; end if;
  insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (p_member, 'founding', n, amt, t) on conflict do nothing;
  if not found then return null; end if;
  return n;
end $function$


;

CREATE OR REPLACE FUNCTION public.kr8_notyet_founding_open(p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.kr8_rcfg('founding_on', 1) = 1 and public.kr8_rcfg('founding_thb', 100) > 0
     and not public.kr8_is_team(p_member)
     and not exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding')
     and (select coalesce(max(founding_no), 0) from public.kr8_prizes
           where kind = 'founding' and is_test = public.kr8_is_test_member(p_member)) < public.kr8_rcfg('founding_slots', 50)
$function$


;

drop function if exists public.kr8_is_paid_recruiter(uuid);
drop function if exists public.kr8_honorary_founding_no(uuid);
drop table if exists public.kr8_paid_recruiters;
drop table if exists public.kr8_honorary_founding;
commit;
