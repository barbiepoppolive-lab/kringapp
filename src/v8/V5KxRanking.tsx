/**
 * Weekly ranking (LOCKED rules 15 Nov; look A "Gold-ring podium" approved 17 Nov — no scope tabs).
 * Rings = likes ×1, saves ×3, share-link opens ×5, visitors' likes/saves ×2, your best Reel of the week (best_reels = 1 since 15 Nov) (Mon 00:00 – Sun 23:59 Bangkok).
 * Board V2 "Compact" (18 Nov): podium with gold ฿ text, rows 4–8 slim with the ฿, PRIZE LINE, #9+ with "12 to #8".
 * Empty paid ranks show "Your spot? · ฿250". Pinned own row = progress to the prize floor + the next step. Tap any score → the math.
 * Every number comes from the server (kr8_weekly_ranking / kr8_score_breakdown); nothing is computed here.
 */
import React, { useEffect, useRef, useState } from 'react';
import './kx.css';
import { countdown, fmtN, mathLines, weekEnd } from './kxLogic';
import { kxBreakdown, kxCardExtras, kxMemberReels, kxRanking, kxRules, kxSeatsLeft, type KxBreakdown, type KxGap, type KxRanking, type KxRankRow } from './v5Kx';
import { RingGlyph } from './V5KxCard';
import { InviteHint } from './V5Invite';
import { signReelPaths } from './v5Reel';
import { RingToast, rulesVariant, WinSheet, winRules } from './V5KxRules';
import { BackIcon, Crown, InfoIcon, Medal, PlusIcon, ShareIcon, type Tone } from './BoardArt';
import { rankDelta, seenRankAtStart } from './prizeRace';
import { FairPlaySheet, NewcomersLeague } from './V5Ret10';
import { lineOut, refCode } from './invite';
import { boardMoment, displayCode, cardBlob, cardCaption, cardLink, linkCopiedToast, shareCard, storyButtonLabel, storyFileName, type ShareCard } from './rankStory';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

const Av = ({ photo, name, size }: { photo: string | null; name: string; size: number }) => (
  <i className="kx-av" style={{ width: size, height: size, ...(photo ? { backgroundImage: `url('${photo}')` } : {}) }} aria-hidden="true">{photo ? '' : (name || '?').charAt(0).toUpperCase()}</i>
);
/** a story frame with a small star: "make a story picture" */
const StoryIcon = () => (
  <svg viewBox="0 0 24 24" focusable="false"><rect x="6" y="2.8" width="12" height="18.4" rx="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8.2l1.15 2.35 2.6.38-1.88 1.83.44 2.58L12 14.12l-2.31 1.22.44-2.58-1.88-1.83 2.6-.38z" fill="currentColor" /></svg>
);
/** copy a link (clipboard API, else the old textarea way); true when it worked */
export async function copyLink(s: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(s); return true; } } catch { /* fall back */ }
  try {
    const t = document.createElement('textarea'); t.value = s; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}
export const baht = (n: number) => `฿${fmtN(n)}`;
export const ringsText = (L: Tx, Lf: Txf, n: number) => (n === 1 ? L('1 Ring') : Lf('{0} Rings', fmtN(n)));

/** The exact founder copy (EN) with a natural Thai version in KX_L. */
export const HOW_RINGS = 'Bangkok’s best Reels, chosen by the people who love the city. A like is 1 Ring. A save is 3. Each person who opens your Reel from Instagram, TikTok, Facebook or another app is 5. When a visitor to Bangkok likes or saves your Reel, it counts double, because you showed someone the real city. Only your best Reel of the week counts. Tap any score to see how it adds up.';

export function HowSheet(props: { L: Tx; onClose: () => void }) {
  const { L } = props;
  return (
    <div className="kx-shbg" onClick={props.onClose}>
      <div className="kx-sh" id="kxHow" role="dialog" aria-label={L('How Rings work')} onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        <h2>{L('How Rings work')}</h2>
        <p className="kx-how" id="kxHowText">{L(HOW_RINGS)}</p>
        <button type="button" className="kx-btn ghost" id="kxHowOk" onClick={props.onClose}>{L('Got it')}</button>
      </div>
    </div>
  );
}

