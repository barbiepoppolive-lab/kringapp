import confetti from 'canvas-confetti';
import { playKring } from './sfx';

const GOLDEN_HOUR_OVERRIDE_KEY = 'kring_v3_golden_hour_override';
const LOY_KRATHONG_OVERRIDE_KEY = 'kring_loy_krathong_override';

export const KRING_BRAND_FIREWORK_COLORS = [
  '#FFB21E',
  '#FFD067',
  '#7381FF',
  '#3446FF',
  '#9B5CFF',
] as const;

export interface KringFixedOutcomeSticker {
  id: 'khobkhunkha-19' | 'susu-19' | 'aroimak-39' | 'kring-99';
  th: string;
  en: string;
  emoji: string;
  thb: 19 | 39 | 99;
  hostShareRate: 0.8;
  randomPoolRate: 0;
  hostNetThb: number;
}

export const KRING_FIXED_STICKERS: readonly KringFixedOutcomeSticker[] = [
  {
    id: 'khobkhunkha-19',
    th: 'ขอบคุณค่า',
    en: 'Thank you kindly',
    emoji: '🙏✨',
    thb: 19,
    hostShareRate: 0.8,
    randomPoolRate: 0,
    hostNetThb: 15.2,
  },
  {
    id: 'susu-19',
    th: 'สู้ ๆ',
    en: 'Keep going!',
    emoji: '✌️💛',
    thb: 19,
    hostShareRate: 0.8,
    randomPoolRate: 0,
    hostNetThb: 15.2,
  },
  {
    id: 'aroimak-39',
    th: 'อร่อยมาก',
    en: 'So delicious!',
    emoji: '🍜🔥',
    thb: 39,
    hostShareRate: 0.8,
    randomPoolRate: 0,
    hostNetThb: 31.2,
  },
  {
    id: 'kring-99',
    th: 'กริ๊ง!',
    en: 'Kring! Cheers!',
    emoji: '🔔🥂',
    thb: 99,
    hostShareRate: 0.8,
    randomPoolRate: 0,
    hostNetThb: 79.2,
  },
] as const;

export function computeFixedStickerSplit(thb: number): {
  grossThb: number;
  hostNetThb: number;
  platformThb: number;
  hostShareRate: 0.8;
  randomPoolRate: 0;
} {
  const hostNetThb = Math.round(thb * 80) / 100;
  const platformThb = Math.round(thb * 20) / 100;
  return {
    grossThb: thb,
    hostNetThb,
    platformThb,
    hostShareRate: 0.8,
    randomPoolRate: 0,
  };
}

export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (document?.documentElement?.dataset?.reduceMotion === 'true') {
      return true;
    }
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

export function isGoldenHourWindow(): boolean {
  try {
    const override = localStorage.getItem(GOLDEN_HOUR_OVERRIDE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // ignore
  }
  const hr = new Date().getHours();
  return hr >= 17 && hr <= 23;
}

export function toggleGoldenHourOverride(current: boolean): boolean {
  const next = !current;
  try {
    localStorage.setItem(GOLDEN_HOUR_OVERRIDE_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
}

/**
 * V2.2 Loy Krathong seasonal window: active Nov 1–15 (month index 10, day 1..15)
 * or when overridden via localStorage for preview/testing.
 */
export function isLoyKrathongSeason(now: Date = new Date()): boolean {
  try {
    const override = localStorage.getItem(LOY_KRATHONG_OVERRIDE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // ignore
  }
  const month = now.getMonth(); // 0 = Jan, 10 = Nov
  const day = now.getDate();
  return month === 10 && day >= 1 && day <= 15;
}

/**
 * Approved Kring Sound Logo A "Ching" (ฉิ่ง · two small bronze cups touch, Thai 7-tone tuning in sfx.ts).
 */
export function playKringBumpChime(): void {
  playKring('release');
}

/**
 * V2.4 Bump Act 1 (approach): soft haptic tick every 10m (navigator.vibrate(8)).
 */
export function triggerApproachTick10m(): boolean {
  if (isReducedMotionPreferred()) return false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return Boolean(navigator.vibrate(8));
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * V2.4 Bump Act 2 (contact at 0ms): 30ms one-shot haptic (navigator.vibrate(30)).
 */
export function triggerContactOneShot30ms(): boolean {
  if (isReducedMotionPreferred()) return false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return Boolean(navigator.vibrate(30));
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Chao Phraya River Fireworks Effect (0% Lucky RNG — pure celebratory visual for bump, tips & fixed-value treats).
 * Strictly uses Kring brand colors and skips when prefers-reduced-motion: reduce is active.
 */
export function triggerChaoPhrayaFireworks(bursts = 2): void {
  if (isReducedMotionPreferred()) return;
  try {
    const colors = [...KRING_BRAND_FIREWORK_COLORS];
    for (let i = 0; i < bursts; i++) {
      setTimeout(() => {
        if (isReducedMotionPreferred()) return;
        confetti({
          particleCount: 42,
          spread: 72,
          origin: { x: 0.25 + Math.random() * 0.5, y: 0.58 - i * 0.1 },
          colors,
          disableForReducedMotion: true,
        });
      }, i * 180);
    }
  } catch {
    // ignore in headless/SSR
  }
}
