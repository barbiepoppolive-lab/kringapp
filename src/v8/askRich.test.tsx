// 0185 Ask BKK: big emoji, reactions, share-card text wrapping, the photo-check rules, and the thread UI hooks.
import { describe, expect, it } from 'vitest';
import { applyReact, bigEmoji, nextReact, wrapLines, REACTS, EMOJI_ALL } from './askRich';
import { askPhotoVerdict } from '../../supabase/functions/kr8-ask-photo/rules.ts';
import { readFileSync } from 'node:fs';

describe('big emoji (1–3 emoji only)', () => {
  it.each(['😂', '🔥🔥', '❤️💯😂', '🇹🇭', '👍🏽', '😂 😂'])('%s is big', (t) => expect(bigEmoji(t)).toBe(true));
  it.each(['', 'ok 😂', '😂😂😂😂', '123', 'สวัสดี', '#', 'lol'])('%s is normal', (t) => expect(bigEmoji(t)).toBe(false));
});

describe('reactions', () => {
  it('has exactly 😂 ❤️ 🔥 💯', () => expect([...REACTS]).toEqual(['😂', '❤️', '🔥', '💯']));
  it('tap again takes it back, another switches', () => {
    expect(nextReact(null, '🔥')).toBe('🔥');
    expect(nextReact('🔥', '🔥')).toBe(null);
    expect(nextReact('🔥', '😂')).toBe('😂');
  });
  it('one per member: switching moves the count', () => {
    expect(applyReact({ '🔥': 2 }, null, '🔥')).toEqual({ '🔥': 3 });
    expect(applyReact({ '🔥': 1 }, '🔥', '😂')).toEqual({ '😂': 1 });
    expect(applyReact({ '🔥': 1 }, '🔥', null)).toEqual({});
  });
  it('the emoji picker has no duplicates', () => expect(new Set(EMOJI_ALL).size).toBe(EMOJI_ALL.length));
  it('reactions never give Rings (0185 has no ledger / score write for them)', () => {
    const sql = readFileSync('supabase/migrations/0185_ask_share_rich_react.sql', 'utf8');
    const fn = sql.slice(sql.indexOf('function public.kr8_ask_react('), sql.indexOf('function public.kr8_ask_react_counts'));
    expect(fn).not.toMatch(/rings_ledger|kr8_posts|score/);
    expect(fn).toMatch(/interval '1 minute'\) >= 60/);
  });
});

describe('share card text', () => {
  const m = (s: string) => s.length * 10;
  it('fits short text on one line', () => expect(wrapLines(m, 'Best sunset spot?', 400, 3)).toEqual(['Best sunset spot?']));
  it('cuts long text nicely with …', () => {
    const out = wrapLines(m, 'Santi Chai Prakan Park at 5:30 is free and breezy with lights after dark and the river right there', 200, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith('…')).toBe(true);
    out.forEach((l) => expect(m(l)).toBeLessThanOrEqual(200));
  });
  it('wraps Thai without spaces', () => {
    const out = wrapLines(m, 'ไปดูพระอาทิตย์ตกริมแม่น้ำเจ้าพระยาที่ไหนดีที่สุดในกรุงเทพ', 120, 3);
    expect(out.length).toBeGreaterThan(1);
    out.forEach((l) => expect(m(l)).toBeLessThanOrEqual(120));
  });
});

describe('Ask photo check rules (same as card photos / Reels)', () => {
  it('passes a normal street photo', () => expect(askPhotoVerdict([], [], [])).toBe('ok'));
  it('refuses nudity', () => expect(askPhotoVerdict([{ Name: 'Explicit Nudity', Confidence: 91 }], [], [])).toBe('nudity'));
  it('ignores weak moderation guesses', () => expect(askPhotoVerdict([{ Name: 'Explicit Nudity', Confidence: 40 }], [], [])).toBe('ok'));
  it('refuses a child face (age range tops out under 18)', () => expect(askPhotoVerdict([], [{ Confidence: 99, AgeRange: { Low: 6, High: 12 } }], [])).toBe('child'));
  it('passes an adult face', () => expect(askPhotoVerdict([], [{ Confidence: 99, AgeRange: { Low: 24, High: 32 } }], [])).toBe('ok'));
  it('refuses a copied picture (app / stock watermark)', () => {
    expect(askPhotoVerdict([], [], [{ DetectedText: 'TikTok', Type: 'WORD', Confidence: 95 }])).toBe('copied');
    expect(askPhotoVerdict([], [], [{ DetectedText: 'shutterstock', Type: 'WORD', Confidence: 95 }])).toBe('copied');
  });
  it('a bare @handle alone is fine', () => expect(askPhotoVerdict([], [], [{ DetectedText: '@ploy.bkk', Type: 'WORD', Confidence: 95 }])).toBe('ok'));
});
