-- UNDO 0171: restore kr8_face_aws_record as before (bus/drop/m0171_before_kr8_face_aws_record.sql, the 0161 version) and drop
-- the new objects. Run the before-file first, then this.
drop function if exists public.kr8_admin_account_check_note(uuid, text);
drop function if exists public.kr8_admin_account_check_decide(uuid, text);
drop function if exists public.kr8_admin_account_checks();
drop function if exists public.kr8_account_check_request(text);
-- the tables keep history; drop only if you really want the refusals gone:
-- drop table if exists public.kr8_account_checks; drop table if exists public.kr8_dup_ok; drop table if exists public.kr8_dup_refusals;
