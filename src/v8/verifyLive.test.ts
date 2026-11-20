import { describe, expect, it } from 'vitest';
import { LIVE_MAX_MS, LOST_MS, MAX_RESTARTS, checkPayload, clientVerdict, frameHint, liveStart, liveStep, progressOf, randomOrder } from './verifyLive';
import type { FrameRead, LiveFrame, LiveState, Turn } from './verifyLive';
import { cosine, decodeYunet, fasBox, invertAffine, l2norm, similarity, SFACE_REF } from './faceEngine';
import { V5_L } from './v5Strings';

let T = 1000;
/** a fake embedding: person p (unit vector along axis p), anti-spoof score r */
const F = (p = 1, r = 0.98): FrameRead => { const e = new Float32Array(128); e[p] = 1; return { emb: e, real: r }; };
const fr = (o: Partial<LiveFrame> = {}): LiveFrame => ({ found: true, faces: 1, yaw: 0.5, closed: 0.05, ear: 0.3, size: 0.4, cx: 0.5, cy: 0.5, bright: 0.5, t: (T += 66), ...o });
const run = (s: LiveState, frames: LiveFrame[]) => frames.reduce(liveStep, s);
const straight = (n = 5) => Array.from({ length: n }, () => fr());
const turn = (dir: Turn, n = 3) => Array.from({ length: n }, () => fr({ yaw: dir === 'left' ? 0.68 : 0.32, cx: dir === 'left' ? 0.47 : 0.53 }));
const blink = () => [fr({ closed: 0.05 }), fr({ closed: 0.8 }), fr({ closed: 0.85 }), fr({ closed: 0.06 })];

describe('instant face check · live steps (0081)', () => {
  it('a live face: straight → both turns in the asked order → blink = done, within seconds', () => {
    for (const order of [['left', 'right'], ['right', 'left']] as [Turn, Turn][]) {
      T = 1000;
      const s = run(liveStart(order), [...straight(), ...turn(order[0]), ...turn(order[1]), ...blink()]);
      expect(s.step).toBe('done');
      expect(s.turned).toEqual({ left: true, right: true });
      expect(s.blinkSeen).toBe(true);
      expect(s.doneAt - s.straightAt).toBeLessThan(2000);
      expect(checkPayload(s, { engine: 'mediapipe', match: 0.62, same: 0.8, device: 'Android' })).toMatchObject({ live: true, left: true, right: true, blink: true, order: order.join('-') });
    }
  });
  it('turning the wrong way does not count', () => {
    T = 1000;
    const s = run(liveStart(['left', 'right']), [...straight(), ...turn('right', 6)]);
    expect(s.step).toBe('turn1');
    expect(s.turned.right).toBe(false);
  });
  it('a STILL PHOTO fails: no turn, no blink before the time limit', () => {
    T = 1000;
    let s = run(liveStart(['left', 'right']), straight());
    const still = Array.from({ length: Math.ceil(LIVE_MAX_MS / 66) + 3 }, () => fr());
    s = run(s, still);
    expect(s.step).toBe('failed');
    expect(s.fail).toBe('still');
    expect(clientVerdict({ live: s, selfie: F(), others: [F(), F()], match: 0.7 })).toEqual({ kind: 'fail', why: 'still' });
  });
  it('turns but no blink → timeout fail', () => {
    T = 1000;
    let s = run(liveStart(['left', 'right']), [...straight(), ...turn('left'), ...turn('right')]);
    s = run(s, Array.from({ length: Math.ceil(LIVE_MAX_MS / 66) + 3 }, () => fr({ closed: 0.06 })));
    expect(s.fail).toBe('timeout');
  });
  it('face-api fallback: blink from the eye shape', () => {
    T = 1000;
    const ea = (ear: number) => fr({ closed: null, ear });
    const s = run(liveStart(['right', 'left']), [...Array.from({ length: 5 }, () => ea(0.3)), ...turn('right').map((f) => ({ ...f, closed: null })),
      ...turn('left').map((f) => ({ ...f, closed: null })), ea(0.3), ea(0.3), ea(0.12), ea(0.3)]);
    expect(s.step).toBe('done');
  });
  it('lost face mid-check → starts again; too many restarts → fail', () => {
    T = 1000;
    let s = run(liveStart(['left', 'right']), [...straight(), ...turn('left')]);
    s = run(s, [fr({ found: false, t: T + LOST_MS + 50 })]);
    T += LOST_MS + 50;
    expect(s.step).toBe('straight');
    expect(s.restarts).toBe(1);
    for (let i = 0; i < MAX_RESTARTS; i++) { s = run(s, [...straight(), ...turn('left')]); s = run(s, [fr({ found: false, t: (T += LOST_MS + 50) })]); }
    expect(s.step).toBe('failed');
    expect(s.fail).toBe('lost');
  });
  it('a face that jumps (another photo swapped in) restarts the check', () => {
    T = 1000;
    let s = run(liveStart(['left', 'right']), [...straight(), ...turn('left')]);
    s = run(s, [fr({ cx: 0.85, size: 0.2 })]);
    expect(s.step).toBe('straight');
    expect(s.restarts).toBe(1);
  });
  it('two faces → hint "only you", and a restart during the live part', () => {
    expect(frameHint(fr({ faces: 2 }), null)).toBe('one');
    T = 1000;
    const s = run(liveStart(['left', 'right']), [...straight(), fr({ faces: 2 })]);
    expect(s.step).toBe('straight');
  });
  it('friendly hints: closer, back, light, centre, still', () => {
    expect(frameHint(fr({ size: 0.12 }), null)).toBe('closer');
    expect(frameHint(fr({ size: 0.9 }), null)).toBe('back');
    expect(frameHint(fr({ bright: 0.1 }), null)).toBe('light');
    expect(frameHint(fr({ cx: 0.8 }), null)).toBe('centre');
    expect(frameHint(fr({ cx: 0.55 }), fr({ cx: 0.45 }))).toBe('still');
    expect(frameHint(fr({ found: false }), null)).toBe('face');
    expect(frameHint(fr(), fr())).toBe(null);
  });
  it('random order: both orders happen', () => {
    expect(randomOrder(() => 0.1)).toEqual(['left', 'right']);
    expect(randomOrder(() => 0.9)).toEqual(['right', 'left']);
  });
  it('progress fills the ring', () => {
    T = 1000;
    expect(progressOf(liveStart())).toBe(0);
    expect(progressOf(run(liveStart(['left', 'right']), [...straight(), ...turn('left'), ...turn('right'), ...blink()]))).toBe(1);
  });
});

