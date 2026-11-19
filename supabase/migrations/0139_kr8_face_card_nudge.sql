-- 0139 (19 Nov, founder): the card photo no longer decides the face check ✓ (it sent most checks to the founder by hand).
-- When the camera face passes but the card photo doesn't match it (or shows no face), the member is verified and gets ONE
-- system message asking for a clear photo of themself. At most once a week per member. Service role only (face-check-aws).
create table if not exists public.kr8_card_nudges (user_id uuid primary key, why text, sent_at timestamptz not null default now());
alter table public.kr8_card_nudges enable row level security;

create or replace function public.kr8_face_card_nudge(p_user uuid, p_why text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.kr8_card_nudges where user_id = p_user and sent_at > now() - interval '7 days') then return false; end if;
  insert into public.kr8_card_nudges (user_id, why) values (p_user, left(p_why, 40))
    on conflict (user_id) do update set why = excluded.why, sent_at = now();
  perform public.kr8_system_notice(p_user,
    'ยืนยันตัวตนเรียบร้อยแล้ว ✓ แต่รูปบนการ์ดของคุณดูไม่เหมือนหน้าคุณตอนสแกน รบกวนเปลี่ยนรูปการ์ดเป็นรูปที่เห็นหน้าคุณชัดๆ นะครับ (ฉัน › แก้ไขโปรไฟล์)',
    'You''re verified ✓ Your card photo doesn''t look like the face from your face check. Please change it to a clear photo of you (Me › Edit profile).');
  return true;
end $$;
revoke all on function public.kr8_face_card_nudge(uuid, text) from public, anon, authenticated;
grant execute on function public.kr8_face_card_nudge(uuid, text) to service_role;
