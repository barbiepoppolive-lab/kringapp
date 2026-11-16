/**
 * 0066 admin "Same person?" — pure helpers (no DOM), so vitest can check them.
 * kr8_admin_dup_overview gives links (pairs + reason), the members in them, held claims and likes/saves between linked
 * accounts; the page groups linked accounts into clusters here (oldest account first = the one to keep by default).
 */
export type DupReason = 'face' | 'device' | 'network' | 'line';
export interface DupLink { a: string; b: string; reason: DupReason; detail: { dist?: number; where?: string }; first_at: string; dismissed: boolean }
export interface DupPrize { id: string; kind: 'weekly' | 'founding'; amount: number; status: 'won' | 'claimed' | 'cancelled'; week: string | null; rank: number | null; founding_no: number | null }
export interface DupMember { user_id: string; member_no: number | null; first_name: string; photo: string | null; joined_at: string; verified: boolean; ghost: boolean;
  is_test: boolean; line: boolean; prints: number; selfie_path: string | null; reels: number; prizes: DupPrize[] }
export interface DupHeld { claim_id: string; user_id: string; brand: string; amount: number; created_at: string; reason: 'linked' | 'face_mismatch' | 'no_print' | 'no_face';
  detail: { others?: { user_id: string; first_name: string; member_no: number | null; reasons: DupReason[] }[]; self_dist?: number | null }; face_dist: number | null;
  prize_kind: 'weekly' | 'founding' | null; founding_no: number | null; week: string | null; rank: number | null }
export interface DupMutual { from: string; to: string; likes: number; saves: number }
export interface DupOverview { links: DupLink[]; members: DupMember[]; held: DupHeld[]; mutual: DupMutual[] }
export interface DupCluster { key: string; members: DupMember[]; links: DupLink[]; held: DupHeld[]; mutual: DupMutual[]; reasons: DupReason[]; open: boolean }

export function isDupOverview(x: unknown): x is DupOverview {
  const o = x as DupOverview;
  return !!o && Array.isArray(o.links) && Array.isArray(o.members) && Array.isArray(o.held) && Array.isArray(o.mutual);
}

export const REASON_LABEL: Record<DupReason, string> = { face: 'Same face', device: 'Same phone', network: 'Same Wi-Fi / network', line: 'Same LINE' };
export const HOLD_LABEL: Record<DupHeld['reason'], string> = {
  linked: 'Linked to another account with a prize', face_mismatch: 'Face check didn’t match this account', no_print: 'No face print on file yet', no_face: 'Claimed without the face check',
};
export function linkText(l: DupLink): string {
  if (l.reason === 'face' && typeof l.detail?.dist === 'number') return `${REASON_LABEL.face} · ${l.detail.dist.toFixed(2)}`;
  return REASON_LABEL[l.reason] + (l.detail?.where ? ` · ${l.detail.where}` : '');
}
/** how alike two faces are, in words (face-api distance: lower = more alike) */
export function faceWords(d: number | null | undefined): string {
  if (d === null || d === undefined) return '';
  return d < 0.35 ? 'almost certainly the same person' : d < 0.45 ? 'very likely the same person' : d <= 0.5 ? 'likely the same person' : 'probably different people';
}

/** linked accounts → groups (union-find). Dismissed links ("not the same person") don't join a group. Held claims with no
 *  link (face mismatch / no face) are a group of one. Oldest account first. */
export function buildClusters(ov: DupOverview): DupCluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const m of ov.members) parent.set(m.user_id, m.user_id);
  const live = ov.links.filter((l) => !l.dismissed);
  for (const l of live) { if (!parent.has(l.a)) parent.set(l.a, l.a); if (!parent.has(l.b)) parent.set(l.b, l.b); join(l.a, l.b); }
  const byId = new Map(ov.members.map((m) => [m.user_id, m]));
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) { const r = find(id); groups.set(r, [...(groups.get(r) || []), id]); }
  const out: DupCluster[] = [];
  for (const ids of groups.values()) {
    const set = new Set(ids);
    const links = live.filter((l) => set.has(l.a) && set.has(l.b));
    const held = ov.held.filter((h) => set.has(h.user_id));
    if (!links.length && !held.length) continue;
    const members = ids.map((i) => byId.get(i)).filter((m): m is DupMember => !!m).sort((x, y) => Date.parse(x.joined_at) - Date.parse(y.joined_at));
    const reasons = [...new Set(links.map((l) => l.reason))].sort() as DupReason[];
    out.push({ key: members.map((m) => m.user_id).join(','), members, links, held, mutual: ov.mutual.filter((x) => set.has(x.from) && set.has(x.to)), reasons,
      open: held.length > 0 || members.slice(1).some((m) => !m.ghost) });
  }
  // held claims first, then the most reasons, then newest
  return out.sort((a, b) => (b.held.length ? 1 : 0) - (a.held.length ? 1 : 0) || b.reasons.length - a.reasons.length
    || Date.parse(b.members[b.members.length - 1]?.joined_at || '0') - Date.parse(a.members[a.members.length - 1]?.joined_at || '0'));
}
export function prizeName(p: { kind: string | null; founding_no?: number | null; rank?: number | null; week?: string | null }): string {
  return p.kind === 'founding' ? `Founding Local #${p.founding_no ?? ''}` : p.kind === 'weekly' ? `Weekly #${p.rank ?? ''}${p.week ? ` (${p.week})` : ''}` : 'Prize';
}

// ───────── weekly review (kr8_admin_week_review) ─────────
export interface WeekRow { rank: number; user_id: string; first_name: string; member_no: number | null; photo: string | null; rings: number; joined_at: string; verified: boolean;
  line: boolean; prints: number; prize: { id: string; amount: number; status: string } | null;
  links: { other: string; reason: DupReason; other_name: string | null; other_no: number | null }[] }
export interface WeekReview { week: string | null; closed_at?: string; approved_at?: string | null; opens_at?: string; weeks?: { week: string; approved: boolean }[]; rows: WeekRow[] }
export function isWeekReview(x: unknown): x is WeekReview { const o = x as WeekReview; return !!o && 'week' in o && Array.isArray(o.rows); }
/** flags the founder should look at before approving a winner */
export function weekFlags(r: WeekRow, now = Date.now()): string[] {
  const f: string[] = [];
  const others = new Map<string, { name: string; reasons: Set<string> }>();
  for (const l of r.links) {
    const o = others.get(l.other) || { name: `${l.other_name ?? 'member'}${l.other_no != null ? ` #${l.other_no}` : ''}`, reasons: new Set<string>() };
    o.reasons.add(REASON_LABEL[l.reason]); others.set(l.other, o);
  }
  for (const o of others.values()) f.push(`${[...o.reasons].join(' + ')} as ${o.name}`);
  if (!r.verified) f.push('Not face-verified');
  if (!r.prints) f.push('No face print');
  if (now - Date.parse(r.joined_at) < 7 * 86400_000) f.push('Account under 7 days old');
  return f;
}
