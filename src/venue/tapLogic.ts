/**
 * 18 Nov "tap everything": pure helpers (no DOM) that turn admin numbers into plain English for the who-and-why sheets.
 * Founder: "numbers are confusing — I can't decide". Every decision line is a sentence; raw numbers only appear as faint detail.
 */
import type { Link, MoneyVerdict, Person, Trust } from './adminV2Logic';
import type { RobotAlert } from './autopilotLogic';

// ───────── 0121 kr8_admin_explain shapes (null / missing before 0121 is applied: the UI says so and falls back) ─────────
export interface ExGive { what: 'like' | 'save'; post_id: string; user_id: string; no: number | null; name: string | null; at: string; traveller: boolean; counted: boolean; why: string | null }
export interface ExOpen { post_id: string; day: string; at: string; source: string | null; country: string | null; opener: string | null; opener_no: number | null; opener_name: string | null; counted: boolean; why: string | null }
export interface ExRings { kind: 'rings'; user_id: string; week_start: string; weights: { like: number; save: number; open: number; traveller_mult: number; opens_day_cap: number };
  reels: { id: string; status: string; hidden: boolean; board_off: boolean; at: string; poster_path: string | null; off_why: string | null }[]; gives: ExGive[]; opens: ExOpen[] }
export interface ExReel { kind: 'reel'; id: string; author: string; no: number | null; name: string | null; status: string; hidden: boolean; board_off: boolean; board_off_reason: string | null;
  note: string | null; video_path: string | null; poster_path: string | null; at: string; body: string | null; likes: number; saves: number; places: { id: string; name: string; outside_bkk: boolean }[] }
export interface ExPlace { kind: 'place'; id: string; name_en: string; name_th: string | null; area: string; status: string; added_how: string | null; outside_bkk: boolean; lat: number; lng: number;
  created_at: string; by: string | null; by_no: number | null; by_name: string | null; reels: { id: string; author: string; no: number | null; name: string | null; status: string; hidden: boolean; poster_path: string | null; at: string }[] }
export interface ExCode { id: string; brand: string; amount: number; status: string; is_test: boolean; masked: string; added_at: string; assigned_at: string | null; user_id: string | null; no: number | null; name: string | null; claim_id: string | null; used_at: string | null }
export interface ExCodes { kind: 'codes'; stock: string; codes: ExCode[] }
export interface ExClaim { kind: 'claim'; id: string; user_id: string | null; no: number | null; name: string | null; brand: string; amount: number; rings: number; status: string; is_test: boolean;
  created_at: string; assigned_at: string | null; used_at: string | null; hold: null | { reason: string; detail: Record<string, unknown>; face_dist: number | null; decided: string | null; decided_at: string | null; note: string | null };
  code: null | { masked: string; status: string }; same_phone: { user_id: string | null; no: number | null; name: string | null }[] }
export interface ExErrors { kind: 'errors'; user_id: string; no: number | null; name: string | null; rows: { kind: string; code: string | null; detail: string | null; ua: string | null; at: string }[] }
export interface ExFlag { user_id: string; no: number | null; name: string | null; flag_key: string; severity: string; summary: string; detail: Record<string, unknown>; last_at: string; partner_name?: string | null }
export interface ExAlert { kind: 'alert'; dedupe_key: string; robot: string; severity: string; title: string; body: string; href: string; detail: Record<string, unknown>; first_at: string; last_at: string; flags: ExFlag[] | null }
export const isEx = <T extends { kind: string }>(x: unknown, kind: T['kind']): x is T => !!x && typeof x === 'object' && (x as { kind?: string }).kind === kind;