describe('instant face check · the phone\'s verdict (SFace cosine + MiniFASNet)', () => {
  T = 1000;
  const done = run(liveStart(['left', 'right']), [...straight(), ...turn('left'), ...turn('right'), ...blink()]);
  const v = (o: Partial<{ selfie: FrameRead | null; others: FrameRead[]; match: number | null }>) => clientVerdict({ live: done, selfie: F(), others: [F(), F()], match: 0.6, ...o });
  it('sends a good check', () => expect(v({})).toMatchObject({ kind: 'send', doubt: false }));
  it('a printed photo / screen (anti-spoof low on any frame) → fail', () => expect(v({ others: [F(), F(1, 0.2)] })).toEqual({ kind: 'fail', why: 'spoof' }));
  it('fewer than 3 frames scored → fail (anti-spoof needs 3)', () => expect(v({ others: [F()] })).toEqual({ kind: 'fail', why: 'spoof' }));
  it('a different face in a later frame → fail', () => expect(v({ others: [F(), F(2)] })).toEqual({ kind: 'fail', why: 'swap' }));
  it('selfie clearly not the card photo → friendly retry, nothing sent', () => expect(v({ match: 0.2 })).toEqual({ kind: 'fail', why: 'mismatch' }));
  it('a borderline anti-spoof score → sent with a doubt flag (the server queues it)', () => expect(v({ others: [F(), F(1, 0.7)] })).toMatchObject({ kind: 'send', doubt: true }));
  it('borderline card match is the server\'s call', () => expect(v({ match: 0.35 }).kind).toBe('send'));
  it('no face in the selfie → fail', () => expect(v({ selfie: { emb: null, real: null } })).toEqual({ kind: 'fail', why: 'noface' }));
  it('payload has scores and steps, no face measurements', () => {
    const p = checkPayload(done, { engine: 'mediapipe', match: 0.41234, same: 0.9, realMin: 0.97, frames: 3, device: 'iPhone' });
    expect(Object.keys(p).sort()).toEqual(['blink', 'device', 'doubt', 'engine', 'frames', 'left', 'live', 'match', 'ms', 'order', 'real', 'right', 'same', 'straight']);
    expect(p.match).toBe(0.412);
  });
});

