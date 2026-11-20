-- 0163 · "Not yet" for Reels (20 Nov). A soft, coaching no: the Reel is hidden from everyone else (same
-- plumbing as 'hidden' — no new status, no strike, awards removed), the member still sees it with the tips.
-- Not-yet notes are marked with "⏳ " at the start of each language line ("th\nen"). The server adds the
-- Founding line when the member's ฿100 Founding chance is still open, and the push speaks the member's language.

alter table public.kr8_posts drop constraint if exists kr8_posts_review_note_check;
alter table public.kr8_posts add constraint kr8_posts_review_note_check check (review_note is null or length(review_note) <= 1900);

create or replace function public.kr8_notyet_founding_open(p_member uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_rcfg('founding_on', 1) = 1 and public.kr8_rcfg('founding_thb', 100) > 0
     and not public.kr8_is_team(p_member)
     and not exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding')
     and (select coalesce(max(founding_no), 0) from public.kr8_prizes
           where kind = 'founding' and is_test = public.kr8_is_test_member(p_member)) < public.kr8_rcfg('founding_slots', 50)
$$;
revoke all on function public.kr8_notyet_founding_open(uuid) from public, anon, authenticated;

create or replace function public.kr8_admin_review_reel(p_reel uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid; th text; en text; t text; i int; lines text[];
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_status not in ('approved', 'hidden', 'not_yet') then raise exception 'KR8_BAD_STATUS'; end if;
  if p_status = 'not_yet' then
    select author into a from public.kr8_posts where id = p_reel and kind = 'reel';
    if a is null then raise exception 'KR8_NO_REEL'; end if;
    t := btrim(replace(coalesce(p_note, ''), '⏳', ''));
    if t = '' then raise exception 'KR8_NOTE_NEEDED'; end if;
    lines := regexp_split_to_array(t, E'\\s*\\n\\s*');
    th := btrim(lines[1]); en := btrim(lines[array_length(lines, 1)]);
    if public.kr8_notyet_founding_open(a) then
      th := th || ' โพสต์รีลใหม่ได้ตลอดนะครับ สิทธิ์ ฿100 Founding Local ของคุณยังอยู่ครับ';
      en := en || ' Post a new one anytime — your Founding ฿100 chance is still open.';
    else
      th := th || ' โพสต์รีลใหม่ได้ตลอดเลยครับ';
      en := en || ' Post a new one anytime!';
    end if;
    update public.kr8_posts
       set status = 'hidden', hidden = true, reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = left('⏳ ' || left(th, 900) || E'\n⏳ ' || left(en, 900), 1900)
     where id = p_reel and kind = 'reel';
    delete from public.kr8_reel_awards where reel_id = p_reel;
    return;
  end if;
  update public.kr8_posts
     set status = p_status, hidden = (p_status = 'hidden'), reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(left(btrim(coalesce(p_note, '')), 200), '')
   where id = p_reel and kind = 'reel';
  if not found then raise exception 'KR8_NO_REEL'; end if;
  if p_status = 'hidden' then delete from public.kr8_reel_awards where reel_id = p_reel; end if;
end $$;

create or replace function public.kr8_push_on_reel_hidden()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare ny boolean := left(coalesce(new.review_note, ''), 1) = '⏳'; thai boolean; parts text[]; body text;
begin
  if to_regprocedure('public.kr8_push_queue(text,uuid,boolean,text,text,text,uuid,boolean)') is not null then
    if ny then
      select coalesce(upper((m.langs)[1]), 'TH') = 'TH' into thai from public.kr8_members m where m.user_id = new.author;
      thai := coalesce(thai, true);
      parts := regexp_split_to_array(new.review_note, E'\\n');
      body := btrim(replace(case when thai then parts[1] else parts[array_length(parts, 1)] end, '⏳', ''));
      perform public.kr8_push_queue('admin', new.author, false,
        case when thai then 'ยังไม่ผ่านรอบนี้ · มีคำแนะนำสำหรับรีลถัดไปครับ' else 'Not yet — tips for your next Reel' end,
        left(body, 240), '/app/?tab=me', new.id, false);
    else
      perform public.kr8_push_queue('admin', new.author, false, 'รีลของคุณถูกซ่อน · Your Reel was hidden', left(new.review_note, 240),
                                    '/app/?tab=me', new.id, false);
    end if;
  end if;
  return new;
exception when others then return new;      -- a ding must never block the review
end $$;