// ───────── Rings: why a like / save / open did or did not count ─────────
const GIVE_WHY: Record<string, string> = {
  own: 'their own like (never counts)', no_card: 'from an account with no member card', test_or_team: 'from a test or Kring Team account',
  hidden_duplicate: 'from a hidden duplicate account', no_photo: 'from an account with no card photo or name yet',
  new_account: 'from a brand-new account (not face-verified, under 3 days old)', linked: 'from a linked account (same face or phone as this member)',
  reel_not_approved: 'the Reel is not approved yet', reel_hidden: 'the Reel is hidden', reel_board_off: 'the Reel is feed-only (off the board)',
  'reel_author_hidden_duplicate': 'this member is a hidden duplicate', reel_no_bangkok_place: 'the Reel has no Bangkok place tag',
};
export const giveWhy = (why: string | null) => (why ? GIVE_WHY[why] || why.replace(/_/g, ' ') : 'counted');
const OPEN_WHY: Record<string, string> = {
  same_phone: 'same phone opened it again', robot: 'a link-preview robot, not a person', repeat: 'the same visitor opened it again that day',
  burst: 'too many opens in a few seconds (looks automatic)', line: 'opened inside LINE (LINE previews are not counted)', own: 'the member opened their own link',
  own_phone: 'opened on the member’s own phone', linked: 'opened by a linked account', day_cap: 'over the daily limit of opens per Reel',
  not_counted: 'not counted', reel_not_approved: 'the Reel is not approved yet', reel_hidden: 'the Reel is hidden', reel_board_off: 'the Reel is feed-only (off the board)',
  reel_no_bangkok_place: 'the Reel has no Bangkok place tag', reel_author_hidden_duplicate: 'this member is a hidden duplicate',
};
export const openWhy = (why: string | null) => (why ? OPEN_WHY[why] || why.replace(/_/g, ' ') : 'counted');
export interface RingsSummary { likes: number; saves: number; opens: number; likesOff: number; savesOff: number; opensOff: number; rings: number; topGivers: { name: string; no: number | null; user_id: string; n: number }[]; offWhy: [string, number][] }
export function ringsSummary(x: ExRings): RingsSummary {
  const w = x.weights;
  const on = x.gives.filter((g) => g.counted);
  const opensOn = x.opens.filter((o) => o.counted);
  const pts = on.reduce((n, g) => n + (g.what === 'like' ? w.like : w.save) * (g.traveller ? w.traveller_mult : 1), 0) + opensOn.length * w.open;
  const by = new Map<string, { name: string; no: number | null; user_id: string; n: number }>();
  for (const g of on) { const r = by.get(g.user_id) || { name: g.name || 'member', no: g.no, user_id: g.user_id, n: 0 }; r.n++; by.set(g.user_id, r); }
  const off = new Map<string, number>();
  for (const g of x.gives.filter((g) => !g.counted)) off.set(giveWhy(g.why), (off.get(giveWhy(g.why)) || 0) + 1);
  for (const o of x.opens.filter((o) => !o.counted)) off.set(openWhy(o.why), (off.get(openWhy(o.why)) || 0) + 1);
  return {
    likes: on.filter((g) => g.what === 'like').length, saves: on.filter((g) => g.what === 'save').length, opens: opensOn.length,
    likesOff: x.gives.filter((g) => !g.counted && g.what === 'like').length, savesOff: x.gives.filter((g) => !g.counted && g.what === 'save').length,
    opensOff: x.opens.filter((o) => !o.counted).length, rings: pts,
    topGivers: [...by.values()].sort((a, b) => b.n - a.n).slice(0, 5), offWhy: [...off.entries()].sort((a, b) => b[1] - a[1]),
  };
}
/** "Most Rings came from #74 Mint (4 of 6 likes and saves)" — the sentence at the top of the Rings sheet */
export function ringsSentence(name: string, s: RingsSummary): string {
  const given = s.likes + s.saves;
  if (!given && !s.opens) return `${name} has no counted likes, saves or link opens this week${s.likesOff + s.savesOff + s.opensOff ? ' — the ones they got did not count (see why below)' : ''}.`;
  const top = s.topGivers[0];
  const parts = [`${s.likes} like${s.likes === 1 ? '' : 's'}`, `${s.saves} save${s.saves === 1 ? '' : 's'}`, `${s.opens} link open${s.opens === 1 ? '' : 's'}`];
  const lead = `${name} earned Rings this week from ${parts.join(', ')}`;
  if (top && given >= 3 && top.n / given >= 0.6) return `${lead}. Most of it came from ONE person: #${top.no ?? '?'} ${top.name} (${top.n} of ${given}) — check they are not friends farming Rings.`;
  return `${lead}${s.opensOff + s.likesOff + s.savesOff ? `; ${s.opensOff + s.likesOff + s.savesOff} more did not count` : ''}.`;
}

