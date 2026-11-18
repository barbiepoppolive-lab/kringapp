/**
 * Admin v2 brain (17 Nov): pure functions, no DOM, so vitest checks them.
 * Everything here works on ONE snapshot (0082 kr8_admin_v2_snapshot), so Today, Needs you, People, Money and Board
 * can never disagree. Times are shown in India time (the founder), Bangkok in small text.
 */

import { pickNextStep, type NextStepInput, type NextStepKind } from '../v8/nextStep';

// ───────── rows from 0082 ─────────
export type Kind = 'real' | 'test' | 'team' | 'ghost' | 'admin' | 'nocard' | 'mirror';   // 0110: mirror = View-as-member sign-in, never a member
export interface Link { user_id: string; no: number | null; name: string | null; reason: string; dist: number | null; sface_sim?: number | null; at: string }
export interface Trust { score: number; reasons: string[] }
export interface Person {
  user_id: string; kind: Kind; no: number | null; name: string; who: string | null; area: string | null; joined_at: string; last_active_at: string | null;
  ref: string | null; src: string | null; verified: boolean; ig: string | null; tt: string | null; has_photo: boolean; photo_check: string | null;
  email_hint: string | null; line: boolean;
  trust?: Trust | null;
  check: { id: string; status: string; at: string; auto: string | null; reason: string | null; selfie_path?: string | null } | null;
  reels: { live: number; waiting: number; hidden: number; board_off: number; board_off_reason: string | null } | null;
  claims: { n: number; paid: number; held: number; thb: number; first_at: string | null } | null;
  links: Link[]; shared_net: number; refs: number;
  board: { rank: number; rings: number } | null;
  score: { likes: number; saves: number; opens: number; score: number } | null;
}
export interface Claim {
  id: string; user_id: string | null; no: number | null; name: string | null; brand: string; amount: number; status: 'assigned' | 'pending' | 'cancelled';
  held: boolean; used: boolean; created_at: string; assigned_at: string | null; is_test: boolean; hold_reason: string | null; decided: string | null;
  decided_at: string | null; face_dist: number | null; joined_at: string | null;
  hold_others: { user_id: string; member_no: number | null; first_name: string | null; reasons?: string[]; face_dist?: number | null }[] | null;
  prize: { kind: string; week: string | null; rank: number | null } | null;
}
export interface CodeStock { brand: string; amount: number; available: number; assigned: number; used: number }
export interface BoardRow {
  rank: number; user_id: string; rings: number; prize: number; likes: number | null; saves: number | null; opens: number | null;
  is_new: boolean; no: number | null; name: string | null;
}
export interface DupAuto {
  at: string; dup: string; dup_no: number | null; dup_name: string | null;
  keep: string | null; keep_no: number | null; keep_name: string | null;
  why: 'same_face' | 'same_device' | string | null; dup_sim: number | null;
  voided_reels: number; ledger_void: number; ghost: boolean; undone: boolean;
  /** dry run of the sweep of past data: the robot WOULD hide this account; nothing was changed */
  preview?: boolean;
}
export interface Snapshot {
  at: string; day_start: string; week_start: string; include_test: boolean;
  counts: { real: number; real_today: number; test: number; team: number; ghost: number; admin: number; nocard: number };
  people: Person[]; claims: Claim[]; codes: CodeStock[];
  board: { week_start: string; paid_ranks: number; floor: number; rows: BoardRow[] };
  pending: { reels: { id: string; user_id: string; at: string; poster_path: string | null; video_path: string | null; body: string | null }[];
    checks: { id: string; user_id: string; at: string; auto: string | null; review: string[] | null; selfie_path: string | null }[]; reports: number; places: number };
  alerts: { kind: string; subject: string; at: string; sent: boolean; error: boolean | string | null }[];
  /** 0086 kr8_admin_places_auto: what the place robot did (loaded next to the snapshot; missing before 0086) */
  places_auto?: PlaceAuto[];
  /** 0087 kr8_admin_v2_people_extra: real-photo flag, step inputs, Removed list, one set of counts (missing before 0087) */
  extra?: PeopleExtra;
  /** 0095 kr8_admin_dups_auto: duplicates automatically ghosted by the duplicate robot (with Undo) */
  dups_auto?: DupAuto[];
}
export interface PeopleExtraRow {
  real_photo: boolean;
  reel: { status: 'approved' | 'pending' | 'hidden'; note: string | null; at: string } | null;
  won: { kind: 'weekly' | 'founding'; amount: number; status: 'won' }[];
  open_claims: number;
  check: string | null;
}
export interface PeopleExtra {
  counts: { members: number; with_photo: number; no_photo: number; nocard: number; removed: number; team: number };
  rows: Record<string, PeopleExtraRow>;
  removed: { user_id: string; no: number | null; name: string | null; joined_at: string; why: string }[];
  admins: { user_id: string; joined_at: string; email_hint: string | null }[];
}
export interface PlaceAuto { at: string; action: 'place_auto_reject' | 'place_auto_link' | 'place_auto_live' | 'place_geo_found' | 'place_geo_miss' | string;
  place_id: string | null; name: string | null; reason: string | null; into: string | null; outside: boolean | null; area: string | null; no: number | null;
  status: string | null; now_name: string | null }
export function isSnapshot(x: unknown): x is Snapshot {
  const s = x as Snapshot | null;
  return !!s && typeof s === 'object' && !!s.counts && Array.isArray(s.people) && Array.isArray(s.claims) && Array.isArray(s.codes) && !!s.board && !!s.pending;
}