/** Tap any score → the Reel(s) that count, with every line of the sum (mock m3). One Reel since 15 Nov. */
export function MathSheet(props: { L: Tx; Lf: Txf; lang: string; user: string; onClose: () => void; onShare?: (reel: string | null) => void; onHow: () => void;
  onProfile?: (id: string) => void }) {
  // Retention 10 (feature 9): every score tap opens the fair-play breakdown (kr8_fair_play, adds up to the board number exactly)
  if (FAIR_PLAY) return <FairPlaySheet lang={props.lang} user={props.user} onClose={props.onClose} onProfile={props.onProfile}
    onShare={props.onShare ? () => props.onShare?.(null) : undefined} />;
  return <MathSheetOld {...props} />;
}
const FAIR_PLAY = true;
function MathSheetOld(props: { L: Tx; Lf: Txf; lang: string; user: string; onClose: () => void; onShare?: (reel: string | null) => void; onHow: () => void }) {
  const { L, Lf } = props;
  const [d, setD] = useState<KxBreakdown | null | undefined>(undefined);
  const [posters, setPosters] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    setD(undefined);
    kxBreakdown(props.user).then((r) => {
      if (dead) return;
      setD(r);
      const paths = (r?.reels || []).map((x) => x.poster_path || '').filter(Boolean);
      if (paths.length) signReelPaths(paths).then((m) => { if (!dead) setPosters(m); }).catch(() => undefined);
    }).catch(() => { if (!dead) setD(null); });
    return () => { dead = true; };
  }, [props.user]);
  const label: Record<string, string> = { lLocal: 'Local likes', lTrav: 'Visitor likes', sLocal: 'Local saves', sTrav: 'Visitor saves', opens: 'Link opens from Instagram / TikTok' };
  const R = d ? { like: d.weights.like, save: d.weights.save, open: d.weights.open, traveller_mult: d.weights.mult } : null;
  return (
    <div className="kx-shbg" onClick={props.onClose}>
      <div className="kx-sh kx-math" id="kxMath" role="dialog" onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        {d === undefined ? <p className="kx-empty">…</p> : d === null || !R ? <p className="kx-empty">{L('Couldn’t reach Kring. Check your connection and try again.')}</p> : (
          <>
            <div className="kx-math-h">
              <h2 id="kxMathTitle">{d.is_me ? Lf('Your {0}', ringsText(L, Lf, d.rings)) : Lf('{0} · {1}', d.first_name, ringsText(L, Lf, d.rings))}</h2>
              <span>{d.weights.best <= 1 ? L('your best Reel this week') : Lf('best {0} Reels this week', String(d.weights.best))}</span>
            </div>
            {d.reels.length === 0 ? <p className="kx-empty" id="kxMathEmpty">{d.is_me ? L('No Rings yet this week. Post a Reel at a place, then share it.') : L('No Rings yet this week.')}</p> : null}
            {d.reels.map((r, i) => {
              const place = props.lang === 'th' && r.place_th ? r.place_th : r.place;
              const lines = mathLines({ lLocal: r.l_local, lTrav: r.l_trav, sLocal: r.s_local, sTrav: r.s_trav, opens: r.opens }, R);
              return (
                <div className="kx-mr" key={r.post_id} data-math-reel={r.post_id}>
                  <div className="kx-mr-h">
                    <i className="th" style={r.poster_path && posters[r.poster_path] ? { backgroundImage: `url('${posters[r.poster_path]}')` } : undefined} />
                    <span className="t">{place ? Lf('Reel at {0}', place) : Lf('Reel {0}', String(i + 1))}
                      <small>{new Intl.DateTimeFormat(props.lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(Date.parse(r.posted_at))}</small></span>
                    <b data-reel-score={r.score}>{fmtN(r.score)}</b>
                  </div>
                  {lines.map((x) => (
                    <div className={`kx-ml${x.n ? '' : ' z'}`} key={x.key} data-line={x.key}>
                      <span>{L(label[x.key])}</span><em>{fmtN(x.n)} × {x.each}</em><b>{fmtN(x.total)}</b>
                    </div>
                  ))}
                  {r.opens > 0 && r.opens % d.weights.cap === 0 ? <p className="kx-mnote">{Lf('Link opens: at most {0} count per day', String(d.weights.cap))}</p> : null}
                </div>
              );
            })}
            {d.reels.length ? (
              <div className="kx-mtot" id="kxMathTotal"><span>{[...d.reels.map((r) => fmtN(r.score)), ...(d.invites ? [`${fmtN(d.invites)} (${props.lang === 'th' ? 'เพื่อน' : 'friends'})`] : [])].join(' + ')}</span><b>{fmtN(d.rings)} <RingGlyph /></b></div>
            ) : null}
            {d.more > 0 ? <p className="kx-mnote">{d.more === 1 ? L('1 more Reel this week, not counted (only your best Reel counts)') : Lf('{0} more Reels this week, not counted (only your best Reel counts)', String(d.more))}</p> : null}
            <p className="kx-mfoot">{L('Same math for everyone. Tap any score on the board to see it.')}<br />{L('Same score? The Reel posted first is ahead.')}</p>
            {d.is_me && props.onShare ? (
              <button type="button" className="kx-btn" id="kxMathShare" onClick={() => props.onShare?.(d.reels[0]?.post_id || null)}>
                {d.reels.length ? Lf('Share a Reel · each open +{0}', String(d.weights.open)) : L('Post a Reel')} {d.reels.length ? <RingGlyph white /> : null}
              </button>
            ) : null}
            <button type="button" className="kx-linkbtn" id="kxMathHow" onClick={props.onHow}>{L('How Rings work')}</button>
          </>
        )}
      </div>
    </div>
  );
}

