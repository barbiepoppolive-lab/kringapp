/**
 * 19 Nov Ring-farming check (founder: "These ring farming reports from members should be highlighted with ample data in admin panel
 * for me to assess"). Pure helpers, no DOM: 0123 kr8_admin_farming_cases() data → plain-English lines, a verdict, and the
 * "Rings now / if counted once / if not counted" comparison. Times are shown in India time (the founder is in India).
 */

export interface FarmGiver {
  user_id: string; no: number | null; name: string | null; joined_at: string;
  ref_code: string | null; src_code: string | null; ref_no: number | null; ref_name: string | null;
  verified: boolean; has_photo: boolean; ghost: boolean; ua: string | null; ua2: string | null;
  likes: number; saves: number; reels: number; opens: number; given_total: number; people: number;
  others: { no: number | null; name: string | null; n: number }[];
  own_reels: number; first_give_at: string | null; first_give_min: number | null;
  by_share: boolean; by_link: boolean; by_flag: boolean; rings_from: number; one_like: number;
}
export interface FarmBeneficiary { user_id: string; no: number | null; name: string | null; joined_at: string; verified: boolean; rank: number | null; rings: number; rings_full: number; rings_once: number; rings_none: number }
export type ScoreMode = 'full' | 'once' | 'none';
export interface FarmDecision { score_mode: ScoreMode; givers: string[]; hold: boolean; note: string | null; at: string }
export interface FarmCase { beneficiary: FarmBeneficiary; decision: FarmDecision | null; links: { a: string; b: string; reason: string }[]; givers: FarmGiver[] }
export interface FarmData { week_start: string; now: string; weights: { like: number; save: number; traveller_mult: number }; paid_ranks: number; board: { user_id: string; rings: number; rank: number }[]; cases: FarmCase[] }
export type FarmAction = ScoreMode | 'hold' | 'unhold';
export type Tone = 'r' | 'a' | 'g';
export interface FarmSignal { key: string; text: string; tone: Tone }
export interface FarmVerdict { kind: 'coordinated' | 'fake' | 'organic'; title: string; reason: string; tone: Tone }

export const isFarmData = (x: unknown): x is FarmData => !!x && typeof x === 'object' && Array.isArray((x as FarmData).cases) && Array.isArray((x as FarmData).board);

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const tag = (no: number | null | undefined) => `#${no ?? '?'}`;
export const nameTag = (p: { no: number | null; name: string | null }) => `${tag(p.no)} ${p.name || 'member'}`;

// ───────── phones ─────────
/** iPhone / Android / Computer from a user-agent, plus the Android model when the phone still sends one (new Chrome sends only "K") */
export function phoneOf(ua: string | null | undefined): { kind: 'iPhone' | 'Android' | 'Computer' | null; model: string | null } {
  const u = ua || '';
  if (!u) return { kind: null, model: null };
  if (/\b(iPhone|iPad|iPod)\b/.test(u)) return { kind: 'iPhone', model: null };
  const a = u.match(/Android [\d.]+(?:; ([^;)]+))?/);
  if (a) { const m = (a[1] || '').replace(/\s*Build\/.*$/, '').trim(); return { kind: 'Android', model: m && m !== 'K' && !/^wv$/i.test(m) ? m : null }; }
  if (/Windows|Macintosh|X11|CrOS/.test(u)) return { kind: 'Computer', model: null };
  return { kind: null, model: null };
}
export const giverPhone = (g: Pick<FarmGiver, 'ua' | 'ua2'>) => { const p = phoneOf(g.ua); return p.kind ? p : phoneOf(g.ua2); };

