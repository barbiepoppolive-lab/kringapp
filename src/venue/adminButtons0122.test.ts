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

describe('0162 one honest photo label (was "Photo needs a look" + "Photo OK" side by side)', () => {
  const labels = (row: HTMLElement) => Array.from(row.querySelectorAll('[data-photo-check]')).map((n) => n.textContent);
  it('ok / null: nothing · unchecked: "Photo being checked" (no button) · no_face: red, no button · look: ONE tap-if-fine button', () => {
    expect(labels(memberRow({ ...member, photo_check: 'ok' }))).toEqual([]);
    expect(labels(memberRow({ ...member, photo_check: null }))).toEqual([]);
    const un = memberRow({ ...member, photo_check: 'unchecked' });
    expect(labels(un)).toEqual(['Photo being checked']);
    expect(un.querySelector('[data-photo-ok]')).toBeNull();
    const nf = memberRow({ ...member, photo_check: 'no_face' });
    expect(labels(nf)).toEqual(['No face in photo · hidden from People']);
    expect(nf.querySelector('[data-photo-ok]')).toBeNull();
    const lk = memberRow({ ...member, photo_check: 'look' });
    expect(labels(lk)).toEqual(['Photo: check by eye · tap if fine']);
    expect(lk.querySelectorAll('[data-photo-ok]').length).toBe(1);
    expect(lk.textContent).not.toContain('Photo needs a look');
  });
  it('one tap on "check by eye" calls the admin RPC and shows ✓ Photo OK', async () => {
    const row = memberRow({ ...member, photo_check: 'look' });
    document.body.append(row);
    const b = row.querySelector<HTMLButtonElement>('[data-photo-ok="u-0122"]')!;
    b.click(); await flush();
    expect(calls).toEqual([{ fn: 'kr8_admin_photo_ok', args: { p_user: 'u-0122' } }]);
    expect(b.textContent).toBe('✓ Photo OK');
    expect(b.disabled).toBe(true);
  });
  it('a failed save lets the admin tap again', async () => {
    fail = 'KR8_ADMIN_ONLY';
    const row = memberRow({ ...member, photo_check: 'look' });
    document.body.append(row);
    const b = row.querySelector<HTMLButtonElement>('[data-photo-ok]')!;
    b.click(); await flush();
    expect(b.disabled).toBe(false);
    expect(b.title).toContain('KR8_ADMIN_ONLY');
  });
  it('the photo sheet (tap on the photo) shows the same single label', async () => {
    const row = memberRow({ ...member, photo_check: 'look' });
    document.body.append(row);
    row.querySelector<HTMLButtonElement>('button.ml-ph')!.click();
    const inSheet = document.querySelector<HTMLButtonElement>('.sheet [data-photo-ok="u-0122"]');
    expect(inSheet).not.toBeNull();
    inSheet!.click(); await flush();
    expect(calls.map((c) => c.fn)).toEqual(['kr8_admin_photo_ok']);
    expect(row.querySelector<HTMLButtonElement>('[data-photo-ok]')!.textContent).toBe('✓ Photo OK');
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

describe('20 Nov: a member row opens the admin member page', () => {
  it('the name is a link to #m/<user id>', () => {
    const row = memberRow({ ...member, photo_check: 'ok' });
    const a = row.querySelector<HTMLAnchorElement>('a.ml-open')!;
    expect(a.getAttribute('href')).toBe('#m/u-0122');
    expect(a.textContent).toContain('Ploy');
  });
});