export interface OwnRow { n: string; l1: React.ReactNode; l2: string; btn: 'math' | 'share' | 'post' | null; key: string }
/** The pinned row: what I have, then the next step and what it pays (six states, mock m2). */
export function ownRow(L: Tx, Lf: Txf, gap: KxGap | null | undefined, mine: KxRanking['mine'] | undefined | null): OwnRow {
  const rt = (n: number) => ringsText(L, Lf, n);
  const you = (g: KxGap) => `${L('You')} · ${rt(g.rings)}`;
  const toRank = (t: NonNullable<KxGap['target']>) => `${Lf('{0} to pass #{1}', rt(t.need), String(t.rank))}${t.prize > 0 ? ` · ${baht(t.prize)}` : ''}`;
  if (!gap) return { n: '–', l1: L('Not on the board yet'), l2: L('Post 1 Reel'), btn: 'post', key: 'none' };
  const g = gap, t = g.target;
  if (g.state === 'top') return { n: '1', l1: you(g), l2: `${Lf('{0} now', baht(g.prize_now))}${g.behind ? ` · ${Lf('#{0} is {1} behind you', String(g.behind.rank), fmtN(g.behind.diff))}` : ''}`, btn: 'math', key: 'top' };
  if (g.state === 'paid' && t) {
    const guard = (g.rank || 0) >= 6 && g.behind;
    return { n: String(g.rank), l1: you(g), l2: `${Lf('{0} now', baht(g.prize_now))} · ${guard && g.behind ? Lf('#{0} is {1} behind you', String(g.behind.rank), fmtN(g.behind.diff)) : toRank(t)}`, btn: 'math', key: 'paid' };
  }
  if (g.state === 'floor' && t) return { n: String(g.rank), l1: you(g), l2: Lf('{0} to take {1}', rt(t.need), baht(t.prize)), btn: 'math', key: 'floor' };
  if (g.state === 'board' && t) return { n: String(g.rank), l1: you(g), l2: toRank(t), btn: 'math', key: 'board' };
  if (g.state === 'far' && t) {
    return { n: String(g.rank), l1: you(g), l2: `${g.above ? `${Lf('{0} to pass {1}', rt(g.above.need), g.above.name)} · ` : ''}${Lf('{0} to top 10', fmtN(g.top10_need ?? t.need))}`, btn: 'share', key: 'far' };
  }
  // no Rings yet this week
  if (mine && mine.live > 0 && t) return { n: '–', l1: you(g), l2: t.open ? `${Lf('Seat #{0} is open', String(t.rank))} · ${baht(t.prize)} · ${Lf('reach {0}', rt(g.floor))}` : toRank(t), btn: 'share', key: 'zero' };
  // 20 Nov: short enough for one line at 320–360 px ("You · in review · Usually under 2 hours" was cut off)
  if (mine && mine.pending > 0) return { n: '–', l1: <>{L('In review')}</>, l2: L('usually < 2 h'), btn: null, key: 'review' };
  if (t && t.open && t.prize > 0) return { n: '–', l1: <>{Lf('Seat #{0} is open', String(t.rank))} · {baht(t.prize)}</>, l2: `${L('Post a Reel')} · ${Lf('reach {0}', rt(Math.max(1, g.floor)))}`, btn: 'post', key: 'open' };
  return { n: '–', l1: L('Not on the board yet'), l2: L('Post 1 Reel'), btn: 'post', key: 'none' };
}

/** Last 6 h of the week (Sun 18:00 → 24:00 Bangkok): the closing line turns pink. */
export const isLastHours = (now = Date.now(), end = weekEnd(now)) => end - now > 0 && end - now <= 6 * 3600_000;

/** "37 of 50 paid seats left" (Founding Local seats, from kr8_seats_left). Hidden when unknown, off or full. Never a voucher count. One language. */
export const PAID_SEATS = 50;
const seatsOk = (left: number | null | undefined): left is number => typeof left === 'number' && Number.isFinite(left) && left > 0;
export function SeatsLine(props: { L: Tx; Lf: Txf; lang: string; left: number | null | undefined }) {
  const { left } = props;
  if (!seatsOk(left)) return null;
  const n = String(Math.min(left, PAID_SEATS));
  return <p className="rka-seats" id="kxSeatsLeft" data-left={n}><span lang={props.lang}>{props.Lf('{0} of {1} paid seats left', n, String(PAID_SEATS))}</span></p>;
}