// ───────── time words (India time) ─────────
export function istClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M/, (_, x: string) => ` ${x.toLowerCase()}m`);
}
export function istDay(iso: string): string { return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }); }
const istHour = (iso: string) => Number(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }));
export function spanWords(min: number): string {
  if (min < 90) return plural(Math.max(1, Math.round(min)), 'minute');
  if (min < 48 * 60) return plural(Math.round(min / 60), 'hour');
  return plural(Math.round(min / 1440), 'day');
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

// ───────── facts (numbers the lines and the verdict are built from) ─────────
export interface FarmFacts {
  n: number; newN: number; spanMin: number; firstJoin: string | null; lastJoin: string | null; overnight: boolean;
  given: number; givenAll: number; allToHim: boolean; sameReels: number | null; viaLink: number; noLink: number; otherLink: number;
  fastMin: number | null; posted: number; verified: number; real: number; iphone: number; android: number; sameModel: string | null;
  wifi: string[][]; phone: string[][]; face: string[][]; flagged: number; spread: number;
}
export function farmFacts(c: FarmCase, weekStart: string): FarmFacts {
  const gs = c.givers; const n = gs.length; const me = c.beneficiary.no;
  const joins = gs.map((g) => Date.parse(g.joined_at)).filter((x) => !isNaN(x)).sort((a, b) => a - b);
  const w0 = Date.parse(weekStart);
  const fresh = gs.filter((g) => Date.parse(g.joined_at) >= w0);
  const given = gs.reduce((s, g) => s + g.likes + g.saves, 0);
  const givenAll = gs.reduce((s, g) => s + Math.max(g.given_total, g.likes + g.saves), 0);
  const reelsSet = new Set(gs.map((g) => g.reels));
  const phones = gs.map(giverPhone);
  const models = phones.map((p) => p.model).filter(Boolean) as string[];
  const byId = new Map<string, string>([[c.beneficiary.user_id, tag(me)], ...gs.map((g) => [g.user_id, tag(g.no)] as [string, string])]);
  const pairs = (r: (x: string) => boolean) => c.links.filter((l) => r(l.reason)).map((l) => [byId.get(l.a) || '?', byId.get(l.b) || '?']);
  const fast = gs.map((g) => g.first_give_min).filter((x): x is number => typeof x === 'number');
  return {
    n, newN: fresh.length, spanMin: joins.length > 1 ? (joins[joins.length - 1] - joins[0]) / 60000 : 0,
    firstJoin: joins.length ? new Date(joins[0]).toISOString() : null, lastJoin: joins.length ? new Date(joins[joins.length - 1]).toISOString() : null,
    overnight: n > 0 && gs.every((g) => { const h = istHour(g.joined_at); return h >= 0 && h < 7; }),
    given, givenAll, allToHim: n > 0 && gs.every((g) => g.likes + g.saves >= g.given_total), sameReels: n > 1 && reelsSet.size === 1 ? gs[0].reels : null,
    viaLink: gs.filter((g) => me != null && g.ref_no === me).length, noLink: gs.filter((g) => !g.ref_code).length,
    otherLink: gs.filter((g) => g.ref_code && !(me != null && g.ref_no === me)).length,
    fastMin: fast.length ? median(fast) : null,
    posted: gs.filter((g) => g.own_reels > 0).length, verified: gs.filter((g) => g.verified).length, real: gs.filter((g) => g.verified || g.own_reels > 0).length,
    iphone: phones.filter((p) => p.kind === 'iPhone').length, android: phones.filter((p) => p.kind === 'Android').length,
    sameModel: models.length >= 3 && models.length === n && new Set(models).size === 1 ? models[0] : null,
    wifi: pairs((r) => r === 'network'), phone: pairs((r) => r === 'device'), face: pairs((r) => r === 'face' || r === 'face_maybe'),
    flagged: gs.filter((g) => g.by_flag).length, spread: gs.filter((g) => g.people > 1).length,
  };
}

// ───────── the plain-English lines ─────────
export function farmSignals(c: FarmCase, weekStart: string): FarmSignal[] {
  const f = farmFacts(c, weekStart); const me = tag(c.beneficiary.no); const out: FarmSignal[] = [];
  if (!f.n) return out;
  // 1. who joined when
  if (f.newN === f.n && f.n >= 2 && f.spanMin <= 24 * 60) {
    const night = f.overnight && f.firstJoin && f.lastJoin ? ` (${istClock(f.firstJoin)}–${istClock(f.lastJoin)} India time)` : '';
    out.push({ key: 'burst', text: `${f.n} new accounts, all joined within ${spanWords(f.spanMin)}${night}`, tone: f.spanMin <= 6 * 60 ? 'r' : 'a' });
  } else if (f.newN) out.push({ key: 'new', text: f.n === 1 ? `New account: joined ${istDay(f.firstJoin || c.givers[0].joined_at)}` : `${f.newN} of ${f.n} joined this week`, tone: f.newN * 2 >= f.n ? 'a' : 'g' });
  else out.push({ key: 'old', text: f.n === 1 ? 'Joined before this week' : `All ${f.n} joined before this week`, tone: 'g' });
  // 2. where their likes went
  const pct = f.givenAll ? Math.round((f.given / f.givenAll) * 100) : 0;
  if (f.allToHim) out.push({ key: 'share', text: `100% of their likes went to ${me}`, tone: 'r' });
  else out.push({ key: 'share', text: `${pct}% of their likes and saves went to ${me}${f.spread ? ` (${f.spread} also liked other members)` : ''}`, tone: pct >= 80 ? 'r' : pct >= 50 ? 'a' : 'g' });
  // 3. the same pattern
  if (f.sameReels != null) out.push({ key: 'same', text: `All liked exactly ${plural(f.sameReels, 'Reel')}${f.allToHim ? ` — only ${me}'s` : ` of ${me}'s`}`, tone: 'r' });
  // 4. invite link
  if (f.viaLink) out.push({ key: 'link', text: `${f.viaLink} of ${f.n} joined with ${me}'s invite link${f.noLink ? `, ${f.noLink} with no link` : ''}`, tone: 'a' });
  else if (f.noLink === f.n) out.push({ key: 'link', text: `None used an invite link`, tone: 'a' });
  // 5. speed
  if (f.fastMin != null && f.newN === f.n && f.fastMin <= 60) out.push({ key: 'fast', text: `Most liked ${me} ${f.fastMin <= 1 ? 'the minute they joined' : `within ${spanWords(f.fastMin)} of joining`}`, tone: 'r' });
  // 6. real-people signs (green when most look real)
  out.push({ key: 'posted', text: f.posted ? `${f.posted} of ${f.n} posted their own Reels${f.posted * 2 >= f.n ? ' (looks like real people)' : ''}` : `None posted a Reel of their own`, tone: f.posted * 2 >= f.n ? 'g' : 'a' });
  out.push({ key: 'face', text: f.verified ? `${f.verified} of ${f.n} face-verified` : 'None face-verified', tone: f.verified * 2 >= f.n ? 'g' : 'a' });
  // 7. phones and networks
  if (f.sameModel) out.push({ key: 'model', text: `All on the same phone model (${f.sameModel})`, tone: 'r' });
  else if (f.iphone && f.android) out.push({ key: 'phones', text: `Different phones: ${f.iphone} iPhone, ${f.android} Android`, tone: 'g' });
  else if (f.iphone + f.android) out.push({ key: 'phones', text: `All on ${f.iphone ? 'iPhone' : 'Android'}`, tone: 'a' });
  if (f.phone.length) out.push({ key: 'device', text: `Same phone used by ${f.phone.map((p) => p.join(' and ')).join(', ')} — one person, two accounts`, tone: 'r' });
  if (f.face.length) out.push({ key: 'facedup', text: `Same face: ${f.face.map((p) => p.join(' and ')).join(', ')}`, tone: 'r' });
  if (f.wifi.length) out.push({ key: 'wifi', text: `Same Wi-Fi: ${f.wifi.map((p) => p.join(' and ')).join(', ')} (often friends or family)`, tone: 'a' });
  if (f.flagged) out.push({ key: 'robot', text: `The protect robot also flagged ${f.flagged === f.n ? (f.n === 1 ? 'them' : `all ${f.n}`) : `${f.flagged} of them`} (they like each other back)`, tone: 'a' });
  return out;
}

export function farmVerdict(c: FarmCase, weekStart: string): FarmVerdict {
  const f = farmFacts(c, weekStart); const me = tag(c.beneficiary.no);
  if (!f.n) return { kind: 'organic', title: 'Looks organic', reason: 'No account here sends most of its likes to one member.', tone: 'g' };
  const share = f.givenAll ? f.given / f.givenAll : 0;
  const burst = f.newN === f.n && f.n >= 3 && f.spanMin <= 6 * 60;
  const coordinated = (share >= 0.8 && f.n >= 3) || burst || f.viaLink * 2 >= f.n || f.flagged > 0;
  const fake = f.phone.length + f.face.length >= 1 || !!f.sameModel || f.real * 10 < f.n * 3;
  if (fake && (coordinated || f.phone.length + f.face.length)) {
    const why = f.phone.length || f.face.length ? `${plural(f.phone.length + f.face.length, 'pair')} of them use the same phone or face`
      : f.sameModel ? `they are all on the same phone model`
      : `${f.n - f.real} of ${f.n} never face-verified or posted a Reel`;
    return { kind: 'fake', title: 'Likely fake accounts', reason: `${why[0].toUpperCase()}${why.slice(1)}, and they did almost nothing on Kring except like ${me}.`, tone: 'r' };
  }
  if (coordinated) {
    const how = [f.verified ? `${f.verified} face-verified` : '', f.posted ? `${f.posted} posted Reels` : ''].filter(Boolean).join(', ');
    const together = burst ? 'joined within a few hours' : f.viaLink * 2 >= f.n ? `came through ${me}'s invite link` : 'acted together';
    return { kind: 'coordinated', title: 'Likely friends asked to like (coordinated)',
      reason: `They look like real people${how ? ` (${how})` : ''}, but they ${together} and ${share >= 0.95 ? 'liked only' : 'mostly liked'} ${me} — most likely friends ${me} asked to like.`, tone: 'a' };
  }
  return { kind: 'organic', title: 'Looks organic', reason: `Their likes are spread over other members too and they joined at different times — normal fans of ${me}.`, tone: 'g' };
}

// ───────── Rings comparison ─────────
/** rank this member would have with `rings` (others stay as they are on the board now) */
export function rankIf(d: Pick<FarmData, 'board'>, uid: string, rings: number): number {
  return 1 + d.board.filter((b) => b.user_id !== uid && b.rings > rings).length;
}
export interface FarmCompare { now: number; full: number; once: number; none: number; rankNow: number | null; rankFull: number; rankOnce: number; rankNone: number; mode: ScoreMode }
export function farmCompare(d: Pick<FarmData, 'board'>, c: FarmCase): FarmCompare {
  const b = c.beneficiary;
  return { now: b.rings, full: b.rings_full, once: b.rings_once, none: b.rings_none, rankNow: b.rank, mode: c.decision?.score_mode || 'full',
    rankFull: rankIf(d, b.user_id, b.rings_full), rankOnce: rankIf(d, b.user_id, b.rings_once), rankNone: rankIf(d, b.user_id, b.rings_none) };
}
/** card title: "12 accounts liked only #19 Nut" */
export function farmHeadline(c: FarmCase, weekStart: string): string {
  const f = farmFacts(c, weekStart); const who = nameTag(c.beneficiary);
  const acc = plural(f.n, 'account');
  if (f.newN === f.n && f.overnight) return `${acc} joined overnight and liked only ${who}`;
  return f.allToHim ? `${acc} liked only ${who}` : `${acc} gave most of their likes to ${who}`;
}
export const MODE_WORDS: Record<ScoreMode, string> = { full: 'Counted fully', once: 'Each friend counted once', none: 'Not counted' };
export function decisionWords(dec: FarmDecision | null): string | null {
  if (!dec) return null;
  if (dec.score_mode === 'full' && !dec.hold) return 'You chose: count fully';
  return `You chose: ${[dec.score_mode !== 'full' ? MODE_WORDS[dec.score_mode].toLowerCase() : '', dec.hold ? 'prize on hold' : ''].filter(Boolean).join(' · ')}`;
}
/** after a tap: "Saved — each friend counts once. #19 now has 89 Rings." */
export function savedWords(a: FarmAction, rings: number | null | undefined, who: string): string {
  const what = a === 'full' ? 'counted fully' : a === 'once' ? 'each friend counts once' : a === 'none' ? 'these likes don’t count' : a === 'hold' ? 'prize on hold' : 'prize released';
  return `Saved — ${what}.${rings != null && (a === 'full' || a === 'once' || a === 'none') ? ` ${who} now has ${rings} Rings.` : ''}`;
}

// ───────── one giver in words ─────────
export function giverLines(g: FarmGiver, me: number | null): { joined: string; chips: { text: string; tone: Tone | '' }[]; gave: string; share: number } {
  const link = g.ref_no != null ? (g.ref_no === me ? `via ${tag(me)}'s link` : `via ${tag(g.ref_no)}'s link`) : g.ref_code ? `code ${g.ref_code}` : 'no link';
  const ph = giverPhone(g);
  const tot = Math.max(g.given_total, g.likes + g.saves);
  const share = tot ? Math.round(((g.likes + g.saves) / tot) * 100) : 0;
  const chips: { text: string; tone: Tone | '' }[] = [
    g.verified ? { text: '✓ face', tone: 'g' } : { text: 'no face check', tone: 'a' },
    ph.kind ? { text: ph.model ? `${ph.kind} ${ph.model}` : ph.kind, tone: '' } : null,
    g.own_reels ? { text: `posted ${plural(g.own_reels, 'Reel')}`, tone: 'g' } : { text: 'no Reels', tone: 'a' },
    g.first_give_min != null ? { text: g.first_give_min <= 1 ? 'liked at once' : `liked after ${spanWords(g.first_give_min)}`, tone: g.first_give_min <= 60 ? 'r' : '' } : null,
    g.others.length ? { text: `also liked ${g.others.map((o) => tag(o.no)).join(', ')}`, tone: 'g' } : null,
    g.ghost ? { text: 'hidden duplicate', tone: 'r' } : null,
  ].filter(Boolean) as { text: string; tone: Tone | '' }[];
  const parts = [g.likes ? plural(g.likes, 'like') : '', g.saves ? plural(g.saves, 'save') : '', g.opens ? plural(g.opens, 'open') : ''].filter(Boolean);
  return { joined: `joined ${istClock(g.joined_at)} IST, ${istDay(g.joined_at)} · ${link}`, chips, gave: parts.join(' · ') || '—', share };
}
