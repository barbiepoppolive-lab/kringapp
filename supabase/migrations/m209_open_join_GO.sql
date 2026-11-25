-- m209 (25 Nov, open onboarding) — APPLY ON GO. Do NOT apply before the founder says "go" for the open-join app build.
-- This changes live behaviour, so it waits. It goes live together with the face-gate app build (branch face-gate).
--
--   1. kr8_face_gate: the gate also holds while open_join_on = 1, so turning face_gate_on off by mistake can never make an
--      unchecked account visible or contactable once anyone can join without the check. Same rule otherwise (member #68 and
--      below exempt, ghosts exempt, verified exempt).
--   2. kr8_invite_try: an invite pays ONLY when the friend passes the face check (settled economy fact: invite = 10 Rings and
--      requires the face check). The old "or their first Reel was approved" route is removed. Today that route is already
--      closed for every new member (an unchecked member cannot post), so no Rings change for anyone; this makes it explicit.
--      invite = 10, invite_day_cap = 20 and the inviter's daily count are unchanged.
--   3. open_join_on = 1.
-- Weekly ranking rules, liker_min_age_hours (876000), v2_unv_day_cap (2), min_rings_for_paid_seat (25): untouched.
-- UNDO: m209_open_join_GO_UNDO.sql
begin;

create or replace function public.kr8_face_gate(p_user uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select (public.kr8_rcfg('face_gate_on', 0) = 1 or public.kr8_rcfg('open_join_on', 0) = 1)
     and exists (select 1 from public.kr8_members m
                  where m.user_id = p_user and not m.verified and not m.ghost
                    and coalesce(m.member_no, 0) > public.kr8_rcfg('face_gate_after_no', 68))
$function$;
revoke execute on function public.kr8_face_gate(uuid) from public, anon;
grant execute on function public.kr8_face_gate(uuid) to authenticated;

create or replace function public.kr8_invite_try(p_friend uuid)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  f public.kr8_members;
  inv uuid;
  x int := public.kr8_rcfg('invite', 10);
  cap int := public.kr8_rcfg('invite_day_cap', 20);
  join_day_start timestamptz;
  n int := 0;
  w int := 0;
begin
  if x <= 0 then return 0; end if;
  select * into f from public.kr8_members where user_id = p_friend;
  -- m209: a passed face check only (the approved-Reel route is gone)
  if f.user_id is null or not coalesce(f.verified, false) or lower(coalesce(f.ref_code, '')) !~ '^k0*[0-9]{1,7}$' then
    return 0;
  end if;
  select user_id into inv from public.kr8_members where member_no = substring(lower(f.ref_code) from 2)::int;
  if not coalesce(public.kr8_invite_pair_ok(inv, p_friend), false) then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('kr8_invite:' || inv::text));

  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
  values (p_friend, x, 'invite_welcome', inv::text)
  on conflict do nothing;
  get diagnostics w = row_count;

  if exists (select 1 from public.kr8_rings_ledger where member_id = inv and reason = 'invite' and ref_id = p_friend::text) then
    return case when w > 0 then x else 0 end;
  end if;

  join_day_start := public.kr8_bkk_day_start(coalesce(f.created_at, now()));
  if (
    select count(*)
      from public.kr8_rings_ledger l
      left join public.kr8_members fm on fm.user_id::text = l.ref_id
     where l.member_id = inv
       and l.reason = 'invite'
       and coalesce(fm.created_at, l.created_at) >= join_day_start
       and coalesce(fm.created_at, l.created_at) < join_day_start + interval '1 day'
  ) >= greatest(cap, 0) then
    return case when w > 0 then x else 0 end;
  end if;

  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
  values (inv, x, 'invite', p_friend::text)
  on conflict do nothing;
  get diagnostics n = row_count;
  return case when greatest(n, w) > 0 then x else 0 end;
end $function$;
-- trigger-only (kr8_invite_trg / kr8_invite_verify_trg): nobody calls it directly, same as today
revoke all on function public.kr8_invite_try(uuid) from public, anon, authenticated;

update public.kr8_rings_config set value = 1, updated_at = now() where key = 'open_join_on';

commit;
