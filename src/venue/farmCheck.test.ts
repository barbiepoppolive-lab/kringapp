/**
 * 19 Nov Ring-farming check (0123): the plain-English lines + verdict, and the 4 decision buttons wired to kr8_admin_farming_decide.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { farmCompare, farmHeadline, farmSignals, farmVerdict, giverLines, phoneOf, savedWords, decisionWords } from './farmLogic';
import { farmData, mintCase, nutCase, organicCase, U } from './farmFixture';

const W0 = '2026-11-15T17:00:00Z';

describe('Ring-farming check · plain-English lines', () => {
  it('this week’s #19 case reads the way the founder would say it', () => {
    const t = farmSignals(nutCase, W0).map((s) => s.text);
    expect(t).toEqual([
      '12 new accounts, all joined within 5 hours (1:30 am–6:30 am India time)',
      '100% of their likes went to #19',
      "All liked exactly 3 Reels — only #19's",
      '8 of 12 joined with #19\'s invite link, 4 with no link',
      'Most liked #19 within 10 minutes of joining',
      '7 of 12 posted their own Reels (looks like real people)',
      '5 of 12 face-verified',
      'Different phones: 6 iPhone, 6 Android',
    ]);
    const tones = Object.fromEntries(farmSignals(nutCase, W0).map((s) => [s.key, s.tone]));
    expect(tones).toMatchObject({ burst: 'r', share: 'r', same: 'r', posted: 'g', face: 'a', phones: 'g' });
  });
  it('verdict: real-looking people who joined together and liked only #19 → friends asked to like', () => {
    const v = farmVerdict(nutCase, W0);
    expect(v.kind).toBe('coordinated');
    expect(v.title).toBe('Likely friends asked to like (coordinated)');
    expect(v.reason).toBe('They look like real people (5 face-verified, 7 posted Reels), but they joined within a few hours and liked only #19 — most likely friends #19 asked to like.');
    expect(farmHeadline(nutCase, W0)).toBe('12 accounts joined overnight and liked only #19 Nut');
  });
  it('same phone as the member → likely fake accounts', () => {
    const t = farmSignals(mintCase, W0).map((s) => s.text);
    expect(t).toContain('Same phone used by #74 and #76 — one person, two accounts');
    expect(t).toContain('All on Android');
    expect(t).toContain('The protect robot also flagged them (they like each other back)');
    const v = farmVerdict(mintCase, W0);
    expect(v.kind).toBe('fake');
    expect(v.title).toBe('Likely fake accounts');
    expect(v.reason).toBe('1 pair of them use the same phone or face, and they did almost nothing on Kring except like #74.');
  });
  it('old, verified members who like many people → looks organic', () => {
    const s = farmSignals(organicCase, W0).map((x) => x.text);
    expect(s).toContain('All 3 joined before this week');
    expect(s).toContain('33% of their likes and saves went to #20 (3 also liked other members)');
    const v = farmVerdict({ ...organicCase, givers: organicCase.givers.map((g) => ({ ...g, by_flag: false })) }, W0);
    expect(v).toMatchObject({ kind: 'organic', title: 'Looks organic', tone: 'g' });
  });
  it('Rings now vs if counted once vs if not counted, with the rank each gives', () => {
    expect(farmCompare(farmData(), nutCase)).toMatchObject({ full: 125, once: 101, none: 89, rankFull: 1, rankOnce: 1, rankNone: 2, mode: 'full' });
  });
  it('phones, one giver in words, decision words', () => {
    expect(phoneOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)')).toEqual({ kind: 'iPhone', model: null });
    expect(phoneOf('Mozilla/5.0 (Linux; Android 14; K) Chrome/131')).toEqual({ kind: 'Android', model: null });
    expect(phoneOf('Mozilla/5.0 (Linux; Android 13; SM-A515F Build/TP1A) Chrome/119')).toEqual({ kind: 'Android', model: 'SM-A515F' });
    const g = giverLines(nutCase.givers[0], 19);
    expect(g.joined).toBe('joined 1:30 am IST, 18 Nov · via #19\'s link');
    expect(g.chips.map((c) => c.text)).toEqual(['✓ face', 'iPhone', 'posted 1 Reel', 'liked after 4 minutes']);
    expect(g.gave).toBe('3 likes');
    expect(g.share).toBe(100);
    expect(decisionWords(null)).toBeNull();
    expect(decisionWords({ score_mode: 'once', givers: [], hold: true, note: null, at: W0 })).toBe('You chose: each friend counted once · prize on hold');
    expect(savedWords('none', 89, '#19')).toBe('Saved — these likes don’t count. #19 now has 89 Rings.');
  });
});

// ───────── UI: card → sheet → 4 buttons ─────────
const calls: { fn: string; args: Record<string, unknown> }[] = [];
let state = farmData();
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args });
      if (fn === 'kr8_admin_farming_cases') return structuredClone(state);
      if (fn === 'kr8_admin_v2_photos') return {};
      if (fn === 'kr8_admin_farming_decide') {
        const c = state.cases.find((x) => x.beneficiary.user_id === args.p_beneficiary)!;
        const a = String(args.p_action);
        const d = c.decision || { score_mode: 'full' as const, givers: [] as string[], hold: false, note: null, at: W0 };
        if (a === 'hold' || a === 'unhold') d.hold = a === 'hold'; else { d.score_mode = a as 'full'; d.givers = args.p_givers as string[]; }
        c.decision = d;
        c.beneficiary.rings = d.score_mode === 'once' ? c.beneficiary.rings_once : d.score_mode === 'none' ? c.beneficiary.rings_none : c.beneficiary.rings_full;
        return { ok: true, score_mode: d.score_mode, hold: d.hold, rings: c.beneficiary.rings };
      }
      return null;
    }),
  };
});
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const lastDecide = () => calls.filter((c) => c.fn === 'kr8_admin_farming_decide').slice(-1)[0];

describe('Ring-farming check · Needs you card, case sheet and buttons', () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="app"></div>'; calls.length = 0; state = farmData(); history.replaceState(null, '', '#inbox');
    (await import('./farmCheck'))._resetFarm(); (await import('./adminSheet'))._resetSheets();
  });

  it('one highlighted card per case at the top of Needs you', async () => {
    const { farmSection } = await import('./farmCheck');
    const sec = farmSection(); document.getElementById('app')!.append(sec);
    await wait();
    const cards = sec.querySelectorAll('.fc-card');
    expect(cards.length).toBe(2);
    const nut = document.getElementById(`fcCase-${U(19)}`)!;
    expect(nut.className).toContain('t-r');   // #19 is in the prize places → red
    expect(nut.textContent).toContain('Ring-farming check');
    expect(nut.textContent).toContain('12 accounts joined overnight and liked only #19 Nut');
    expect(nut.textContent).toContain('Likely friends asked to like (coordinated)');
    expect(nut.textContent).toContain('125 now');
    expect(nut.querySelectorAll('.fc-faces .fc-av').length).toBe(1 + 7 + 1);   // #19, 7 faces, "+5"
  });

  it('tap → full sheet with signals, Rings comparison, every account (tap → member) and 4 decisions', async () => {
    const { openFarmSheet } = await import('./farmCheck');
    openFarmSheet(U(19)); await wait();
    const sh = document.getElementById('xSheet')!;
    expect(sh.dataset.kind).toBe('farm');
    expect(location.hash).toBe(`#x/farm/${encodeURIComponent(U(19))}`);
    expect(sh.textContent).toContain('100% of their likes went to #19');
    expect(sh.textContent).toContain('7 of 12 posted their own Reels (looks like real people)');
    expect(document.getElementById('fcBarOnce')!.textContent).toContain('101 Rings · #1');
    expect(document.getElementById('fcBarNone')!.textContent).toContain('89 Rings · #2');
    const rows = sh.querySelectorAll<HTMLAnchorElement>('#fcGivers a.fc-g');
    expect(rows.length).toBe(12);
    expect(rows[0].getAttribute('href')).toBe(`#m/${U(121)}`);
    expect(['fcFull', 'fcOnce', 'fcNone', 'fcHold'].map((id) => document.getElementById(id)?.textContent))
      .toEqual(['Count fully', 'Count each friend once', 'Don’t count these', 'Hold prize']);
  });

  it('each button calls kr8_admin_farming_decide with the flagged accounts, shows the new Rings, and Undo goes back', async () => {
    const { openFarmSheet } = await import('./farmCheck');
    openFarmSheet(U(19)); await wait();
    const ids = nutCase.givers.map((g) => g.user_id);
    document.getElementById('fcOnce')!.click(); await wait();
    const dec = calls.filter((c) => c.fn === 'kr8_admin_farming_decide');
    expect(dec[0].args).toEqual({ p_beneficiary: U(19), p_action: 'once', p_givers: ids, p_note: null });
    expect(document.getElementById('fcStatus')!.textContent).toContain('Saved — each friend counts once. #19 now has 101 Rings.');
    expect(document.getElementById('fcOnce')!.textContent).toBe('✓ Count each friend once');
    document.getElementById('fcUndo')!.click(); await wait();
    expect(lastDecide().args).toMatchObject({ p_action: 'full' });
    document.getElementById('fcNone')!.click(); await wait();
    expect(lastDecide().args).toMatchObject({ p_action: 'none' });
    expect(document.getElementById('fcStatus')!.textContent).toContain('#19 now has 89 Rings.');
    document.getElementById('fcHold')!.click(); await wait();
    expect(lastDecide().args).toMatchObject({ p_action: 'hold' });
    expect(document.getElementById('fcHold')!.textContent).toBe('✓ Prize on hold · release');
    document.getElementById('fcHold')!.click(); await wait();
    expect(lastDecide().args).toMatchObject({ p_action: 'unhold' });
    document.getElementById('fcFull')!.click(); await wait();
    expect(lastDecide().args).toMatchObject({ p_action: 'full' });
  });

  it('reachable from the board row and from the protect alert', async () => {
    const { farmBoardMark, farmAlertList } = await import('./farmCheck');
    const board = document.createElement('div'); board.id = 'v2Board';
    board.innerHTML = `<a class="v2li v2brow" href="#m/${U(19)}" data-uid="${U(19)}"><div class="grow"><b>Nut</b></div></a><a class="v2li v2brow" href="#m/${U(33)}" data-uid="${U(33)}"><div class="grow"></div></a>`;
    document.body.append(board);
    farmBoardMark(board); await wait();
    const chip = document.getElementById(`fcBoard-${U(19)}`)!;
    expect(chip.textContent).toBe('Ring-farming?');
    expect(board.querySelectorAll('.fc-board').length).toBe(1);
    chip.click(); await wait();
    expect(document.getElementById('xSheet')!.dataset.kind).toBe('farm');
    const box = document.createElement('div');
    await farmAlertList(box);
    expect(box.querySelector(`#fcAlert-${U(19)}`)!.textContent).toContain('#19 Nut · 12 accounts');
    expect(box.querySelector(`#fcAlert-${U(74)}`)!.textContent).toContain('Likely fake accounts');
  });

  it('no 0123 yet → nothing shows, nothing breaks', async () => {
    state = { bad: true } as never;
    const { farmSection } = await import('./farmCheck');
    const sec = farmSection(); await wait();
    expect(sec.hidden).toBe(true);
    expect(sec.children.length).toBe(0);
  });
});
