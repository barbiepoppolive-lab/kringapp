/**
 * N (15 Nov): a visitor who picked a video, wrote a caption, chose a place or typed a greeting lost it all when LINE or
 * Google sign-in left the page. Before the sign-in sheet opens, the draft is kept on the phone (text in localStorage,
 * the video file in IndexedDB) and put back after sign-in. Kept for 2 hours; every storage call is wrapped in try/catch.
 */
import type { PickedPlace } from './V5KxPlaces';

const KEY = 'kr8_signin_draft';
const DB = 'kr8-draft';
const STORE = 'files';
export const DRAFT_MAX_AGE_MS = 2 * 3600_000;

export interface HiDraft { name: string; img: string; context: string; id?: string; message: string }
export interface SignInDraft {
  kind: 'reel' | 'hi';
  at: number;
  caption?: string;
  places?: PickedPlace[];
  area?: string | null;
  here?: boolean;
  hasVideo?: boolean;
  hi?: HiDraft;
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') { ok(null); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch { /* exists */ } };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch { ok(null); }
  });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { ok(req ? (req.result as T) : null); db.close(); };
      tx.onerror = () => { ok(null); db.close(); };
    } catch { ok(null); }
  });
}

/** Pure: is a stored draft still worth restoring? */
export function draftUsable(d: SignInDraft | null, now: number): d is SignInDraft {
  return !!d && (d.kind === 'reel' || d.kind === 'hi') && typeof d.at === 'number' && now - d.at >= 0 && now - d.at < DRAFT_MAX_AGE_MS;
}

export async function saveSignInDraft(d: Omit<SignInDraft, 'at' | 'hasVideo'>, video?: File | null): Promise<void> {
  let hasVideo = false;
  if (video) {
    const ok = await idbDo('readwrite', (s) => s.put({ blob: video, name: video.name, type: video.type, lastModified: video.lastModified }, 'video'));
    hasVideo = ok !== null;
  }
  try { localStorage.setItem(KEY, JSON.stringify({ ...d, at: Date.now(), hasVideo })); } catch { /* private mode */ }
}

export async function loadSignInDraft(): Promise<{ draft: SignInDraft; video: File | null } | null> {
  let d: SignInDraft | null = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null') as SignInDraft | null; } catch { d = null; }
  if (!draftUsable(d, Date.now())) { void clearSignInDraft(); return null; }
  let video: File | null = null;
  if (d.hasVideo) {
    const rec = await idbDo<{ blob: Blob; name: string; type: string; lastModified?: number }>('readonly', (s) => s.get('video'));
    if (rec?.blob) {
      try { video = new File([rec.blob], rec.name || 'clip.mp4', { type: rec.type || '', lastModified: rec.lastModified }); } catch { video = null; }
    }
  }
  return { draft: d, video };
}

export async function clearSignInDraft(): Promise<void> {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  await idbDo('readwrite', (s) => s.delete('video'));
}
