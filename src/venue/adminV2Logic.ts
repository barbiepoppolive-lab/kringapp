/**
 * Admin v2 brain (17 Nov): pure functions, no DOM, so vitest checks them.
 * Everything here works on ONE snapshot (0082 kr8_admin_v2_snapshot), so Today, Needs you, People, Money and Board
 * can never disagree. Times are shown in India time (the founder), Bangkok in small text.
 */

// ───────── rows from 0082 ─────────
export type Kind = 'real' | 'test' | 'team' | 'ghost' | 'admin' | 'nocard';
export interface Link { user_id: string; no: number | null; name: string | null; reason: string; dist: number | null; at: string }
export interface Person {
  user_id: string; kind: Kind; no: number | null; name: string; who: string | null; area: string | null; joined_at: string; last_active_at: string | null;
  ref: string | null; src: string | null; verified: boolean; ig: string | null; tt: string | null; has_photo: boolean; photo_check: string | null;
  email_hint: string | null; line: boolean;
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
export interface BoardRow { rank: number; user_id: string; rings: number; prize: number; likes: number | null; saves: number | null; opens: number | null; is_new: boolean; no: number | null; name: string | null }
export interface Snapshot {
  at: string; day_start: string; week_start: string; include_test: boolean;
  counts: { real: number; real_today: number; test: number; team: number; ghost: number; admin: number; nocard: number };
  people: Person[]; claims: Claim[]; codes: CodeStock[];
  board: { week_start: string; paid_ranks: number; floor: number; rows: BoardRow[] };
  pending: { reels: { id: string; user_id: string; at: string; poster_path: string | null; video_path: string | null; body: string | null }[];
    checks: { id: string; user_id: string; at: string; auto: string | null; review: string[] | null; selfie_path: string | null }[]; reports: number; places: number };
  alerts: { kind: string; subject: string; at: string; sent: boolean; error: string | null }[];
}
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
/** Look-alike between TWO accounts. Lower = more alike. Never used for "is the photo the same person as the selfie". */
export function lookalikeWords(dist: number | null | undefined, reason = 'face'): { tone: 'r' | 'a'; text: string } {
  if (reason === 'device') return { tone: 'a', text: 'Same phone' };
  if (reason === 'network') return { tone: 'a', text: 'Same Wi-Fi / network' };
  if (dist == null) return { tone: 'a', text: 'Looks alike' };
  if (dist < 0.4) return { tone: 'r', text: `Same face · ${dist.toFixed(2)}` };
  if (dist <= 0.5) return { tone: 'a', text: `Looks alike · ${dist.toFixed(2)}` };
  return { tone: 'a', text: `Slightly alike · ${dist.toFixed(2)}` };
}

// ───────── anomaly flags (plain words) ─────────
export type FlagKey = 'lookalike' | 'shared' | 'board_off' | 'fast_claim' | 'opens_only' | 'no_photo' | 'burst' | 'unverified_paid';
export interface Flag { key: FlagKey; text: string; tone: 'r' | 'a' }
export function personFlags(p: Person, all: Person[] = [], claims: Claim[] = []): Flag[] {
  const f: Flag[] = [];
  const alike = p.links.filter((l) => l.reason.startsWith('face'));
  if (alike.length) f.push({ key: 'lookalike', tone: alike.some((l) => (l.dist ?? 1) < 0.4) ? 'r' : 'a', text: `Looks like ${alike.map((l) => `#${l.no ?? '?'}`).join(', ')}` });
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

// ───────── Needs you: one card per person-group, ranked, with auto-handled kept apart ─────────
export type InboxKind = 'held' | 'lookalike' | 'check' | 'reel' | 'reports' | 'places';
export interface InboxItem {
  key: string; kind: InboxKind; rank: number; title: string; why: string; people: Person[]; claims: Claim[]; links: { a: string; b: string; reason: string; dist: number | null }[];
  reelIds: string[]; checkIds: string[]; at: string; count?: number;
}
export interface Handled { key: string; at: string; text: string }

const RANK: Record<InboxKind, number> = { held: 100, lookalike: 80, check: 70, reports: 60, reel: 50, places: 20 };

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

export function buildInbox(s: Snapshot): { items: InboxItem[]; handled: Handled[] } {
  const people = s.people;
  const byId = new Map(people.map((p) => [p.user_id, p]));
  const items: InboxItem[] = [];
  const handled: Handled[] = [];
  const used = new Set<string>();   // a person appears on ONE card only

  // 1) look-alike groups (+ any held claim inside the group rides on the same card)
  for (const g of linkGroups(people)) {
    const ids = new Set(g.map((p) => p.user_id));
    const links = dedupeLinks(g.flatMap((p) => p.links.filter((l) => ids.has(l.user_id)).map((l) => ({ a: p.user_id, b: l.user_id, reason: l.reason, dist: l.dist }))));
    const held = s.claims.filter((c) => c.user_id && ids.has(c.user_id) && c.held && c.status === 'pending');
    const newer = g.slice(1);
    const settled = newer.every((p) => p.kind === 'ghost' || (p.check?.status === 'rejected' && !p.reels?.live && !(p.claims?.paid)));
    const label = g.map((p) => `#${p.no ?? '?'}`).join(' · ');
    if (settled && !held.length) {
      handled.push({ key: 'g:' + label, at: latest(links.map(() => g[g.length - 1].joined_at)), text: `${label}: newer account already refused at face check and has nothing live` });
      continue;
    }
    g.forEach((p) => used.add(p.user_id));
    const strong = links.some((l) => (l.dist ?? 1) < 0.4 || l.reason === 'device');
    const why = [
      `${g.length} accounts ${strong ? 'are very likely one person' : 'look alike'} (${links.map((l) => `#${byId.get(l.a)?.no}↔#${byId.get(l.b)?.no} ${lookalikeWords(l.dist, l.reason).text}`).join('; ')}).`,
      held.length ? `${held.length} prize claim held: no code goes out until you decide.` : '',
      newer.some((p) => p.reels?.live) ? `Newer account still has ${newer.reduce((n, p) => n + (p.reels?.live || 0), 0)} live Reel(s).` : '',
      newer.some((p) => p.claims?.paid) ? `Newer account was already paid ฿${newer.reduce((n, p) => n + (p.claims?.thb || 0), 0)}.` : '',
    ].filter(Boolean).join(' ');
    items.push({ key: 'g:' + g.map((p) => p.user_id).join(','), kind: held.length ? 'held' : 'lookalike', rank: (held.length ? RANK.held : RANK.lookalike) + (strong ? 5 : 0),
      title: held.length ? `Prize held · ${label}` : `Same person? ${label}`, why, people: g, claims: held, links, reelIds: [], checkIds: [], at: latest(links.map(() => g[g.length - 1].joined_at)) });
  }
  // 2) held claims of people not already on a card
  for (const c of s.claims.filter((x) => x.held && x.status === 'pending' && x.user_id && !used.has(x.user_id))) {
    const p = byId.get(c.user_id!); if (!p) continue;
    used.add(p.user_id);
    const others = (c.hold_others || []).map((o) => `#${o.member_no ?? '?'}`).join(', ');
    items.push({ key: 'c:' + c.id, kind: 'held', rank: RANK.held, title: `Prize held · ${who(p)}`, at: c.created_at, people: [p], claims: [c], links: [], reelIds: [], checkIds: [],
      why: `฿${c.amount} ${c.brand} claim is waiting.` + (others ? ` Looks like ${others}.` : '') + (c.hold_reason === 'review' ? ' Face check needs your eye.' : '') });
  }
  // 3) face checks the robot sent to a human (pending), one per person
  for (const v of s.pending.checks) {
    const p = byId.get(v.user_id); if (!p || used.has(p.user_id)) continue;
    used.add(p.user_id);
    items.push({ key: 'v:' + v.id, kind: 'check', rank: RANK.check, title: `Face check · ${who(p)}`, at: v.at, people: [p], claims: [], links: [], reelIds: [], checkIds: [v.id],
      why: v.review?.length ? `The instant check was not sure: ${v.review.join(', ').replace(/_/g, ' ')}.` : 'Waiting for your yes / no.' });
  }
  // 4) Reels waiting, grouped per person
  const reelsBy = new Map<string, Snapshot['pending']['reels']>();
  for (const r of s.pending.reels) reelsBy.set(r.user_id, [...(reelsBy.get(r.user_id) || []), r]);
  for (const [uid, rs] of reelsBy) {
    const p = byId.get(uid); if (!p) continue;
    if (used.has(uid)) { const card = items.find((i) => i.people.some((x) => x.user_id === uid)); card?.reelIds.push(...rs.map((r) => r.id)); continue; }
    items.push({ key: 'r:' + uid, kind: 'reel', rank: RANK.reel, title: `${rs.length === 1 ? 'Reel' : `${rs.length} Reels`} to approve · ${who(p)}`, at: rs[0].at, people: [p], claims: [], links: [],
      reelIds: rs.map((r) => r.id), checkIds: [], why: p.verified ? 'Verified member.' : 'Member is not face-verified yet.' });
  }
  if (s.pending.reports) items.push({ key: 'reports', kind: 'reports', rank: RANK.reports, title: `${s.pending.reports} open report${s.pending.reports === 1 ? '' : 's'}`, why: 'Members reported a Reel or a person.', people: [], claims: [], links: [], reelIds: [], checkIds: [], at: s.at, count: s.pending.reports });
  if (s.pending.places) items.push({ key: 'places', kind: 'places', rank: RANK.places, title: `${s.pending.places} new place${s.pending.places === 1 ? '' : 's'} from members`, why: 'Fix the name, then approve.', people: [], claims: [], links: [], reelIds: [], checkIds: [], at: s.at, count: s.pending.places });

  // auto-decided things the founder never needs to touch, for the "Handled automatically" log
  for (const p of people) {
    if (p.check && p.check.status !== 'pending' && p.check.auto) handled.push({ key: 'a:' + p.check.id, at: p.check.at, text: `${who(p)} face check ${p.check.status} automatically` });
    else if (p.check?.status === 'rejected' && /one (verified )?account/i.test(p.check.reason || '')) handled.push({ key: 'a:' + p.check.id, at: p.check.at, text: `${who(p)} refused: one account per person` });
  }
  for (const c of s.claims) if (c.status === 'assigned' && !c.held && !c.decided && (s.include_test || !c.is_test)) handled.push({ key: 'p:' + c.id, at: c.assigned_at || c.created_at, text: `${who(c)} paid ฿${c.amount} ${c.brand} automatically` });
  items.sort((a, b) => b.rank - a.rank || Date.parse(a.at) - Date.parse(b.at));
  handled.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { items, handled };
}
function dedupeLinks<T extends { a: string; b: string }>(ls: T[]): T[] {
  const seen = new Set<string>();
  return ls.filter((l) => { const k = [l.a, l.b].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
}
const latest = (xs: string[]) => xs.reduce((m, x) => (Date.parse(x) > Date.parse(m) ? x : m), xs[0] || new Date(0).toISOString());

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
export type PeopleFilter = 'all' | 'today' | 'unverified' | 'flagged' | 'claims' | 'nocard';
export function filterPeople(s: Snapshot, f: PeopleFilter, q = '', ref = '', includeTest = false): Person[] {
  const d0 = Date.parse(s.day_start);
  const needle = q.trim().toLowerCase().replace(/^#/, '');
  return s.people.filter((p) => {
    if (!includeTest && !(p.kind === 'real' || p.kind === 'nocard')) return false;
    if (ref && (p.ref || p.src || '') !== ref) return false;
    if (needle && !(`${p.name} ${p.no ?? ''} ${p.ref ?? ''} ${p.ig ?? ''} ${p.area ?? ''}`.toLowerCase().includes(needle) || String(p.no) === needle)) return false;
    if (f === 'today') return Date.parse(p.joined_at) >= d0;
    if (f === 'unverified') return p.kind !== 'nocard' && !p.verified;
    if (f === 'flagged') return personFlags(p, s.people, s.claims).some((x) => x.key !== 'no_photo');
    if (f === 'claims') return (p.claims?.n || 0) > 0;
    if (f === 'nocard') return p.kind === 'nocard';
    return true;
  }).sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at));
}
export const referrers = (s: Snapshot) => [...new Set(s.people.filter((p) => p.kind === 'real').map((p) => p.ref || p.src).filter((x): x is string => !!x))].sort();

// ───────── plain-English summary for the top of Today ─────────
export function summary(s: Snapshot, inbox = buildInbox(s)): string[] {
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
  if (look.length) out.push(`${look.length} look-alike group${look.length === 1 ? '' : 's'} to settle (${look.map((i) => i.people.map((p) => '#' + p.no).join('↔')).join(', ')}).`);
  const m = money(s);
  out.push(`${m.available} codes left · ฿${m.paidWeekThb.toLocaleString('en-US')} paid this week${m.heldN ? ` · ฿${m.heldThb} held` : ''}.`);
  const fast = s.people.filter((p) => p.kind === 'real' && personFlags(p, s.people, s.claims).some((f) => f.key === 'fast_claim')).length;
  if (fast) out.push(`${fast} member${fast === 1 ? '' : 's'} claimed a prize within 15 min of joining.`);
  if (!inbox.items.length) out.push('Nothing needs you right now.');
  return out;
}
