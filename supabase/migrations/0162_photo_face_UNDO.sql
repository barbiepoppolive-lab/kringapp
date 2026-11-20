-- UNDO 0162: removes the photo guard and audit; restores kr8_people / kr8_admin_photo_ok (see bus/drop/pf162/before_*.sql)
do $$ begin if exists (select 1 from cron.job where jobname = 'kr8_photo_audit') then perform cron.unschedule('kr8_photo_audit'); end if; end $$;
drop trigger if exists kr8_photo_face_guard on public.kr8_members;
update public.kr8_members set photo_check = 'unchecked' where photo_check in ('no_face','look');
alter table public.kr8_members drop constraint if exists kr8_members_photo_check_check;
alter table public.kr8_members add constraint kr8_members_photo_check_check check (photo_check = any (array['ok','unchecked']));
-- then run before_kr8_people.sql and before_kr8_admin_photo_ok.sql
