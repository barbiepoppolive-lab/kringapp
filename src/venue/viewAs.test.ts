// 0110 View as member + Spot a bug: logic, the Needs-you bug case (English only), mirror exclusion in admin lists, and the
// migration's guarantees (admin-only mint, server write blocking, UNDO).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { BANNED_MEMBER_WORDS, bugMeta, fitScale, frameSrc, isBugSpots, mirrorSeed, screenName, seenFlags, tapPoint, type BugSpot } from './viewAsLogic';
import { filterPeople, isReal, type Person, type Snapshot } from './adminV2Logic';

vi.mock('./shared', async (orig) => ({ ...(await orig<typeof import('./shared')>()), rpc: vi.fn() }));
import { rpc } from './shared';
import { bugCaseCard, bugSection } from './viewAs';

afterEach(() => { vi.mocked(rpc).mockReset(); document.body.innerHTML = ''; });

describe('mirror seed (what the framed app gets as its whole storage)', () => {
  it('Visitor: signed out, language set, nagging prompts snoozed', () => {
    const s = mirrorSeed('visitor', 'th', '{"access_token":"x"}', 'kr8-mirror-auth', 0);
    expect(s.store['kr8-mirror-auth']).toBeUndefined();
    expect(s.store.kr8_lang).toBe('th');
    expect(JSON.parse(s.store.kr8_a2hs).snooze).toBeGreaterThan(0);
    expect(s.store.kr8_coach).toBeUndefined();
  });
  it('Member: the mirror session under the mirror key only; coach tips already seen', () => {
    const s = mirrorSeed('member', 'en', '{"access_token":"x"}', 'kr8-mirror-auth', 0);
    expect(s.store['kr8-mirror-auth']).toBe('{"access_token":"x"}');
    expect(s.store['kr8-v5-auth']).toBeUndefined();
    expect(JSON.parse(s.store.kr8_coach)).toContain('post');
  });
  it('New member sees the first-time tips', () => { expect(seenFlags('newmember').kr8_coach).toBeUndefined(); });
  it('frame address', () => { expect(frameSrc('/app/', 'th', 5)).toBe('/app/?mirror=1&lang=th&mv=5'); expect(frameSrc('/app', 'en', 1)).toBe('/app/?mirror=1&lang=en&mv=1'); });
});

describe('phone frame', () => {
  it('a tap is stored as 0-1 of the screen, clamped', () => {
    expect(tapPoint(195, 422, { left: 0, top: 0, width: 390, height: 844 })).toEqual({ x: 0.5, y: 0.5 });
    expect(tapPoint(-20, 900, { left: 0, top: 0, width: 390, height: 844 })).toEqual({ x: 0, y: 1 });
    // a scaled-down frame (phone admin) gives the same point
    expect(tapPoint(10 + 179, 50 + 387.5, { left: 10, top: 50, width: 358, height: 775 })).toEqual({ x: 0.5, y: 0.5 });
  });
  it('scales down to fit, never up', () => {
    expect(fitScale(406, 860, 1200, 2000)).toBe(1);
    expect(fitScale(406, 860, 358, 2000)).toBeCloseTo(0.882, 3);
    expect(fitScale(406, 860, 1200, 700)).toBeCloseTo(0.814, 3);
  });
  it('screen names in plain words', () => {
    expect(screenName('tab:board')).toBe('Board');
    expect(screenName('tab:me sheet:open')).toBe('Me · sheet open');
    expect(screenName('no-card')).toBe('Make your card');
    expect(screenName(null)).toBe('Unknown screen');
  });
});

const BUG: BugSpot = { id: 'b1', at: '2026-11-18T06:00:00Z', note: 'Board title is cut off on Android', persona: 'member', lang: 'th', viewport: '360x780',
  route: 'tab:board', x: 0.5, y: 0.2, shot: 'data:image/jpeg;base64,AAAA', status: 'open', handled_at: null };

