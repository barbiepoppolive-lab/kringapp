// 17 Nov admin view (?admin=1): the wish is remembered per phone, only the server can switch it on, and while it is on the
// client never sends a write / log call. Migration 0077 keeps every new path behind kr8_is_admin().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ADMIN_VIEW_NO_SHEETS, ADMIN_VIEW_READS, adminPanelHref, adminViewActive, adminViewBlocks, adminViewWanted, guardClient, setAdminViewActive,
} from './adminView';
import { AdminViewMe, AdminViewPill } from './V5AdminView';
import { v5ErrText } from './v5Strings';

const loc = (search: string) => ({ search, pathname: '/app/', hash: '' });
const L = (en: string) => en;

beforeEach(() => { localStorage.clear(); setAdminViewActive(false); });
afterEach(() => { setAdminViewActive(false); });

describe('the ?admin=1 wish', () => {
  it('is remembered on this phone until Exit / ?admin=0', () => {
    expect(adminViewWanted(loc(''))).toBe(false);
    expect(adminViewWanted(loc('?admin=1'))).toBe(true);
    expect(adminViewWanted(loc(''))).toBe(true);           // a later visit without the parameter
    expect(adminViewWanted(loc('?admin=0'))).toBe(false);
    expect(adminViewWanted(loc(''))).toBe(false);
  });
  it('Exit (or a non-admin sign-in) forgets it', () => {
    adminViewWanted(loc('?admin=1'));
    setAdminViewActive(false);
    expect(adminViewWanted(loc(''))).toBe(false);
  });
  it('the wish alone does not switch anything on: only the server answer does', () => {
    adminViewWanted(loc('?admin=1'));
    expect(adminViewActive()).toBe(false);
    expect(adminViewBlocks('kr8_toggle_like')).toBe(false);   // a non-admin with ?admin=1 still uses the app normally
    setAdminViewActive(true);
    expect(adminViewActive()).toBe(true);
  });
});

describe('read-only while on', () => {
  it('blocks every write, log and count call; lets reads through', () => {
    setAdminViewActive(true);
    for (const fn of ['kr8_toggle_like', 'kr8_toggle_save', 'kr8_follow', 'kr8_send_hello', 'kr8_send_message', 'kr8_create_reel_v2', 'kr8_save_card',
      'kr8_log_reel_view', 'kr8_log_reel_share', 'kr8_share_open_seen', 'kr8_touch', 'kr8_log_client', 'kr8_listing_tap', 'kr8_coach_seen',
      'kr8_ask_create', 'kr8_ask_answer', 'kr8_ask_vote', 'kr8_claim_prize', 'kr8_push_subscribe', 'kr8_not_interested', 'kr8_report', 'kr8_block',
      'kr8_admin_review_reel', 'kr8_admin_set_ghost', 'kr8_delete_me']) expect(adminViewBlocks(fn)).toBe(true);
    for (const fn of ['kr8_me', 'kr8_people', 'kr8_profile', 'kr8_feed', 'kr8_ask_feed', 'kr8_weekly_ranking', 'kr8_treats_live', 'kr8_admin_reels', 'kr8_admin_view_ok'])
      expect(adminViewBlocks(fn)).toBe(false);
  });
  it('the read allow-list holds no write or logging call', () => {
    for (const fn of ADMIN_VIEW_READS) expect(fn).not.toMatch(/toggle|follow$|send|create|save_|log_|touch|set_|claim_|report|block$|delete|vote|answer$|seen$|tap$|subscribe|review_/);
  });
  it('the guarded client answers a blocked call itself, without any request, and passes reads through', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: [1], error: null }));
    const upload = vi.fn(async () => ({ data: { path: 'x' }, error: null }));
    const c = guardClient({ rpc, storage: { from: () => ({ upload, createSignedUrls: async () => ({ data: [], error: null }) }) } });
    setAdminViewActive(true);
    const blocked = await (c.rpc as unknown as (f: string) => Promise<{ error: { message: string } }>)('kr8_toggle_like');
    expect(blocked.error.message).toBe('KR8_ADMIN_VIEW');
    const chained = await (c.rpc as unknown as (f: string) => { select: (x: string) => Promise<{ error: { message: string } }> })('kr8_log_reel_view').select('id');
    expect(chained.error.message).toBe('KR8_ADMIN_VIEW');
    expect(rpc).not.toHaveBeenCalled();
    await (c.rpc as unknown as (f: string) => Promise<unknown>)('kr8_people');
    expect(rpc).toHaveBeenCalledTimes(1);
    const st = (c as unknown as { storage: { from: (b: string) => { upload: (...a: unknown[]) => Promise<{ error: { message: string } | null }> } } }).storage;
    expect((await st.from('kr8-reels').upload('a', 'b')).error?.message).toBe('KR8_ADMIN_VIEW');
    expect(upload).not.toHaveBeenCalled();
    setAdminViewActive(false);   // off: exactly as before
    await (c.rpc as unknown as (f: string) => Promise<unknown>)('kr8_toggle_like');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect((await st.from('kr8-reels').upload('a', 'b')).error).toBeNull();
  });
  it('never forces card making, posting, hellos or claims', () => {
    for (const s of ['v5card', 'post', 'hi', 'claim', 'verify', 'reelNudge']) expect(ADMIN_VIEW_NO_SHEETS.has(s)).toBe(true);
    for (const s of ['ranking', 'rewards', 'profile', 'inbox', 'thread', 'place', 'settings']) expect(ADMIN_VIEW_NO_SHEETS.has(s)).toBe(false);
  });
  it('a stopped call reads "Admin view · read-only"', () => {
    expect(v5ErrText('ADMIN_VIEW')[0]).toBe('Admin view · read-only');
  });
});

