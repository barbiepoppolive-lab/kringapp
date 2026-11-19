-- 0127 · Invite Rings also when the invited friend passes the face check (until now only a ref change or an approved Reel
-- triggered kr8_invite_try, so a friend who verified but had no approved Reel never paid out). Same rule, same function.
create or replace function public.kr8_invite_verify_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.verified, false) and not coalesce(old.verified, false) and lower(coalesce(new.ref_code, '')) ~ '^k0*[0-9]{1,7}$' then
    begin perform public.kr8_invite_try(new.user_id); exception when others then raise warning 'kr8_invite_verify_trg: %', sqlerrm; end;
  end if;
  return new;
end $$;
drop trigger if exists kr8_invite_verify on public.kr8_members;
create trigger kr8_invite_verify after update of verified on public.kr8_members for each row execute function public.kr8_invite_verify_trg();
