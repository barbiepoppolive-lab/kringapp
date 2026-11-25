/* 19 Nov: Me tab "A · Card + one line" (founder pick). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { MeView, type MeViewProps } from './V5Me';
import { V5_L, KX_L } from './v5Strings';
import type { V5Profile } from './v5Live';

afterEach(() => cleanup());
const EN = (s: string) => s;
const TH = (s: string) => V5_L.th[s] || KX_L.th[s] || s;
const fmt = (L: (s: string) => string) => (s: string, ...a: string[]) => a.reduce((x, v, i) => x.replace(`{${i}}`, v), L(s));
const p = { user_id: 'me', first_name: 'Ploy', photo: null, langs: ['TH', 'EN'], bio: '', area: 'Ari', who: 'local', verified: true, ig_handle: 'ploy.bkk', interests: [],
  member_no: '00037', online: true, here: false, mine: true, level: { level: 'tea', posts: 3, visits: 0, points: 15, next: 'pandan', need_points: 10, pct: 60 },
  followers: 214, following: 88, likes: 1320, gifts: 0, i_follow: false, follows_me: false,
  reels: [{ id: 'r1', poster_path: 'x.jpg', status: 'approved', likes: 4 }] } as unknown as V5Profile;
const kx = { member_no: 37, ig_handle: 'ploy.bkk', tiktok_handle: null, lifetime: 420, level: 1, week: 31, week_rank: 5, founding_no: 12, founding_left: 38, founding_thb: 100, has_reel: true, prizes: 0 };
const me = (x: Partial<MeViewProps> = {}, L = EN) => render(
  <div className="v8-app-root">
    <MeView L={L} Lf={fmt(L) as never} p={p} rank={null} posters={{}} savedCount={0} savedImgs={[]} unread={false} verifyState="verified" onTop10={() => undefined}
      onList={() => undefined} onSettings={() => undefined} onActivity={() => undefined} onEdit={() => undefined} onShare={() => undefined} onCode={() => undefined}
      onSaved={() => undefined} onRewards={() => undefined} onReel={() => undefined} onPost={() => undefined} onVerify={() => undefined}
      kx={kx as never} weekRank={5} weekPrize={400} invites={{ friends: 3, rings: 30 }} reelsSlot={<div id="slot" />}
      onHelp={() => undefined} onReplay={() => undefined} {...x} />
  </div>);

describe('Me tab rv4 A: skyline head + one line', () => {
  const hook = (h: Partial<{ rank: number | null; prize: number; toLine: number | null; top: number }> = {}) => ({ rank: null, prize: 0, toLine: null, top: 1500, ...h });
  const tasks = { done: 3, of: 4, ready: 1, readyRings: 1, streak: 1 };
  it('25 Nov chip: ◎ Rings · 🔥 tasks done today · 🏆 rank ("–" when unranked); the big Rings box is gone', () => {
    me({ weekHook: hook(), chipTasks: { ...tasks, ready: 0 } });
    const c = document.getElementById('meChip')!;
    expect(c.textContent).toContain('420');
    expect(c.textContent).toContain('🔥3');
    expect(c.textContent).toContain('🏆–');
    expect(document.getElementById('meChipBadge')).toBeNull();
    for (const id of ['meStrip', 'kxWeekHook', 'kxWeekHookOpen', 'dtMeLine', 'profileQa']) expect(document.getElementById(id), id).toBeNull();
    cleanup();
    me({ weekHook: hook({ rank: 3, prize: 600 }), chipTasks: tasks });
    expect(document.getElementById('meChip')!.textContent).toContain('🏆#3');
    expect(document.getElementById('meChipBadge')!.textContent).toBe('1');
  });
  it('the sheet: Leaderboard · History · Tasks open their screens; Claim sends the claim; another member sees no claim', async () => {
    const onRanking = vi.fn(), onRings = vi.fn(), onTasks = vi.fn(), onClaimTasks = vi.fn(async () => 'ok' as const);
    const week = { me: { rank: 3, all_rank: 3, rings: 120 }, rows: [{ rank: 2, all_rank: 2, rings: 157 }] };
    const open = () => fireEvent.click(document.getElementById('meChip')!);
    me({ weekHook: hook({ rank: 3, prize: 600 }), chipTasks: tasks, week, onRanking, onRings, onTasks, onClaimTasks });
    open();
    const sh = document.getElementById('meRingsSheet')!.textContent || '';
    for (const t of ['#3 this week', '38 Rings to #2', '#1 wins ฿1,500', '420 Rings', 'From likes, Reels and tasks', '3 of 4 today', 'Leaderboard', 'History', 'Tasks', 'Claim 1 Ring'])
      expect(sh, t).toContain(t);
    fireEvent.click(document.getElementById('meSheetClaim')!);
    expect(onClaimTasks).toHaveBeenCalled();
    fireEvent.click(document.getElementById('meSheetRank')!); expect(onRanking).toHaveBeenCalled();
    expect(document.getElementById('meRingsSheet')).toBeNull();
    open(); fireEvent.click(document.getElementById('meSheetRings')!); expect(onRings).toHaveBeenCalled();
    open(); fireEvent.click(document.getElementById('meSheetTasks')!); expect(onTasks).toHaveBeenCalled();
    cleanup();
    me({ weekHook: hook(), chipTasks: { ...tasks, ready: 0 } });
    open();
    expect(document.getElementById('meSheetClaim')).toBeNull();
    expect(document.getElementById('meRingsSheet')!.textContent).toContain('Not on this week’s board yet');
  });
  it('no passed face check: the Verify line, no chip', () => {
    me({ weekHook: hook(), chipTasks: tasks, lockSlot: <div id="lockProbe" /> });
    expect(document.getElementById('lockProbe')).not.toBeNull();
    expect(document.getElementById('meChip')).toBeNull();
  });
  it('question bubble: my answer, or today\'s question as a prompt that opens the question step', () => {
    const onQa = vi.fn();
    me({ p: { ...p, qa_q: 'soi_shop', qa_answer: 'The coffee place at the mouth of the soi' } as V5Profile, onQa });
    expect(document.getElementById('meQaNote')!.textContent).toContain('My soi’s go-to');
    expect(document.getElementById('meQaNote')!.textContent).toContain('The coffee place');
    cleanup();
    me({ onQa });
    expect(document.getElementById('meQaNote')!.textContent).toContain('Your soi’s go-to shop?');
    fireEvent.click(document.getElementById('meQaNote')!);
    expect(onQa).toHaveBeenCalled();
  });
  it('under the name: 📍 area and flags; empty bio → ✏️ Add a short bio', () => {
    me({ p: { ...p, langs: ['TH', 'EN', 'AR'] } as V5Profile });
    const m = document.getElementById('meMeta')!.textContent || '';
    expect(m).toContain('📍 Ari');
    expect(m).toContain('🇹🇭 🇬🇧 Arabic');
    expect(document.getElementById('meAddBio')!.textContent).toBe('✏️ Add a short bio');
  });
  it('stats are Reels · Followers · Following beside the photo; head, then the Reels; Founding card and old week tiles are gone', () => {
    const onEdit = vi.fn();
    me({ onEdit, weekHook: hook() });
    const s = document.getElementById('meStats')!.textContent || '';
    for (const t of ['1', 'Reels', '214', 'Followers', '88', 'Following']) expect(s).toContain(t);
    expect(document.getElementById('meIdentity')!.contains(document.getElementById('meStats'))).toBe(true);
    const order = ['meChip', 'meIdentity', 'slot'].map((id) => document.getElementById(id)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const id of ['kxTiles', 'kxFounding', 'meShare', 'meHelpRow', 'installChip']) expect(document.getElementById(id), id).toBeNull();
    fireEvent.click(document.getElementById('meEdit')!);
    expect(onEdit).toHaveBeenCalled();
  });
  it('⋯ opens Share card · Ask Kring Helper · Install app · Replay intro; each closes the menu', () => {
    const onCode = vi.fn(), onHelp = vi.fn(), onReplay = vi.fn();
    me({ onCode, onHelp, onReplay });
    fireEvent.click(document.getElementById('meMore')!);
    const list = document.getElementById('meMoreList')!.textContent || '';
    for (const t of ['Share card', 'Ask Kring Helper', 'Install app', 'Replay intro']) expect(list).toContain(t);
    fireEvent.click(document.getElementById('meHelpRow')!);
    expect(onHelp).toHaveBeenCalled();
    expect(document.getElementById('meMoreList')).toBeNull();
    fireEvent.click(document.getElementById('meMore')!);
    fireEvent.click(document.getElementById('meShare')!);
    expect(onCode).toHaveBeenCalled();
    fireEvent.click(document.getElementById('meMore')!);
    fireEvent.click(document.getElementById('goReplay')!);
    expect(onReplay).toHaveBeenCalled();
  });
  it('action steps that need the member (retry, claim, verify) still show; post / pending / climb are on the line or the grid', () => {
    for (const k of ['climb', 'reel', 'pending']) {
      cleanup();
      me({ nextKind: k, nextSlot: <div id="nextProbe" /> });
      expect(document.getElementById('nextProbe'), k).toBeNull();
    }
    for (const k of ['retry', 'claim', 'verify']) {
      cleanup();
      me({ nextKind: k, nextSlot: <div id="nextProbe" /> });
      expect(document.getElementById('nextProbe'), k).not.toBeNull();
    }
  });
  it('Thai mode: Thai only (chip sheet, meta, bubble, stats, menu)', () => {
    document.documentElement.lang = 'th';   // the app sets this in Thai mode (rvArea reads it)
    me({ weekHook: { rank: 3, prize: 600, toLine: null, top: 1500 }, chipTasks: tasks, onQa: () => undefined,
      week: { me: { rank: 3, all_rank: 3, rings: 120 }, rows: [{ rank: 2, all_rank: 2, rings: 157 }] } }, TH);
    fireEvent.click(document.getElementById('meChip')!);
    const sheet = document.getElementById('meRingsSheet')!.textContent || '';
    fireEvent.click(document.querySelector('.mc-dim')!);
    fireEvent.click(document.getElementById('meMore')!);
    const t = [sheet, ...['meMeta', 'meQaNote', 'meAddBio', 'meStats', 'meMoreList'].map((id) => document.getElementById(id)!.textContent)].join(' ');
    expect(t).toContain('อันดับ 3 สัปดาห์นี้');
    expect(t).toContain('อันดับ 1 รับ ฿1,500');
    expect(t).toContain('รับ 1 ริง');
    expect(t).toContain('ร้านประจำในซอยคุณคือร้านไหน');
    expect(t).toContain('ถามผู้ช่วยกริ๊ง!');
    expect(t.replace(/k\b/g, '')).not.toMatch(/[A-Za-z]{2,}/);
    document.documentElement.lang = '';
  });
  it('the preview switch is gone', () => {
    expect(fs.existsSync(path.join(__dirname, 'V5MeVariants.tsx'))).toBe(false);
    for (const f of ['V5Me.tsx', 'KringAppV8.tsx']) expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).not.toMatch(/mev=|meVariantFromUrl|ME_VARIANT/);
  });
});
