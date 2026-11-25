-- UNDO m240 (LINE rich menu data). Run after the rich menu is removed from LINE.
drop function if exists public.kr8_line_menu_data(text, text);
drop table if exists public.kr8_line_menu_taps;
