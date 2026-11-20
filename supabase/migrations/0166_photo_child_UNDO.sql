-- 0166 UNDO: back to the card-photo audit without the child rule (holds / bans / messages already made stay; clear them by hand)
alter table public.kr8_photo_audit drop constraint if exists kr8_photo_audit_verdict_check;
update public.kr8_photo_audit set verdict = 'no_face' where verdict = 'child';
alter table public.kr8_photo_audit add constraint kr8_photo_audit_verdict_check check (verdict = any (array['ok','no_face','look']));
delete from public.kr8_rings_config where key = 'photo_child_high';
CREATE OR REPLACE FUNCTION public.kr8_photo_audit_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; f jsonb; nf int; person numeric; words int; v text; why text; hid int := 0; looks int := 0; cleared int := 0; sent int := 0; mid bigint;
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
    if nf = 0 and person < 80 then v := 'no_face'; why := 'no person in the photo';
    elsif nf = 0 then v := 'look'; why := 'a person but no clear face';
    elsif nf >= 3 then v := 'look'; why := 'group photo';
    elsif words >= 25 then v := 'look'; why := 'lots of text (screenshot?)';
    end if;
    insert into public.kr8_photo_audit (user_id, md5, verdict, why, decided_at) values (r.user_id, r.md5, v, why, now())
    on conflict (user_id) do update set verdict = excluded.verdict, why = excluded.why, decided_at = now(),
      admin_ok = case when public.kr8_photo_audit.md5 = excluded.md5 then public.kr8_photo_audit.admin_ok else false end,
      md5 = excluded.md5;
    if v = 'no_face' then
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
  return jsonb_build_object('hidden', hid, 'look', looks, 'cleared', cleared, 'messages', sent);
end $function$
;