// ───────── Protect flags → one plain sentence each ─────────
export function flagSentence(f: ExFlag | { no: number | null; name: string | null; flag_key: string; summary: string; detail: Record<string, unknown>; partner_name?: string | null }): string {
  const me = `#${f.no ?? '?'} ${f.name || 'member'}`.trim();
  const d = f.detail || {};
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : Number(d[k]) || 0);
  if (f.flag_key === 'ring_farming') {
    const given = n('given_to_partner'), total = n('total_given'), back = n('received_from_partner');
    const partner = `#${d.partner_no ?? '?'}${f.partner_name ? ` ${f.partner_name}` : ''}`;
    const share = total && given >= total ? `all ${given}` : `${given} of ${total || '?'}`;
    return `${me} gave ${share} of their likes and saves to ${partner}, and ${partner} gave ${back} back — looks like two friends farming Rings.`;
  }
  if (f.flag_key === 'scam_chat') return `${me} sent chat messages that look like a scam (asking for money, crypto or a LINE id).`;
  if (f.flag_key === 'link_tries') return `${me} kept trying to post links that are blocked.`;
  if (f.flag_key === 'shared_signals') {
    const rs = Array.isArray(d.reasons) ? (d.reasons as string[]) : [];
    const words = rs.map((r) => (r === 'face' ? 'face' : r === 'device' ? 'phone' : r === 'network' ? 'Wi-Fi' : r)).join(' and ');
    return `${me} shares a ${words || 'phone or Wi-Fi'} with ${n('peers') || 'another'} other account${n('peers') === 1 ? '' : 's'}.`;
  }
  return `${me}: ${f.summary}`;
}

// ───────── trust / verdicts / look-alikes in words ─────────
/** "Looks genuine" / "Check first" / "Likely a second account" — the number stays faint */
export function trustWords(t: Trust): { text: string; tone: 'g' | 'a' | 'r'; detail: string } {
  const dupe = t.reasons.some((r) => /same (face|phone)/i.test(r));
  if (t.score >= 70) return { text: 'Looks genuine', tone: 'g', detail: `trust ${t.score}` };
  if (t.score <= 30) return { text: dupe ? 'Likely a second account' : 'Risky', tone: 'r', detail: `trust ${t.score}` };
  return { text: 'Check first', tone: 'a', detail: `trust ${t.score}` };
}
/** one sentence that tells the founder what to tap and why */
export function verdictSentence(v: MoneyVerdict): string {
  const neg = v.reasons.filter((r) => /^[−-]\d/.test(r)).map((r) => r.replace(/^[−-]\d+\s*/, ''));
  const pos = v.reasons.filter((r) => r.startsWith('+')).map((r) => r.replace(/^\+\d+\s*/, ''));
  const other = v.reasons.filter((r) => !/^[−+-]\d/.test(r));
  if (v.call === 'REFUSE') return `Refuse — ${(neg[0] || other[0] || 'too many warning signs').replace(/^Linked to/, 'linked to')}${neg[0] && /same (face|phone)/.test(neg[0]) ? ': a second account' : ''}.`;
  if (v.call === 'PAY') return `Pay — ${pos.slice(0, 2).join(', ') || 'clean member'}${other.length ? `; ${other[0].toLowerCase()}` : ''}.`;
  return `Wait — ${(other[0] || neg[0] || 'mixed signals').replace(/^Borderline signals — /, '')}; look at the photos before paying.`;
}
/** look-alike link in words: "Same face as #74 — second account → Reject" */
export function linkVerdict(l: Pick<Link, 'reason' | 'dist' | 'no'> & { sface_sim?: number | null }): { text: string; tone: 'r' | 'a'; faint: string } {
  const other = `#${l.no ?? '?'}`;
  const faint = l.sface_sim != null ? `similarity ${l.sface_sim.toFixed(2)}` : l.dist != null ? `face distance ${l.dist.toFixed(2)}` : '';
  if (l.reason === 'device') return { text: `Same phone as ${other} — probably the same person → check`, tone: 'a', faint };
  if (l.reason === 'network') return { text: `Same Wi-Fi as ${other} — often friends or family, not proof`, tone: 'a', faint };
  const strong = (l.sface_sim ?? 0) >= 0.6 || (l.dist != null && l.dist < 0.4);
  if (strong) return { text: `Same face as ${other} — second account → Reject`, tone: 'r', faint };
  if (l.dist != null && l.dist > 0.5 && l.sface_sim == null) return { text: `A little like ${other} — probably different people`, tone: 'a', faint };
  return { text: `Looks like ${other} — compare the photos`, tone: 'a', faint };
}
/** profile photo vs own live selfie (0081 SFace similarity: higher = more alike; older face-api distance: lower = more alike) */
export function selfieWords(match: number | null | undefined, sface: boolean): { text: string; tone: 'g' | 'a'; faint: string } {
  if (match == null) return { text: 'No face found in one of the photos → look yourself', tone: 'a', faint: '' };
  const ok = sface ? match >= 0.45 : match < 0.6;
  return ok ? { text: 'Selfie matches the profile photo', tone: 'g', faint: `${sface ? 'similarity' : 'distance'} ${match.toFixed(2)}` }
    : { text: 'Profile photo may not be them → check', tone: 'a', faint: `${sface ? 'similarity' : 'distance'} ${match.toFixed(2)}` };
}
/** member flag chip → one sentence for its why sheet */
export function flagWhy(key: string, p: Pick<Person, 'name' | 'no' | 'links' | 'reels' | 'shared_net' | 'score'>): string {
  const me = `${p.name || 'This member'}${p.no != null ? ` #${p.no}` : ''}`;
  switch (key) {
    case 'lookalike': return `${me}'s face looks like another account (${p.links.filter((l) => l.reason.startsWith('face')).map((l) => `#${l.no ?? '?'}`).join(', ')}). One person may be using two accounts.`;
    case 'shared': return `${me} used the same phone or Wi-Fi as another account. On its own that is often friends or family; together with a look-alike face it means a second account.`;
    case 'board_off': return `${me}'s Reel is feed-only: it shows in the feed but earns no Rings on the board${p.reels?.board_off_reason ? ` (reason: ${p.reels.board_off_reason})` : ''}.`;
    case 'opens_only': return `All of ${me}'s Rings this week come from shared-link opens, none from likes or saves. That can be real sharing, or someone opening their own link many times.`;
    case 'fast_claim': return `${me} claimed a prize within minutes of joining — typical of people making extra accounts for prizes.`;
    case 'unverified_paid': return `${me} was paid a prize but never passed the face check.`;
    case 'no_photo': return `${me} has no card photo yet, so they do not show to other members.`;
    case 'burst': return `Several people joined with the same invite link within 2 hours — real friends, or one person making accounts.`;
    case 'lookalike_board': return `${me} has a look-alike account. Check it before their prize is approved.`;
    default: return `${me}: ${key.replace(/_/g, ' ')}`;
  }
}

