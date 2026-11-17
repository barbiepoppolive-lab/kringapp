-- 0089 · Admin face checks (17 Nov 2026). Since 0088 a selfie whose live check passed (straight + left + right) is approved
--        automatically, so it never reaches the Face checks queue and the founder could no longer see it. This brings it back.
--
--   · kr8_admin_v2_face_checks(p_user, p_auto_only, p_limit)  READ: every face check (approved, pending, rejected), newest first, with
--       status, time, auto/manual, the live_check steps, the selfie path (null once deleted after 30 days) and the member's paid claims.
--       The selfie itself stays in the PRIVATE kr8-verify bucket; the panel signs a 10-minute URL with the admin's own sign-in
--       (storage policy kr8_verify_admin_select = kr8_is_admin()). Nothing here makes the bucket public.
--   · kr8_admin_v2_face_reject(p_id, p_reason)  WRITE: an AUTO-approved check → rejected, member un-verified. Paid codes are NOT
--       taken back; they are listed in the admin log ('face_reject', paid_claims) and show as "Paid but not face-verified".
--   · kr8_admin_v2_face_undo(p_id)  WRITE: undoes that reject only (back to approved, member verified again).
-- All three start with kr8_is_admin(); anon cannot execute them.
--
-- UNDO: drop function public.kr8_admin_v2_face_undo(uuid), public.kr8_admin_v2_face_reject(uuid, text),
--       public.kr8_admin_v2_face_checks(uuid, boolean, integer);

begin;

create or replace function public.kr8_admin_v2_face_checks(p_user uuid default null, p_auto_only boolean default false, p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'at') desc) from (
    select jsonb_build_object(
      'id', v.id, 'user_id', v.user_id, 'no', m.member_no, 'name', m.first_name, 'status', v.status, 'at', v.created_at, 'reviewed_at', v.reviewed_at,
      'auto', v.status <> 'pending' and v.reviewed_by is null, 'live', v.live_check, 'reason', v.reject_reason,
      'selfie_path', case when v.selfie_deleted_at is null then v.selfie_path end, 'selfie_deleted_at', v.selfie_deleted_at,
      'verified', coalesce(m.verified, false),
      'undo', v.status = 'rejected' and v.reject_reason like 'Admin rejected after auto-approval%',
      'paid', (select count(*) from public.kr8_reward_claims c where c.member_id = v.user_id and c.status = 'assigned' and not c.is_test)) x
    from public.kr8_verifications v left join public.kr8_members m on m.user_id = v.user_id
    where (p_user is null or v.user_id = p_user)
      and (not p_auto_only or (v.reviewed_by is null and v.reviewed_at is not null and (v.status = 'approved' or v.reject_reason like 'Admin rejected after auto-approval%')))
    order by v.created_at desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) z), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_v2_face_checks(uuid, boolean, integer) from public, anon;
grant execute on function public.kr8_admin_v2_face_checks(uuid, boolean, integer) to authenticated;

create or replace function public.kr8_admin_v2_face_reject(p_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.kr8_verifications; paid jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into v from public.kr8_verifications where id = p_id for update;
  if v.id is null then raise exception 'KR8_NO_VERIFICATION'; end if;
  if v.status <> 'approved' then raise exception 'KR8_NOT_APPROVED'; end if;
  -- reviewed_by stays null: this column still says the approval was automatic; the reject is marked in reject_reason + the log
  update public.kr8_verifications set status = 'rejected',
         reject_reason = left('Admin rejected after auto-approval' || coalesce(': ' || nullif(btrim(p_reason), ''), ''), 200)
   where id = p_id;
  -- un-verify only when no other approved check remains
  if not exists (select 1 from public.kr8_verifications o where o.user_id = v.user_id and o.status = 'approved' and o.id <> p_id) then
    update public.kr8_members set verified = false, updated_at = now() where user_id = v.user_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'amount', c.amount_thb, 'brand', c.brand)), '[]'::jsonb) into paid
    from public.kr8_reward_claims c where c.member_id = v.user_id and c.status = 'assigned' and not c.is_test;
  insert into public.kr8_admin_actions_log(action, detail)
    values ('face_reject', jsonb_build_object('verification_id', p_id, 'user_id', v.user_id, 'by', auth.uid(), 'reason', p_reason, 'paid_claims', paid));
  return jsonb_build_object('ok', true, 'paid', jsonb_array_length(paid));
end $$;
revoke all on function public.kr8_admin_v2_face_reject(uuid, text) from public, anon;
grant execute on function public.kr8_admin_v2_face_reject(uuid, text) to authenticated;

create or replace function public.kr8_admin_v2_face_undo(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.kr8_verifications;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into v from public.kr8_verifications where id = p_id for update;
  if v.id is null then raise exception 'KR8_NO_VERIFICATION'; end if;
  if v.status <> 'rejected' or coalesce(v.reject_reason, '') not like 'Admin rejected after auto-approval%' then raise exception 'KR8_NOTHING_TO_UNDO'; end if;
  update public.kr8_verifications set status = 'approved', reject_reason = null where id = p_id;   -- kr8_verify_after_trg sets verified again
  update public.kr8_members set verified = true, updated_at = now() where user_id = v.user_id;
  insert into public.kr8_admin_actions_log(action, detail) values ('face_reject_undo', jsonb_build_object('verification_id', p_id, 'user_id', v.user_id, 'by', auth.uid()));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.kr8_admin_v2_face_undo(uuid) from public, anon;
grant execute on function public.kr8_admin_v2_face_undo(uuid) to authenticated;

commit;