describe('Needs you: one bug per card, English only', () => {
  it('meta line', () => { expect(bugMeta(BUG)).toBe('Member · Thai · Android 360 · Board'); });
  it('card: the note, picture, plain line and two buttons; no Thai text', () => {
    const c = bugCaseCard(BUG);
    expect(c.querySelector('.v2q')?.textContent).toBe(BUG.note);
    expect(c.querySelector('.va-shot img')?.getAttribute('src')).toBe(BUG.shot);
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Not a bug', 'Fixed']);
    expect(c.textContent).not.toMatch(/[฀-๿]/);
  });
  it('a bug without a picture still shows where it was tapped', () => {
    const c = bugCaseCard({ ...BUG, shot: null });
    expect(c.querySelector('.va-shot.none .va-dot')?.getAttribute('style')).toContain('left:50%');
  });
  it('Fixed closes the case on the server', async () => {
    vi.mocked(rpc).mockResolvedValue(true as never);
    const done = vi.fn();
    const c = bugCaseCard(BUG, done);
    (c.querySelector('#vaFixed-b1') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('kr8_admin_bug_spot_set', { p_id: 'b1', p_status: 'fixed' });
    expect(c.classList.contains('va-done')).toBe(true);
  });
  it('section: one card per open bug, counted; empty when none / before 0110', async () => {
    vi.mocked(rpc).mockResolvedValue([BUG, { ...BUG, id: 'b2' }] as never);
    const n = vi.fn();
    const box = bugSection(n);
    await vi.waitFor(() => expect(n).toHaveBeenCalledWith(2));
    expect(box.querySelectorAll('.va-case')).toHaveLength(2);
    expect(box.querySelector('.v2sec')?.textContent).toBe('Bug spots · 2');
    vi.mocked(rpc).mockRejectedValue(new Error('function kr8_admin_bug_spots does not exist'));
    const box2 = bugSection();
    await new Promise((r) => setTimeout(r, 0));
    expect(box2.children).toHaveLength(0);
  });
  it('isBugSpots', () => { expect(isBugSpots([BUG])).toBe(true); expect(isBugSpots({})).toBe(false); });
});

describe('mirror is never a member in admin lists', () => {
  const p = (user_id: string, kind: Person['kind']): Person => ({ user_id, kind, no: 1, name: 'X', who: 'local', area: 'Bangkok', joined_at: '2026-11-18T00:00:00Z',
    last_active_at: null, ref: null, src: null, verified: true, ig: null, tt: null, has_photo: true, photo_check: null, email_hint: null, line: false,
    check: null, reels: null, claims: null, links: [], shared_net: 0, refs: 0, board: null, score: null });
  const snap = { at: '', day_start: '2026-11-17T18:30:00Z', week_start: '', include_test: true, counts: {} as Snapshot['counts'], people: [p('a', 'real'), p('m', 'mirror')],
    claims: [], codes: [], board: { week_start: '', paid_ranks: 8, floor: 25, rows: [] }, pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [] } as Snapshot;
  it('not real, not listed unless "Show test rows"', () => {
    expect(isReal(p('m', 'mirror'))).toBe(false);
    expect(filterPeople(snap, 'all').map((x) => x.user_id)).toEqual(['a']);
    expect(filterPeople(snap, 'all', '', '', true).map((x) => x.user_id)).toEqual(['a', 'm']);
  });
});

describe('migration 0110', () => {
  const sql = readFileSync('supabase/migrations/0110_kr8_view_as_member.sql', 'utf8');
  const body = sql.slice(sql.indexOf('begin;'));
  it('has an UNDO and is one transaction', () => { expect(sql).toMatch(/-- UNDO/); expect(body.trim().endsWith('commit;')).toBe(true); });
  it('the sign-in mint is admin-only and never granted to anon', () => {
    const fn = body.slice(body.indexOf('function public.kr8_admin_mirror_signin'), body.indexOf('grant execute on function public.kr8_admin_mirror_signin'));
    expect(fn).toMatch(/if not public\.kr8_is_admin\(\) or auth\.uid\(\) is null then raise exception 'KR8_ADMIN_ONLY'/);
    expect(body).not.toMatch(/grant [^;]*\bto anon\b/i);
    expect(body).toMatch(/revoke all on function public\.kr8_admin_mirror_signin\(text\) from public, anon;/);
  });
  it('the server refuses the mirror\'s writes that would reach real members', () => {
    for (const t of ['kr8_post_likes', 'kr8_post_saves', 'kr8_follows', 'kr8_threads', 'kr8_messages', 'kr8_posts', 'kr8_reports', 'kr8_reward_claims', 'kr8_verifications'])
      expect(body, t).toMatch(new RegExp(`\\['${t}',\\s+'[a-z_]+',\\s+'refuse'\\]`));
    for (const t of ['kr8_post_views', 'kr8_post_shares', 'kr8_checkins', 'kr8_rings_ledger', 'kr8_prizes', 'kr8_week_results', 'kr8_ref_credits'])
      expect(body, t).toMatch(new RegExp(`\\['${t}',\\s+'[a-z_]+',\\s+'skip'\\]`));
    expect(body).toMatch(/create trigger kr8_mirror_member before insert or update or delete on public\.kr8_members/);
  });
  it('admin counts / lists see "mirror", never "real"; the mirror itself sees a normal app', () => {
    expect(body).toMatch(/when public\.kr8_is_mirror\(p\) then 'mirror'/);
    expect(body).toMatch(/and not public\.kr8_is_mirror\(auth\.uid\(\)\)/);
  });
  it('the mirror card is hidden, verified and takes no member number; no new-member alert is sent for it', () => {
    expect(body).toMatch(/disable trigger kr8_notify_founder_member/);
    expect(body).toMatch(/'member-2026-11-17', null, true, true/);
  });
  it('member-facing words: the mirror card adds none of the banned words', () => {
    const card = /values \(uid, 'Mirror'[^;]*;/.exec(body)![0].toLowerCase();
    for (const w of BANNED_MEMBER_WORDS) expect(card, w).not.toContain(w);
  });
});
