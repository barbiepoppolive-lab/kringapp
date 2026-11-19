/**
 * 18 Nov tap-all guard (founder: "Everything inside admin must be tappable further so I can see things and take decisions").
 * Renders every admin v2 view with fake snapshot data and FAILS if any row-like element is neither a link nor has a click handler.
 * Also checks the who-and-why sheet: faces, one plain sentence, evidence, decision buttons, its own #x/ hash, back closes it.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, Person } from './adminV2Logic';

const ROWS = '.v2li, .ac-row, .mb-stat, .v2kpi, .v2hl, .v2reel, .v2brow';
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
function untappable(root: ParentNode = document): string[] {
  return [...root.querySelectorAll<HTMLElement>(ROWS)].filter((n) => {
    if (n.tagName === 'A' && n.hasAttribute('href')) return false;
    if (typeof n.onclick === 'function') return false;
    if (n.closest('a[href]')) return false;
    return true;
  }).map((n) => `${n.className} :: ${(n.textContent || '').slice(0, 60)}`);
}

const person = (o: Partial<Person> & Pick<Person, 'user_id' | 'no' | 'name'>): Person => ({
  kind: 'real', who: 'local', area: 'Ari', joined_at: '2026-11-17T08:00:00Z', last_active_at: null, ref: null, src: null, verified: false, ig: null, tt: null,
  has_photo: true, photo_check: 'ok', email_hint: null, line: false, trust: null, check: null, reels: null, claims: null, links: [], shared_net: 0, refs: 0,
  board: null, score: null, ...o,
});
const U74 = '00000000-0000-4000-8000-000000000074';
const U76 = '00000000-0000-4000-8000-000000000076';
const snapshot: Snapshot = {
  at: '2026-11-18T10:00:00Z', day_start: '2026-11-17T18:30:00Z', week_start: '2026-11-16T17:00:00Z', include_test: false,
  counts: { real: 2, real_today: 1, test: 0, team: 0, ghost: 0, admin: 0, nocard: 0 },
  people: [
    person({ user_id: U74, no: 74, name: 'Mint', verified: true, trust: { score: 82, reasons: ['+30 face verified', '+10 real photo'] },
      reels: { live: 1, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null }, board: { rank: 1, rings: 40 }, score: { likes: 4, saves: 2, opens: 3, score: 40 },
      check: { id: 'chk74', status: 'approved', at: '2026-11-17T09:00:00Z', auto: 'pass', reason: null } }),
    person({ user_id: U76, no: 76, name: 'Reaper', joined_at: '2026-11-18T05:00:00Z', trust: { score: 18, reasons: ['−40 same face as #74', '−20 claimed within 15 min of joining'] },
      links: [{ user_id: U74, no: 74, name: 'Mint', reason: 'face', dist: null, aws_sim: 98, at: '2026-11-18T05:10:00Z' }],
      reels: { live: 1, waiting: 1, hidden: 0, board_off: 1, board_off_reason: 'AI-made' }, board: { rank: 2, rings: 15 }, score: { likes: 0, saves: 0, opens: 3, score: 15 },
      claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-18T05:06:00Z' } }),
  ],
  claims: [
    { id: 'cl76', user_id: U76, no: 76, name: 'Reaper', brand: 'truemoney', amount: 100, status: 'pending', held: true, used: false, created_at: '2026-11-18T05:06:00Z',
      assigned_at: null, is_test: false, hold_reason: 'linked', decided: null, decided_at: null, face_dist: 0.31, joined_at: '2026-11-18T05:00:00Z',
      hold_others: [{ user_id: U74, member_no: 74, first_name: 'Mint', reasons: ['face'], face_dist: 0.31 }], prize: { kind: 'founding', week: null, rank: null } },
    { id: 'cl74', user_id: U74, no: 74, name: 'Mint', brand: 'truemoney', amount: 100, status: 'assigned', held: false, used: true, created_at: '2026-11-17T10:00:00Z',
      assigned_at: '2026-11-17T10:00:05Z', is_test: false, hold_reason: null, decided: null, decided_at: null, face_dist: null, joined_at: '2026-11-17T08:00:00Z', hold_others: null, prize: null },
  ],
  codes: [{ brand: 'truemoney', amount: 100, available: 3, assigned: 5, used: 0 }],
  board: { week_start: '2026-11-16T17:00:00Z', paid_ranks: 8, floor: 25, rows: [
    { rank: 1, user_id: U74, rings: 40, prize: 1500, likes: 4, saves: 2, opens: 3, is_new: false, no: 74, name: 'Mint' },
    { rank: 2, user_id: U76, rings: 15, prize: 1000, likes: 0, saves: 0, opens: 3, is_new: true, no: 76, name: 'Reaper' },
  ] },
  pending: { reels: [{ id: 'reel76', user_id: U76, at: '2026-11-18T06:00:00Z', poster_path: 'p/76.jpg', video_path: 'v/76.mp4', body: null }], checks: [], reports: 1, places: 0 },
  alerts: [],
  places_auto: [{ at: '2026-11-18T06:30:00Z', action: 'place_auto_reject', place_id: 'pl-junk', name: '0812345678', reason: 'phone', into: null, outside: null, area: null, no: 76, status: 'rejected', now_name: null }],
  dups_auto: [{ at: '2026-11-18T07:00:00Z', dup: 'u-ghost', dup_no: 99, dup_name: 'Clone', keep: U74, keep_no: 74, keep_name: 'Mint', why: 'same_face', dup_sim: 0.91, voided_reels: 1, ledger_void: 5, ghost: true, undone: false }],
};
const brief = {
  at: snapshot.at, day_start: snapshot.day_start,
  alerts: [
    { id: 'a1', dedupe_key: 'protect:ring_farming', robot: 'protect', severity: 'amber', title: '1 member(s) in mutual Ring-farming pairs', body: 'Trust score adjusted (-15).', href: '#autopilot', at: snapshot.at, detail: { flagged_members: 1 } },
    { id: 'a2', dedupe_key: 'selffix:voucher_restock', robot: 'self_fix', severity: 'red', title: 'Voucher stock low', body: 'Buy codes', href: '#codes', at: snapshot.at, detail: {} },
    { id: 'a3', dedupe_key: 'struggle:' + U76, robot: 'health_watch', severity: 'amber', title: 'Reaper keeps failing to post', body: '3 errors', href: '#help', at: snapshot.at, detail: { user_id: U76, member_no: 76, name: 'Reaper' } },
  ],
  brief: { new_members: { today: 1, total: 2 }, face_checks: { today: 1, pass: 1, waiting: 0, refused: 0 }, posts: { reels_today: 1, reels_waiting: 1, reels_live: 2, asks_today: 0 },
    held_payouts: { count: 1, thb: 100 }, voucher_stock: { available: 3, burn_7d: 7, daily_burn: 1, days_left: 3 }, errors: { client_24h: 2, outbox_failed_24h: 0, robot_failed_24h: 0, total: 2 },
    top3_needs_you: [{ severity: 'amber', title: 'Pay Reaper (#76) ฿100 TrueMoney?', sub: '', href: '#inbox' }] },
};
const member = {
  user_id: U76, kind: 'real', trust: { score: 18, reasons: ['−40 same face as #74'] },
  card: { no: 76, name: 'Reaper', photo: null, who: 'local', area: 'Ari', bio: null, langs: null, interests: null, gender: null, ig: null, tt: null, verified: false, photo_check: 'ok',
    ref: 'k00074', src: null, joined_at: '2026-11-18T05:00:00Z', last_active_at: null, age_ok_at: null, ghost: false },
  email_hint: 're…@x.com', signed_up_at: '2026-11-18T05:00:00Z', last_sign_in_at: null, line: false,
  consents: { terms_version: 'v5', terms_at: null, promo_ok: null, promo_at: null, web_reels: null, web_reels_at: null, log: [] },
  reels: [{ id: 'reel76', status: 'pending', hidden: false, board_off: false, board_off_reason: null, likes: 0, saves: 0, shares: 0, views: 3, at: '2026-11-18T06:00:00Z', poster_path: 'p/76.jpg', note: null }],
  rings_week: { likes: 0, saves: 0, opens: 3, score: 15 }, board: { rank: 2, rings: 15 }, rings_ledger: [], results: [],
  claims: [{ id: 'cl76', brand: 'truemoney', amount: 100, status: 'pending', held: true, used: false, created_at: '2026-11-18T05:06:00Z', assigned_at: null, hold_reason: 'linked', decided: null, decided_at: null }],
  referrals: [], links: [{ user_id: U74, no: 74, name: 'Mint', reason: 'face', dist: null, aws_sim: 98, at: '2026-11-18T05:10:00Z', dismissed: false }],
  checks: [{ id: 'chk76', status: 'rejected', auto: 'block', reason: 'same face', at: '2026-11-18T05:20:00Z', reviewed_at: '2026-11-18T05:20:01Z', by_admin: false }],
  admin_log: [{ at: '2026-11-18T07:00:00Z', action: 'claim_held' }],
};
const rings = {
  kind: 'rings', user_id: U76, week_start: snapshot.week_start, weights: { like: 1, save: 3, open: 5, traveller_mult: 2, opens_day_cap: 30 },
  reels: [{ id: 'reel76', status: 'approved', hidden: false, board_off: false, at: snapshot.at, poster_path: null, off_why: null }],
  gives: [{ what: 'like', post_id: 'reel76', user_id: U74, no: 74, name: 'Mint', at: snapshot.at, traveller: false, counted: false, why: 'linked' }],
  opens: [{ post_id: 'reel76', day: '2026-11-18', at: snapshot.at, source: 'instagram', country: 'TH', opener: null, opener_no: null, opener_name: null, counted: true, why: null },
    { post_id: 'reel76', day: '2026-11-18', at: snapshot.at, source: 'other', country: 'US', opener: null, opener_no: null, opener_name: null, counted: false, why: 'same_phone' }],
};
const growth = { days: 7, from: '2026-11-12', to: '2026-11-18', now: snapshot.at, visitors: 40, visitors_prev: 30, visits: 60, returning: 10, signins: 5, cards: 3, first_reels: 1,
  app_installs: 2, share_opens: 4, funnel: { signed_in: 5, card: 3, reel: 1 }, sources: [{ host: 'instagram.com', ref: null, visitors: 20 }, { host: null, ref: null, visitors: 20 }],
  refs: [{ ref: 'k00074', visitors: 6, joined: 1, reels: 0, member_no: 74, member_name: 'Mint' }], countries: [{ country: 'TH', visitors: 30 }], series: [{ t: '2026-11-18', visitors: 40 }] };

const calls: string[] = [];
vi.mock('../v8/v5Reel', () => ({ signReelPaths: vi.fn(async (ps: string[]) => Object.fromEntries(ps.map((p) => [p, `https://cdn.test/${p}`]))) }));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push(fn);
      switch (fn) {
        case 'kr8_admin_v2_snapshot': return structuredClone(snapshot);
        case 'kr8_admin_morning_brief': return structuredClone(brief);
        case 'kr8_admin_places_auto': return structuredClone(snapshot.places_auto);
        case 'kr8_admin_dups_auto': return structuredClone(snapshot.dups_auto);
        case 'kr8_admin_v2_people_extra': return null;
        case 'kr8_admin_v2_photos': return {};
        case 'kr8_admin_v2_face_checks': return [];
        case 'kr8_admin_v2_member': return structuredClone(member);
        case 'kr8_admin_protect_overview': return { at: snapshot.at, mode: 'on', counts: { scam_chat: 0, link_tries: 0, ring_farming: 1, shared_signals: 0, reported_posts_3plus: 0 },
          flags: [{ user_id: U76, member_no: 76, name: 'Reaper', flag_key: 'ring_farming', severity: 'amber', summary: '4/4 Reel likes+saves went to #74 (3 back)',
            detail: { partner_id: U74, partner_no: 74, given_to_partner: 4, total_given: 4, received_from_partner: 3 }, last_at: snapshot.at }], reported_posts: [] };
        case 'kr8_admin_explain':
          if (args.p_kind === 'rings') return structuredClone(rings);
          if (args.p_kind === 'errors') return { kind: 'errors', user_id: U76, no: 76, name: 'Reaper', rows: [{ kind: 'reel_publish_fail', code: 'UPLOAD:0', detail: null, ua: null, at: snapshot.at }] };
          return null;
        case 'kr8_admin_places_list': return [{ id: 'pl1', name_en: 'Jodd Fairs', name_th: 'จ๊อดแฟร์', area: 'Huai Khwang', status: 'live', added_how: 'typed', outside_bkk: false, coords_rough: false,
          osm_ref: null, lat: 13.75, lng: 100.56, created_at: snapshot.at, by_no: 76, by_name: 'Reaper', geo: 'found', reels: 1, auto: 'place_auto_live' }];
        case 'kr8_admin_v2_activity': return [{ at: snapshot.at, kind: 'robot', auto: true, user_id: null, no: null, name: null, text: 'Self-fix ran', other_no: null },
          { at: snapshot.at, kind: 'signup', auto: true, user_id: U76, no: 76, name: 'Reaper', text: 'joined', other_no: null }];
        case 'kr8_admin_growth': return structuredClone(growth);
        case 'kr8_admin_growth_daily': return [{ day: '2026-11-18', visitors: 40, visits: 60, returning: 10, signins: 5, cards: 3, first_reels: 1 }];
        case 'kr8_admin_autopilot_state': return { at: snapshot.at, day_start: snapshot.day_start, paused: false, pg_cron_available: true, cron_jobs: [], robots: [], heartbeats: [],
          logs: [{ id: 7, robot: 'dup_robot', action: 'dup_auto_ghost', target: 'u-ghost', detail: { dup_no: 99 }, can_undo: true, undone_at: null, dry_run: false, at: snapshot.at }] };
        default: return null;
      }
    }),
  };
});

describe('tap-all: every admin row opens something', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; calls.length = 0; history.replaceState(null, '', '#today'); });

  it('no untappable row on any admin v2 screen', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    const screens: [string, () => unknown][] = [
      ['today', () => v2.todayView()], ['inbox', () => v2.inboxView()], ['auto', () => v2.autoView()], ['people', () => v2.peopleView()],
      ['member', () => v2.memberView(U76)], ['money', () => v2.moneyView()], ['board', () => v2.boardView()], ['places', () => v2.placesView()],
      ['log', () => v2.logView()], ['growth', () => v2.growthView()], ['autopilot', () => v2.autopilotView()],
    ];
    const bad: string[] = [];
    let rows = 0;
    for (const [name, show] of screens) {
      await show(); await wait(60);
      // open every fold so rows inside are checked too
      document.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true; });
      rows += document.querySelectorAll(ROWS).length;
      bad.push(...untappable().map((x) => `${name}: ${x}`));
    }
    expect(rows).toBeGreaterThan(25);
    expect(bad).toEqual([]);
  });

  it('Ring-farming alert → sheet with faces and a plain sentence; own hash; back closes it and keeps the page', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    history.replaceState(null, '', '#inbox');
    v2.inboxView(); await wait();
    const row = document.querySelector<HTMLElement>('.ac-row[data-alert="protect:ring_farming"]')!;
    expect(row).toBeTruthy();
    row.click(); await wait();
    const sheet = document.getElementById('xSheet')!;
    expect(sheet).toBeTruthy();
    expect(location.hash).toBe('#x/alert/protect%3Aring_farming');
    expect(sheet.textContent).toContain('#76 Reaper gave all 4 of their likes and saves to #74 Mint');
    expect(sheet.querySelectorAll('a.xs-face[href^="#m/"]').length).toBe(2);
    expect(sheet.querySelector('#xFlagDismiss-' + U76)).toBeTruthy();
    // back: the router sees the base hash again → the sheet goes, the page under it stays (no re-render)
    const page = document.querySelector('#app .scr');
    history.replaceState(null, '', '#inbox');
    expect(v2.v2Route('inbox')).toBe(true);
    expect(document.getElementById('xSheet')).toBeNull();
    expect(document.querySelector('#app .scr')).toBe(page);
  });

  it('struggle alert lists the member with last errors in plain English and a Help link', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait();
    document.querySelector<HTMLElement>(`.ac-row[data-alert="struggle:${U76}"]`)!.click(); await wait();
    const sheet = document.getElementById('xSheet')!;
    expect(sheet.querySelector(`.xs-who[href="#m/${U76}"]`)).toBeTruthy();
    expect(sheet.textContent).toContain('Reel did not post: the phone lost connection during upload');
    expect(sheet.querySelector('a[href="#help"]')).toBeTruthy();
  });

  it('board Rings number → who gave them, counted vs not with reasons', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    v2.boardView(); await wait();
    document.getElementById('v2Rings-' + U76)!.click(); await wait();
    const t = document.getElementById('xSheet')!.textContent!;
    expect(t).toContain('did not count: from a linked account');
    expect(t).toContain('Not counted: same phone opened it again');
    expect(t).toContain('Counted · from instagram');
    expect(location.hash).toBe(`#x/rings/${U76}`);
  });

  it('member page: reel tile opens the clip with Approve / Hide; plain look-alike words, numbers only faint', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    await v2.memberView(U76); await wait();
    expect(document.getElementById('app')!.textContent).toContain('Same face as #74 — second account → Reject');
    document.querySelector<HTMLElement>('.v2reel[data-reel="reel76"]')!.click(); await wait();
    const sheet = document.getElementById('xSheet')!;
    expect(sheet.querySelector('video')?.getAttribute('src')).toBe('https://cdn.test/v/76.mp4');
    expect(sheet.querySelector('#xReelOk')).toBeTruthy();
    expect(sheet.querySelector('#xReelHide')).toBeTruthy();
  });

  it('Needs you money card leads with a plain sentence; the trust number is faint', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait();
    const sent = document.querySelector('.v2case.k-held .v2vsent')!.textContent!;
    expect(sent).toMatch(/^Robot says: Refuse — same face as #74: a second account\.$/);
    expect(document.querySelector('.v2case.k-held .v2pill .v2faint')?.textContent).toContain('trust 18');
  });

  it('Handled automatically line → what the robot did, to whom, why, with Undo', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait();
    document.querySelector<HTMLElement>('.v2hl[data-h="dup:u-ghost"]')!.click(); await wait();
    const sheet = document.getElementById('xSheet')!;
    expect(sheet.textContent).toContain('has the same face as #74 Mint, so it is a second account');
    expect(sheet.querySelector('#xUndoDup')).toBeTruthy();
  });

  it('0121 kr8_admin_explain is admin-only, security definer with a fixed search_path, and read-only', () => {
    const sql = readFileSync('supabase/migrations/0121_admin_explain.sql', 'utf8');
    expect(sql).toMatch(/if not public\.kr8_is_admin\(\) then raise exception 'KR8_ADMIN_ONLY'/);
    expect(sql).toMatch(/language plpgsql stable security definer set search_path = public, pg_temp/);
    expect(sql).toMatch(/revoke all on function public\.kr8_admin_explain\(text, text\) from public, anon;/);
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/\b(insert|update|delete|alter|drop|truncate)\b/i);
  });
});
