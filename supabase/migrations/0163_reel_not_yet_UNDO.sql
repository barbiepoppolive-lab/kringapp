-- UNDO 0163: restore the 200-char approved/hidden-only review and the bilingual hidden push.
create or replace function public.kr8_admin_review_reel(p_reel uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_status not in ('approved', 'hidden') then raise exception 'KR8_BAD_STATUS'; end if;
  update public.kr8_posts
     set status = p_status, hidden = (p_status = 'hidden'), reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(left(btrim(coalesce(p_note, '')), 200), '')
   where id = p_reel and kind = 'reel';
  if not found then raise exception 'KR8_NO_REEL'; end if;
  if p_status = 'hidden' then delete from public.kr8_reel_awards where reel_id = p_reel; end if;
end $function$;

create or replace function public.kr8_push_on_reel_hidden()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if to_regprocedure('public.kr8_push_queue(text,uuid,boolean,text,text,text,uuid,boolean)') is not null then
    perform public.kr8_push_queue('admin', new.author, false, 'รีลของคุณถูกซ่อน · Your Reel was hidden', left(new.review_note, 240),
                                  '/app/?tab=me', new.id, false);
  end if;
  return new;
exception when others then return new;
end $function$;

drop function if exists public.kr8_notyet_founding_open(uuid);

-- note: any ⏳ notes longer than 200 chars must be trimmed before the old check comes back
update public.kr8_posts set review_note = left(review_note, 200) where length(review_note) > 200;
alter table public.kr8_posts drop constraint if exists kr8_posts_review_note_check;
alter table public.kr8_posts add constraint kr8_posts_review_note_check check (review_note is null or length(review_note) <= 200);
