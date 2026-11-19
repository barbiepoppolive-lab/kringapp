// @vitest-environment jsdom
// 0122: "Photo OK" (Members row, photo sheet, member page) and Help "No reply needed" (Needs you card + Help panel).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const calls: { fn: string; args: Record<string, unknown> }[] = [];
let fail: string | null = null;
vi.mock('./shared', async (orig) => ({
  ...(await orig<typeof import('./shared')>()),
  rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    calls.push({ fn, args });
    if (fail) throw new Error(fail);
    return fn === 'kr8_admin_help_no_reply' ? { closed: 1 } : { photo_check: 'ok' };
  }),
}));

import { memberRow, type MemberRow } from './adminApp';
import { helpCaseCard } from './adminHelp';
import type { HelpCase } from './adminHelpLogic';

const flush = () => new Promise((r) => setTimeout(r, 0));
const member: MemberRow = {
  user_id: 'u-0122', member_no: 77, first_name: 'Ploy', photo: 'data:image/jpeg;base64,/9j/4AA', joined_at: '2026-11-18T10:00:00Z',
  ref_code: null, src_code: null, who: 'local', area: 'Ari', langs: ['TH'], gender: null, show_gender: false, ig_handle: null, tiktok_handle: null,
  bio: null, interests: [], verified: false, age_ok: true, terms_ok: true, last_active_at: null, reels_approved: 0, reels_waiting: 0, reels_hidden: 0,
  card_complete: true, is_test: false, photo_check: 'unchecked',
};
const helpCase: HelpCase = {
  thread_id: 't-0122', member: 'm-0122', member_no: 501, name: 'Kaew', photo: null, verified: false, test: false,
  waiting_since: new Date().toISOString(), last_at: new Date().toISOString(), unanswered: 1,
  question: '[Help] thanks!', messages: ['[Help] thanks!'], history: [],
};

beforeEach(() => { calls.length = 0; fail = null; document.body.replaceChildren(); });

describe('0122 Photo OK', () => {
  it('shows a Photo OK button only next to "Photo needs a look", and one tap calls the admin RPC and clears the flag', async () => {
    expect(memberRow({ ...member, photo_check: 'ok' }).querySelector('[data-photo-ok]')).toBeNull();
    expect(memberRow({ ...member, photo_check: null }).querySelector('[data-photo-ok]')).toBeNull();
    const row = memberRow({ ...member });
    document.body.append(row);
    const b = row.querySelector<HTMLButtonElement>('[data-photo-ok="u-0122"]')!;
    expect(b.textContent).toBe('Photo OK');
    expect(row.querySelector('[data-photo-check="unchecked"]')).not.toBeNull();
    b.click(); await flush();
    expect(calls).toEqual([{ fn: 'kr8_admin_photo_ok', args: { p_user: 'u-0122' } }]);
    expect(b.textContent).toBe('✓ Photo OK');
    expect(b.disabled).toBe(true);
    expect(row.querySelector('[data-photo-check="unchecked"]')).toBeNull();
  });
  it('a failed save keeps the flag and lets the admin tap again', async () => {
    fail = 'KR8_ADMIN_ONLY';
    const row = memberRow({ ...member });
    document.body.append(row);
    const b = row.querySelector<HTMLButtonElement>('[data-photo-ok]')!;
    b.click(); await flush();
    expect(b.disabled).toBe(false);
    expect(b.dataset.error).toBe('KR8_ADMIN_ONLY');
    expect(row.querySelector('[data-photo-check="unchecked"]')).not.toBeNull();
  });
  it('the photo sheet (tap on the photo) also has Photo OK', async () => {
    const row = memberRow({ ...member });
    document.body.append(row);
    row.querySelector<HTMLButtonElement>('button.ml-ph')!.click();
    const inSheet = document.querySelector<HTMLButtonElement>('.sheet [data-photo-ok="u-0122"]');
    expect(inSheet).not.toBeNull();
    inSheet!.click(); await flush();
    expect(calls.map((c) => c.fn)).toEqual(['kr8_admin_photo_ok']);
    expect(row.querySelector<HTMLButtonElement>('[data-photo-ok]')!.textContent).toBe('✓ Photo OK');
    expect(document.querySelector('[data-photo-check="unchecked"]')).toBeNull();
  });
});

describe('0122 Help "No reply needed"', () => {
  it('closes the case without sending a message', async () => {
    let done = '';
    const card = helpCaseCard(helpCase, (c) => { done = c.member; });
    const b = card.querySelector<HTMLButtonElement>('#hpaNoReply-m-0122')!;
    expect(b.textContent).toBe('No reply needed');
    b.click(); await flush();
    expect(calls).toEqual([{ fn: 'kr8_admin_help_no_reply', args: { p_member: 'm-0122', p_thread: 't-0122' } }]);
    expect(calls.some((c) => c.fn.startsWith('kr8_admin_team_reply'))).toBe(false);
    expect(done).toBe('m-0122');
    expect(card.classList.contains('hpa-done')).toBe(true);
    expect(card.querySelector('.hpa-status')!.textContent).toContain('no message sent');
  });
  it('the SQL is admin-only, keeps the ack filter and adds the closed filter; help_cases / self-fix are left for a hand patch', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0122_admin_photo_ok_help_done.sql'), 'utf8');
    const code = sql.replace(/--.*$/gm, '');
    expect(code.match(/if not public\.kr8_is_admin\(\) then raise exception 'KR8_ADMIN_ONLY'/g)?.length).toBe(4);
    expect(code.match(/not public\.kr8_is_ack\(x\.body\)/g)?.length).toBe(2);
    expect(code.match(/x\.id > public\.kr8_help_closed_upto\(t\.id\)/g)?.length).toBe(2);
    expect(code).toMatch(/revoke all on function public\.kr8_admin_photo_ok\(uuid\) from public, anon;/);
    expect(code).toMatch(/revoke all on function public\.kr8_admin_help_no_reply\(uuid, uuid\) from public, anon;/);
    expect(code).not.toMatch(/function public\.kr8_admin_help_cases|function public\.kr8_robot_self_fix_run/);
  });
});
