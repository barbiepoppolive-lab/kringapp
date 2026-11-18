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
import { BackIcon, Crown, Disc, InfoIcon, Medal, PlusIcon, ShareIcon, type Tone } from './BoardArt';
import { refCode } from './invite';
import { rankStoryBlob, shareRankStory, storyButton, storyButtonLabel, type RankStory } from './rankStory';

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
export const baht = (n: number) => `฿${fmtN(n)}`;
export const ringsText = (L: Tx, Lf: Txf, n: number) => (n === 1 ? L('1 Ring') : Lf('{0} Rings', fmtN(n)));

/** The exact founder copy (EN) with a natural Thai version in KX_L. */
export const HOW_RINGS = 'Bangkok’s best Reels, chosen by the people who love the city. A like is 1 Ring. A save is 3. Each person who opens your Reel from Instagram or TikTok is 5. When a visitor to Bangkok likes or saves your Reel, it counts double, because you showed someone the real city. Only your best Reel of the week counts. Tap any score to see how it adds up.';

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
export function MathSheet(props: { L: Tx; Lf: Txf; lang: string; user: string; onClose: () => void; onShare?: (reel: string | null) => void; onHow: () => void }) {
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
  if (!gap) return { n: '–', l1: L('Not on the board yet'), l2: L('One Reel at a place puts you on it'), btn: 'post', key: 'none' };
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
  if (mine && mine.pending > 0) return { n: '–', l1: <>{L('You')} · {L('in review')}</>, l2: L('Usually under 2 hours'), btn: null, key: 'review' };
  if (t && t.open && t.prize > 0) return { n: '–', l1: <>{Lf('Seat #{0} is open', String(t.rank))} · {baht(t.prize)}</>, l2: `${L('Post a Reel')} · ${Lf('reach {0}', rt(Math.max(1, g.floor)))}`, btn: 'post', key: 'open' };
  return { n: '–', l1: L('Not on the board yet'), l2: L('One Reel at a place puts you on it'), btn: 'post', key: 'none' };
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
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  useEffect(() => {
    let dead = false;
    Promise.resolve(kxRules()).then((c) => { if (!dead) setCfg(c || null); }).catch(() => undefined);
    Promise.resolve(kxSeatsLeft()).then((n) => { if (!dead) setSeatsLeft(typeof n === 'number' ? n : null); }).catch(() => undefined);
    kxRanking('all').then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
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
    Promise.resolve(kxCardExtras()).then((x) => { if (!dead) setMyNo(x?.member_no ?? null); }).catch(() => undefined);
    return () => { dead = true; };
  }, [props.myId]);
  const end = data?.ends_at ? Date.parse(data.ends_at) || weekEnd(now) : weekEnd(now);
  const hot = isLastHours(now, end);
  const close = closeLine(Lf, lang, now, end);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), hot ? 1000 : 15000); return () => window.clearInterval(id); }, [hot]);
  const rows = data?.rows || [];
  const paid = data?.paid_ranks ?? 8;
  const prizes = data?.prizes || [];
  const at = (rank: number) => rows.find((r) => r.rank === rank);
  const own = ownRow(L, Lf, data?.gap, data?.mine);
  const wr = winRules(cfg, data);
  const floor = data?.floor ?? wr?.floor ?? 25;
  const prog = floorProgress(data?.gap?.rings ?? 0, floor);
  const youLine = prog.below && (data?.gap?.rings ?? 0) > 0 && ['board', 'far', 'zero'].includes(own.key) ? Lf('{0} more Rings for a prize seat', fmtN(prog.need)) : own.l2;
  const floorNote = !!data && data.floor > 0 && (data.open_seats > 0 || rows.some((r) => r.needs));
  const postLabel = lang === 'th' ? 'โพสต์คลิป' : L('Post a Reel');   // founder copy for this button (the app says โพสต์รีล elsewhere)
  const share = latest !== null;
  // board-1 (Kring Light): "X more Rings to be eligible" only on MY row; other rows under the floor show a dimmed prize (the prize line says why)
  const elig = (r: KxRankRow) => (r.needs && r.is_me ? <em className="rka-elig">{Lf('{0} more Rings to be eligible', fmtN(Math.max(1, r.needs - r.rings)))}</em> : null);
  // plain render functions (not components): the countdown re-render must not remount rows
  const Score = ({ r, cls }: { r: KxRankRow; cls: string }) => (
    <button type="button" className={cls} data-score={r.rings} aria-label={L('See the math')} onClick={(e) => { e.stopPropagation(); setMath(r.user_id); }}>
      <RingGlyph />{ringsText(L, Lf, r.rings)}{elig(r)}
    </button>
  );
  const Row = ({ r }: { r: KxRankRow }) => (
    <div className={`kx-row bx-row${r.is_me ? ' mer' : ''}${r.needs ? ' low' : ''}${r.rank > paid ? ' plain' : ''}`} data-rank={r.rank}>
      <button type="button" className="who" onClick={() => props.onPerson(r.user_id)} aria-label={r.is_me ? L('You') : r.first_name}>
        <span className="n">{r.rank}</span>
        <span className={`bx-ra ${RING_CLS[r.rank % 4]}`}><Av photo={r.photo} name={r.first_name} size={36} /></span>
      </button>
      <span className="bx-rt">
        <button type="button" className="t" onClick={() => props.onPerson(r.user_id)}>{r.is_me ? L('You') : r.first_name}{r.is_new && !r.is_me ? <i className="nw">{L('NEW')}</i> : null}</button>
        {Score({ r, cls: 'kx-sc bx-sc' })}
      </span>
      {r.prize > 0 && r.all_rank <= paid
        ? <span className={`kx-pz${r.paid ? '' : ' off'}`} data-prize={r.prize}>{baht(r.prize)}</span>
        : <span className="kx-tl">{r.to_line ? Lf('{0} to #{1}', fmtN(r.to_line), String(paid)) : ''}</span>}
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
  const storyIn: RankStory | null = canStory && g?.rank ? {
    lang: lang === 'th' ? 'th' : 'en', rank: g.rank, rings: g.rings, prize: g.prize_now > 0 ? g.prize_now : 0, name: props.myName, photo: props.myPhoto, poster: null,
    code: refCode(myNo), link: `${location.origin}${import.meta.env.BASE_URL || '/'}${refCode(myNo) ? `?ref=${refCode(myNo)}` : ''}`,
  } : null;
  const storyKey = storyIn ? JSON.stringify([storyIn, posterPath]) : '';
  const story = useRef<{ key: string; blob: Promise<Blob | null> } | null>(null);
  const makeStory = (): Promise<Blob | null> | null => {
    if (!storyIn) return null;
    if (story.current?.key === storyKey) return story.current.blob;
    const s = storyIn;
    const blob = (posterPath ? signReelPaths([posterPath]).then((m) => m[posterPath] || null).catch(() => null) : Promise.resolve(null))
      .then((poster) => rankStoryBlob({ ...s, poster }));
    story.current = { key: storyKey, blob };
    return blob;
  };
  const [storyBusy, setStoryBusy] = useState(false);
  useEffect(() => {
    if (!storyKey || latest === undefined) return;
    const t = window.setTimeout(() => { void makeStory(); }, 900);   // after the board has painted
    return () => window.clearTimeout(t);
  }, [storyKey, latest]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shareStory = async () => {
    const p = makeStory();
    if (!p || !storyIn) return;
    setStoryBusy(true);
    try { await shareRankStory(await p, storyIn.rank); } finally { setStoryBusy(false); }
  };
  const TONE: Record<number, Tone> = { 1: 'gold', 2: 'blue', 3: 'rose' };
  return (
    <div className={`kx-page kx-rk bx${low ? ' lowfx' : ''}${lang === 'th' ? ' lth' : ''}`} id="kxRanking" lang={lang}>
      <div className="bx-bg" aria-hidden="true" />
      <div className="bx-top">
        <button type="button" className="kx-bk bx-bk" aria-label={L('Back')} onClick={props.onBack}><BackIcon /></button>
        <div className="bx-tt">
          <h1>{L('Weekly Ranking')}<Crown tone="gold" w={24} cls="bx-tcr" /></h1>
          <p className="bx-sub" id="kxBoardSub">
            <span className={`bx-cd${close.soon ? ' soon' : ''}${hot ? ' hot' : ''}`} id="kxCountdown" data-hot={hot ? '1' : '0'}>{close.text}</span>
            {seatsOk(seatsLeft) ? <> · <span id="kxSeatsLeft" data-left={Math.min(seatsLeft, PAID_SEATS)}>{Lf('{0}/{1} seats left', String(Math.min(seatsLeft, PAID_SEATS)), String(PAID_SEATS))}</span></> : null}
          </p>
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
                      <button type="button" className="bx-img" data-rank={rank} aria-label={r.is_me ? L('You') : r.first_name} onClick={() => props.onPerson(r.user_id)}
                        style={r.photo ? { backgroundImage: `url('${r.photo}')` } : undefined}>{r.photo ? '' : (r.first_name || '?').charAt(0).toUpperCase()}</button>
                    ) : (
                      <button type="button" className="bx-img empty" data-seat="open" aria-label={L('Your spot?')} onClick={props.onPost}><PlusIcon /></button>
                    )}
                    <Medal n={n} />
                  </div>
                  <span className="bx-nm">{r ? (r.is_me ? L('You') : r.first_name) : L('Your spot?')}</span>
                  {r ? Score({ r, cls: 'bx-r' }) : <span className="bx-r none">&nbsp;</span>}
                  {pz > 0 ? <b className={`bx-pz${r && !r.paid ? ' off' : ''}`} data-prize={pz}>{baht(pz)}</b> : <b className="bx-pz none">&nbsp;</b>}
                  <Disc tone={rank === 1 ? 'gold' : rank === 2 ? 'blue' : 'pink'} w={rank === 1 ? 116 : 92} h={rank === 1 ? 18 : 10} />
                </div>
              );
            })}
          </div>
          {data && !data.payout_on ? <p className="kx-rk-note bx-note" id="kxPayoutNote">{Lf('Prizes start when {0} Locals are on the board this week', String(data.min_posters))}</p> : null}
          <div className="kx-list bx-list" id="kxRankList">
            {Array.from({ length: Math.max(0, paid - 3) }, (_, i) => i + 4).map((rank) => { const r = at(rank); return <React.Fragment key={rank}>{r ? Row({ r }) : Seat({ rank })}</React.Fragment>; })}
            {rows.some((r) => r.rank > paid) || floorNote
              ? <div className="kx-div bx-line" id="kxPrizeLine"><span>{floorNote ? Lf('PRIZE LINE · {0} RINGS TO TAKE A SEAT', String(data?.floor ?? 0)) : L('PRIZE LINE')}</span></div> : null}
            {rows.filter((r) => r.rank > paid).map((r) => <React.Fragment key={r.user_id}>{Row({ r })}</React.Fragment>)}
          </div>
        </>
      )}
      <div className="bx-endpad" />
      <div className="bx-pin" id="kxPin">
        {toast && rv ? <RingToast v={rv} lang={lang} pts={wr?.save ?? 3} who="Mint" act="save" /> : null}
        {props.myId && data ? (
          <div className="bx-you" id="kxMeRow" data-state={own.key} role="button" tabIndex={0}
            onClick={() => { if (own.btn !== 'post' && own.key !== 'review') setMath(props.myId); }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && own.btn !== 'post') setMath(props.myId); }}>
            <span className="n">{/^\d+$/.test(own.n) ? `#${own.n}` : own.n}</span>
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
              <span className="l1">{own.l1}</span>
              <small id="kxMeNext">{youLine}</small>
              <span className={`bx-bar${prog.below ? '' : ' full'}`} id="kxMeBar" data-pct={prog.pct} data-floor={floor}
                role="progressbar" aria-valuemin={0} aria-valuemax={floor} aria-valuenow={Math.min(floor, data.gap?.rings ?? 0)}><i style={{ width: `${prog.pct}%` }} /></span>
            </span>
          </div>
        ) : props.myId && !err ? (
          // K-006 (18 Nov): keeps my row's place while the board loads, so the button does not jump up when it arrives (CLS)
          <div className="bx-you bx-you-wait" aria-hidden="true" />
        ) : null}
        <div className={`bx-ctas${canStory ? ' two' : ''}`}>
          <button type="button" className={`bx-cta${share ? ' share' : ' post'}`} id="kxBoardCta" data-act={share ? 'share' : 'post'} aria-busy={latest === undefined}
            onPointerDown={() => { if (latest) props.onShareDown?.(latest); }}
            onClick={() => { if (latest) props.onShare(latest); else if (latest === null) props.onPost(); }}>
            <span className="ic">{share ? <ShareIcon /> : <PlusIcon />}</span>
            <span className="tx">{share ? L('Share my Reel') : postLabel}</span>
          </button>
          {canStory ? (
            <button type="button" className="bx-story" id="kxShareRank" aria-label={storyButtonLabel(lang)} aria-busy={storyBusy}
              onPointerDown={() => { void makeStory(); }} onClick={() => { void shareStory(); }}>
              <span className="ic" aria-hidden="true"><StoryIcon /></span>
              <span className="tx" lang={lang === 'th' ? 'th' : 'en'}>{storyButton(lang)}</span>
            </button>
          ) : null}
        </div>
        {share ? <InviteHint lang={lang} x={cfg?.invite} /> : null}
      </div>
      {math ? <MathSheet L={L} Lf={Lf} lang={lang} user={math} onClose={() => setMath(null)} onHow={() => { setMath(null); setHow(true); }}
        onShare={(reel) => { setMath(null); if (reel) props.onShare(reel); else props.onPost(); }} /> : null}
      {how ? <HowSheet L={L} onClose={() => setHow(false)} /> : null}
      {wr && win ? <WinSheet v={rv || 'C'} lang={lang} r={wr} glass onClose={() => setWin(false)} /> : null}
    </div>
  );
}
