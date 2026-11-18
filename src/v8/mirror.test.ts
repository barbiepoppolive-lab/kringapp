// 0110 View as member: the framed app (?mirror=1 inside /app/admin.html) keeps its own in-memory storage and never sends a write.
// The server refuses the mirror's writes too (0110 triggers, checked on the TEST database with a rolled-back trial).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIRROR_EXTRA_READS, adminViewBlocks, guardClient, mirrorActive, mirrorPersona, setAdminViewActive } from './adminView';
import { MIRROR_AUTH_KEY, v5AuthKey } from './v5Live';

type Win = Record<string, unknown>;
const setMirror = (v: unknown) => { (window as unknown as Win).__kr8Mirror = v; };

beforeEach(() => { setAdminViewActive(false); setMirror(undefined); });
afterEach(() => { setMirror(undefined); });

describe('mirror write guard (client)', () => {
  const WRITES = ['kr8_toggle_like', 'kr8_toggle_save', 'kr8_like', 'kr8_follow', 'kr8_send_hello', 'kr8_send_message', 'kr8_create_reel_v2', 'kr8_create_post',
    'kr8_checkin', 'kr8_touch', 'kr8_log_reel_view', 'kr8_log_reel_share', 'kr8_share_open_seen', 'kr8_save_card', 'kr8_claim_prize', 'kr8_claim_treat',
    'kr8_help_open', 'kr8_report', 'kr8_push_subscribe', 'kr8_verify_instant', 'kr8_set_ref', 'kr8_log_client', 'kr8_delete_me2', 'kr8_ask_answer', 'kr8_ask_vote'];
  const READS = ['kr8_feed_ranked', 'kr8_me', 'kr8_people', 'kr8_weekly_ranking', 'kr8_my_rewards', 'kr8_card_extras', 'kr8_seats_left', 'kr8_ask_feed', 'kr8_my_invites'];

  it('is off by default: a normal member app sends everything', () => {
    expect(mirrorActive()).toBe(false);
    expect(mirrorPersona()).toBeNull();
    for (const fn of WRITES) expect(adminViewBlocks(fn)).toBe(false);
  });
  it('in the frame: every write / log / count call is stopped, reads go through', () => {
    setMirror({ persona: 'member' });
    expect(mirrorActive()).toBe(true);
    expect(mirrorPersona()).toBe('member');
    for (const fn of WRITES) expect(adminViewBlocks(fn), fn).toBe(true);
    for (const fn of READS) expect(adminViewBlocks(fn), fn).toBe(false);
  });
  it('extra mirror reads are read-only names (no set/claim/log/create)', () => {
    for (const fn of MIRROR_EXTRA_READS) expect(fn).not.toMatch(/_(set|claim|log|create|send|save|toggle|touch|checkin|delete|report|accept|agree|request|follow$|like$|vote|answer$|use$|tap$|open$)/);
  });
  it('the guarded client never reaches the network for a write, and refuses uploads', async () => {
    setMirror({ persona: 'newmember' });
    const rpc = vi.fn(() => Promise.resolve({ data: 1, error: null }));
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const c = guardClient({ rpc, storage: { from: () => ({ upload }) } } as never) as unknown as { rpc: (f: string, a?: unknown) => Promise<{ error: { message: string } | null }>; storage: { from: (b: string) => { upload: () => Promise<{ error: { message: string } | null }> } } };
    const w = await c.rpc('kr8_toggle_like', { p_post: 'x' });
    expect(w.error?.message).toBe('KR8_ADMIN_VIEW');
    expect(rpc).not.toHaveBeenCalled();
    await c.rpc('kr8_feed_ranked', {});
    expect(rpc).toHaveBeenCalledTimes(1);
    const u = await c.storage.from('kr8-reels').upload();
    expect(u.error?.message).toBe('KR8_ADMIN_VIEW');
    expect(upload).not.toHaveBeenCalled();
  });
  it('the frame keeps its sign-in under its own key (never the admin page\'s kr8-v5-auth)', () => {
    expect(v5AuthKey()).toBe('kr8-v5-auth');
    setMirror({ persona: 'member' });
    expect(v5AuthKey()).toBe(MIRROR_AUTH_KEY);
    expect(MIRROR_AUTH_KEY).not.toBe('kr8-v5-auth');
  });
});

describe('index.html mirror storage shim', () => {
  const html = readFileSync('index.html', 'utf8');
  const shim = /<script>\s*\/\/ 18 Nov "View as member"[\s\S]*?<\/script>/.exec(html)![0].replace(/^<script>|<\/script>$/g, '');
  /** Runs the shim against a fake frame window. */
  function run(search: string, parent: Win | 'self') {
    const realLS = { getItem: () => 'REAL', setItem: vi.fn(), removeItem: vi.fn() };
    const win: Win = { localStorage: realLS, sessionStorage: realLS };
    win.parent = parent === 'self' ? win : parent;
    new Function('window', 'location', shim)(win, { search });
    return { win, realLS };
  }
  const adminParent = (seed?: unknown): Win => ({ location: { pathname: '/app/admin.html' }, __kr8MirrorSeed: seed });

  it('comes before every other script (the feed and visit scripts read storage)', () => {
    expect(html.indexOf('18 Nov "View as member"')).toBeLessThan(html.indexOf('13 Nov funnel fix'));
    expect(html.indexOf('18 Nov "View as member"')).toBeLessThan(html.indexOf('link-visit counter'));
  });
  it('inside the admin frame: the app gets the seeded in-memory storage, the real storage is never written', () => {
    const seed = { persona: 'member', store: { kr8_lang: 'th', 'kr8-mirror-auth': '{"access_token":"x"}' }, session: {} };
    const { win, realLS } = run('?mirror=1&lang=th', adminParent(seed));
    const ls = win.localStorage as Storage;
    expect(win.__kr8Mirror).toEqual({ persona: 'member' });
    expect(ls.getItem('kr8_lang')).toBe('th');
    expect(ls.getItem('kr8-v5-auth')).toBeNull();
    ls.setItem('kr8_lang', 'en');
    expect(seed.store.kr8_lang).toBe('en');   // kept by the admin page, so a reload of the frame keeps it
    expect(realLS.setItem).not.toHaveBeenCalled();
  });
  it('does nothing for a normal visit, a direct ?mirror=1 link, or a frame on another page', () => {
    expect(run('', adminParent({ store: {} })).win.__kr8Mirror).toBeUndefined();
    expect(run('?mirror=1', 'self').win.__kr8Mirror).toBeUndefined();
    expect(run('?mirror=1', adminParent(undefined)).win.__kr8Mirror).toBeUndefined();
    expect(run('?mirror=1', { location: { pathname: '/app/' }, __kr8MirrorSeed: { store: {} } }).win.__kr8Mirror).toBeUndefined();
    const plain = run('?mirror=1', 'self');
    expect((plain.win.localStorage as { getItem: () => string }).getItem()).toBe('REAL');
  });
  it('the visit counter and the service worker skip the mirror frame (no fake visits)', () => {
    expect(html).toContain('(admin|mirror)=1(&|$)/.test(location.search))return;');
    expect(html).toContain("navigator.serviceWorker && !window.__kr8Mirror");
  });
});
