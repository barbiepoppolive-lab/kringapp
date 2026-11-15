import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cardMissing, igUrl, isMemberList, langNames, memberJoined, memberRow, memberVia, ttUrl, type MemberList, type MemberRow } from '../venue/adminApp';

// Shape returned by public.kr8_admin_member_list() (0053); values shaped like a live run on 15 Nov 2026 (photo shortened, names changed).
const full: MemberRow = {
  user_id: '0a21313a-0000-0000-0000-000000000016', member_no: 16, first_name: 'Ton', photo: 'data:image/jpeg;base64,/9j/4AA',
  joined_at: '2026-11-15T14:22:52.223301+00:00', ref_code: 'pich', src_code: null, who: 'local', area: 'Bangkok', langs: ['TH', 'EN'],
  gender: 'male', show_gender: false, ig_handle: '@ton_bkk', tiktok_handle: 'tonbkk', bio: 'Coffee in Ari', interests: ['cafes', 'music'],
  verified: false, age_ok: true, terms_ok: true, last_active_at: new Date(Date.now() - 20 * 60000).toISOString(),
  reels_approved: 2, reels_waiting: 1, reels_hidden: 0, card_complete: true, is_test: false,
};
const bare: MemberRow = { ...full, user_id: 'u14', member_no: 14, first_name: 'Mali', photo: null, ref_code: null, src_code: null, gender: null, show_gender: false,
  ig_handle: null, tiktok_handle: null, bio: null, interests: [], card_complete: false, reels_approved: 0, reels_waiting: 0 };
const list: MemberList = { total: 2, test_hidden: 12, members: [full, bare] };

describe('admin member list', () => {
  it('accepts the function output shape and rejects anything else', () => {
    expect(isMemberList(list)).toBe(true);
    expect(isMemberList(null)).toBe(false);
    expect(isMemberList({ total: 1, members: [] })).toBe(false);
    expect(isMemberList({ ...list, members: [{ first_name: 'x' }] })).toBe(false);
  });
  it('joined time in Bangkok and India, plain words', () => {
    expect(memberJoined(full.joined_at)).toBe('joined 15 Nov · 21:22 Bangkok · 19:52 India');
    expect(memberVia(full)).toBe('via pich');
    expect(memberVia({ ref_code: null, src_code: 'ig' })).toBe('via ig');
    expect(memberVia(bare)).toBe('direct');
    expect(langNames(['TH', 'EN', 'XX'])).toBe('Thai, English, XX');
    expect(igUrl('@ton_bkk')).toBe('https://instagram.com/ton_bkk');
    expect(igUrl('https://www.instagram.com/ton_bkk/')).toBe('https://instagram.com/ton_bkk');
    expect(ttUrl('@tonbkk')).toBe('https://tiktok.com/@tonbkk');
    expect(cardMissing(bare)).toEqual(['photo']);
    expect(cardMissing({ photo: null, first_name: ' ', area: '' })).toEqual(['photo', 'name', 'area']);
  });
  it('renders a full row: photo button, name, number, via, links, hidden gender with a lock, Reels', () => {
    let opened = '';
    const r = memberRow(full, (m) => { opened = m.user_id; });
    const t = r.textContent || '';
    expect(t).toContain('Ton');
    expect(t).toContain('#16');
    expect(t).toContain('joined 15 Nov · 21:22 Bangkok · 19:52 India');
    expect(t).toContain('via pich');
    expect(t).toContain('Local · Bangkok · Thai, English');
    expect(r.querySelector('[data-gender="hidden"] svg')).not.toBeNull();
    expect((r.querySelector('[data-ig]') as HTMLAnchorElement).href).toBe('https://instagram.com/ton_bkk');
    expect((r.querySelector('[data-tt]') as HTMLAnchorElement).href).toBe('https://tiktok.com/@tonbkk');
    expect(t).toContain('Coffee in Ari');
    expect(t).toContain('✓ Card complete');
    expect(t).toContain('Not verified');
    expect(r.querySelector('[data-reels]')!.textContent).toBe('Reels: 2 live · 1 waiting · 0 hidden');
    expect(t).toContain('Last seen 20 min ago');
    (r.querySelector('button.ml-ph') as HTMLButtonElement).click();
    expect(opened).toBe(full.user_id);
  });
  it('renders a bare row: "No photo yet", direct, no gender, no links, card missing photo', () => {
    const r = memberRow(bare);
    const t = r.textContent || '';
    expect(r.querySelector('[data-nophoto]')!.textContent).toContain('No photo yet');
    expect(r.querySelector('img')).toBeNull();
    expect(t).toContain('direct');
    expect(r.querySelector('[data-gender]')).toBeNull();
    expect(r.querySelector('.ml-links')).toBeNull();
    expect(t).toContain('Card missing photo');
    const shown = memberRow({ ...full, show_gender: true });
    expect(shown.querySelector('[data-gender="shown"] svg')).toBeNull();
    expect(shown.textContent).toContain('Male');
  });
  it('migration is additive, admin-only, has an UNDO line and hides test members by default', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0053_kr8_admin_member_list.sql'), 'utf8');
    expect(sql.split('\n').slice(0, 4).join('\n')).toMatch(/UNDO: drop function if exists public\.kr8_admin_member_list\(int, boolean\)/);
    expect(sql).toMatch(/p_include_test boolean default false/);
    expect(sql).toMatch(/if not public\.kr8_is_admin\(\) then raise exception 'KR8_ADMIN_ONLY'/);
    expect(sql).toMatch(/revoke all on function public\.kr8_admin_member_list\(int, boolean\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.kr8_admin_member_list\(int, boolean\) to authenticated;/);
    expect(sql).toMatch(/p\.kind = 'reel'/);
    expect(sql).toMatch(/kr8_is_test_member/);
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\b(alter|drop|insert|update|delete|truncate)\b/i);
    for (const k of ['member_no', 'first_name', 'photo', 'joined_at', 'ref_code', 'src_code', 'who', 'area', 'langs', 'gender', 'show_gender', 'ig_handle', 'tiktok_handle',
      'bio', 'interests', 'verified', 'age_ok', 'terms_ok', 'last_active_at', 'reels_approved', 'reels_waiting', 'reels_hidden', 'card_complete']) expect(code).toContain(`'${k}'`);
  });
});
