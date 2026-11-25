-- UNDO m209: back to the live definitions of 24 Nov (face gate follows face_gate_on only; invite pays on a passed face check
-- OR an approved first Reel) and open_join_on = 0.
begin;
create or replace function public.kr8_face_gate(p_user uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select public.kr8_rcfg('face_gate_on', 0) = 1
     and exists (select 1 from public.kr8_members m
                  where m.user_id = p_user and not m.verified and not m.ghost
                    and coalesce(m.member_no, 0) > public.kr8_rcfg('face_gate_after_no', 68))
$function$;

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
  if f.user_id is null or not (public.kr8_invite_first_reel(p_friend) or coalesce(f.verified, false))   /* 19 Nov founder: an approved Reel OR a passed face check */ or lower(coalesce(f.ref_code, '')) !~ '^k0*[0-9]{1,7}$' then
    return 0;
  end if;
  select user_id into inv from public.kr8_members where member_no = substring(lower(f.ref_code) from 2)::int;
  if not coalesce(public.kr8_invite_pair_ok(inv, p_friend), false) then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('kr8_invite:' || inv::text));

  -- T-398 [A-11 + B-17]: always grant the invited friend's welcome Rings once qualified,
  -- and measure inviter's daily cap by the friend's Bangkok join day (never penalising Monday batch Reel approvals!)
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
revoke all on function public.kr8_invite_try(uuid) from public, anon, authenticated;

update public.kr8_rings_config set value = 0, updated_at = now() where key = 'open_join_on';
commit;
