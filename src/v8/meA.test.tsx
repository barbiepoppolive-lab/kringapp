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

describe('Me tab A: card + one line', () => {
  it('one hairline line: This week 31 · Rank #5 · Prize now ฿400; each opens Rewards / the board', () => {
    const onRings = vi.fn(), onRanking = vi.fn();
    me({ onRings, onRanking });
    const line = document.getElementById('kxTiles')!;
    expect(line.className).toContain('kme-line');
    expect(line.textContent).toContain('31');
    expect(line.textContent).toContain('#5');
    expect(line.textContent).toContain('฿400');
    fireEvent.click(document.getElementById('kxRankTile')!);
    expect(onRanking).toHaveBeenCalled();
    fireEvent.click(document.getElementById('kxRingsHit')!);
    fireEvent.click(document.getElementById('kxPrizeNow')!);
    expect(onRings).toHaveBeenCalledTimes(2);
  });
  it('no prize at my rank: the third cell is Rewards', () => {
    me({ weekPrize: 0 });
    expect(document.getElementById('kxPrizeNow')!.textContent).toContain('Rewards');
  });
  it('revamp Phase 1 (ChatGPT): stats are Reels · Followers · Following; friends joined sits on the weekly rewards entry; no Share pill, helper box or Install chip', () => {
    me();
    const s = document.getElementById('meStats')!.textContent || '';
    for (const t of ['1', 'Reels', '214', 'Followers', '88', 'Following']) expect(s).toContain(t);
    expect(s).not.toContain('Likes');
    expect(document.getElementById('meFriends')!.textContent).toContain('3 friends joined');
    // identity first, then stats, then the Rings balance, then the weekly entry
    const order = ['meIdentity', 'meStats', 'meRings', 'kxTiles'].map((id) => document.getElementById(id)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.getElementById('meShare')).toBeNull();
    expect(document.getElementById('meHelpRow')).toBeNull();
    expect(document.getElementById('installChip')).toBeNull();
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
  it('"Climb this week’s board" is not shown (the line says it); action steps still show at the top', () => {
    me({ nextKind: 'climb', nextSlot: <div id="nextProbe" /> });
    expect(document.getElementById('nextProbe')).toBeNull();
    for (const k of ['reel', 'retry', 'pending', 'claim', 'verify']) {
      cleanup();
      me({ nextKind: k, nextSlot: <div id="nextProbe" /> });
      expect(document.getElementById('nextProbe'), k).not.toBeNull();
    }
  });
  it('Thai mode: Thai only (no English words on the line, stats or menu)', () => {
    me({}, TH);
    fireEvent.click(document.getElementById('meMore')!);
    const t = [document.getElementById('kxTiles')!, document.getElementById('meStats')!, document.getElementById('meMoreList')!, document.getElementById('meRings')!,
      document.getElementById('meFriends')!].map((e) => e.textContent).join(' ');
    expect(t).toContain('สัปดาห์นี้');
    expect(t).toContain('บัตรกำนัลตอนนี้');
    expect(t).toContain('เพื่อนที่ชวนมา');
    expect(t).toContain('ริงของคุณ');
    expect(t).toContain('ถามผู้ช่วยกริ๊ง!');
    expect(t.replace(/k\b/g, '')).not.toMatch(/[A-Za-z]{2,}/);
  });
  it('the preview switch is gone', () => {
    expect(fs.existsSync(path.join(__dirname, 'V5MeVariants.tsx'))).toBe(false);
    for (const f of ['V5Me.tsx', 'KringAppV8.tsx']) expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).not.toMatch(/mev=|meVariantFromUrl|ME_VARIANT/);
  });
});