/** When the week closes, in the member's language: "Sun 23:59" · "อา. 23:59" (Bangkok time; the week ends Mon 00:00, shown as the minute before). */
const TH_DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const EN_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LOCALE: Record<string, string> = { zh: 'zh-CN', hi: 'hi-IN', ja: 'ja-JP', ko: 'ko-KR' };
export function closesAt(end: number, lang: string): string {
  const b = new Date(end - 60_000 + 7 * 3600_000);
  const hm = `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
  if (lang === 'th') return `${TH_DAY[b.getUTCDay()]} ${hm}`;
  if (!LOCALE[lang]) return `${EN_DAY[b.getUTCDay()]} ${hm}`;
  try { return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(end - 60_000); }
  catch { return `${EN_DAY[b.getUTCDay()]} ${hm}`; }
}
/** The one line under the title: "Closes Sun 23:59" (the last 24 h: a live countdown "Closes in 05:12"). */
export function closeLine(Lf: Txf, lang: string, now: number, end: number): { text: string; soon: boolean } {
  const left = end - now;
  if (left > 0 && left <= 24 * 3600_000) return { text: Lf('Closes in {0}', countdown(now, end).replace(/^0d /, '')), soon: true };
  return { text: Lf('Closes {0}', closesAt(end, lang)), soon: false };
}

/** The pinned row's progress: Rings toward the prize floor (25 by default, from the server). Full once you qualify. */
export function floorProgress(rings: number, floor: number): { pct: number; below: boolean; need: number } {
  const f = Math.max(0, floor | 0), r = Math.max(0, rings | 0);
  if (f <= 0 || r >= f) return { pct: 100, below: false, need: 0 };
  return { pct: Math.round((r * 100) / f), below: true, need: f - r };
}

/** The member's newest approved Reel (what "Share my Reel" shares); null = none yet → the button posts one. */
export function latestApproved(reels: { id: string; status: string; created_at: string }[] | null | undefined): string | null {
  const ok = (reels || []).filter((r) => r.status === 'approved').sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return ok[0]?.id || null;
}

/** Cheap phones: no backdrop blur (the sheet gets a solid tint instead). */
const lowFx = () => {
  try {
    const n = navigator as Navigator & { deviceMemory?: number };
    return (typeof n.deviceMemory === 'number' && n.deviceMemory <= 4) || (typeof n.hardwareConcurrency === 'number' && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 4);
  } catch { return false; }
};
const RING_CLS = ['c0', 'c1', 'c2', 'c3'];

/**
 * board-1 v3 (founder 18 Nov): a live countdown in a small glass pill, to the real week end (Bangkok).
 *   more than a day: "3d 08:14:22" (Thai "3 วัน 08:14:22") · last 24 h: "08:14:22", pink, gentle pulse · last hour: big "14:22"
 */
export type ClockMode = 'week' | 'day' | 'hour';
export function liveClock(now: number, end: number, lang: string): { text: string; mode: ClockMode } {
  const left = Math.max(0, end - now), p2 = (n: number) => String(n).padStart(2, '0');
  const d = Math.floor(left / 86_400_000), h = Math.floor(left / 3_600_000) % 24, m = Math.floor(left / 60_000) % 60, sec = Math.floor(left / 1000) % 60;
  if (left < 3_600_000) return { text: `${p2(m)}:${p2(sec)}`, mode: 'hour' };
  if (left < 86_400_000) return { text: `${p2(h)}:${p2(m)}:${p2(sec)}`, mode: 'day' };
  return { text: lang === 'th' ? `${d} วัน ${p2(h)}:${p2(m)}:${p2(sec)}` : `${d}d ${p2(h)}:${p2(m)}:${p2(sec)}`, mode: 'week' };
}
/** board-1 v3 copy, one language (Thai mode = Thai, every other mode = English). */
export function boardCopy(lang: string) {
  const th = lang === 'th';
  return {
    prizeLine: (n: number) => (th ? `เส้นรางวัล · ${n}` : `Prize line · ${n}`),
    top: (d: number | null) => (th ? (d ? `คุณอันดับ 1 · นำ ${fmtN(d)} ริง` : 'คุณอันดับ 1') : (d ? `You’re #1 · ${fmtN(d)} ${d === 1 ? 'Ring' : 'Rings'} ahead` : 'You’re #1')),
    chase: (rank: number, need: number, to: number) => (th ? `อันดับ ${rank} · อีก ${fmtN(need)} ริงถึงอันดับ ${to}` : `#${rank} · ${fmtN(need)} ${need === 1 ? 'Ring' : 'Rings'} to #${to}`),
    rankOnly: (rank: number) => (th ? `อันดับ ${rank}` : `#${rank}`),
    share: th ? 'แชร์' : 'Share',
    myReel: th ? 'คลิปของฉัน' : 'My Reel',
    myRank: th ? 'อันดับของฉัน' : 'My rank',
    shareTitle: th ? 'แชร์อะไรดี?' : 'Share what?',
    up: (n: number) => (n > 0 ? `↑${n}` : `↓${-n}`),
    cdLabel: th ? 'เวลาที่เหลือของสัปดาห์นี้' : 'Time left this week',
  };
}
const Stopwatch = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13.5" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 9.5v4.2l2.6 1.6M9.5 3h5M12 3v2.4M18.4 6.6l1.3-1.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
/** Rings count up from 0 when the board opens (0.8 s, ease-out). Off with "reduce motion" and where there is no animation frame. */
function useCountUp(go: boolean): number {
  const [p, setP] = useState(1);
  useEffect(() => {
    if (!go) return;
    let reduce = true;
    try { reduce = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduce = true; }
    if (reduce || typeof requestAnimationFrame !== 'function') return;
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const x = Math.min(1, (t - t0) / 800); setP(1 - Math.pow(1 - x, 3)); if (x < 1) raf = requestAnimationFrame(step); };
    setP(0); raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [go]);
  return p;
}

/**
 * Board V2 "Compact" (founder pick 18 Nov, BOARDX_V2.png). One background picture; the rest is CSS/SVG.
 * Top: back · title (+ small crown) · one line "Closes Sun 23:59 · 38/50 seats left" · ⓘ (How to win + prize rules in a light glass sheet).
 * Podium: #1 bigger with a thin gold ring, soft warm glow and the crown (no wreath); #2 blue, #3 rose; prizes as gold text on 3D discs.
 * #4–#8 slim rows with thin dividers, the prize line, #9+ plain with "X to #8". Pinned: my row (progress to the prize floor) + one button,
 * "Share my Reel" (newest approved Reel, the app's share flow) or "Post a Reel" when there is none. Empty spots say "Your spot?".
 * Every number comes from the server (kr8_weekly_ranking, kr8_seats_left, kr8_rings_rules); nothing is computed here but the display.
 */
