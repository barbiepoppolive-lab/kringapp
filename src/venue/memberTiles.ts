/**
 * 0176 (20 Nov): People tab, top summary — four tappable tiles (Real members · Face-verified · Not verified · Tried, not verified).
 * Numbers and lists come from kr8_admin_members_tiles (the same "real member" definition as the phone alert).
 * Each tile opens the members behind it: #no, name, photo, joined, last active, face-check status. English only.
 */
import { el, rpc } from './shared';
import { ago } from './adminV2Logic';
import { openSheet, type SheetWho } from './adminSheet';

export interface TileMember {
  user_id: string; no: number | null; name: string | null; joined_at: string; last_active_at: string | null;
  verified: boolean; tried: boolean; status: string;
}
export interface MemberTiles {
  definition: string;
  counts: { real: number; verified: number; not_verified: number; tried: number };
  members: TileMember[];
}
type TileKey = 'real' | 'verified' | 'not_verified' | 'tried';

export const isMemberTiles = (x: unknown): x is MemberTiles =>
  !!x && typeof x === 'object' && !!(x as MemberTiles).counts && Array.isArray((x as MemberTiles).members);

export const TILES: { key: TileKey; label: string; why: string }[] = [
  { key: 'real', label: 'Real members', why: 'Everyone with a card. Not counted: ghost, Kring Team and test/QA accounts.' },
  { key: 'verified', label: 'Face-verified', why: 'Passed the face check (automatic or approved by you) and not removed since.' },
  { key: 'not_verified', label: 'Not verified', why: 'Real members without a passed face check right now.' },
  { key: 'tried', label: 'Tried, not verified', why: 'Not verified, but tried the face check at least once (it failed or went to review).' },
];

export function tileList(t: MemberTiles, key: TileKey): TileMember[] {
  const m = t.members;
  if (key === 'verified') return m.filter((x) => x.verified);
  if (key === 'not_verified') return m.filter((x) => !x.verified);
  if (key === 'tried') return m.filter((x) => !x.verified && x.tried);
  return m;
}

const photoCache = new Map<string, string>();
async function photosFor(ids: string[]): Promise<void> {
  const need = ids.filter((id) => !photoCache.has(id));
  for (let i = 0; i < need.length; i += 80) {
    const part = need.slice(i, i + 80);
    const got = await rpc<Record<string, string>>('kr8_admin_v2_photos', { p_users: part }).catch(() => ({} as Record<string, string>));
    for (const id of part) photoCache.set(id, got[id] || '');
  }
}

async function openTile(t: MemberTiles, key: TileKey): Promise<void> {
  const spec = TILES.find((x) => x.key === key)!;
  const list = tileList(t, key);
  await photosFor(list.map((m) => m.user_id));
  const who: SheetWho[] = list.map((m) => ({
    user_id: m.user_id, no: m.no, name: m.name || 'Member', photo: photoCache.get(m.user_id) || null,
    sub: `Joined ${ago(m.joined_at)} · active ${m.last_active_at ? ago(m.last_active_at) : 'never'} · ${m.status}`,
  }));
  openSheet({ kind: 'members', id: key, title: `${spec.label} · ${list.length}`, why: spec.why, who,
    evidence: list.length ? [] : ['None.'], faint: t.definition });
}

let last: MemberTiles | null = null;
let lastAt = 0;
function paint(box: HTMLElement, t: MemberTiles): void {
  box.replaceChildren(...TILES.map((s) => {
    const a = el('a', { class: 'mb-stat', href: '#people', id: `mt-${s.key}`, role: 'button' },
      el('b', {}, String(t.counts[s.key])), el('span', {}, s.label),
      el('small', {}, s.key === 'real' ? 'tap to see all' : `${Math.round((t.counts[s.key] / Math.max(1, t.counts.real)) * 100)}% of real`));
    a.onclick = (e) => { e.preventDefault(); void openTile(t, s.key); };
    return a;
  }));
}

/** The tile row; fills itself from the database (cached 25 s). Hidden if the database is older than 0176. */
export function memberTilesRow(): HTMLElement {
  const box = el('div', { class: 'mb-grid mt-tiles', id: 'v2MemberTiles', style: 'grid-template-columns:repeat(2,1fr);margin:4px 0 12px' });
  if (last) paint(box, last);
  else box.append(el('div', { class: 'mb-stat' }, el('b', {}, '…'), el('span', {}, 'Members')));
  if (last && Date.now() - lastAt < 25_000) return box;
  void rpc<unknown>('kr8_admin_members_tiles').then((t) => {
    if (!isMemberTiles(t)) { box.remove(); return; }
    last = t; lastAt = Date.now();
    paint(box, t);
  }).catch(() => { if (!last) box.remove(); });
  return box;
}
