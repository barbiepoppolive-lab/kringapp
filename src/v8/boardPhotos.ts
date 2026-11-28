/**
 * 28 Nov (m252): weekly-board photos, downloaded once and kept small on the phone.
 * The lite board gives each row a short photo key (pv). A photo is fetched from kr8_board_photos only when this phone has no copy
 * with that key (a member who changes their photo gets a new key, so the new photo shows). Each photo is shrunk to 96 px
 * (~4 KB) and kept in memory + localStorage (wrapped: private mode / full storage just means fetching again).
 * Order: the top rows first (what the screen shows), then the rest.
 */
import { useEffect, useState } from 'react';
import { kxBoardPhotos } from './v5Kx';

const LS = 'kr8_board_ph_v1';
const KEEP = 150;
const PX = 96;
type Ent = { pv: string; t: string };
const mem = new Map<string, Ent>();
let loaded = false;
let ver = 0;
const subs = new Set<(v: number) => void>();
const inflight = new Set<string>();

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const o = JSON.parse(localStorage.getItem(LS) || '{}') as Record<string, Ent>;
    for (const [k, v] of Object.entries(o)) if (v && typeof v.pv === 'string' && typeof v.t === 'string') mem.set(k, v);
  } catch { /* nothing kept */ }
}
function persist(): void {
  try {
    const small = [...mem.entries()].filter(([, v]) => v.t.length < 20000).slice(-KEEP);
    localStorage.setItem(LS, JSON.stringify(Object.fromEntries(small)));
  } catch { /* private mode / full */ }
}
function bump(): void { ver += 1; for (const f of subs) f(ver); }

/** the kept photo for this member, only if it is the same photo the board names (pv) */
export function boardPhoto(id: string, pv: string | null | undefined): string | null {
  if (!pv) return null;
  load();
  const e = mem.get(id);
  return e && e.pv === pv ? e.t : null;
}

/** shrink a data: image to PX×PX (centre crop) as a JPEG; on any problem keep the original in memory only */
function shrink(src: string): Promise<string> {
  return new Promise((res) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') { res(src); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        if (!s) { res(src); return; }
        const c = document.createElement('canvas');
        c.width = PX; c.height = PX;
        const g = c.getContext('2d');
        if (!g) { res(src); return; }
        g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, PX, PX);
        const out = c.toDataURL('image/jpeg', 0.82);
        res(out && out.length > 100 ? out : src);
      } catch { res(src); }
    };
    img.onerror = () => res(src);
    img.src = src;
  });
}

/** fetch the photos this phone does not have yet: rows in board order, first `first` of them in one call, the rest after */
export async function ensureBoardPhotos(rows: { user_id: string; pv?: string | null }[] | null | undefined, first = 10): Promise<void> {
  if (!rows || !rows.length) return;
  load();
  const need = rows.filter((r) => r.pv && r.user_id && !boardPhoto(r.user_id, r.pv) && !inflight.has(r.user_id + r.pv)).map((r) => ({ id: r.user_id, pv: r.pv as string }));
  if (!need.length) return;
  const batches: { id: string; pv: string }[][] = [need.slice(0, first)];
  for (let i = first; i < need.length; i += 20) batches.push(need.slice(i, i + 20));
  for (const b of batches) {
    if (!b.length) continue;
    b.forEach((x) => inflight.add(x.id + x.pv));
    try {
      const got = await kxBoardPhotos(b.map((x) => x.id));
      for (const g of got || []) {
        if (!g || !g.id || !g.photo) continue;
        mem.set(g.id, { pv: g.pv, t: await shrink(g.photo) });
      }
      persist();
      bump();
    } catch { /* signed out / older server: the board shows initials */ }
    finally { b.forEach((x) => inflight.delete(x.id + x.pv)); }
  }
}

/** re-render when new photos arrive */
export function useBoardPhotosVer(): number {
  const [v, setV] = useState(ver);
  useEffect(() => { subs.add(setV); return () => { subs.delete(setV); }; }, []);
  return v;
}
