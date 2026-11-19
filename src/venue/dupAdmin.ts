/**
 * 0066 admin "Same person?" — pure helpers (no DOM), so vitest can check them.
 * kr8_admin_dup_overview gives links (pairs + reason), the members in them, held claims and likes/saves between linked
 * accounts; the page groups linked accounts into clusters here (oldest account first = the one to keep by default).
 */
/** 0076: 'face_maybe' = faces look alike (a card photo, or a face check just over the line): a FLAG only, never a link */
export type DupReason = 'face' | 'face_maybe' | 'device' | 'network' | 'line';
export interface DupLink { a: string; b: string; reason: DupReason; detail: { dist?: number; where?: string; sources?: string }; first_at: string; dismissed: boolean }
export interface DupPrize { id: string; kind: 'weekly' | 'founding'; amount: number; status: 'won' | 'claimed' | 'cancelled'; week: string | null; rank: number | null; founding_no: number | null }
export interface DupMember { user_id: string; member_no: number | null; first_name: string; photo: string | null; joined_at: string; verified: boolean; ghost: boolean;
  is_test: boolean; line: boolean; prints: number; selfie_path: string | null; reels: number; prizes: DupPrize[] }
export interface DupHeld { claim_id: string; user_id: string; brand: string; amount: number; created_at: string; reason: 'linked' | 'review';
  detail: { others?: { user_id: string; first_name: string; member_no: number | null; reasons: DupReason[] }[]; self_dist?: number | null;
    /** 0075 face review: why the claim waits, the distance to the team-approved verified print, the claim photo (kr8-verify path) */
    review?: string[]; verified_dist?: number | null; claim_photo?: string | null }; face_dist: number | null;
  prize_kind: 'weekly' | 'founding' | null; founding_no: number | null; week: string | null; rank: number | null }
export interface DupMutual { from: string; to: string; likes: number; saves: number }
/** a claim paid normally that carries a flag (same network / same LINE as another member, or face check not matching) */
export interface DupFlagged { claim_id: string; user_id: string | null; first_name: string | null; member_no: number | null; brand: string; amount: number; status: string; created_at: string;
  flags: { user_id: string; first_name: string; member_no: number | null; reasons: DupReason[] }[] | null; face_mismatch: boolean; face_dist: number | null }
export interface DupOverview { links: DupLink[]; members: DupMember[]; held: DupHeld[]; mutual: DupMutual[]; flagged?: DupFlagged[] }
export interface DupCluster { key: string; members: DupMember[]; links: DupLink[]; held: DupHeld[]; mutual: DupMutual[]; reasons: DupReason[]; open: boolean }

export function isDupOverview(x: unknown): x is DupOverview {
  const o = x as DupOverview;
  return !!o && Array.isArray(o.links) && Array.isArray(o.members) && Array.isArray(o.held) && Array.isArray(o.mutual);
}

export const REASON_LABEL: Record<DupReason, string> = { face: 'Same face', face_maybe: 'Faces look alike', device: 'Same phone', network: 'Same Wi-Fi / network', line: 'Same LINE' };
/** founder 16 Nov: only same face / same phone LINK accounts (no Rings between them, claims held); network and LINE are flags */
export const isLinkReason = (r: DupReason): boolean => r === 'face' || r === 'device';
export const HOLD_LABEL: Record<DupHeld['reason'], string> = { linked: 'Same face or phone as another account with a prize',
  review: 'Face check needs your eye' };
/** 0075: the reasons a claim waits for a face review, in plain words */
export const REVIEW_LABEL: Record<string, string> = { no_photo: 'no claim photo', no_verified_print: 'not verified yet (no approved face check to compare with)',
  face_far: 'face doesn’t match the verified face', face_copy: 'face code is a copy of the stored one, not a new camera frame',
  /** 0124 */ fake_red: 'Fake Finder says red (see Fake Finder for the reasons)' };
