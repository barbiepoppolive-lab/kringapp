import { describe, expect, it } from 'vitest';
import * as demo from './v8DemoData';

/* App demo v2 (13 Nov): places and new friends; food is allowed in at most 2 demo items, never in the first 4 Reels. */
const FOOD = /food|noodle|coffee|café|cafe|matcha|latte|tea\b|toast|brioche|dessert|sticky rice|soy milk|\beat\b|drink|beer|wine|cocktail|bar\b|restaurant|kitchen|cook|wok|อาหาร|กะเพรา|ข้าว|ก๋วยเตี๋ยว|กาแฟ|ชา|ขนม|หมู|ไก่|ร้านอาหาร|เครื่องดื่ม|ออเดอร์/i;
const BANNED = /\b(rate|host|guide|tour|creator|gift|wallet|credit|coins?|launch|lucky|draw|reviews?|stars?|hidden gem|alcohol|temples?|meet|dating)\b/i;
const text = (x: unknown) => JSON.stringify(x).replace(/"(img|av|avatar|video|poster)":"[^"]*"/g, '');
const all = () => [
  ...demo.INITIAL_FEED_ITEMS, ...Object.values(demo.INITIAL_STORIES).flat(), ...demo.DEMO_PEOPLE,
  ...demo.INITIAL_DEALS, ...demo.DEMO_REQUESTS, ...demo.DEMO_THREADS,
];

describe('demo data v2', () => {
  it('has at most 2 food items across every demo list', () => {
    const food = all().filter((x) => FOOD.test(text(x)));
    expect(food.length).toBeLessThanOrEqual(2);
  });
  it('keeps food out of the first 4 Reels and out of perks, people and plans', () => {
    expect(demo.INITIAL_FEED_ITEMS.slice(0, 4).filter((x) => FOOD.test(text(x)))).toEqual([]);
    for (const x of [...demo.INITIAL_DEALS, ...demo.DEMO_PEOPLE, ...Object.values(demo.INITIAL_STORIES).flat()]) expect(FOOD.test(text(x))).toBe(false);
  });
  it('opens on Bang Pu gulls, with 9–10 Reels from 4+ example Kring Locals', () => {
    const f = demo.INITIAL_FEED_ITEMS;
    expect(f[0].video).toMatch(/bangpu\.mp4$/);
    expect(f.length).toBeGreaterThanOrEqual(9);
    expect(f.every((x) => x.video && x.poster)).toBe(true);
    expect(new Set(f.map((x) => x.name)).size).toBeGreaterThanOrEqual(4);
  });
  it('uses no banned words', () => {
    for (const x of all()) expect(text(x)).not.toMatch(BANNED);
  });
});