// ───────── alert centre: what kind of sheet an alert opens ─────────
export type AlertSheetKind = 'protect' | 'struggle' | 'help' | 'stock' | 'held' | 'reports' | 'dups' | 'errors' | 'generic';
export function alertSheetKind(a: Pick<RobotAlert, 'dedupe_key' | 'robot' | 'href' | 'title'>): AlertSheetKind {
  const k = a.dedupe_key || '';
  if (k === 'protect:reported_posts' || k === 'sys:open_reports') return 'reports';
  if (k.startsWith('protect:')) return 'protect';
  if (/struggl/i.test(k) || /struggl/i.test(a.robot)) return 'struggle';
  if (/(^|:)help/i.test(k) || a.href === '#help') return 'help';
  if (k === 'selffix:voucher_restock' || k === 'sys:voucher_stock_low' || a.href === '#codes') return 'stock';
  if (k === 'sys:held_claims' || k === 'selffix:stale_holds') return 'held';
  if (k === 'sys:dups_today') return 'dups';
  if (k.startsWith('sys:errors') || a.href === '#problems') return 'errors';
  return 'generic';
}
/** the member an alert is about, when the robot put one in detail */
export function alertUser(a: Pick<RobotAlert, 'detail'>): { user_id: string; no: number | null; name: string | null } | null {
  const d = a.detail || {};
  const id = (d.user_id || d.member_id || d.uid) as string | undefined;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const no = d.member_no ?? d.no;
  return { user_id: id, no: typeof no === 'number' ? no : no != null ? Number(no) || null : null, name: typeof d.name === 'string' ? d.name : typeof d.first_name === 'string' ? d.first_name : null };
}
/** detail jsonb → short "key: value" lines (for the faint part of a generic alert sheet) */
export function detailLines(d: Record<string, unknown> | undefined): string[] {
  if (!d) return [];
  return Object.entries(d).filter(([k, v]) => v != null && v !== '' && !/url|href|hash/i.test(k) && typeof v !== 'object').slice(0, 8)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`);
}