export function reviewText(h: Pick<DupHeld, 'detail'>): string {
  const r = (h.detail?.review || []).map((x) => REVIEW_LABEL[x] || x);
  const d = h.detail?.verified_dist;
  return r.join(' · ') + (typeof d === 'number' ? ` · distance to verified face ${d.toFixed(2)} (${faceWords(d)})` : '');
}
export function flagText(f: DupFlagged): string {
  const parts = (f.flags || []).map((o) => `${o.reasons.map((r) => REASON_LABEL[r]).join(' + ')} as ${o.first_name}${o.member_no != null ? ` #${o.member_no}` : ''}`);
  if (f.face_mismatch) parts.push(`face check didn’t match this account’s earlier face${f.face_dist != null ? ` (${f.face_dist.toFixed(2)})` : ''}`);
  return parts.join(' · ');
}
export function linkText(l: DupLink): string {
  if ((l.reason === 'face' || l.reason === 'face_maybe') && typeof l.detail?.dist === 'number')
    return `${REASON_LABEL[l.reason]} · ${l.detail.dist.toFixed(2)}${l.detail.sources ? ` (${l.detail.sources})` : ''}`;
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
// ───────── 0076 Face check banner (kr8_admin_verify_lookalikes) ─────────
export interface FaceLookalike { user_id: string; member_no: number | null; first_name: string; verified: boolean; dist: number; strength: 'same' | 'maybe'; sources?: string;
  /** 0125: AWS Rekognition similarity 0–100 (server face check); dist is then 1 − sim/100 */
  aws_sim?: number }
export interface FaceLookalikes { has_print: boolean; matches: FaceLookalike[] }
export function isLookalikeMap(x: unknown): x is Record<string, FaceLookalikes> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
    && Object.values(x as Record<string, unknown>).every((v) => !!v && Array.isArray((v as FaceLookalikes).matches));
}
/** "Looks like #30 Pom Thanatp — 0.49" for the admin Face check card. tone r = a face check matches another member's face
 *  check (same person, very likely); a = looks alike (card photo, or just over the line): look by eye. null = nobody close. */
export function lookalikeBanner(l: FaceLookalikes | null | undefined): { text: string; tone: 'r' | 'a'; more: string } | null {
  const m = l?.matches?.[0];
  if (!m) return null;
  const who = `${m.member_no != null ? `#${m.member_no} ` : ''}${m.first_name}${m.verified ? ' ✓' : ''}`;
  const more = l!.matches.slice(1).map((x) => `${x.member_no != null ? `#${x.member_no} ` : ''}${x.first_name} ${x.dist.toFixed(2)}`).join(' · ');
  return { text: `Looks like ${who} — ${m.dist.toFixed(2)}`, tone: m.strength === 'same' ? 'r' : 'a',
    more: (m.strength === 'same' ? 'Same face as another account (face check vs face check). One person, one account: reject if it is the same person.'
      : 'Faces look alike (a card photo, or just over the line). Compare by eye before approving.') + (more ? ` Also close: ${more}.` : '') };
}

// ───────── 0080 Face check v2 (17 Nov: two "same person" lines with opposite meanings confused the founder) ─────────
/** kr8_admin_lookalike_cards: card photo, referrer code and join date per member (empty before database update 0080) */
export interface LookCard { member_no: number | null; first_name: string; photo: string | null; ref_code: string | null; joined_at: string | null }
export function isLookCardMap(x: unknown): x is Record<string, LookCard> {
  return !!x && typeof x === 'object' && !Array.isArray(x) && Object.values(x as Record<string, unknown>).every((v) => !!v && typeof v === 'object' && 'first_name' in (v as object));
}
const whoName = (m: { member_no: number | null; first_name: string }) => `${m.member_no != null ? `#${m.member_no} ` : ''}${m.first_name}`;
/** look-alike distance → plain verdict. ≤ 0.40 = reject; above = the admin compares by eye. */
export function lookalikeVerdict(dist: number): { tone: 'r' | 'a'; text: string } {
  return dist <= 0.4 ? { tone: 'r', text: 'Very likely the same person: reject' } : { tone: 'a', text: 'Borderline: compare faces yourself' };
}
/** The "Possible second account" block (first on the card). null = no look-alike flag. */
export function lookalikeBlock(l: FaceLookalikes | null | undefined): { title: string; dist: string; verdict: { tone: 'r' | 'a'; text: string }; other: FaceLookalike; also: string } | null {
  const m = l?.matches?.[0];
  if (!m) return null;
  return { title: `Possible second account: ${whoName(m)}`, dist: m.aws_sim != null ? `AWS ${m.aws_sim.toFixed(1)}%` : m.dist.toFixed(2), verdict: lookalikeVerdict(m.dist), other: m,
    also: l!.matches.slice(1).map((x) => `${whoName(x)} ${x.dist.toFixed(2)}`).join(' · ') };
}
/** 0125: the server face check (AWS Rekognition) stores the look-alike in live_check.aws_dup; as a look-alike match for the card */
export function awsLookalikes(lc: { model?: string; aws_dup?: { user_id?: string; member_no?: number | null; first_name?: string | null; sim?: number } | null } | null | undefined): FaceLookalikes | null {
  const d = lc?.model === 'aws-rekognition' ? lc.aws_dup : null;
  if (!d?.user_id || typeof d.sim !== 'number') return null;
  return { has_print: true, matches: [{ user_id: d.user_id, member_no: d.member_no ?? null, first_name: d.first_name || '–', verified: false,
    dist: Math.max(0, 1 - d.sim / 100), strength: d.sim >= 95 ? 'same' : 'maybe', sources: 'AWS face check', aws_sim: d.sim }] };
}
/** The member's own profile photo vs their own live selfie. Never says "same person" (that wording belongs to the look-alike block). */
export function ownPhotoLabel(match: number | null | undefined, sface = false, aws = false): { tone: 'n' | 'a'; tick: boolean; text: string } {
  // 0125: AWS CompareFaces similarity stored as 0–1 (0.80+ = automatic ✓)
  if (aws && match !== null && match !== undefined) return match >= 0.8 ? { tone: 'n', tick: true, text: `Profile photo vs own selfie: ✓ matches (AWS ${(match * 100).toFixed(0)}%)` }
    : { tone: 'a', tick: false, text: `Profile photo vs own selfie: may not match (AWS ${(match * 100).toFixed(0)}%), look carefully` };
  // 0081: SFace similarity, higher = more alike (0.45+ = match, calibrated on LFW); older checks: face-api distance, lower = more alike
  if (sface && match !== null && match !== undefined) return match >= 0.45 ? { tone: 'n', tick: true, text: `Profile photo vs own selfie: ✓ matches (similarity ${match.toFixed(2)})` }
    : { tone: 'a', tick: false, text: `Profile photo vs own selfie: may not match (similarity ${match.toFixed(2)}), look carefully` };
  if (match === null || match === undefined) return { tone: 'a', tick: false, text: 'Profile photo vs own selfie: no score (no face found in one photo)' };
  return match < 0.6 ? { tone: 'n', tick: true, text: `Profile photo vs own selfie: ✓ matches (${match.toFixed(2)})` }
    : { tone: 'a', tick: false, text: `Profile photo vs own selfie: may not match (${match.toFixed(2)}), look carefully` };
}
/** "12 Nov 2026" (Bangkok date) or "–" */
export function joinDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '–';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(Date.parse(iso));
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
/** flags the founder should look at before approving a winner. Linked (same face / phone) and flag-only (Wi-Fi / LINE)
 *  accounts, and very new accounts. Not "unverified": almost nobody is verified yet (founder, 16 Nov). */
export function weekFlags(r: WeekRow, now = Date.now()): string[] {
  const f: string[] = [];
  const others = new Map<string, { name: string; reasons: Set<string> }>();
  for (const l of r.links) {
    const o = others.get(l.other) || { name: `${l.other_name ?? 'member'}${l.other_no != null ? ` #${l.other_no}` : ''}`, reasons: new Set<string>() };
    o.reasons.add(REASON_LABEL[l.reason]); others.set(l.other, o);
  }
  for (const o of others.values()) f.push(`${[...o.reasons].join(' + ')} as ${o.name}`);
  if (now - Date.parse(r.joined_at) < 7 * 86400_000) f.push('Account under 7 days old');
  return f;
}
const D = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: o.timeZone || 'UTC' }).format(Date.parse(iso));
/** "16–22 Nov" (or "30 Nov – 6 Dec") for the Monday a week started on */
export function weekRange(week: string): string {
  const a = `${week}T00:00:00Z`, b = new Date(Date.parse(a) + 6 * 86400_000).toISOString();
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return sameMonth ? `${D(a, { day: 'numeric' })}–${D(b, { day: 'numeric', month: 'short' })}` : `${D(a, { day: 'numeric', month: 'short' })} – ${D(b, { day: 'numeric', month: 'short' })}`;
}
/** "Mon 23 Nov · 22:30 IST" (the founder reads admin in India time) */
export function istWhen(iso: string): string {
  const day = D(iso, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).replace(',', '');
  const t = D(iso, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  return `${day} · ${t} IST`;
}
