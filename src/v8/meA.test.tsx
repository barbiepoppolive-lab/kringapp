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
  it('not on the board: Rings · "Be Bangkok’s face of the week · #1 wins ฿1,500" · Post; the line opens the ranking, Rings open Rewards', () => {
    const onRings = vi.fn(), onRanking = vi.fn(), onPost = vi.fn();
    me({ onRings, onRanking, onPost, weekHook: hook() });
    const line = document.getElementById('kxWeekHook')!;
    expect(line.textContent).toContain('420');
    expect(line.textContent).toContain('Be Bangkok’s face of the week');
    expect(line.textContent).toContain('#1 wins ฿1,500');
    fireEvent.click(document.getElementById('kxWeekHookOpen')!);
    expect(onRanking).toHaveBeenCalled();
    fireEvent.click(document.getElementById('meRings')!);
    expect(onRings).toHaveBeenCalled();
    fireEvent.click(document.getElementById('kxWeekHookPost')!);
    expect(onPost).toHaveBeenCalled();
  });
  it('on the board outside the prizes / inside the prizes: the rank line, no Post', () => {
    me({ weekHook: hook({ rank: 14, toLine: 23 }) });
    expect(document.getElementById('kxWeekHook')!.textContent).toContain('You’re #14');
    expect(document.getElementById('kxWeekHook')!.textContent).toContain('23 Rings to the prize line');
    expect(document.getElementById('kxWeekHookPost')).toBeNull();
    cleanup();
    me({ weekHook: hook({ rank: 3, prize: 600 }) });
    expect(document.getElementById('kxWeekHook')!.textContent).toContain('฿600 this week 🏆');
    expect(document.getElementById('kxWeekHook')!.dataset.state).toBe('prize');
  });
  it('stats are Reels · Followers · Following beside the photo; head, then the line, then the Reels; Founding card and old week tiles are gone', () => {
    const onEdit = vi.fn();
    me({ onEdit, weekHook: hook() });
    const s = document.getElementById('meStats')!.textContent || '';
    for (const t of ['1', 'Reels', '214', 'Followers', '88', 'Following']) expect(s).toContain(t);
    expect(document.getElementById('meIdentity')!.contains(document.getElementById('meStats'))).toBe(true);
    const order = ['meIdentity', 'kxWeekHook', 'slot'].map((id) => document.getElementById(id)!);
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
  it('Thai mode: Thai only (line, stats, menu)', () => {
    me({ weekHook: { rank: null, prize: 0, toLine: null, top: 1500 } }, TH);
    fireEvent.click(document.getElementById('meMore')!);
    const t = [document.getElementById('kxWeekHook')!, document.getElementById('meStats')!, document.getElementById('meMoreList')!].map((e) => e.textContent).join(' ');
    expect(t).toContain('มาเป็นหน้าเด่นของกรุงเทพฯ สัปดาห์นี้');
    expect(t).toContain('อันดับ 1 รับ ฿1,500');
    expect(t).toContain('โพสต์');
    expect(t).toContain('ถามผู้ช่วยกริ๊ง!');
    expect(t.replace(/k\b/g, '')).not.toMatch(/[A-Za-z]{2,}/);
  });
  it('the preview switch is gone', () => {
    expect(fs.existsSync(path.join(__dirname, 'V5MeVariants.tsx'))).toBe(false);
    for (const f of ['V5Me.tsx', 'KringAppV8.tsx']) expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).not.toMatch(/mev=|meVariantFromUrl|ME_VARIANT/);
  });
});