// ───────── time: India first, Bangkok small ─────────
export const IST = 'Asia/Kolkata';
export const BKK = 'Asia/Bangkok';
export function clock(iso: string | null | undefined, tz = IST, withDay = true): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('en-GB', { timeZone: tz, ...(withDay ? { day: 'numeric', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', hour12: false });
}
/** "14:32 IST · 16:02 BKK" */
export const both = (iso: string | null | undefined, withDay = false) => (iso ? `${clock(iso, IST, withDay)} IST · ${clock(iso, BKK, false)} BKK` : '–');
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '–';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export const minutesBetween = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
export const who = (p: { no: number | null; name: string | null }) => `${p.name || 'member'}${p.no != null ? ` #${p.no}` : ''}`;
export const isReal = (p: Person) => p.kind === 'real';

// ───────── face distance → one wording everywhere (audit: two "same person" lines meant opposite things) ─────────
/** Look-alike between TWO accounts. Lower = more alike (face-api dist); higher sface_sim = more alike. Never used for "is the photo the same person as the selfie". */
export function lookalikeWords(dist: number | null | undefined, reason = 'face', sfaceSim?: number | null): { tone: 'r' | 'a'; text: string } {
  if (reason === 'device') return { tone: 'a', text: 'Same phone' };
  if (reason === 'network') return { tone: 'a', text: 'Same Wi-Fi / network' };
  if (sfaceSim != null) {
    if (sfaceSim >= 0.6) return { tone: 'r', text: `Same face · ${sfaceSim.toFixed(2)}` };
    return { tone: 'a', text: `Looks alike · ${sfaceSim.toFixed(2)}` };
  }
  if (dist == null) return { tone: 'a', text: 'Looks alike' };
  if (dist < 0.4) return { tone: 'r', text: `Same face · ${dist.toFixed(2)}` };
  if (dist <= 0.5) return { tone: 'a', text: `Looks alike · ${dist.toFixed(2)}` };
  return { tone: 'a', text: `Slightly alike · ${dist.toFixed(2)}` };
}

// ───────── Trust score 0–100 (0095 kr8_trust + client fallback before 0095) ─────────
export function personTrust(p: Person, s?: Snapshot): Trust {
  if (p.trust && typeof p.trust.score === 'number' && Array.isArray(p.trust.reasons)) {
    return { score: Math.max(0, Math.min(100, Math.round(p.trust.score))), reasons: p.trust.reasons };
  }
  if (p.kind === 'nocard' || p.kind === 'admin') return { score: 25, reasons: ['−25 no member card yet'] };
  let score = 50;
  const items: { w: number; t: string }[] = [];
  if (p.verified) { score += 30; items.push({ w: 30, t: '+30 face verified' }); }
  else if (p.check?.status === 'rejected') { score -= 20; items.push({ w: 20, t: '−20 face check refused' }); }
  const hasRealPh = s ? realPhoto(p, s) : p.has_photo && (p.photo_check == null || p.photo_check === 'ok');
  if (hasRealPh) { score += 10; items.push({ w: 10, t: '+10 real photo' }); }
  if ((p.reels?.live || 0) > 0) { score += 10; items.push({ w: 10, t: '+10 approved Reel' }); }

  const sameFace = p.links.find((l) => l.reason === 'face' && ((l.sface_sim ?? 0) >= 0.6 || (l.dist != null && l.dist < 0.4)));
  const alikeFace = !sameFace ? p.links.find((l) => l.reason === 'face') : undefined;
  if (sameFace) { score -= 40; items.push({ w: 40, t: `−40 same face as #${sameFace.no ?? '?'}` }); }
  else if (alikeFace) { score -= 20; items.push({ w: 20, t: `−20 looks like #${alikeFace.no ?? '?'}` }); }

  const sameDev = p.links.find((l) => l.reason === 'device');
  const sameNet = p.links.some((l) => l.reason === 'network') || p.shared_net > 0;
  if (sameDev) { score -= 35; items.push({ w: 35, t: `−35 same phone as #${sameDev.no ?? '?'}` }); }

  const firstAt = p.claims?.first_at || s?.claims.filter((c) => c.user_id === p.user_id && !c.is_test).map((c) => c.created_at).sort()[0] || null;
  const mins = firstAt ? minutesBetween(p.joined_at, firstAt) : null;
  if (mins != null && mins <= 15) { score -= 20; items.push({ w: 20, t: '−20 claimed within 15 min of joining' }); }
  // shared Wi-Fi alone counts 0; −10 only next to another warning sign (same as kr8_trust)
  if (!sameDev && sameNet && (sameFace || alikeFace || (mins != null && mins <= 15))) { score -= 10; items.push({ w: 10, t: '−10 same Wi-Fi as a claimer' }); }

  items.sort((a, b) => b.w - a.w);
  return { score: Math.max(0, Math.min(100, score)), reasons: items.map((x) => x.t) };
}
export function trustChip(t: Trust): { text: string; tone: 'g' | 'a' | 'r' } {
  if (t.score >= 70) return { text: `trust ${t.score}`, tone: 'g' };
  if (t.score <= 30) return { text: `trust ${t.score}`, tone: 'r' };
  return { text: `trust ${t.score}`, tone: 'a' };
}

// ───────── Money Robot (recommendation only; founder taps Pay / Refuse) ─────────
export type MoneyCall = 'PAY' | 'WAIT' | 'REFUSE';
export interface MoneyVerdict {
  call: MoneyCall;
  score: number;
  headline: string;
  tone: 'g' | 'a' | 'r';
  reasons: string[];
  clarity: number;
}
export function moneyRobotVerdict(c: Claim, p: Person | undefined, s: Snapshot): MoneyVerdict {
  const tr = p ? personTrust(p, s) : { score: 25, reasons: ['−25 no member card yet'] };
  const holdOthers = c.hold_others || [];
  const strongHoldOther = holdOthers.some((o) => (o.reasons || []).includes('device') || (o.face_dist != null && o.face_dist < 0.4));
  const strongPersonLink = !!p?.links.some((l) => l.reason === 'device' || (l.reason === 'face' && ((l.sface_sim ?? 0) >= 0.6 || (l.dist != null && l.dist < 0.4))));
  const hardDup = strongHoldOther || strongPersonLink || p?.kind === 'ghost' || p?.check?.status === 'rejected';
  const anyDupLink = holdOthers.length > 0 || !!p?.links.some((l) => l.reason === 'face' || l.reason === 'device');

  let call: MoneyCall;
  let tone: 'g' | 'a' | 'r';
  if (hardDup || tr.score <= 30) {
    call = 'REFUSE';
    tone = 'r';
  } else if (tr.score >= 70 && p?.verified && c.hold_reason !== 'review' && !anyDupLink) {
    call = 'PAY';
    tone = 'g';
  } else {
    call = 'WAIT';
    tone = 'a';
  }

  const pool: string[] = [...tr.reasons];
  if (c.hold_reason === 'review' && !pool.some((r) => /face check/i.test(r))) pool.push('Face check needs your eye before paying');
  for (const o of holdOthers) {
    const tag = `#${o.member_no ?? '?'}`;
    if (!pool.some((r) => r.includes(tag))) pool.push(`Linked to ${tag}${o.first_name ? ` ${o.first_name}` : ''}`);
  }
  if (call === 'PAY' && pool.length < 3) pool.push('No duplicate face or phone links');
  if (!pool.length) pool.push(call === 'WAIT' ? 'Borderline signals — check card and Reel first' : 'Standard member signals');

  // reasons that SUPPORT the call come first (a REFUSE card should not lead with "+30 face verified")
  const plus = (r: string) => r.startsWith('+');
  const support = (r: string) => (call === 'PAY' ? plus(r) || !/^[−-]\d/.test(r) : !plus(r));
  const reasons = [...pool.filter(support), ...pool.filter((r) => !support(r))].slice(0, 3);
  const headline = call === 'WAIT' ? `Robot says: WAIT · trust ${tr.score}` : `Robot says: ${call} · trust ${tr.score}`;
  const clarity = (call !== 'WAIT' ? 60 : 0) + Math.abs(tr.score - 50) + (hardDup ? 20 : 0);
  return { call, score: tr.score, headline, tone, reasons, clarity };
}

export function dupAutoText(d: DupAuto): string {
  if (d.preview) {
    const keepP = d.keep_no != null ? `#${d.keep_no}${d.keep_name ? ` ${d.keep_name}` : ''}` : 'older account';
    const whyP = d.why === 'same_device' ? `same phone as ${keepP}` : `same face as ${keepP}`;
    return `Would hide ${d.dup_name || 'member'}${d.dup_no != null ? ` #${d.dup_no}` : ''} (${whyP}) · nothing changed yet`;
  }
  const dupWho = `${d.dup_name || 'member'}${d.dup_no != null ? ` #${d.dup_no}` : ''}`;
  const keepWho = d.keep_no != null ? `#${d.keep_no}${d.keep_name ? ` ${d.keep_name}` : ''}` : 'older account';
  const why = d.why === 'same_device'
    ? `same phone as ${keepWho}`
    : `same face as ${keepWho}${d.dup_sim != null ? ` · ${Number(d.dup_sim).toFixed(2)}` : ''}`;
  const ringsNote = d.voided_reels || d.ledger_void ? ' · voided this week’s Rings' : '';
  return `Duplicate robot ghosted ${dupWho} (${why})${ringsNote}${d.undone ? ' · undone by you' : ''}`;
}

// ───────── anomaly flags (plain words) ─────────
export type FlagKey = 'lookalike' | 'shared' | 'board_off' | 'fast_claim' | 'opens_only' | 'no_photo' | 'burst' | 'unverified_paid';
export interface Flag { key: FlagKey; text: string; tone: 'r' | 'a' }
export function personFlags(p: Person, all: Person[] = [], claims: Claim[] = []): Flag[] {
  const f: Flag[] = [];
  const alike = p.links.filter((l) => l.reason.startsWith('face'));
  if (alike.length) f.push({ key: 'lookalike', tone: alike.some((l) => (l.sface_sim ?? 0) >= 0.6 || (l.dist ?? 1) < 0.4) ? 'r' : 'a', text: `Looks like ${alike.map((l) => `#${l.no ?? '?'}`).join(', ')}` });
  const dev = p.links.filter((l) => !l.reason.startsWith('face'));
  if (dev.length || p.shared_net) f.push({ key: 'shared', tone: 'a', text: dev.length ? `Same phone/Wi-Fi as ${dev.map((l) => `#${l.no ?? '?'}`).join(', ')}` : `Claimed on the same Wi-Fi/phone as ${p.shared_net} other` });
  if (p.reels?.board_off) f.push({ key: 'board_off', tone: 'a', text: 'Off the board' + (p.reels.board_off_reason ? ` · ${p.reels.board_off_reason}` : '') });
  const mine = claims.filter((c) => c.user_id === p.user_id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const first = mine[0];
  const mins = first ? minutesBetween(p.joined_at, first.created_at) : null;
  if (mins != null && mins <= 15) f.push({ key: 'fast_claim', tone: 'a', text: `Claimed ${mins} min after joining` });
  if (mine.some((c) => c.status === 'assigned') && !p.verified) f.push({ key: 'unverified_paid', tone: 'a', text: 'Paid but not face-verified' });
  if (p.score && p.score.opens > 0 && p.score.likes + p.score.saves === 0) f.push({ key: 'opens_only', tone: 'a', text: 'Rings only from link opens' });
  if (p.kind === 'real' && !p.has_photo) f.push({ key: 'no_photo', tone: 'a', text: 'No card photo' });
  if (p.ref) {
    const t = Date.parse(p.joined_at);
    const near = all.filter((o) => o.ref === p.ref && o.user_id !== p.user_id && Math.abs(Date.parse(o.joined_at) - t) <= 2 * 3600_000).length;
    if (near >= 2) f.push({ key: 'burst', tone: 'a', text: `${near + 1} sign-ups via ${p.ref} within 2 h` });
  }
  return f;
}

// ───────── Needs you: ONE decision about ONE person (or one pair) per card ─────────
export type InboxKind = 'held' | 'lookalike' | 'check' | 'reel' | 'reports';
/** r = money (red), a = needs a look (amber), f = FYI-level (Reels waiting) */
export type InboxTone = 'r' | 'a' | 'f';
export interface InboxItem {
  key: string; kind: InboxKind; rank: number;
  /** the plain-English question the founder answers, e.g. "Pay Pang (#137) ฿100 TrueMoney?" (title = question) */
  title: string; question: string;
  /** "What happened": at most 2 short lines */
  what: string[];
  /** what.join(' ') — kept for older callers */
  why: string;
  tone: InboxTone;
  /** keys of other open cases about the same person(s) */
  related: string[];
  people: Person[]; claims: Claim[];
  links: { a: string; b: string; reason: string; dist: number | null; sface_sim?: number | null }[];
  reelIds: string[]; checkIds: string[]; at: string; count?: number;
  verdict?: MoneyVerdict;
}
export const INBOX_FILTERS: { key: 'all' | InboxKind; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'held', label: 'Money' }, { key: 'lookalike', label: 'Look-alike' },
  { key: 'check', label: 'Face check' }, { key: 'reel', label: 'Reels' }, { key: 'reports', label: 'Reports' },
];
/** "Very alike / Looks alike / Slightly alike / Same phone" — never a decimal on a card (decimals live on the member page) */
export function alikeWord(dist: number | null | undefined, reason = 'face', sfaceSim?: number | null): string {
  const t = lookalikeWords(dist, reason, sfaceSim).text.split(' · ')[0];
  return t === 'Same face' ? 'Very alike' : t;
}
/** Waiting time for the card corner: "12 min", "36 h", "3 d" */
export function waitShort(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}
const BRAND: Record<string, string> = { truemoney: 'TrueMoney', grab: 'Grab', shopeepay: 'ShopeePay' };
const nameNo = (p: { name: string | null; no: number | null }) => `${p.name || 'Member'} (#${p.no ?? '?'})`;
const TONE_ORDER: Record<InboxTone, number> = { r: 0, a: 1, f: 2 };
export interface Handled { key: string; at: string; text: string; undoDup?: string; undone?: boolean;
  /** 18 Nov tap-all: what the robot did, to whom, why (for the who-and-why sheet) */
  kind?: 'dup' | 'dup_preview' | 'face' | 'refused' | 'paid' | 'place' | 'settled';
  who?: { user_id: string | null; no: number | null; name: string | null }[];
  why?: string; ref?: string }


/** Groups look-alike links into one card per set of accounts (union-find), the oldest account first. */
export function linkGroups(people: Person[]): Person[][] {
  const byId = new Map(people.map((p) => [p.user_id, p]));
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  for (const p of people) if (p.links.length) parent.set(p.user_id, p.user_id);
  for (const p of people) for (const l of p.links) { if (!byId.has(l.user_id)) continue; parent.set(l.user_id, parent.get(l.user_id) || l.user_id); const a = find(p.user_id), b = find(l.user_id); if (a !== b) parent.set(b, a); }
  const groups = new Map<string, Person[]>();
  for (const id of parent.keys()) { const r = find(id); groups.set(r, [...(groups.get(r) || []), byId.get(id)!]); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((x, y) => Date.parse(x.joined_at) - Date.parse(y.joined_at)));
}

export function buildInbox(s: Snapshot): { items: InboxItem[]; handled: Handled[]; preview: Handled[] } {
  const people = s.people;
  const byId = new Map(people.map((p) => [p.user_id, p]));
  const items: InboxItem[] = [];
  const handled: Handled[] = [];
  const heldAll = s.claims.filter((c) => c.held && c.status === 'pending' && c.user_id);
  const base = { related: [] as string[], claims: [] as Claim[], links: [] as InboxItem['links'], reelIds: [] as string[], checkIds: [] as string[] };
  const push = (i: Omit<InboxItem, 'why' | 'title' | 'related' | 'claims' | 'links' | 'reelIds' | 'checkIds'> & Partial<InboxItem>) =>
    items.push({ ...base, ...i, title: i.question, why: i.what.join(' '), related: [] } as InboxItem);

  // 1) look-alikes: one card per PAIR (older account first)
  for (const g of linkGroups(people)) {
    const ids = new Set(g.map((p) => p.user_id));
    const links = dedupeLinks(g.flatMap((p) => p.links.filter((l) => ids.has(l.user_id)).map((l) => ({ a: p.user_id, b: l.user_id, reason: l.reason, dist: l.dist, sface_sim: l.sface_sim, at: l.at }))));
    for (const l of links) {
      const [older, newer] = [byId.get(l.a)!, byId.get(l.b)!].sort((x, y) => Date.parse(x.joined_at) - Date.parse(y.joined_at));
      const label = `#${older.no ?? '?'} · #${newer.no ?? '?'}`;
      const settled = newer.kind === 'ghost' || (newer.check?.status === 'rejected' && !newer.reels?.live && !(newer.claims?.paid));
      if (settled && !heldAll.some((c) => c.user_id === newer.user_id)) {
        handled.push({ key: 'g:' + label, at: l.at || newer.joined_at, text: `${label}: newer account already refused at face check and has nothing live`, kind: 'settled',
          who: [older, newer].map((p) => ({ user_id: p.user_id, no: p.no, name: p.name })),
          why: `#${newer.no ?? '?'} looked like #${older.no ?? '?'}, but the newer account was already refused at the face check and has nothing live, so there is nothing to decide.` });
        continue;
      }
      const strong = (l.sface_sim ?? 0) >= 0.6 || (l.dist ?? 1) < 0.4 || l.reason === 'device';
      const facts = [newer.reels?.live ? `${newer.reels.live} live Reel${newer.reels.live === 1 ? '' : 's'}` : '', newer.claims?.paid ? `paid ฿${newer.claims.thb}` : '',
        newer.check?.status === 'rejected' ? 'face check refused' : ''].filter(Boolean);
      push({ key: `l:${older.user_id},${newer.user_id}`, kind: 'lookalike', tone: 'a', rank: 80 + (strong ? 5 : 0), at: l.at || newer.joined_at,
        question: l.reason === 'device' ? `#${older.no ?? '?'} and #${newer.no ?? '?'} use the same phone. Same person?` : `#${older.no ?? '?'} and #${newer.no ?? '?'} look alike. Same person?`,
        what: [`${l.reason === 'device' ? 'Same phone' : `Faces: ${alikeWord(l.dist, l.reason, l.sface_sim)}`}${strong ? ' — very likely one person' : ''}`,
          `#${newer.no ?? '?'} joined ${ago(newer.joined_at)}${facts.length ? ' · ' + facts.join(' · ') : ''}`],
        people: [older, newer], links: [{ a: l.a, b: l.b, reason: l.reason, dist: l.dist, sface_sim: l.sface_sim }] });
    }
  }
  // 2) every held claim is its own Money card
  for (const c of heldAll) {
    const p = byId.get(c.user_id!); if (!p) continue;
    const mins = minutesBetween(p.joined_at, c.created_at);
    const alike = [...new Set([...(c.hold_others || []).map((o) => `#${o.member_no ?? '?'}`), ...p.links.map((l) => `#${l.no ?? '?'}`)])];
    const held = c.hold_reason === 'review' ? 'Held: face check needs your eye' : alike.length ? `Held: looks like ${alike.slice(0, 3).join(', ')}` : 'Held by the robot for a check';
    push({ key: 'c:' + c.id, kind: 'held', tone: 'r', rank: 100, at: c.created_at, people: [p], claims: [c], verdict: moneyRobotVerdict(c, p, s),
      question: `Pay ${nameNo(p)} ฿${c.amount} ${BRAND[c.brand] || c.brand}?`,
      what: [mins != null && mins >= 0 && mins <= 60 ? `Claimed ${mins} min after joining` : `Claimed ${ago(c.created_at)}`, held] });
  }
  // 3) face checks the robot sent to a human
  for (const v of s.pending.checks) {
    const p = byId.get(v.user_id); if (!p) continue;
    push({ key: 'v:' + v.id, kind: 'check', tone: 'a', rank: 70, at: v.at, people: [p], checkIds: [v.id],
      question: `Approve ${nameNo(p)}'s face check?`,
      what: [v.review?.length ? `Robot was not sure: ${v.review.slice(0, 2).join(', ').replace(/_/g, ' ')}` : 'Waiting for your yes / no'] });
  }
  // 4) Reels waiting, one card per person
  const reelsBy = new Map<string, Snapshot['pending']['reels']>();
  for (const r of s.pending.reels) reelsBy.set(r.user_id, [...(reelsBy.get(r.user_id) || []), r]);
  for (const [uid, rs] of reelsBy) {
    const p = byId.get(uid); if (!p) continue;
    push({ key: 'r:' + uid, kind: 'reel', tone: 'f', rank: 50, at: rs[0].at, people: [p], reelIds: rs.map((r) => r.id),
      question: `Approve ${nameNo(p)}'s ${rs.length === 1 ? 'Reel' : `${rs.length} Reels`}?`,
      what: [p.verified ? 'Face-verified member' : 'Member is not face-verified yet'] });
  }
  if (s.pending.reports) push({ key: 'reports', kind: 'reports', tone: 'a', rank: 60, at: s.at, people: [], count: s.pending.reports,
    question: `Look at ${s.pending.reports} open report${s.pending.reports === 1 ? '' : 's'}?`, what: ['Members reported a Reel or a person'] });
  // places members type in are no longer a job for the founder (0086): they show in "Handled automatically" below

  // related: other open cases about the same person
  for (const i of items) {
    const ids = new Set(i.people.map((p) => p.user_id));
    i.related = items.filter((o) => o !== i && o.people.some((p) => ids.has(p.user_id))).map((o) => o.key);
  }

  // auto-decided things the founder never needs to touch, for the "Handled automatically" log
  const dupLogged = new Set<string>();
  const preview: Handled[] = [];
  for (const d of s.dups_auto || []) {
    const dWho = [{ user_id: d.dup, no: d.dup_no, name: d.dup_name }, ...(d.keep ? [{ user_id: d.keep, no: d.keep_no, name: d.keep_name }] : [])];
    const keepW = d.keep_no != null ? `#${d.keep_no}${d.keep_name ? ` ${d.keep_name}` : ''}` : 'an older account';
    const dWhy = `${d.dup_name || 'This account'}${d.dup_no != null ? ` #${d.dup_no}` : ''} has the ${d.why === 'same_device' ? 'same phone' : 'same face'} as ${keepW}, so it is a second account.`;
    if (d.preview) { preview.push({ key: `dupp:${d.dup}`, at: d.at, text: dupAutoText(d), kind: 'dup_preview', who: dWho, why: `${dWhy} The robot WOULD hide it, but nothing changes until the sweep switch is on.` }); continue; }
    dupLogged.add(d.dup);
    handled.push({ key: `dup:${d.dup}`, at: d.at, text: dupAutoText(d), undoDup: d.dup, undone: d.undone || !d.ghost, kind: 'dup', who: dWho,
      why: `${dWhy} The robot hid it (ghost mode: they can still use the app but nobody sees them)${d.voided_reels || d.ledger_void ? ' and took away this week’s Rings' : ''}. The older account was kept.` });
  }
  for (const p of people) {
    if (dupLogged.has(p.user_id)) continue;
    const pw = [{ user_id: p.user_id, no: p.no, name: p.name }];
    if (p.check && p.check.status !== 'pending' && p.check.auto) handled.push({ key: 'a:' + p.check.id, at: p.check.at, text: `${who(p)} face check ${p.check.status} automatically`, kind: 'face', who: pw, ref: p.check.id,
      why: p.check.status === 'approved' ? `The live selfie matched ${who(p)}'s profile photo and no other account has this face, so the robot approved it.`
        : `The robot refused ${who(p)}'s face check${p.check.reason ? `: ${p.check.reason.split('\n').pop()}` : ''}.` });
    else if (p.check?.status === 'rejected' && /one (verified )?account/i.test(p.check.reason || '')) handled.push({ key: 'a:' + p.check.id, at: p.check.at, text: `${who(p)} refused: one account per person`, kind: 'refused', who: pw, ref: p.check.id,
      why: `${who(p)}'s face is already verified on another account, so this second account was refused (one person, one account).` });
  }
  for (const c of s.claims) if (c.status === 'assigned' && !c.held && !c.decided && (s.include_test || !c.is_test)) handled.push({ key: 'p:' + c.id, at: c.assigned_at || c.created_at, text: `${who(c)} paid ฿${c.amount} ${c.brand} automatically`, kind: 'paid', ref: c.id,
    who: [{ user_id: c.user_id, no: c.no, name: c.name }], why: `${who(c)} won a prize and had no duplicate warning signs, so the robot sent a ฿${c.amount} ${BRAND[c.brand] || c.brand} code straight away.` });
  for (const a of s.places_auto || []) { const text = placeAutoText(a); if (text) handled.push({ key: `pl:${a.action}:${a.place_id}:${a.at}`, at: a.at, text, kind: 'place', ref: a.place_id || undefined, why: placeAutoWhy(a) }); }
  // red (money) first, then amber, then FYI; inside each, stronger cases first, then whoever has waited longest
  items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.rank - a.rank || Date.parse(a.at) - Date.parse(b.at));
  handled.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  preview.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { items, handled, preview };
}

// ───────── Robot Report card on Today (0095) ─────────
export interface RobotReport {
  totalToday: number;
  lines: string[];
  needsCount: number;
}
export function buildRobotReport(s: Snapshot, inbox: { items: InboxItem[]; handled: Handled[] } = buildInbox(s)): RobotReport {
  const d0 = Date.parse(s.day_start);
  const dupsToday = (s.dups_auto || []).filter((d) => !d.preview && !d.undone && d.ghost && Date.parse(d.at) >= d0).length;
  const dupsActive = (s.dups_auto || []).filter((d) => !d.preview && !d.undone && d.ghost).length;
  const facesToday = s.people.filter((p) => p.check && p.check.status !== 'pending' && p.check.auto && Date.parse(p.check.at) >= d0).length;
  const placesToday = (s.places_auto || []).filter((a) => Date.parse(a.at) >= d0).length;
  const paidToday = s.claims.filter((c) => c.status === 'assigned' && !c.held && !c.decided && !c.is_test && Date.parse(c.assigned_at || c.created_at) >= d0).length;
  const previewN = (s.dups_auto || []).filter((d) => d.preview).length;
  const heldItems = inbox.items.filter((i) => i.kind === 'held');

  const lines: string[] = [];
  if (dupsToday > 0) lines.push(`Duplicate robot ghosted ${dupsToday} duplicate account${dupsToday === 1 ? '' : 's'} today (kept the oldest, voided Rings).`);
  else if (dupsActive > 0) lines.push(`Duplicate robot is holding ${dupsActive} duplicate account${dupsActive === 1 ? '' : 's'} in ghost mode (0 new today).`);
  else lines.push('Duplicate robot: 0 duplicate accounts caught today.');

  if (previewN > 0) lines.push(`Duplicate robot preview: ${previewN} past case${previewN === 1 ? '' : 's'} it would hide — nobody hidden until you switch the sweep on.`);

  const autoParts: string[] = [];
  if (facesToday) autoParts.push(`${facesToday} face check${facesToday === 1 ? '' : 's'} decided`);
  if (placesToday) autoParts.push(`${placesToday} place${placesToday === 1 ? '' : 's'} checked`);
  if (paidToday) autoParts.push(`${paidToday} clean claim${paidToday === 1 ? '' : 's'} paid`);
  if (autoParts.length) lines.push(`Handled today without bothering you: ${autoParts.join(' · ')}.`);

  if (heldItems.length) {
    const payN = heldItems.filter((i) => i.verdict?.call === 'PAY').length;
    const refN = heldItems.filter((i) => i.verdict?.call === 'REFUSE').length;
    const waitN = heldItems.filter((i) => i.verdict?.call === 'WAIT').length;
    const breakdown = [payN ? `${payN} PAY` : '', refN ? `${refN} REFUSE` : '', waitN ? `${waitN} WAIT` : ''].filter(Boolean).join(' · ');
    lines.push(`Money robot scored ${heldItems.length} held claim${heldItems.length === 1 ? '' : 's'} for your tap (${breakdown}).`);
  } else {
    lines.push('Money robot: 0 held claims waiting for your decision.');
  }

  const totalToday = dupsToday + facesToday + placesToday + paidToday;
  return { totalToday, lines, needsCount: inbox.items.length };
}
function dedupeLinks<T extends { a: string; b: string }>(ls: T[]): T[] {
  const seen = new Set<string>();
  return ls.filter((l) => { const k = [l.a, l.b].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ───────── money ─────────
export interface Money { available: number; assigned: number; paidWeekThb: number; paidWeekN: number; heldThb: number; heldN: number; paidAllThb: number; byMember: { p: { no: number | null; name: string | null; user_id: string | null }; n: number; thb: number }[] }
export function money(s: Snapshot): Money {
  const w0 = Date.parse(s.week_start);
  const real = s.claims.filter((c) => !c.is_test);
  const paid = real.filter((c) => c.status === 'assigned');
  const week = paid.filter((c) => Date.parse(c.assigned_at || c.created_at) >= w0);
  const held = real.filter((c) => c.held && c.status === 'pending');
  const per = new Map<string, Money['byMember'][number]>();
  for (const c of paid) { const k = c.user_id || 'gone'; const r = per.get(k) || { p: { no: c.no, name: c.name, user_id: c.user_id }, n: 0, thb: 0 }; r.n++; r.thb += c.amount; per.set(k, r); }
  return {
    available: s.codes.reduce((n, k) => n + k.available, 0), assigned: s.codes.reduce((n, k) => n + k.assigned, 0),
    paidWeekThb: week.reduce((n, c) => n + c.amount, 0), paidWeekN: week.length, heldThb: held.reduce((n, c) => n + c.amount, 0), heldN: held.length,
    paidAllThb: paid.reduce((n, c) => n + c.amount, 0), byMember: [...per.values()].sort((a, b) => b.thb - a.thb || b.n - a.n),
  };
}
/** One chip per claim: paid / used / held / refused / waiting. ("assigned" alone confused everyone: it means the member got the code.) */
export function claimChip(c: Claim): { text: string; tone: 'g' | 'a' | 'r' | '' } {
  if (c.status === 'cancelled') return { text: 'Refused', tone: 'r' };
  if (c.held && c.status === 'pending') return { text: 'Held · you decide', tone: 'a' };
  if (c.status === 'pending') return { text: 'Waiting for a code', tone: 'a' };
  if (c.used) return { text: 'Paid · code used', tone: 'g' };
  return { text: c.decided === 'paid' ? 'Paid by you' : 'Paid · code sent', tone: 'g' };
}

// ───────── people list ─────────
/** Real photo = 0087 real_photo (base64 data URL > 200 chars, photo_check ok/unset); before 0087 fall back to "has any photo". */
export const realPhoto = (p: Person, s: Snapshot): boolean => (s.extra?.rows[p.user_id]?.real_photo ?? p.has_photo) === true;
export const noCard = (p: Person) => p.kind === 'nocard' || p.kind === 'admin';
/** ONE set of counts for the People header and the Today tab. Kring Team is never a member. */
export interface PeopleCounts { members: number; withPhoto: number; noPhoto: number; noCard: number; removed: number; today: number }
export function peopleCounts(s: Snapshot): PeopleCounts {
  const d0 = Date.parse(s.day_start);
  const real = s.people.filter((p) => p.kind === 'real');
  const withPhoto = real.filter((p) => realPhoto(p, s)).length;
  return {
    members: s.extra?.counts.members ?? s.counts.real,
    withPhoto: s.extra?.counts.with_photo ?? withPhoto,
    noPhoto: s.extra?.counts.no_photo ?? real.length - withPhoto,
    noCard: s.extra?.counts.nocard ?? s.counts.nocard + s.counts.admin,
    removed: s.extra?.counts.removed ?? s.counts.ghost + s.counts.test,
    today: real.filter((p) => Date.parse(p.joined_at) >= d0).length,
  };
}
/** "18 members · 14 with photo · 5 without a card" */
export const peopleHeadline = (c: PeopleCounts) => `${c.members} member${c.members === 1 ? '' : 's'} · ${c.withPhoto} with photo · ${c.noCard} without a card`;
/** Admin sign-ins without a card (0087) as rows of the "Signed up, no card" group. */
export function withAdminLogins(s: Snapshot): Snapshot {
  const have = new Set(s.people.map((p) => p.user_id));
  const extra = (s.extra?.admins || []).filter((a) => !have.has(a.user_id)).map((a): Person => ({
    user_id: a.user_id, kind: 'admin', no: null, name: '', who: null, area: null, joined_at: a.joined_at, last_active_at: null, ref: null, src: null, verified: false,
    ig: null, tt: null, has_photo: false, photo_check: null, email_hint: a.email_hint, line: false, check: null, reels: null, claims: null, links: [], shared_net: 0, refs: 0,
    board: null, score: null }));
  return extra.length ? { ...s, people: [...s.people, ...extra] } : s;
}
/** Members with a real photo (newest first), then "No photo yet", then "Signed up, no card". */
export interface PeopleGroups { photo: Person[]; nophoto: Person[]; nocard: Person[] }
export function groupPeople(list: Person[], s: Snapshot): PeopleGroups {
  const g: PeopleGroups = { photo: [], nophoto: [], nocard: [] };
  for (const p of list) (noCard(p) ? g.nocard : realPhoto(p, s) ? g.photo : g.nophoto).push(p);
  return g;
}

/** The member's next step, worded for the founder — the same rules as the member app's "Your next step" (src/v8/nextStep.ts). */
export type StepChip = { key: NextStepKind | 'won'; text: string; tone: 'g' | 'a' | 'r' | '' };
const STEP_WORDS: Record<NextStepKind | 'won', [string, StepChip['tone']]> = {
  reel: ['No Reel', ''], retry: ['Reel rejected', 'r'], pending: ['Reel pending', 'a'], claim: ['Prize won – not claimed', 'a'],
  won: ['Prize won – not claimed', 'a'], verify: ['Claim held – verify face', 'a'], climb: ['Done ✓', 'g'],
};
export function stepChip(p: Person, s: Snapshot): StepChip | null {
  if (p.kind !== 'real') return null;
  const x = s.extra?.rows[p.user_id];
  if (!x) return null;
  const won = x.won.map((w, i) => ({ id: `${p.user_id}:${i}`, kind: w.kind, week: null, rank: null, founding_no: null, amount: w.amount, rings: null, status: 'won' as const, claim_id: null, created_at: '' }));
  const claims = Array.from({ length: x.open_claims }, (_, i) => ({ id: `${p.user_id}:c${i}`, status: 'pending' as const })) as unknown as NextStepInput['claims'];
  // founder's view of the same rules: a hidden latest Reel with no live Reel left is "rejected" even without a note, and a claim
  // waiting on a face check is "held – verify face" even while the check sits with the team (the member pill hides it then)
  const note = x.reel?.status === 'hidden' ? x.reel.note || (p.reels?.live ? null : 'hidden') : null;
  const step = pickNextStep({
    hasCard: true, reels: x.reel ? [{ status: x.reel.status, note, created_at: x.reel.at }] : [],
    prizes: won, claims, verified: p.verified, verifyPending: false,
  });
  // the member pill only shouts about the Founding prize; the founder also wants a weekly prize nobody claimed
  const kind: StepChip['key'] | null = step && step.kind === 'climb' && won.length ? 'won' : step ? step.kind : null;
  if (!kind) return null;
  const [text, tone] = STEP_WORDS[kind];
  return { key: kind, text, tone };
}
export type PeopleFilter = 'all' | 'today' | 'unverified' | 'flagged' | 'claims' | 'nocard';
export function filterPeople(s: Snapshot, f: PeopleFilter, q = '', ref = '', includeTest = false): Person[] {
  const d0 = Date.parse(s.day_start);
  const needle = q.trim().toLowerCase().replace(/^#/, '');
  return s.people.filter((p) => {
    if (p.kind === 'team') return false;   // Kring Team is never a member, never listed
    if (!includeTest && !(p.kind === 'real' || noCard(p))) return false;
    if (ref && (p.ref || p.src || '') !== ref) return false;
    if (needle && !(`${p.name} ${p.no ?? ''} ${p.ref ?? ''} ${p.ig ?? ''} ${p.area ?? ''}`.toLowerCase().includes(needle) || String(p.no) === needle)) return false;
    if (f === 'today') return Date.parse(p.joined_at) >= d0;
    if (f === 'unverified') return !noCard(p) && !p.verified;
    if (f === 'flagged') return personFlags(p, s.people, s.claims).some((x) => x.key !== 'no_photo');
    if (f === 'claims') return (p.claims?.n || 0) > 0;
    if (f === 'nocard') return noCard(p);
    return true;
  }).sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at));
}
export const referrers = (s: Snapshot) => [...new Set(s.people.filter((p) => p.kind === 'real').map((p) => p.ref || p.src).filter((x): x is string => !!x))].sort();

// ───────── plain-English summary for the top of Today ─────────
export function summary(s: Snapshot, inbox: { items: InboxItem[]; handled: Handled[] } = buildInbox(s)): string[] {
  const d0 = Date.parse(s.day_start);
  const today = s.people.filter((p) => p.kind === 'real' && Date.parse(p.joined_at) >= d0);
  const refs = [...new Set(today.map((p) => p.ref || 'no referrer'))];
  const out: string[] = [];
  out.push(today.length
    ? `${today.length} new member${today.length === 1 ? '' : 's'} today${refs.length === 1 ? (refs[0] === 'no referrer' ? ', none via a referrer' : `, all via ${refs[0]}`) : `, via ${refs.join(', ')}`}.`
    : 'No new members yet today (India time).');
  const held = inbox.items.filter((i) => i.kind === 'held');
  const look = inbox.items.filter((i) => i.kind === 'lookalike');
  const hn = held.reduce((n, i) => n + i.claims.length, 0);
  if (hn) out.push(`${hn} prize claim${hn === 1 ? '' : 's'} held: possible second account.`);
  if (look.length) out.push(`${look.length} look-alike pair${look.length === 1 ? '' : 's'} to settle (${look.map((i) => i.people.map((p) => '#' + p.no).join('↔')).join(', ')}).`);
  const m = money(s);
  out.push(`${m.available} codes left · ฿${m.paidWeekThb.toLocaleString('en-US')} paid this week${m.heldN ? ` · ฿${m.heldThb} held` : ''}.`);
  const fast = s.people.filter((p) => p.kind === 'real' && personFlags(p, s.people, s.claims).some((f) => f.key === 'fast_claim')).length;
  if (fast) out.push(`${fast} member${fast === 1 ? '' : 's'} claimed a prize within 15 min of joining.`);
  if (!inbox.items.length) out.push('Nothing needs you right now.');
  return out;
}

// ───────── places the robot decided (0086) ─────────
const REASON: Record<string, string> = { phone: 'phone number', url: 'web link', line_id: 'LINE id', rude: 'rude word', too_short: 'too short', no_letters: 'no letters',
  banned: 'banned word', placeholder: 'not a place name' };
const q = (t: string | null | undefined) => `“${(t || '').trim().slice(0, 50)}”`;
/** One plain line per automatic place decision, for "Handled automatically". */
export function placeAutoText(a: PlaceAuto): string | null {
  const by = a.no != null ? ` (#${a.no})` : '';
  switch (a.action) {
    case 'place_auto_live': return `New place ${q(a.name)} added${by}${a.outside ? ' · outside Bangkok' : ''}`;
    case 'place_auto_link': return `Place ${q(a.name)}${by} matched existing ${q(a.into)}`;
    case 'place_auto_reject': return `Place ${q(a.name)}${by} refused: ${REASON[a.reason || ''] || a.reason || 'junk'}`;
    case 'place_geo_found': return `Pinned ${q(a.name)} on the map${a.outside ? ' · outside Bangkok' : a.area && a.area !== 'Bangkok' ? ` · ${a.area}` : ''}`;
    case 'place_geo_miss': return `Not on the map: ${q(a.name)} (kept as a name-only tag)`;
    default: return null;
  }
}
/** why the place robot did it, in one sentence */
export function placeAutoWhy(a: PlaceAuto): string {
  const by = a.no != null ? `member #${a.no}` : 'a member';
  switch (a.action) {
    case 'place_auto_live': return `${by} typed a new place name that looked real, so the robot added it${a.outside ? ' (it is outside Bangkok, so it earns no board Rings)' : ''}.`;
    case 'place_auto_link': return `${by} typed ${q(a.name)}, which is the same place as ${q(a.into)}, so the robot used the existing place.`;
    case 'place_auto_reject': return `${by} typed ${q(a.name)}: it is a ${REASON[a.reason || ''] || a.reason || 'junk entry'}, not a place, so the robot refused it.`;
    case 'place_geo_found': return `The robot found ${q(a.name)} on the map and pinned it.`;
    case 'place_geo_miss': return `The robot could not find ${q(a.name)} on the map, so it stays a name-only tag.`;
    default: return placeAutoText(a) || a.action;
  }
}
export interface PlaceRow { id: string; name_en: string; name_th: string | null; area: string; status: 'live' | 'pending' | 'rejected'; added_how: string | null;
  outside_bkk: boolean; coords_rough: boolean; osm_ref: string | null; lat: number; lng: number; created_at: string; by_no: number | null; by_name: string | null;
  geo: string | null; reels: number; auto: string | null }
/** Chips for a row in More → Places. */
export function placeFlags(p: PlaceRow): [string, string][] {
  const f: [string, string][] = [];
  if (p.status === 'rejected') f.push([p.auto?.startsWith('place_auto_reject') ? `refused · ${REASON[p.auto.split(':')[1] || ''] || 'junk'}` : 'hidden', 'r']);
  if (p.outside_bkk) f.push(['outside Bangkok', 'a']);
  if (p.status !== 'rejected') f.push(p.coords_rough ? [p.geo === 'not_found' ? 'name only' : 'finding pin…', ''] : ['on map', 'g']);
  return f;
}


// ───────── face checks (0089) ─────────
export interface FaceCheck {
  id: string; user_id: string; no: number | null; name: string | null; status: 'approved' | 'pending' | 'rejected'; at: string; reviewed_at: string | null;
  auto: boolean; live: { straight?: boolean; left?: boolean; right?: boolean; blink?: boolean; blink_fallback?: boolean; device?: string; match?: number | null; model?: string } | null;
  reason: string | null; selfie_path: string | null; selfie_deleted_at: string | null; verified: boolean; undo: boolean; paid: number;
}
/** Card chip: "✓ face" / "face pending" / "face refused" / "no face check". */
export function faceChip(p: Person): { text: string; tone: 'g' | 'a' | 'r' | '' } | null {
  if (p.kind !== 'real') return null;
  if (p.verified) return { text: '✓ face', tone: 'g' };
  if (p.check?.status === 'pending') return { text: 'face pending', tone: 'a' };
  if (p.check?.status === 'rejected') return { text: 'face refused', tone: 'r' };
  return { text: 'no face check', tone: '' };
}
/** "straight ✓ · left ✓ · right ✓ · blink – · iPhone" */
export function liveSteps(l: FaceCheck['live']): string {
  if (!l) return 'no live-check data';
  const t = (b: boolean | undefined) => (b ? '✓' : b === false ? '✗' : '–');
  return [`straight ${t(l.straight)}`, `left ${t(l.left)}`, `right ${t(l.right)}`, `blink ${l.blink ? '✓' : l.blink_fallback ? 'skipped' : t(l.blink)}`, l.device || null]
    .filter(Boolean).join(' · ');
}
export function faceStatusWords(f: FaceCheck): string {
  if (f.status === 'pending') return 'Waiting for review';
  if (f.status === 'approved') return f.auto ? 'Approved automatically' : 'Approved by you';
  return f.undo ? 'Rejected by you after auto-approval' : f.auto ? 'Refused automatically' : 'Rejected by you';
}