export function RankingPage(props: { L: Tx; Lf: Txf; lang: string; myArea: string | null; myPhoto: string | null; myName: string; myId: string | null;
  onBack: () => void; onPerson: (id: string) => void; onPost: () => void; onShare: (reel: string) => void;
  /** audit 18 Nov: finger down on "Share my Reel" → fetch the /r/ link early, so the tap opens the share sheet at once */
  onShareDown?: (reel: string) => void;
  /** 22 Nov: the small "Share & win Rings" line under my row → the Share & win Rings sheet */
  onShareWin?: () => void;
  /** 0066: not face-verified yet → a small nudge under my photo (everyone still shows on the board; 0111: it is only needed to claim a prize) */
  needsVerify?: boolean; onVerify?: () => void }) {
  const { L, Lf, lang } = props;
  const [data, setData] = useState<KxRanking | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [math, setMath] = useState<string | null>(null);
  const [how, setHow] = useState(false);
  const [rv] = useState(rulesVariant);
  const [low] = useState(lowFx);
  const [cfg, setCfg] = useState<Record<string, number> | null>(null);
  const [win, setWin] = useState(() => { try { return new URLSearchParams(location.search).get('win') === '1'; } catch { return false; } });
  const [toast] = useState(() => { try { return !!rv && new URLSearchParams(location.search).get('toast') === '1'; } catch { return false; } });
  /** undefined = still loading; null = no approved Reel yet */
  const [latest, setLatest] = useState<string | null | undefined>(props.myId ? undefined : null);
  /** board-1: the poster of my best (else newest) approved Reel and my invite code, for the "Share my rank" story card */
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [myNo, setMyNo] = useState<number | null>(null);
  const [vanity, setVanity] = useState<string | null>(null);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  useEffect(() => {
    let dead = false;
    Promise.resolve(kxRules()).then((c) => { if (!dead) setCfg(c || null); }).catch(() => undefined);
    Promise.resolve(kxSeatsLeft()).then((n) => { if (!dead) setSeatsLeft(typeof n === 'number' ? n : null); }).catch(() => undefined);
    kxRanking('all').then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setErr(true); });
    // 19 Nov founder: the board is live, so it refreshes every 5 min while it is on screen (founder 19 Nov: keep the server light) (no flicker, a failed refresh keeps the last board)
    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      kxRanking('all').then((d) => { if (!dead && d) { setData(d); setErr(false); } }).catch(() => undefined);
    }, 300000);
    return () => { dead = true; window.clearInterval(tick); };
  }, []);
  useEffect(() => {
    let dead = false;
    if (!props.myId) { setLatest(null); return; }
    setLatest(undefined);
    Promise.resolve(kxMemberReels(props.myId)).then((m) => {
      if (dead) return;
      const id = latestApproved(m?.reels);
      setLatest(id);
      const ok = (m?.reels || []).filter((r) => r.status === 'approved' && r.poster_path);
      setPosterPath((ok.find((r) => r.id === m?.best) || ok.find((r) => r.id === id) || ok[0])?.poster_path || null);
    }).catch(() => { if (!dead) setLatest(null); });
    Promise.resolve(kxCardExtras()).then((x) => { if (!dead) { setMyNo(x?.member_no ?? null); setVanity(x?.vanity_code ?? null); } }).catch(() => undefined);
    return () => { dead = true; };
  }, [props.myId]);
  const end = data?.ends_at ? Date.parse(data.ends_at) || weekEnd(now) : weekEnd(now);
  const hot = isLastHours(now, end);
  const clock = liveClock(now, end, lang);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const C = boardCopy(lang);
  const cu = useCountUp(!!data);
  const [shareOpen, setShareOpen] = useState(false);
  const rows = data?.rows || [];
  const paid = data?.paid_ranks ?? 8;
  const prizes = data?.prizes || [];
  const at = (rank: number) => rows.find((r) => r.rank === rank);
  const own = ownRow(L, Lf, data?.gap, data?.mine);
  const wr = winRules(cfg, data);
  const floor = data?.floor ?? wr?.floor ?? 25;
  const prog = floorProgress(data?.gap?.rings ?? 0, floor);
  const floorNote = !!data && data.floor > 0 && (data.open_seats > 0 || rows.some((r) => r.needs));
  const postLabel = lang === 'th' ? 'โพสต์คลิป' : L('Post a Reel');   // founder copy for this button (the app says โพสต์รีล elsewhere)
  const share = latest !== null;
  // board-1 (Kring Light): "X more Rings to be eligible" only on MY row; other rows under the floor show a dimmed prize (the prize line says why)
  const elig = (r: KxRankRow) => (r.needs && r.is_me ? <em className="rka-elig">{Lf('{0} more Rings to be eligible', fmtN(Math.max(1, r.needs - r.rings)))}</em> : null);
  // 20 Nov (founder): a prize seat under the Rings floor shows its prize greyed with "25 Rings to unlock" (payout needs the floor too)
  const unlock = (r: KxRankRow | undefined) => (r && r.needs && !r.paid ? <small className="rv5-unlock">{lang === 'th' ? `ต้องมี ${fmtN(r.needs)} ริง` : `${fmtN(r.needs)} Rings to unlock`}</small> : null);
  // 20 Nov: one thin blue→pink line per row = my Rings against the rank just above me
  const progLine = (r: KxRankRow) => { const up = rows.find((x) => x.rank === r.rank - 1); const pct = up && up.rings > 0 ? Math.max(4, Math.min(100, Math.round((r.rings * 100) / up.rings))) : 100; return <i className="rv5-prog" aria-hidden="true"><b style={{ width: `${pct}%` }} /></i>; };
  // plain render functions (not components): the countdown re-render must not remount rows
  const Score = ({ r, cls }: { r: KxRankRow; cls: string }) => (
    <button type="button" className={cls} data-score={r.rings} aria-label={L('See the math')} title={ringsText(L, Lf, r.rings)} onClick={(e) => { e.stopPropagation(); setMath(r.user_id); }}>
      <RingGlyph /><span className="num">{fmtN(Math.round(r.rings * cu))}</span>{elig(r)}
    </button>
  );
  const Row = ({ r }: { r: KxRankRow }) => (
    <div className={`kx-row bx-row${r.is_me ? ' mer' : ''}${r.needs ? ' low' : ''}${r.rank > paid ? ' plain' : ''}`} data-rank={r.rank}>
      <button type="button" className="who" onClick={() => setMath(r.user_id)} aria-label={r.is_me ? L('You') : r.first_name}>
        <span className="n">{r.rank}</span>
        <span className={`bx-ra ${RING_CLS[r.rank % 4]}`}><Av photo={r.photo} name={r.first_name} size={36} /></span>
      </button>
      <span className="bx-rt">
        <button type="button" className="t" onClick={() => setMath(r.user_id)}>{r.is_me ? L('You') : r.first_name}{r.is_new && !r.is_me ? <i className="nw">{L('NEW')}</i> : null}</button>
        {Score({ r, cls: 'kx-sc bx-sc' })}
        {progLine(r)}
      </span>
      {r.prize > 0 && r.all_rank <= paid
        ? <span className={`kx-pz${r.paid ? '' : ' off'}`} data-prize={r.prize}>{baht(r.prize)}{unlock(r)}</span>
        : <span className="kx-tl" />}
    </div>
  );
  const Seat = ({ rank }: { rank: number }) => (
    <button type="button" className="kx-row bx-row seat" data-rank={rank} data-seat="open" onClick={props.onPost}>
      <span className="n">{rank}</span><i className="kx-plus" aria-hidden="true"><PlusIcon /></i>
      <span className="bx-rt"><span className="t">{L('Your spot?')}</span></span>
      <span className="kx-pz">{baht(prizes[rank - 1] || 0)}</span>
    </button>
  );
  // board-1: "Share my rank" → a 1080×1920 story picture of ME only (no other member's face or name). Made ahead of the tap,
  // so the phone's share sheet opens at once (iOS only allows it straight from a tap).
  const g = data?.gap;
  const canStory = !!props.myId && !!g?.rank && (g?.rings ?? 0) > 0;
  // board-1 v2 (founder brief): the card is about ME only. Top N (paid seats) = "challenge", otherwise "help". Look A until the founder picks.
  const paidN = (data?.prizes || prizes).slice(0, paid).filter((p) => p > 0).length;
  const pool = (data?.prizes || prizes).slice(0, paid).reduce((a, p) => a + (p > 0 ? p : 0), 0);   // from the live config, never hard-coded
  const moment = boardMoment(g?.rank, paidN || paid);
  const storyIn: ShareCard | null = canStory && g?.rank ? {
    lang: lang === 'th' ? 'th' : 'en', moment, look: 'B3', rank: g.rank, daysLeft: Math.max(0, Math.floor((end - now) / 86_400_000)), won: 0,
    paidN: paidN || paid, pool, code: displayCode(vanity, refCode(myNo)), hero: null,
  } : null;
  const storyLink = cardLink({ origin: location.origin, base: import.meta.env.BASE_URL || '/app/', reel: latest || null, code: refCode(myNo), moment });
  const storyKey = storyIn ? JSON.stringify([{ ...storyIn, daysLeft: 0 }, storyIn.daysLeft, posterPath, props.myPhoto]) : '';
  const story = useRef<{ key: string; blob: Promise<Blob | null> } | null>(null);
  const makeStory = (): Promise<Blob | null> | null => {
    if (!storyIn) return null;
    if (story.current?.key === storyKey) return story.current.blob;
    const s = storyIn;
    const blob = (posterPath ? signReelPaths([posterPath]).then((m) => m[posterPath] || null).catch(() => null) : Promise.resolve(null))
      .then((poster) => cardBlob({ ...s, hero: poster || props.myPhoto }));
    story.current = { key: storyKey, blob };
    return blob;
  };
  const [storyBusy, setStoryBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastT = useRef<number>();
  const flash = (m: string) => { setToastMsg(m); window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToastMsg(''), 4200); };
  useEffect(() => () => window.clearTimeout(toastT.current), []);
  useEffect(() => {
    if (!storyKey || latest === undefined) return;
    const t = window.setTimeout(() => { void makeStory(); }, 900);   // after the board has painted
    return () => window.clearTimeout(t);
  }, [storyKey, latest]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shareStory = async () => {
    const p = makeStory();
    if (!p || !storyIn) return;
    setStoryBusy(true);
    try {
      await shareCard(await p, { name: storyFileName(storyIn.moment, storyIn.rank), caption: cardCaption(lang, storyIn.moment), link: lineOut(storyLink),
        copy: copyLink, toast: flash, copied: linkCopiedToast(lang) });
    } finally { setStoryBusy(false); }
  };
  // board-1 v3: the pinned row is ONE line ("You’re #1 · 54 Rings ahead" / "#4 · 6 Rings to #3"); the bar only while chasing the next rank
  const pin = ((): { text: React.ReactNode; chase: boolean; pct: number } => {
    const gp = data?.gap;
    if (!gp || !gp.rank) return { text: <>{own.l1}{own.l2 ? <> · {own.l2}</> : null}</>, chase: false, pct: 0 };
    if (gp.state === 'top') return { text: C.top(gp.behind?.diff ?? null), chase: false, pct: 100 };
    if (gp.state === 'floor' || (prog.below && gp.rings > 0)) return { text: `${C.rankOnly(gp.rank)} · ${Lf('{0} more Rings for a prize seat', fmtN(prog.need))}`, chase: true, pct: prog.pct };
    const t = gp.target;
    if (t && t.need > 0) return { text: C.chase(gp.rank, t.need, t.rank), chase: true, pct: Math.max(6, Math.min(96, Math.round((gp.rings * 100) / (gp.rings + t.need)))) };
    return { text: C.rankOnly(gp.rank), chase: false, pct: 0 };
  })();
  const delta = props.myId && data?.gap?.rank ? rankDelta(seenRankAtStart(props.myId), data.week_start, data.gap.rank) : null;
  const TONE: Record<number, Tone> = { 1: 'gold', 2: 'blue', 3: 'rose' };
  return (
    <div className={`kx-page kx-rk bx rv5${low ? ' lowfx' : ''}${lang === 'th' ? ' lth' : ''}`} id="kxRanking" lang={lang}>
      <div className="bx-bg" aria-hidden="true" />
      <div className="bx-top">
        <button type="button" className="kx-bk bx-bk" aria-label={L('Back')} onClick={props.onBack}><BackIcon /></button>
        <div className="bx-tt">
          <h1>{L('Weekly Ranking')}<Crown tone="gold" w={24} cls="bx-tcr" /></h1>
          <p className="bx-sub" id="kxBoardSub">
            <span className={`bx-cd m-${clock.mode}${clock.mode !== 'week' ? ' day' : ''}${hot ? ' hot' : ''}`} id="kxCountdown" data-hot={hot ? '1' : '0'} data-mode={clock.mode}
              role="timer" aria-label={`${C.cdLabel} ${clock.text}`}><Stopwatch /><span className="t">{clock.text}</span></span>
            <span className="bx-live" id="kxLive"><i aria-hidden="true" />{L('Live')}</span>
          </p>
          {/* 22 Nov founder: after the close, anyone can replay last week's top 10 (opens the week-close celebration, everyone view) */}
          <button type="button" className="bx-lw" id="kxLastWeek" onClick={() => window.dispatchEvent(new Event('kr8:lastweek'))}>
            🏆 {lang === 'th' ? 'ผลสัปดาห์ที่แล้ว' : 'Last week’s winners'} <b aria-hidden="true">›</b>
          </button>
        </div>
        <button type="button" className="bx-i" id="kxWinOpen" aria-label={L('How to win')} onClick={() => (wr ? setWin(true) : setHow(true))}><InfoIcon /></button>
      </div>
      {data === null && !err ? <p className="kx-empty pad">…</p> : err ? <p className="kx-empty pad">{L('Couldn’t reach Kring. Check your connection and try again.')}</p> : (
        <>
          <div className="bx-pod" id="kxPodium">
            <i className="bx-aura" aria-hidden="true" />
            {[2, 1, 3].map((rank) => {
              const r = at(rank);
              const pz = prizes[rank - 1] || 0;
              const n = rank as 1 | 2 | 3;
              return (
                <div key={rank} className={`bx-pc p${rank}${r ? '' : ' open'}${r?.is_me ? ' me' : ''}${r?.needs ? ' low' : ''}`}>
                  <i className={`bx-beam b${rank}`} aria-hidden="true" />
                  <div className="bx-ph">
                    <Crown tone={TONE[rank]} w={rank === 1 ? 40 : 30} cls="bx-crown" />
                    {r ? (
                      <button type="button" className="bx-img" data-rank={rank} aria-label={r.is_me ? L('You') : r.first_name} onClick={() => setMath(r.user_id)}
                        style={r.photo ? { backgroundImage: `url('${r.photo}')` } : undefined}>{r.photo ? '' : (r.first_name || '?').charAt(0).toUpperCase()}</button>
                    ) : (
                      <button type="button" className="bx-img empty" data-seat="open" aria-label={L('Your spot?')} onClick={props.onPost}><PlusIcon /></button>
                    )}
                    <Medal n={n} />
                  </div>
                  <span className="bx-nm">{r ? (r.is_me ? L('You') : r.first_name) : L('Your spot?')}</span>
                  {r ? Score({ r, cls: 'bx-r' }) : <span className="bx-r none">&nbsp;</span>}
                  {pz > 0 ? <b className={`bx-pz${r && !r.paid ? ' off' : ''}`} data-prize={pz}>{baht(pz)}{unlock(r)}</b> : <b className="bx-pz none">&nbsp;</b>}
                  <i className={`bx-pool p${rank}`} aria-hidden="true" />
                </div>
              );
            })}
          </div>
          {data && !data.payout_on ? <p className="kx-rk-note bx-note" id="kxPayoutNote">{Lf('Prizes start when {0} Locals are on the board this week', String(data.min_posters))}</p> : null}
          <div className="kx-list bx-list" id="kxRankList">
            {Array.from({ length: Math.max(0, paid - 3) }, (_, i) => i + 4).map((rank) => { const r = at(rank); return <React.Fragment key={rank}>{r ? Row({ r }) : Seat({ rank })}</React.Fragment>; })}
            {rows.some((r) => r.rank > paid) || floorNote
              ? <div className="kx-div bx-line" id="kxPrizeLine" data-floor={data?.floor ?? 0} aria-label={floorNote ? Lf('PRIZE LINE · {0} RINGS TO TAKE A SEAT', String(data?.floor ?? 0)) : L('PRIZE LINE')}>
                <span>{floorNote ? <>{C.prizeLine(data?.floor ?? 0)} <RingGlyph /></> : C.prizeLine(paid).replace(/ · \d+$/, '')}</span></div> : null}
            {rows.filter((r) => r.rank > paid).map((r) => <React.Fragment key={r.user_id}>{Row({ r })}</React.Fragment>)}
          </div>
          {/* Retention 10 (feature 10): members who joined this week, same Rings as the board */}
          <NewcomersLeague lang={lang} onPerson={(id) => setMath(id)} />
        </>
      )}
      <div className="bx-endpad" />
      <div className="bx-pin" id="kxPin">
        {toast && rv ? <RingToast v={rv} lang={lang} pts={wr?.save ?? 3} who="Mint" act="save" /> : null}
        {toastMsg ? <p className="bx-toast" id="kxStoryToast" role="status" lang={lang === 'th' ? 'th' : 'en'}>{toastMsg}</p> : null}
        {props.myId && data ? (
          <div className="bx-you" id="kxMeRow" data-state={own.key} role="button" tabIndex={0}
            onClick={() => { if (own.btn !== 'post' && own.key !== 'review') setMath(props.myId); }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && own.btn !== 'post') setMath(props.myId); }}>
            <span className="rka-meph bx-ra me">
              <Av photo={props.myPhoto} name={props.myName} size={42} />
              {props.needsVerify && props.onVerify ? (
                <button type="button" className="rka-vfy" id="kxVerifyNudge" onClick={(e) => { e.stopPropagation(); props.onVerify?.(); }}
                  aria-label={lang === 'th' ? 'ยืนยันใบหน้าสั้น ๆ ให้พร้อมรับรางวัล' : 'Quick face check, so you’re ready to claim prizes'}
                  title={lang === 'th' ? 'ยืนยันใบหน้าสั้น ๆ ให้พร้อมรับรางวัล' : 'Quick face check, so you’re ready to claim prizes'}>
                  {lang === 'th' ? <span lang="th">ยืนยันหน้า</span> : <small lang="en">verify</small>}
                </button>
              ) : null}
            </span>
            <span className="t">
              <span className="l1" id="kxMeNext">{pin.text}{delta ? <i className={`bx-up${delta > 0 ? '' : ' dn'}`} id="kxRankMove">{C.up(delta)}</i> : null}</span>
              {pin.chase ? <span className="bx-bar" id="kxMeBar" data-pct={pin.pct} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pin.pct}><i style={{ width: `${pin.pct}%` }} /></span> : null}
            </span>
          </div>
        ) : props.myId && !err ? (
          // K-006 (18 Nov): keeps my row's place while the board loads, so the button does not jump up when it arrives (CLS)
          <div className="bx-you bx-you-wait" aria-hidden="true" />
        ) : null}
        {props.onShareWin && props.myId && data ? (
          <button type="button" className="bx-swin" id="kxShareWinOpen" lang={lang === 'th' ? 'th' : 'en'} onClick={props.onShareWin}>
            <ShareIcon />{lang === 'th' ? 'แชร์รับริง' : 'Share & win Rings'} ›
          </button>
        ) : null}
        <button type="button" className={`bx-cta${share ? ' share' : ' post'}`} id="kxBoardCta" data-act={share ? 'share' : 'post'} aria-busy={latest === undefined}
          aria-haspopup={share && canStory ? 'dialog' : undefined}
          onPointerDown={() => { if (latest) { props.onShareDown?.(latest); if (canStory) void makeStory(); } }}
          onClick={() => { if (latest) { if (canStory) setShareOpen(true); else props.onShare(latest); } else if (latest === null) props.onPost(); }}>
          <span className="ic">{share ? <ShareIcon /> : <PlusIcon />}</span>
          <span className="tx">{share ? C.share : postLabel}</span>
        </button>
      </div>
      {math ? <MathSheet L={L} Lf={Lf} lang={lang} user={math} onClose={() => setMath(null)} onHow={() => { setMath(null); setHow(true); }}
        onProfile={(id) => { setMath(null); props.onPerson(id); }}
        onShare={(reel) => { setMath(null); if (reel) props.onShare(reel); else props.onPost(); }} /> : null}
      {how ? <HowSheet L={L} onClose={() => setHow(false)} /> : null}
      {wr && win ? <WinSheet v={rv || 'C'} lang={lang} r={wr} glass onClose={() => setWin(false)} extra={<SeatsLine L={L} Lf={Lf} lang={lang} left={seatsLeft} />} /> : null}
      {shareOpen && latest ? (
        <div className="kx-shbg bx-shbg" onClick={() => setShareOpen(false)}>
          <div className="bx-sharesheet" id="kxShareSheet" role="dialog" aria-label={C.shareTitle} lang={lang === 'th' ? 'th' : 'en'} onClick={(e) => e.stopPropagation()}>
            <span className="grab" />
            <div className="bx-two">
              <button type="button" className="bx-pick" id="kxShareReel" onClick={() => { setShareOpen(false); props.onShare(latest); }}>
                <span className="ic"><ShareIcon /></span><span className="tx">{C.myReel}</span>
              </button>
              <button type="button" className="bx-pick" id="kxShareRank" aria-label={storyButtonLabel(lang)} aria-busy={storyBusy} onClick={() => { setShareOpen(false); void shareStory(); }}>
                <span className="ic"><StoryIcon /></span><span className="tx">{C.myRank}</span>
              </button>
            </div>
            <InviteHint lang={lang} x={cfg?.invite} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
