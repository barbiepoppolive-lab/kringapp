-- 0107 · "Delete my face data" deletes EVERY face code (18 Nov 2026, T-392 FAQ truth check, PDPA).
--
-- ADDITIVE & RE-RUNNABLE (create or replace only; no table changes). Body = 0092's kr8_forget_my_face() (unchanged since; 0093–0106
-- don't touch it; matches pg_get_functiondef on kring-test before this) plus:
--   1. the member's kr8_face_prints rows (the older 128-number face-api code, made in the background after a check and by claims)
--      are deleted too. Before 0107 only kr8_face_vectors went, so a member who tapped "Delete my face data" still had face codes.
--   2. the 1-year prize rule (0067) is kept as it is: a member who has a prize gets the same copy kr8_prize_trail() makes when an
--      account is deleted (member number + email hash + the 'verify'/'selfie' prints → kr8_prize_faces, kept one year at most, read
--      only by kr8_founding_try so the same person can't get a 2nd Founding Local). Without this, deleting the face data first
--      and the account after would skip that rule.
--   The result also says how many face-api prints went ('prints') and how many were kept for the prize rule ('kept').
-- Help FAQ delete_data (src/v8/helpFaq.ts) describes exactly this.
--
-- UNDO (back to 0092):
--   create or replace function public.kr8_forget_my_face() returns jsonb
--   language plpgsql security definer set search_path = public, pg_temp as $$
--   declare uid uuid := auth.uid(); n int := 0;
--   begin
--     if uid is null then raise exception 'KR8_SIGN_IN'; end if;
--     if to_regclass('public.kr8_storage_trash') is not null then
--       insert into public.kr8_storage_trash (bucket, name, user_id)
--       select 'kr8-verify', v.selfie_path, uid from public.kr8_verifications v
--        where v.user_id = uid and v.selfie_path is not null and v.selfie_deleted_at is null
--       on conflict (bucket, name) do nothing;
--     end if;
--     update public.kr8_verifications set selfie_deleted_at = coalesce(selfie_deleted_at, now()) where user_id = uid and selfie_path is not null;
--     delete from public.kr8_face_vectors where user_id = uid;
--     get diagnostics n = row_count;
--     update public.kr8_members set verified = false, updated_at = now() where user_id = uid and verified;
--     insert into public.kr8_admin_actions_log (action, detail) values ('face_forget', jsonb_build_object('user', uid, 'codes', n));
--     return jsonb_build_object('forgotten', true, 'codes', n);
--   end $$;
--   revoke all on function public.kr8_forget_my_face() from public, anon;
--   grant execute on function public.kr8_forget_my_face() to authenticated;
--   (rows already deleted from kr8_face_prints can't come back; rows copied to kr8_prize_faces expire after one year as before.)

begin;

create or replace function public.kr8_forget_my_face() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int := 0; np int := 0; nk int := 0;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if to_regclass('public.kr8_storage_trash') is not null then
    insert into public.kr8_storage_trash (bucket, name, user_id)
    select 'kr8-verify', v.selfie_path, uid from public.kr8_verifications v
     where v.user_id = uid and v.selfie_path is not null and v.selfie_deleted_at is null
    on conflict (bucket, name) do nothing;
  end if;
  update public.kr8_verifications set selfie_deleted_at = coalesce(selfie_deleted_at, now()) where user_id = uid and selfie_path is not null;
  delete from public.kr8_face_vectors where user_id = uid;
  get diagnostics n = row_count;
  if to_regclass('public.kr8_face_prints') is not null then
    -- 0067 prize rule, same rows kr8_prize_trail() keeps on account deletion (one year at most)
    if to_regclass('public.kr8_prize_faces') is not null and exists (select 1 from public.kr8_prizes where member_id = uid) then
      insert into public.kr8_prize_faces (member_no_copy, email_hash, descriptor)
      select (select member_no from public.kr8_members where user_id = uid), public.kr8_email_hash_of(uid), f.descriptor
        from public.kr8_face_prints f where f.user_id = uid and f.source in ('verify', 'selfie');
      get diagnostics nk = row_count;
    end if;
    delete from public.kr8_face_prints where user_id = uid;
    get diagnostics np = row_count;
  end if;
  update public.kr8_members set verified = false, updated_at = now() where user_id = uid and verified;
  insert into public.kr8_admin_actions_log (action, detail)
  values ('face_forget', jsonb_build_object('user', uid, 'codes', n, 'prints', np, 'kept_for_prize', nk));
  return jsonb_build_object('forgotten', true, 'codes', n, 'prints', np, 'kept', nk);
end $$;
revoke all on function public.kr8_forget_my_face() from public, anon;
grant execute on function public.kr8_forget_my_face() to authenticated;

commit;
