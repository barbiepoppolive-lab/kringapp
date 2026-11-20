-- 0166 (20 Nov 2026): card photos of children are refused and caught.
-- Founder: "Why the photo of kid is approved?" (#307's card photo is a small child; AWS reads 3–7).
-- 1. Sign-up / edit: face-check-aws 'photo' now answers 'child' when the main face's AWS age range tops out under 18
--    (photoverdict.ts) → no photo pass → the kr8_members photo trigger refuses it; the app says "Kring is for adults 18+".
-- 2. The 5-minute photo robot (kr8_photo_audit_run) applies the same rule to existing card photos: photo_check = 'no_face'
--    (out of People), possible-minor hold (out of public feeds), prize ban 'all' "Card photo shows a child", one kind
--    "change your photo" message. Nothing is deleted. The founder's Clear on a minor hold / OK on the photo wins.
insert into public.kr8_rings_config (key, value, note) values ('photo_child_high', 18, 'Card photo: AWS age range top below this = a child''s photo (0166)')
on conflict (key) do nothing;
alter table public.kr8_photo_audit drop constraint if exists kr8_photo_audit_verdict_check;
alter table public.kr8_photo_audit add constraint kr8_photo_audit_verdict_check check (verdict = any (array['ok','no_face','look','child']));
CREATE OR REPLACE FUNCTION public.kr8_photo_audit_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; f jsonb; nf int; person numeric; words int; v text; why text; hid int := 0; looks int := 0; cleared int := 0; sent int := 0; mid bigint;
        hi int; lo int; kids int := 0; child_high int := public.kr8_rcfg('photo_child_high', 18);
begin
  for r in
    select m.user_id, m.member_no, m.photo_check, m.langs, md5(m.photo) as md5, q.features
      from public.kr8_members m
      join public.kr8_people_quality q on q.user_id = m.user_id and q.photo_md5 = md5(m.photo)
     where m.photo is not null and not coalesce(m.ghost, false)
       and not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id)
  loop
    f := r.features -> 'photo';
    if f is null then continue; end if;   -- the robot could not read the photo: leave it
    if exists (select 1 from public.kr8_photo_audit a where a.user_id = r.user_id and a.md5 = r.md5 and a.admin_ok) then continue; end if;
    nf := (select count(*) from jsonb_array_elements(coalesce(f -> 'faces', '[]')) x where (x ->> 'conf')::numeric >= 90);
    person := coalesce((f ->> 'person')::numeric, 0);
    words := coalesce((f ->> 'words')::int, 0);
    v := 'ok'; why := null;
    hi := (f #>> '{faces,0,high}')::int; lo := (f #>> '{faces,0,low}')::int;
    -- 0166 (20 Nov, founder: "why the photo of kid is approved?"): the main face reads under 18 → a child's photo.
    -- Not when the founder already cleared them (minor hold cleared) — that is his call.
    if nf between 1 and 2 and hi is not null and hi < child_high
       and not exists (select 1 from public.kr8_minor_holds h where h.user_id = r.user_id and h.cleared_at is not null) then
      v := 'child'; why := format('card photo shows a child (AWS %s–%s)', lo, hi);
    elsif nf = 0 and person < 80 then v := 'no_face'; why := 'no person in the photo';
    elsif nf = 0 then v := 'look'; why := 'a person but no clear face';
    elsif nf >= 3 then v := 'look'; why := 'group photo';
    elsif words >= 25 then v := 'look'; why := 'lots of text (screenshot?)';
    end if;
    insert into public.kr8_photo_audit (user_id, md5, verdict, why, decided_at) values (r.user_id, r.md5, v, why, now())
    on conflict (user_id) do update set verdict = excluded.verdict, why = excluded.why, decided_at = now(),
      admin_ok = case when public.kr8_photo_audit.md5 = excluded.md5 then public.kr8_photo_audit.admin_ok else false end,
      md5 = excluded.md5;
    if v = 'child' then
      if r.photo_check is distinct from 'no_face' then update public.kr8_members set photo_check = 'no_face' where user_id = r.user_id; hid := hid + 1; end if;
      perform public.kr8_minor_hold_add(r.user_id, format('Card photo shows a child (AWS reads %s–%s years)', lo, hi), 'aws_photo');
      insert into public.kr8_prize_bans (user_id, member_no, reason, scope)
        values (r.user_id, r.member_no, 'Card photo shows a child', 'all') on conflict do nothing;
      if not exists (select 1 from public.kr8_photo_notices n where n.user_id = r.user_id) then
        if 'TH' = any (coalesce(r.langs, '{}')) or not ('EN' = any (coalesce(r.langs, '{}'))) then
          mid := public.kr8_system_notice(r.user_id,
            'สวัสดีครับ 🙂 รูปโปรไฟล์ของคุณดูเหมือนรูปเด็ก Kring สำหรับผู้ที่อายุ 18 ปีขึ้นไปครับ กรุณาเปลี่ยนเป็นรูปของคุณเองที่เห็นหน้าชัด ๆ นะครับ (แตะที่การ์ดของคุณในแท็บ Me เพื่อเปลี่ยนรูป)',
            'Hi 🙂 Your profile photo looks like a photo of a child. Please use a clear photo of yourself — Kring is for adults 18+ (tap your card in the Me tab to change it).');
        else
          mid := public.kr8_system_notice(r.user_id,
            'Hi 🙂 Your profile photo looks like a photo of a child. Please use a clear photo of yourself — Kring is for adults 18+ (tap your card in the Me tab to change it).',
            'Hi 🙂 Your profile photo looks like a photo of a child. Please use a clear photo of yourself — Kring is for adults 18+ (tap your card in the Me tab to change it).');
        end if;
        insert into public.kr8_photo_notices (user_id, message_id) values (r.user_id, mid) on conflict do nothing;
        sent := sent + 1;
      end if;
      kids := kids + 1;
    elsif v = 'no_face' then
      if r.photo_check is distinct from 'no_face' then update public.kr8_members set photo_check = 'no_face' where user_id = r.user_id; hid := hid + 1; end if;
      if not exists (select 1 from public.kr8_photo_notices n where n.user_id = r.user_id) then
        if 'TH' = any (coalesce(r.langs, '{}')) or not ('EN' = any (coalesce(r.langs, '{}'))) then
          mid := public.kr8_system_notice(r.user_id,
            'สวัสดีครับ 🙂 รูปโปรไฟล์ของคุณยังไม่เห็นหน้าคุณ ลองเปลี่ยนเป็นรูปที่เห็นหน้าคุณชัด ๆ นะครับ แล้วคุณจะกลับมาแสดงในหน้า People ให้เพื่อน ๆ เห็นครับ (แตะที่การ์ดของคุณในแท็บ Me เพื่อเปลี่ยนรูป)',
            'Hi 🙂 Your profile photo doesn''t show your face yet. Add a clear photo of you to show up in People again (tap your card in the Me tab to change it).');
        else
          mid := public.kr8_system_notice(r.user_id,
            'Hi 🙂 Your profile photo doesn''t show your face yet. Add a clear photo of you to show up in People again (tap your card in the Me tab to change it).',
            'Hi 🙂 Your profile photo doesn''t show your face yet. Add a clear photo of you to show up in People again (tap your card in the Me tab to change it).');
        end if;
        insert into public.kr8_photo_notices (user_id, message_id) values (r.user_id, mid) on conflict do nothing;
        sent := sent + 1;
      end if;
    elsif v = 'look' then
      if r.photo_check is distinct from 'look' then update public.kr8_members set photo_check = 'look' where user_id = r.user_id; looks := looks + 1; end if;
    else
      if r.photo_check in ('no_face','look','unchecked') or r.photo_check is null then
        update public.kr8_members set photo_check = 'ok' where user_id = r.user_id and photo_check is distinct from 'ok'; cleared := cleared + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('hidden', hid, 'look', looks, 'cleared', cleared, 'messages', sent, 'child', kids);
end $function$
;;
