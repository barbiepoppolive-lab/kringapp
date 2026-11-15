// Me tab + face check helpers (10 Nov).
import { describe, expect, it } from 'vitest';
import { LIVE_START, liveNext, type FaceSample } from './v5Face';
import { fmtCount, untilWinners } from './V5Me';

const s = (yaw: number, ear = 0.3, extra: Partial<FaceSample> = {}): FaceSample => ({ found: true, yaw, ear, size: 0.3, centered: true, ...extra });
const run = (samples: FaceSample[]) => samples.reduce(liveNext, LIVE_START);

describe('live face check', () => {
  it('straight → left → right → blink in that order', () => {
    const st = run([s(0.5), s(0.5), s(0.5), s(0.5), s(0.72), s(0.72), s(0.28), s(0.28), s(0.5), s(0.5, 0.1), s(0.5, 0.31)]);
    expect(st.step).toBe('done');
    expect([st.straight, st.left, st.right, st.blink]).toEqual([true, true, true, true]);
  });
  it('a still photo never passes (no head turn, no blink)', () => {
    const st = run(Array.from({ length: 60 }, () => s(0.5)));
    expect(st.step).toBe('left');
    expect(st.blink).toBe(false);
  });
  it('turning right first does not count as left', () => {
    const st = run([s(0.5), s(0.5), s(0.5), s(0.5), s(0.25), s(0.25), s(0.25)]);
    expect(st.step).toBe('left');
  });
  it('no face, face off-centre or too small resets the step', () => {
    expect(run([s(0.5), s(0.5), s(0.5), { found: false, yaw: 0.5, ear: 0, size: 0, centered: false }]).frames).toBe(0);
    expect(run(Array.from({ length: 8 }, () => s(0.5, 0.3, { centered: false }))).step).toBe('straight');
    expect(run(Array.from({ length: 8 }, () => s(0.5, 0.3, { size: 0.08 }))).step).toBe('straight');
  });

  // P0 11 Nov: real phones read 2–5 frames a second, small eyes / glasses / side light
  const toBlink = (t0 = 1000): FaceSample[] => [s(0.5), s(0.5), s(0.5), s(0.5), s(0.72), s(0.72), s(0.28), s(0.28)].map((f, i) => ({ ...f, t: t0 + i * 300 }));
  it('a shallow eye closure (70 % of open) now counts as a blink', () => {
    const st = run([...toBlink(), s(0.5, 0.3, { t: 4000 }), s(0.5, 0.21, { t: 4200 }), s(0.5, 0.25, { t: 4400 })]);
    expect(st.step).toBe('done');
    expect(st.blink).toBe(true);
  });
  it('the blink step accepts a slightly turned head (yaw 0.68)', () => {
    const st = run([...toBlink(), s(0.68, 0.3, { t: 4000 }), s(0.68, 0.15, { t: 4200 }), s(0.68, 0.3, { t: 4400 })]);
    expect(st.blink).toBe(true);
  });
  it('20 s of straight frames with no eye drop → done with blink false', () => {
    const frames = Array.from({ length: 100 }, (_, i) => s(0.5, 0.3, { t: 4000 + i * 205 }));
    const before = run([...toBlink(), ...frames.slice(0, 90)]);
    expect(before.step).toBe('blink');
    const st = run([...toBlink(), ...frames]);
    expect(st.step).toBe('done');
    expect([st.straight, st.left, st.right, st.blink]).toEqual([true, true, true, false]);
  });
  it('20 s fallback with two eye-closure frames (no clean reopen) → done with blink true', () => {
    const frames = Array.from({ length: 100 }, (_, i) => s(0.5, i < 10 ? 0.3 : i === 10 || i === 40 ? 0.2 : 0.23, { t: 4000 + i * 205 }));   // eyes only half reopen
    const st = run([...toBlink(), ...frames]);
    expect(st.step).toBe('done');
    expect(st.blink).toBe(true);
  });
  it('the fallback needs a face looking at the camera: 20 s looking away does not pass', () => {
    const st = run([...toBlink(), ...Array.from({ length: 120 }, (_, i) => s(0.75, 0.3, { t: 4000 + i * 205 }))]);
    expect(st.step).toBe('blink');
  });
  it('a still photo never passes, even with timestamps for minutes', () => {
    const st = run(Array.from({ length: 600 }, (_, i) => s(0.5, 0.3, { t: 1000 + i * 250 })));
    expect(st.step).toBe('left');
    expect(st.blink).toBe(false);
  });
});

describe('Me tab helpers', () => {
  it('counts look like the locked design', () => {
    expect(fmtCount(214)).toBe('214');
    expect(fmtCount(1400)).toBe('1.4k');
    expect(fmtCount(5100)).toBe('5.1k');
    expect(fmtCount(25000)).toBe('25k');
  });
  it('countdown to midnight Bangkok (board closes 00:00, D-10NOV-G)', () => {
    expect(untilWinners(Date.parse('2026-11-10T21:46:00+07:00'))).toBe('2h 14m');
    expect(untilWinners(Date.parse('2026-11-10T00:30:00+07:00'))).toBe('23h 30m');
    expect(untilWinners(Date.parse('2026-11-10T23:59:00+07:00'))).toBe('0h 01m');
  });
});

// K (15 Nov, member #16): monolid eyes, indoor light, eyes closed "for one second" did not register
describe('blink step · small eyes and a slow, held closure', () => {
  const ss = (yaw: number, ear: number, t: number): FaceSample => ({ found: true, yaw, ear, size: 0.3, centered: true, t });
  const lead: FaceSample[] = [0.5, 0.5, 0.5, 0.5, 0.72, 0.72, 0.28, 0.28].map((y, i) => ss(y, 0.3, 1000 + i * 120));
  const blinkFrames = (ears: number[], t0 = 3000, dt = 70) => ears.map((e, i) => ss(0.5, e, t0 + i * dt));
  const runK = (f: FaceSample[]) => [...lead, ...f].reduce(liveNext, LIVE_START);
  it('slow monolid closure (0.20 → 0.14 over ~1 s, eyes kept shut) passes on the hold', () => {
    const ears = [0.2, 0.2, 0.198, 0.19, 0.18, 0.17, 0.16, 0.15, 0.145, 0.14, 0.14, 0.14, 0.14, 0.14];
    const st = runK(blinkFrames(ears));
    expect(st.step).toBe('done');
    expect(st.blink).toBe(true);
  });
  it('the old rule missed it: the open level followed the eyes down (regression guard)', () => {
    // same sequence at 3 frames a second still passes
    const st = runK(blinkFrames([0.2, 0.19, 0.17, 0.15, 0.14, 0.14, 0.14], 3000, 330));
    expect(st.blink).toBe(true);
  });
  it('open-eye jitter (±6 %) for 6 s does not pass as a blink', () => {
    const ears = Array.from({ length: 85 }, (_, i) => 0.2 * (1 + 0.06 * Math.sin(i * 1.7)));
    const st = runK(blinkFrames(ears));
    expect(st.step).toBe('blink');
    expect(st.blink).toBe(false);
  });
  it('the head turns still have to happen first', () => {
    const st = [ss(0.5, 0.3, 0), ss(0.5, 0.3, 100), ss(0.5, 0.3, 200), ss(0.5, 0.3, 300), ...blinkFrames([0.3, 0.1, 0.1, 0.1, 0.3])].reduce(liveNext, LIVE_START);
    expect(st.step).toBe('left');
  });
});
