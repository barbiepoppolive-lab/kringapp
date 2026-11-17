-- 0091 · 0088's auto-approve must not override the instant face check (0081) (17 Nov 2026).
-- 0081 writes its own decision into live_check.auto ('pass' / 'review' / 'block') with straight/left/right = true.
-- Without this, 0088 would approve 0081's 'review' rows (possible duplicate accounts) the moment they are inserted.
-- Rows from the older check (no live_check.auto) keep 0088's behaviour.
-- UNDO: re-run 0088's kr8_verify_auto_trg.

create or replace function public.kr8_verify_auto_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare ok boolean;
begin
  if new.live_check ? 'auto' then return new; end if;   -- 0081 decided this row itself
  ok := coalesce((new.live_check->>'straight')::boolean,false) and coalesce((new.live_check->>'left')::boolean,false)
        and coalesce((new.live_check->>'right')::boolean,false);
  if new.status = 'pending' and ok and not exists (select 1 from public.kr8_members where user_id = new.user_id and ghost) then
    new.status := 'approved'; new.reviewed_at := now();
  end if;
  return new;
end $$;
