-- UNDO for 0113_kr8_admin_growth.sql (18 Nov 2026). 0113 only added one read-only admin function; nothing else to put back.
-- The admin app falls back to a "needs database update 0113" card on the Growth tab when the function is missing.
begin;
drop function if exists public.kr8_admin_growth(int);
commit;
