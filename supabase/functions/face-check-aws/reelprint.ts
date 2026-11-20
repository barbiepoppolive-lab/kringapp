// reelprint (20 Nov 2026, 0165 re-used clip check): a 64-bit "difference hash" of one Reel frame, and the rule for which
// faces found in a Reel point to ANOTHER member. Pure: no Deno / network, so vitest runs it.
//  dHash: the grey picture is area-averaged into a 9 × 8 grid; each of the 64 bits says "the cell on the right is brighter".
//  The same clip re-uploaded (re-encoded, resized, trimmed) keeps nearly the same bits; the database compares them
//  (kr8_reel_reuse_check, Hamming distance). The 20 Nov backfill used exactly this function in Python (scripts/reelprint_backfill.py).

/** RGBA pixels (4 bytes each, row by row) → 16 hex characters. */
export function dhashRGBA(px: ArrayLike<number>, w: number, h: number): string {
  if (!(w > 0 && h > 0) || px.length < w * h * 4) throw new Error('bad picture');
  const sum = new Float64Array(72), cnt = new Float64Array(72);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(7, Math.floor((y * 8) / h));
    for (let x = 0; x < w; x++) {
      const gx = Math.min(8, Math.floor((x * 9) / w));
      const i = (y * w + x) * 4;
      sum[gy * 9 + gx] += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      cnt[gy * 9 + gx]++;
    }
  }
  let hex = '', nib = 0;
  for (let k = 0; k < 64; k++) {
    const gy = Math.floor(k / 8), gx = k % 8;
    const a = sum[gy * 9 + gx] / (cnt[gy * 9 + gx] || 1), b = sum[gy * 9 + gx + 1] / (cnt[gy * 9 + gx + 1] || 1);
    nib = (nib << 1) | (b > a ? 1 : 0);
    if (k % 4 === 3) { hex += nib.toString(16); nib = 0; }
  }
  return hex;
}

/** bits that differ between two hashes (0 = same picture, 64 = opposite) */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

export interface FaceHit { user: string; sim: number }
/** Faces AWS found in a Reel's frames → the other member it shows, but ONLY when the author never appears in any frame
 *  (friends filmed together are fine). Needs a strong match (≥ 95 %). Returns null when nothing points to someone else. */
export function otherMemberInReel(author: string, frames: { at: string; hits: FaceHit[] }[], min = 95): { user: string; sim: number; at: string } | null {
  const me = author.toLowerCase();
  let best: { user: string; sim: number; at: string } | null = null;
  for (const f of frames) for (const h of f.hits) {
    if (!h.user || !(h.sim >= 80)) continue;
    if (h.user.toLowerCase() === me) return null;           // the author is in it: their own Reel
    if (h.sim >= min && (!best || h.sim > best.sim)) best = { user: h.user, sim: h.sim, at: f.at };
  }
  return best;
}
