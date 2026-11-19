-- 0126 · Private test cards (19 Nov 2026). A card made from kringapp.com/app/?ref=test1 is a test member AND a ghost
-- from the first second: nobody else sees the card, its posts, Reels, face check or Rings (ghost = hidden everywhere
-- through kr8_is_blocked; test member = left out of rankings, prizes, website, alerts). Unlike a normal ghost, a test
-- member may post (so the founder can test the whole flow) and may use the server face check before it is switched on.
begin;

create or replace function public.kr8_test_ghost_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.ref_code, '') = 'test1' and (tg_op = 'INSERT' or not old.ghost) then
    perform set_config('kr8.ghost_set', '1', true);
    new.ghost := true;
  end if;
  return new;
end $$;
drop trigger if exists kr8_aa_test_ghost on public.kr8_members;   -- "aa": runs before kr8_ghost_member
create trigger kr8_aa_test_ghost before insert or update of ref_code on public.kr8_members
  for each row execute function public.kr8_test_ghost_trg();

create or replace function public.kr8_ghost_guard_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid;
begin
  if tg_argv[0] = 'auth' then actor := auth.uid();
  else actor := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  end if;
  if not public.kr8_is_ghost(actor) and not public.kr8_is_cardless_admin(actor) then return new; end if;   -- 0077: cardless admin
  -- 0126: a private test card (ref test1) may post; the post stays invisible to others because its author is a ghost
  if tg_table_name = 'kr8_posts' and public.kr8_is_test_member(actor) then return new; end if;
  if tg_argv[1] = 'skip' then return null; end if;
  raise exception 'KR8_GHOST';
end $$;

commit;