describe('instant face check · Thai copy', () => {
  const keys = ['Turn your head slightly left', 'Turn your head slightly right', 'Now blink', 'Move closer', 'More light', 'Hold still', 'You’re verified ✓',
    'We’re checking · usually within a day', 'This face is already on another Kring account', 'Try again · {0} left today', 'Agree and start', 'New: 3-second face check'];
  it('every new screen line has Thai', () => { for (const k of keys) expect(V5_L.th[k], k).toBeTruthy(); });
  it('no banned words in the member copy', () => {
    const banned = /\b(meet|guide|tour|host|creator|reviews?|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples)\b|ลุ้น/i;
    for (const k of keys) { expect(k).not.toMatch(banned); expect(V5_L.th[k]).not.toMatch(banned); }
  });
});

describe('face engine maths (mirrors OpenCV)', () => {
  it('similarity transform maps the reference points onto themselves, and a scaled + shifted copy back', () => {
    const id = similarity(SFACE_REF);
    expect(id[0]).toBeCloseTo(1, 6); expect(id[1]).toBeCloseTo(0, 6); expect(id[2]).toBeCloseTo(0, 4);
    const src = SFACE_REF.map(([x, y]) => [x * 3 + 100, y * 3 + 50] as [number, number]);
    const m = similarity(src);
    const [x, y] = src[2];
    expect(m[0] * x + m[1] * y + m[2]).toBeCloseTo(SFACE_REF[2][0], 3);
    expect(m[3] * x + m[4] * y + m[5]).toBeCloseTo(SFACE_REF[2][1], 3);
    const inv = invertAffine(m);
    expect(inv[0] * SFACE_REF[2][0] + inv[1] * SFACE_REF[2][1] + inv[2]).toBeCloseTo(x, 3);
  });
  it('a rotated face is rotated back (proper rotation, no mirror)', () => {
    const a = 0.3, src = SFACE_REF.map(([x, y]) => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y] as [number, number]);
    const m = similarity(src);
    expect(m[0] * m[4] - m[1] * m[3]).toBeGreaterThan(0);
    expect(Math.atan2(m[3], m[0])).toBeCloseTo(-a, 4);
  });
  it('anti-spoof crop box = minivision CropImage', () => {
    expect(fasBox(480, 640, { x: 187, y: 109, w: 195, h: 239 }, 2.7).map((v) => v + 0)).toEqual([0, 0, 479, 587]);   // values from minivision's own CropImage
    expect(fasBox(640, 480, { x: 300, y: 200, w: 100, h: 100 }, 2.7)).toEqual([215, 115, 485, 385]);
  });
  it('YuNet decoding: one strong cell → one face with 5 points, weak cells dropped', () => {
    const mk = (n: number, k: number) => ({ data: new Float32Array(n * k) });
    const out: Record<string, { data: Float32Array }> = {};
    for (const s of [8, 16, 32]) { const n = (64 / s) ** 2; out[`cls_${s}`] = mk(n, 1); out[`obj_${s}`] = mk(n, 1); out[`bbox_${s}`] = mk(n, 4); out[`kps_${s}`] = mk(n, 10); }
    out.cls_16.data[5] = 0.9; out.obj_16.data[5] = 0.9;   // row 1, col 1 at stride 16 (grid 4×4)
    const f = decodeYunet(out, 64);
    expect(f).toHaveLength(1);
    expect(f[0].score).toBeCloseTo(0.9, 5);
    expect(f[0].x).toBeCloseTo(16 - 8, 4);   // centre (1 + 0) × 16, width e⁰ × 16
    expect(f[0].kps[0]).toEqual([16, 16]);
  });
  it('cosine of L2-normalised vectors', () => {
    expect(cosine(l2norm([3, 4]), l2norm([3, 4]))).toBeCloseTo(1, 6);
    expect(cosine(l2norm([1, 0]), l2norm([0, 2]))).toBeCloseTo(0, 6);
  });
});