describe('pill and Me', () => {
  it('pill opens the admin panel link and Exit', () => {
    const exit = vi.fn();
    render(<AdminViewPill L={L} panelHref={adminPanelHref('/app/')} onExit={exit} />);
    fireEvent.click(screen.getByText('Admin view · ghost'));
    expect(screen.getByText('Open admin panel').getAttribute('href')).toBe('/app/admin.html');
    fireEvent.click(screen.getByText('Exit admin view'));
    expect(exit).toHaveBeenCalledTimes(1);
  });
  it('Me shows ranking, rewards, pending Reels and exit — no card form', () => {
    const fns = { onRanking: vi.fn(), onRewards: vi.fn(), onPending: vi.fn(), onExit: vi.fn() };
    const { container } = render(<AdminViewMe L={L} panelHref="/app/admin.html" {...fns} />);
    fireEvent.click(screen.getByText('Weekly ranking'));
    fireEvent.click(screen.getByText('Reels waiting for review'));
    expect(fns.onRanking).toHaveBeenCalled();
    expect(fns.onPending).toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
  });
});

describe('0077 migration', () => {
  const sql = readFileSync('supabase/migrations/0077_kr8_admin_view.sql', 'utf8');
  it('is additive and wrapped in one transaction', () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).not.toMatch(/^\s*(drop|alter table|truncate|delete from)\b/im);
    expect(sql).not.toMatch(/disable row level security|create policy|alter policy/i);
  });
  it('every new path is behind kr8_is_admin(); the helper is not callable by members', () => {
    expect(sql).toMatch(/kr8_admin_view_ok\(\)[\s\S]*?auth\.uid\(\) is not null and public\.kr8_is_admin\(\)/);
    expect(sql).toMatch(/revoke all on function public\.kr8_admin_view_ok\(\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.kr8_is_cardless_admin\(uuid\) from public, anon, authenticated;/);
    expect(sql).toMatch(/kr8_people[\s\S]*?or adm\.yes\)/);
  });
  it('an admin view, share or link open is never stored', () => {
    for (const fn of ['kr8_log_reel_view', 'kr8_log_reel_share', 'kr8_share_open_seen'])
      expect(sql).toMatch(new RegExp(`function public\\.${fn}\\([\\s\\S]*?kr8_is_admin\\(\\)\\) then return false|function public\\.${fn}\\([\\s\\S]*?if public\\.kr8_is_admin\\(\\) then return false`));
    expect(sql).toMatch(/kr8_ghost_guard_trg[\s\S]*?kr8_is_cardless_admin\(actor\)/);
  });
});
