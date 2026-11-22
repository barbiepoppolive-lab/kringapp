/**
 * Week-close celebration sounds (founder 22 Nov): synthesised with WebAudio, no audio files to load.
 * Temple-bell strike (Kring brand sound), rising whoosh, firework pops + crackle, winner fanfare.
 * Browsers only allow sound after a tap, so the celebration starts with a "tap to open" gift.
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;

export function celebrateAudio(): Ctx | null {
  if (ctx) return ctx;
  try {
    const A = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}
export function unlockAudio(): void { const c = celebrateAudio(); if (c && c.state === 'suspended') void c.resume().catch(() => undefined); }
export function setMuted(m: boolean): void { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }
export function isMuted(): boolean { return muted; }
export function stopAudio(): void { try { void ctx?.close(); } catch { /* ignore */ } ctx = null; master = null; }

function out(): { c: Ctx; m: GainNode } | null { const c = celebrateAudio(); return c && master ? { c, m: master } : null; }

let noiseBuf: AudioBuffer | null = null;
function noise(c: Ctx): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

/** Thai temple bell: inharmonic partials with a long shimmering decay. */
export function bell(at = 0, pitch = 660, vol = 0.5): void {
  const o = out(); if (!o) return;
  const { c, m } = o; const t = c.currentTime + at;
  [[1, 1, 3.2], [2.76, 0.5, 2.2], [5.4, 0.28, 1.4], [8.93, 0.14, 0.9], [0.5, 0.35, 3.6]].forEach(([r, a, d]) => {
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = 'sine'; osc.frequency.value = pitch * r;
    osc.detune.setValueAtTime(0, t); osc.detune.linearRampToValueAtTime(r > 1 ? 6 : 0, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g).connect(m); osc.start(t); osc.stop(t + d + 0.05);
  });
}

/** Rising rocket whoosh. */
export function whoosh(at = 0, dur = 0.7, vol = 0.35): void {
  const o = out(); if (!o) return;
  const { c, m } = o; const t = c.currentTime + at;
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
  f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3800, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(m); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

/** Firework: low boom + bright burst, then a crackle tail. */
export function boom(at = 0, vol = 0.6, crackle = true): void {
  const o = out(); if (!o) return;
  const { c, m } = o; const t = c.currentTime + at;
  const k = c.createOscillator(); const kg = c.createGain();
  k.type = 'sine'; k.frequency.setValueAtTime(140, t); k.frequency.exponentialRampToValueAtTime(38, t + 0.45);
  kg.gain.setValueAtTime(vol, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  k.connect(kg).connect(m); k.start(t); k.stop(t + 0.55);
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.6);
  const g = c.createGain(); g.gain.setValueAtTime(vol * 0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  s.connect(f).connect(g).connect(m); s.start(t, Math.random()); s.stop(t + 0.7);
  if (!crackle) return;
  for (let i = 0; i < 26; i++) {
    const ct = t + 0.25 + Math.random() * 1.1;
    const cs = c.createBufferSource(); cs.buffer = noise(c);
    const cf = c.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 2500 + Math.random() * 4000;
    const cg = c.createGain(); const a = vol * (0.12 + Math.random() * 0.18);
    cg.gain.setValueAtTime(a, ct); cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.03 + Math.random() * 0.03);
    cs.connect(cf).connect(cg).connect(m); cs.start(ct, Math.random()); cs.stop(ct + 0.08);
  }
}

/** Bright winner fanfare (rising arpeggio, then a held chord). */
export function fanfare(at = 0, vol = 0.22): void {
  const o = out(); if (!o) return;
  const { c, m } = o; const t = c.currentTime + at;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((fq, i) => {
    const st = t + i * 0.11; const end = i === notes.length - 1 ? st + 1.4 : st + 0.22;
    [1, 2].forEach((h, j) => {
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = j ? 'sine' : 'triangle'; osc.frequency.value = fq * h;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol * (j ? 0.3 : 1), st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(m); osc.start(st); osc.stop(end + 0.05);
    });
  });
  [523.25, 659.25, 783.99].forEach((fq) => {
    const st = t + 0.44; const osc = c.createOscillator(); const g = c.createGain();
    osc.type = 'sine'; osc.frequency.value = fq;
    g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol * 0.5, st + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, st + 1.6);
    osc.connect(g).connect(m); osc.start(st); osc.stop(st + 1.7);
  });
}

/** Sparkle "ting" (rings flying into Rewards). */
export function sparkle(at = 0, vol = 0.16): void {
  const o = out(); if (!o) return;
  const { c, m } = o; const t = c.currentTime + at;
  [1568, 2093, 2637, 3136].forEach((fq, i) => {
    const st = t + i * 0.06; const osc = c.createOscillator(); const g = c.createGain();
    osc.type = 'sine'; osc.frequency.value = fq;
    g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
    osc.connect(g).connect(m); osc.start(st); osc.stop(st + 0.4);
  });
}
