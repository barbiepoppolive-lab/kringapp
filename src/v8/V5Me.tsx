/**
 * Me tab (LOCKED by the founder 10 Nov 01:28 IST): member card, follow, activity, someone else's profile.
 * (The old Top 5 board + its card pill were removed 16 Nov: the weekly board is the Ranking sheet, Top 8 from kr8_rings_config.)
 * Visual source: scratch/opus_venue/me_tab_locked_10nov/ (me_tab_locked.html, top10_sheet.html, follow_screens.html).
 * Calm luxe #0B0A12, hairlines, Bricolage light numbers, spaced caps. No yellow anywhere (monarchy rule).
 * One language per screen: every visible string goes through L().
 */
import { rvArea, rvLangs } from './rvLabels';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { rvHeroIn, rvSettle } from './rvMotion';
import './me.css';
import './meA.css';
import type { V5Activity, V5FollowRow, V5Level, V5Profile } from './v5Live';
import { NeonCard, progLine, RingGlyph } from './V5KxCard';
import { isStandalone, openInstallSheet } from './A2HS';
import { fmtN, isNotYetNote, levelFor, reviewNoteText } from './kxLogic';
import type { KxCardExtras } from './v5Kx';
import { fvMarkShown, fvText } from './V5Unverified';
import { postAgo } from './postTime';
import './meChip.css';
import { ProfileBadges } from './badges';

// ── pre-season (D-11NOV-G): the board ranks from day one; rewards start on kr8_settings.reward_start_at ──
const LOCALE: Record<string, string> = { th: 'th-TH', zh: 'zh-CN', hi: 'hi-IN', ja: 'ja-JP', ko: 'ko-KR' };
/** "1 Dec" / "1 ธ.ค." in the member's language, Bangkok calendar day. */
export function fmtRewardDay(start: number, lang: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang] || 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(start);
}
export const rewardsOpen = (start: number, now = Date.now()) => now >= start;
type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

export const LEVEL_NAME: Record<V5Level, string> = { anchan: 'Anchan member', tea: 'Thai tea member', pandan: 'Pandan member' };
export const LANG_NAME: Record<string, string> = { TH: 'Thai', EN: 'English', ZH: 'Chinese', HI: 'Hindi', JA: 'Japanese', KO: 'Korean', FR: 'French', DE: 'German',
  ES: 'Spanish', RU: 'Russian', MS: 'Malay', ID: 'Indonesian', VI: 'Vietnamese', AR: 'Arabic' };
/** 0251: profile builder step 6. Key saved in kr8_members.qa_q → the English question (translated by L()). */
export const QA_QUESTIONS: Record<string, string> = { soi_shop: 'Which shop in your soi do you always go back to?' };
/** The member's answer to today's question, on their profile. Renders nothing without an answer. */
export function QaLine(props: { L: Tx; q?: string | null; a?: string | null }) {
  const a = (props.a || '').trim();
  if (!a) return null;
  const q = props.q && QA_QUESTIONS[props.q];
  return (
    <p className="kpb-qa-card" id="profileQa">
      {q ? <small>{props.L(q)}</small> : null}
      <b>{a}</b>
    </p>
  );
}
export const INTEREST: Record<string, [string, string]> = {
  coffee: ['☕', 'Coffee'], street_food: ['🍜', 'Street food'], desserts: ['🍧', 'Desserts'], markets: ['🛍', 'Markets'], running: ['🏃', 'Running'],
  yoga: ['🧘', 'Yoga'], film_photos: ['📷', 'Film photos'], art: ['🎨', 'Art'], music: ['🎵', 'Music'], books: ['📚', 'Books'],
  language_exchange: ['💬', 'Language exchange'], board_games: ['🎲', 'Board games'], cooking: ['🍳', 'Cooking'], sunsets: ['🌇', 'Sunsets'],
  parks: ['🌳', 'Parks'], shopping: ['🛒', 'Shopping'], gaming: ['🎮', 'Gaming'], fitness: ['💪', 'Fitness'], cycling: ['🚲', 'Cycling'],
  volunteering: ['🤝', 'Volunteering'],
};

export function fmtCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
const initial = (s: string) => (s || '?').trim().charAt(0).toUpperCase();

/** Next 19:00 in Bangkok (UTC+7, no daylight saving) */
export function untilWinners(now = Date.now()): string {
  const bkk = new Date(now + 7 * 3600_000);
  const t = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + 1, 0, 0, 0) - 7 * 3600_000;
  const next = t > now ? t : t + 86400_000;
  const mins = Math.max(0, Math.round((next - now) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

function Avatar({ photo, name, size }: { photo: string | null; name: string; size?: number }) {
  return photo ? (
    <span className="kme-av" style={{ backgroundImage: `url('${photo}')`, width: size, height: size }} />
  ) : (
    <span className="kme-av kme-av-i" style={{ width: size, height: size }}>{initial(name)}</span>
  );
}

/** N2 neon card (locked 14 Nov): full photo, small name, LV + #member number, IG / TikTok pills. Level from lifetime Rings. */
export function KxMemberCard(props: { L: Tx; Lf: Txf; p: V5Profile; kx: KxCardExtras | null | undefined; compact?: boolean; gender?: string | null }) {
  const { L, Lf, p, kx } = props;
  const langs = (p.langs || []).slice(0, 2).map((c) => L(LANG_NAME[c] || c)).join(' · ');
  const where = rvArea(L(p.area === 'Bangkok' ? 'Bangkok' : p.area));
  const lv = levelFor(kx?.lifetime ?? 0);
  return (
    <div className={`kx-mecard${props.compact ? ' compact' : ''}`}>
      <NeonCard L={L} id={p.mine ? 'meCard' : 'profileCard'} photo={p.photo} name={p.first_name} level={kx?.level ?? lv.n} no={kx?.member_no ?? null}
        ig={kx ? kx.ig_handle : p.ig_handle} tt={kx?.tiktok_handle ?? null} size="me" compact={props.compact}
        founding={kx?.founding_no ?? null} gender={props.gender ?? null}
        sub={[where, langs].filter(Boolean).join(' · ') + (p.verified ? ` · ✓ ${L('verified')}` : '')}
        prog={{ pct: lv.pct, line: progLine(L, Lf, lv) }} />
    </div>
  );
}

/** ✓ that draws itself once (ChatGPT motion: "task / verified → draw a small ✓") */
export const RvCheck = ({ L }: { L: Tx }) => (
  <svg className="rv-chk" viewBox="0 0 20 20" role="img" aria-label={L('verified')}><circle cx="10" cy="10" r="9" /><path d="M5.8 10.4l2.8 2.7 5.6-6" /></svg>
);

/**
 * Revamp Phase 1 (ChatGPT): the person is the hero. Large natural photo, name ✓, city · languages, short bio.
 * No level badge, no neon frame, no glow. Used by Me (with the edit pencil) and by a member's profile.
 */
export function RvIdentity(props: { L: Tx; p: V5Profile; id: string; hero?: boolean; tools?: React.ReactNode; extra?: React.ReactNode }) {
  const { L, p } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (props.hero) rvHeroIn(ref.current); }, [props.hero]);
  const where = p.who === 'traveller' ? [L('Traveller'), rvArea(L(p.area))].filter(Boolean).join(' · ') : rvArea(L(p.area === 'Bangkok' ? 'Bangkok' : p.area));
  const langs = rvLangs(p.langs || [], 3);
  return (
    <section className="rv-id" id={props.id} aria-label={p.first_name}>
      <div className="rv-idph" ref={ref} style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined}>
        {p.photo ? null : <span className="rv-idini" aria-hidden="true">{initial(p.first_name)}</span>}
        {props.tools}
      </div>
      <h2 className="rv-idnm">{p.first_name}{p.verified ? <RvCheck L={L} /> : null}</h2>
      <p className="rv-idsub">{[where, langs].filter(Boolean).join(' · ')}</p>
      {props.extra}
      {p.bio ? <p className="rv-idbio">{p.bio}</p> : null}
    </section>
  );
}

function Stats(props: { L: Tx; p: V5Profile; onList: (k: 'followers' | 'following') => void }) {
  const { L, p } = props;
  return (
    <div className="kme-st">
      <button type="button" id="statFollowers" onClick={() => props.onList('followers')}><b>{fmtCount(p.followers)}</b><span className="cap">{L('Followers')}</span></button>
      <button type="button" id="statFollowing" onClick={() => props.onList('following')}><b>{fmtCount(p.following)}</b><span className="cap">{L('Following')}</span></button>
      <div><b>{fmtCount(p.likes)}</b><span className="cap">{L('Likes')}</span></div>
    </div>
  );
}

function ReelRow(props: { reels: V5Profile['reels']; posters: Record<string, string>; onOpen: (id: string) => void; pending?: string }) {
  return (
    <div className="kme-mom">
      {/* 24 Nov audit: this was sliced to 9 with no "see all", so a member's 10th Reel onward simply vanished from
          their profile — worst for the most active members. The grid shows everything they have. */}
      {props.reels.map((r) => (
        <button type="button" key={r.id} data-reel-tile={r.id} onClick={() => props.onOpen(r.id)}
          style={props.posters[r.poster_path] ? { backgroundImage: `url('${props.posters[r.poster_path]}')` } : undefined}>
          {r.status === 'pending' && props.pending ? <span className="pend">{props.pending}</span> : null}
          {r.likes ? <span className="lk">♥ {fmtCount(r.likes)}</span> : null}
        </button>
      ))}
    </div>
  );
}


/** 19 Nov (founder, card A): show in pictures that weak Reels are not accepted (✓ you at a real place · ✕ copied · ✕ dark at home) */
export function ReelStamps(props: { L: Tx }) {
  const { L } = props;
  const one = (src: string, ok: boolean, tag: string) => (
    <div className={`kx-rs-th${ok ? '' : ' no'}`} style={{ backgroundImage: `url('${(import.meta.env.BASE_URL || '/app/').replace(/\/?$/, '/')}media/${src}')` }}>
      <span className={`kx-rs-stamp ${ok ? 'ok' : 'no'}`}>{ok ? `✓ ${L('Accepted')}` : `✕ ${L('Not accepted')}`}</span>
      <span className="kx-rs-tag">{L(tag)}</span>
    </div>
  );
  return (
    <div className="kx-rs" id="kxReelStamps">
      <p className="kx-rs-h">{L('Every Reel is checked by our team before it goes live.')}</p>
      <div className="kx-rs-row">{one('reel_ok.jpg', true, 'You · real place')}{one('reel_copied.jpg', false, 'Copied TikTok')}{one('reel_dark.jpg', false, 'Dark · at home')}</div>
    </div>
  );
}

/**
 * "Founding Local · ฿100": three steps under the card, step 1 already ticked (mock m5). Shows until the member is a Founding Local;
 * when all the spots are taken it becomes "3 steps to the board" with no ฿. The spots-left number is the true count from the server.
 */
export type WeekHookData = { rank: number | null; prize: number; toLine: number | null; top: number; needs?: number | null;
  /** 21 Nov: within 10 Rings of the next prize rank (or of the 25-Ring line) → "{n} Rings from ฿{prize} · one Story could do it" */
  near?: { n: number; prize: number } | null };

/**
 * 20 Nov fix ("You're #1 ฿900" for a test member): the board's me.rank is the rank inside the loaded scope (area / friends / with
 * blocked members hidden), but the prize is paid on the city-wide rank. The Me line now reads the city-wide rank (all_rank) and that
 * rank's prize, so #1 always reads ฿1,500. A seat under the Rings floor shows its prize greyed with "25 Rings to unlock".
 */
export function kxWeekHook(w: { me: { rank: number; all_rank?: number; rings: number; prize: number } | null; rows?: { all_rank?: number; rank: number; rings: number; is_me: boolean; to_line: number | null; needs?: number | null }[];
  paid_ranks?: number; prizes?: number[]; floor?: number } | null | undefined, ladderTop = 0): WeekHookData {
  const me = w?.me || null;
  const rank = me ? (me.all_rank || me.rank) : null;
  const paid = w?.paid_ranks || 8;
  const prize = rank && rank <= paid ? (w?.prizes?.[rank - 1] ?? me?.prize ?? 0) : 0;
  const row = w?.rows?.find((r) => r.is_me);
  const lineRow = w?.rows?.find((r) => (r.all_rank || r.rank) === paid);
  const toLine = rank && rank > paid ? (row?.to_line ?? (lineRow && me ? Math.max(1, lineRow.rings - me.rings + 1) : null)) : null;
  const flr = w?.floor ?? 25;
  const needs = prize > 0 && me && me.rings < flr ? flr : null;
  return { rank, prize, toLine, top: w?.prizes?.[0] || ladderTop || 0, needs, near: nearPrize(w, rank, prize, paid, flr) };
}

/** 21 Nov: the next prize step when it is 10 Rings away or less. In a prize seat under 25 Rings: the 25-Ring line for that prize.
 *  In a prize seat: the rank above (its Rings + 1). Outside the prizes: the last paid seat (or just the 25-Ring line if that seat is open). */
export function nearPrize(w: { me: { rings: number } | null; rows?: { all_rank?: number; rank: number; rings: number }[]; prizes?: number[] } | null | undefined,
  rank: number | null, prize: number, paid: number, flr: number): { n: number; prize: number } | null {
  const me = w?.me;
  if (!me || !rank) return null;
  const R = me.rings || 0;
  const at = (k: number) => w?.rows?.find((r) => (r.all_rank || r.rank) === k);
  let n = 0, pz = 0;
  if (prize > 0 && R < flr) { n = flr - R; pz = prize; }
  else if (prize > 0 && rank > 1) { const up = at(rank - 1); if (up) { n = up.rings - R + 1; pz = w?.prizes?.[rank - 2] ?? 0; } }
  else if (rank > paid) { const lr = at(paid); n = Math.max(flr - R, lr && lr.rings >= flr ? lr.rings - R + 1 : 0); pz = w?.prizes?.[paid - 1] ?? 0; }
  return n > 0 && n <= 10 && pz > 0 ? { n, prize: pz } : null;
}

/**
 * 20 Nov founder ("Remove those 0 of 50. We need put something catchy instead"): Founding Local seats are gone, so Me sells this
 * week's board in one tappable line. Not on the board: "Be Bangkok's face of the week · #1 wins ฿1,500". On the board but outside the
 * prizes: "You're #14 · 23 Rings to the prize line". In the prizes: "You're #3 · ฿600 this week 🏆". Tapping opens the weekly ranking.
 */
export function WeekHook(props: { L: Tx; Lf: Txf; hook: WeekHookData; onRanking?: () => void; onPost: () => void }) {
  const { L, Lf, hook: h } = props;
  const baht = (n: number) => `฿${fmtN(n)}`;
  const inPrize = !!h.rank && h.prize > 0;
  const locked = inPrize && !!h.needs;
  const onBoard = !!h.rank;
  const line = inPrize ? (h.needs ? `${Lf('You’re #{0} · {1}', String(h.rank), baht(h.prize))} · ${Lf('{0} Rings to unlock', fmtN(h.needs))}` : Lf('You’re #{0} · {1} this week 🏆', String(h.rank), baht(h.prize)))
    : onBoard && h.toLine ? Lf('You’re #{0} · {1} Rings to the prize line', String(h.rank), fmtN(h.toLine))
    : h.top ? Lf('Be Bangkok’s face of the week · #1 wins {0}', baht(h.top)) : L('Climb this week’s board');
  return (
    <div className={`kx-hook${inPrize && !locked ? ' won' : locked ? ' locked' : ''}`} id="kxWeekHook" data-state={inPrize ? 'prize' : onBoard ? 'board' : 'off'}>
      <button type="button" className="kx-hook-t" id="kxWeekHookOpen" onClick={props.onRanking || props.onPost}>
        <span className="ic" aria-hidden="true">{inPrize ? '★' : '✦'}</span><b>{line}</b><i aria-hidden="true">›</i>
      </button>
      {!onBoard ? <button type="button" className="kx-hook-go" id="kxWeekHookPost" onClick={props.onPost}>{L('Post a Reel')}</button> : null}
    </div>
  );
}

export function FoundingChecklist(props: { L: Tx; Lf: Txf; kx: KxCardExtras | null | undefined; hasSocial: boolean; onLink: () => void; onPost: () => void;
  hook?: WeekHookData | null; onRanking?: () => void }) {
  const { L, Lf, kx } = props;
  if (!kx || kx.founding_left === undefined) return null;
  const open = (kx.founding_left ?? 0) > 0;
  // 20 Nov: seats gone. No "0 of 50", no ฿100 promise: the weekly-board hook instead (a member with no Reel yet sees it on the
  // "Your next step" card at the top, so it is not repeated here).
  if (!open) return kx.has_reel && props.hook ? <WeekHook L={L} Lf={Lf} hook={props.hook} onRanking={props.onRanking} onPost={props.onPost} /> : null;
  if (kx.founding_no) return null;
  // polish #4: one "Next step" card: only the next thing to do; gone when everything is done
  if (kx.has_reel || (!open && kx.has_reel)) return null;
  const amt = `฿${fmtN(kx.founding_thb ?? 100)}`;
  // audit P3-13: the server pays Founding Local for the first APPROVED Reel (rules page §4). Instagram / TikTok is not a step,
  // so it shows as an optional link, never as "step 2". Steps: 1 card ✓ · 2 post a Reel at a place · 3 Kring approves it.
  const [guide, setGuide] = useState(false);
  return (
    <div className="kx-fc kx-next rv-found" id="kxFounding" data-left={kx.founding_left ?? 0} data-step={2}>
      {/* revamp Phase 1: a membership milestone, not a game — title, ฿100, spots left, progress, 3 steps, examples behind a tap */}
      <span className="rv-fk">{open ? L('Early-member milestone') : L('Your first Reel')}</span>
      <div className="h"><b>{open ? `${L('Founding Local')} · ${amt}` : L('3 steps to the board')}</b>{open ? <span id="kxFoundingLeft">{Lf('{0} of {1} spots left', String(kx.founding_left), '50')}</span> : null}</div>
      <div className="bar rv-fbar" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={1}><i style={{ width: `${(1 / 3) * 100}%` }} /></div>
      <ol className="rv-fsteps">
        <li className="d"><b aria-hidden="true">✓</b><span>{L('Create your account')}</span></li>
        <li className="c">
          <button type="button" className="st go" id="kxFoundingPost" onClick={props.onPost}>
            <i>2</i><span>{L('Post your first Reel at a place')}</span>{open ? <em>{amt}</em> : null}
          </button>
        </li>
        <li><b aria-hidden="true">3</b><span>{open ? Lf('Kring approves it · claim {0}', amt) : L('Kring approves it · you are on the board')}</span></li>
      </ol>
      {open ? <p className="kx-next-l" id="kxFoundingPaid">{L('Yours when Kring approves your Reel · claim 24 h after posting')}</p> : null}
      <button type="button" className="rv-fguide" id="kxFoundingGuide" aria-expanded={guide} onClick={() => setGuide((g) => !g)}>
        {L('What gets accepted?')}<i aria-hidden="true">{guide ? '−' : '+'}</i>
      </button>
      {guide ? <ReelStamps L={L} /> : null}
      {!props.hasSocial ? (
        <button type="button" className="kx-fc-link" id="kxFoundingAdd" onClick={props.onLink}>{L('Optional: add Instagram or TikTok')} ›</button>
      ) : null}
    </div>
  );
}

/** Same rule as FoundingChecklist: the Founding "Next step" card is on screen. */
export const foundingDue = (kx: KxCardExtras | null | undefined) => !!kx && !kx.founding_no && kx.founding_left !== undefined && !kx.has_reel;


// ───────────── 25 Nov (founder-approved mock F): the Rings chip on the cover + its sheet, the question bubble, emoji meta ─────────────
/** Flags for the member's languages. A language with no fair single flag (Arabic) shows its short name instead. */
export const LANG_FLAG: Record<string, string> = { TH: '🇹🇭', EN: '🇬🇧', ZH: '🇨🇳', HI: '🇮🇳', JA: '🇯🇵', KO: '🇰🇷', FR: '🇫🇷', DE: '🇩🇪',
  ES: '🇪🇸', RU: '🇷🇺', MS: '🇲🇾', ID: '🇮🇩', VI: '🇻🇳' };
export function langFlags(L: Tx, codes: string[] | null | undefined, max = 4): string {
  return (codes || []).slice(0, max).map((c) => { const k = c.toUpperCase(); return LANG_FLAG[k] || L(LANG_NAME[k] || c); }).join(' ');
}
/** Short label + prompt per question key (the full question stays in QA_QUESTIONS for the builder). */
export const QA_SHORT: Record<string, { label: string; prompt: string; ic: string }> = {
  soi_shop: { label: 'My soi’s go-to', prompt: 'Your soi’s go-to shop?', ic: '🏪' },
};
/** Instagram-Notes-style bubble above the photo: my answer, or today's question as a prompt. Tap → the builder's question step. */
export function QaBubble(props: { L: Tx; q?: string | null; a?: string | null; qKey: string; onTap?: () => void }) {
  const { L } = props;
  const a = (props.a || '').trim();
  const meta = QA_SHORT[(a && props.q) || props.qKey];
  if (!a && (!props.onTap || !meta)) return null;
  const body = a ? (
    <><small>{meta ? L(meta.label) : L('Today’s question')}</small><b>{a}</b></>
  ) : (
    <><small>{L('Today’s question')}</small><b><span aria-hidden="true">{meta!.ic} </span>{L(meta!.prompt)}</b></>
  );
  return props.onTap ? (
    <button type="button" className={`mc-note${a ? '' : ' ask'}`} id="meQaNote" onClick={props.onTap}>{body}</button>
  ) : <p className="mc-note" id="meQaNote">{body}</p>;
}

export type ChipTasks = { done: number; of: number; ready: number; readyRings: number; streak: number };
/** The data behind the chip and the sheet. Every number comes from the app's own loads (kr8_card_extras, kr8_weekly_ranking, kr8_tasks_today). */
export type RingsChipData = {
  rings: number | null; rank: number | null; tasks: ChipTasks | null;
  /** to the rank above: { n Rings, to rank } */ gap: { n: number; to: number } | null;
  top: number; claim: number; prizes: number; near?: { n: number; prize: number } | null; needs?: number | null; week?: number | null;
};

export function RingsChip(props: { L: Tx; Lf: Txf; d: RingsChipData; mine: boolean; onOpen: () => void }) {
  const { L, Lf, d } = props;
  const rings = d.rings === null ? '…' : fmtN(d.rings);
  const label = [Lf(d.rings === 1 ? '1 Ring' : '{0} Rings', rings), d.tasks ? Lf('{0} of {1} today', String(d.tasks.done), String(d.tasks.of)) : '',
    d.rank ? Lf('#{0} this week', String(d.rank)) : L('Not on this week’s board yet')].filter(Boolean).join(' · ');
  return (
    <button type="button" className="mc-chip" id={props.mine ? 'meChip' : 'profileChip'} aria-label={label} aria-haspopup="dialog" onClick={props.onOpen}>
      <span className="mc-c"><RingGlyph /><b>{rings}</b></span>
      {d.tasks ? <span className="mc-c"><span aria-hidden="true">🔥</span><b>{d.tasks.done}</b></span> : null}
      {/* 25 Nov: no rank this week → no 🏆 part at all (a "🏆 –" sat confusingly next to the "🏆 #3 · Week 47" badge) */}
      {d.rank ? <span className="mc-c"><span aria-hidden="true">🏆</span><b>{`#${d.rank}`}</b></span> : null}
      {props.mine && d.claim > 0 ? <i className="mc-badge" id="meChipBadge">{d.claim}</i> : null}
    </button>
  );
}

export function RingsSheet(props: { L: Tx; Lf: Txf; d: RingsChipData; mine: boolean; onClose: () => void;
  onRanking?: () => void; onHistory?: () => void; onTasks?: () => void; onClaimPrize?: () => void;
  onClaim?: () => Promise<'ok' | 'face' | 'fail'>; onShareBest?: () => void; onShareBestDown?: () => void }) {
  const { L, Lf, d } = props;
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props.onClose]);
  const baht = (n: number) => `฿${fmtN(n)}`;
  const go = (f?: () => void) => () => { props.onClose(); f?.(); };
  const rankSub = props.mine
    ? [d.near ? Lf(d.near.n === 1 ? '1 Ring from {1} · one Story could do it' : '{0} Rings from {1} · one Story could do it', fmtN(d.near.n), baht(d.near.prize))
        : d.needs ? Lf('{0} Rings to unlock', fmtN(d.needs))
        : d.rank === 1 ? L('Top of the board this week')
        : d.gap ? Lf(d.gap.n === 1 ? '1 Ring to #{1}' : '{0} Rings to #{1}', fmtN(d.gap.n), String(d.gap.to)) : '',
      d.top && d.rank !== 1 && !d.near ? Lf('#1 wins {0}', baht(d.top)) : ''].filter(Boolean)
    : [d.week !== null && d.week !== undefined ? Lf(d.week === 1 ? '1 Ring this week' : '{0} Rings this week', fmtN(d.week)) : '', d.top ? Lf('#1 wins {0}', baht(d.top)) : ''].filter(Boolean);
  const claimTasks = props.mine && d.tasks && d.tasks.ready > 0;
  const claimPrize = props.mine && !claimTasks && d.prizes > 0;
  const claim = async () => {
    if (!props.onClaim || busy) return;
    setBusy(true); setFail(false);
    const r = await props.onClaim().catch(() => 'fail' as const);
    setBusy(false);
    if (r === 'ok') return;
    if (r === 'face') { props.onClose(); props.onTasks?.(); return; }
    setFail(true);
  };
  const Go = ({ t }: { t: string }) => <span className="mc-go">{t}<i aria-hidden="true">›</i></span>;
  const goldify = (s: string) => {
    const m = s.match(/฿[\d,]+/);
    if (!m || m.index === undefined) return s;
    return <>{s.slice(0, m.index)}<em>{m[0]}</em>{s.slice(m.index + m[0].length)}</>;
  };
  return createPortal(
    <div className="mc-wrap" role="dialog" aria-modal="true" aria-label={props.mine ? L('Your Rings') : L('Rings this week')} id="meRingsSheet">
      <div className="mc-dim" onClick={props.onClose} />
      <div className="mc-sheet">
        <div className="mc-grab" />
        <button type="button" className="mc-row" id="meSheetRank" onClick={go(props.onRanking)}>
          <span className="mc-e" aria-hidden="true">🏆</span>
          <span className="mc-t"><b>{d.rank ? Lf('#{0} this week', String(d.rank)) : L('Not on this week’s board yet')}</b>
            {rankSub.length ? <small>{rankSub.map((x, i) => <React.Fragment key={i}>{i ? ' · ' : ''}{goldify(x)}</React.Fragment>)}</small> : null}</span>
          <Go t={L('Leaderboard')} />
        </button>
        {props.mine && props.onHistory ? (
          <button type="button" className="mc-row" id="meSheetRings" onClick={go(props.onHistory)}>
            <span className="mc-e" aria-hidden="true"><RingGlyph /></span>
            <span className="mc-t"><b>{d.rings === null ? '…' : Lf(d.rings === 1 ? '1 Ring' : '{0} Rings', fmtN(d.rings))}</b><small>{L('From likes, Reels and tasks')}</small></span>
            <Go t={L('History')} />
          </button>
        ) : null}
        {props.mine && d.tasks && props.onTasks ? (
          <button type="button" className="mc-row" id="meSheetTasks" onClick={go(props.onTasks)}>
            <span className="mc-e" aria-hidden="true">🔥</span>
            <span className="mc-t"><b>{Lf('{0} of {1} today', String(d.tasks.done), String(d.tasks.of))}</b>
              <span className="mc-seg" aria-hidden="true">{Array.from({ length: Math.max(1, d.tasks.of) }, (_, i) => <i key={i} className={i < d.tasks!.done ? 'on' : ''} />)}</span></span>
            <Go t={L('Tasks')} />
          </button>
        ) : null}
        {props.mine && d.near && props.onShareBest ? (
          <button type="button" className="mc-share" id="kxNearShare" onPointerDown={props.onShareBestDown} onClick={go(props.onShareBest)}>
            {L('Share my best Reel')}<span aria-hidden="true"> ↗</span></button>
        ) : null}
        {claimTasks ? (
          <button type="button" className="mc-claim" id="meSheetClaim" disabled={busy} onClick={() => void claim()}>
            {d.tasks!.readyRings === 1 ? L('Claim 1 Ring') : d.tasks!.readyRings > 1 ? Lf('Claim {0} Rings', fmtN(d.tasks!.readyRings)) : L('Claim')}</button>
        ) : claimPrize ? (
          <button type="button" className="mc-claim" id="meSheetClaim" onClick={go(props.onClaimPrize)}>{L('Claim your prize')}</button>
        ) : null}
        {fail ? <p className="mc-fail" role="alert">{L('Couldn’t claim. Try again.')}</p> : null}
      </div>
    </div>,
    (typeof document !== 'undefined' && document.querySelector('.v8-app-root')) || document.body,
  );
}

/** Builds the chip data for my own Me tab. */
export function myChipData(kx: KxCardExtras | null | undefined, hook: WeekHookData, tasks: ChipTasks | null,
  week: { me: { rank: number; all_rank?: number; rings: number } | null; rows?: { all_rank?: number; rank: number; rings: number }[] } | null | undefined): RingsChipData {
  const rank = hook.rank;
  let gap: RingsChipData['gap'] = null;
  if (rank && rank > 1 && week?.me) {
    const up = week.rows?.find((r) => (r.all_rank || r.rank) === rank - 1);
    if (up) gap = { n: Math.max(1, up.rings - week.me.rings + 1), to: rank - 1 };
  }
  return { rings: kx ? kx.lifetime ?? 0 : null, rank, tasks, gap, top: hook.top, claim: (tasks?.ready ?? 0) + (kx?.prizes ?? 0), prizes: kx?.prizes ?? 0,
    near: rank ? hook.near ?? null : null, needs: hook.needs ?? null };
}

const IcBell = () => <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
const IcMore = () => <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
const IcShare = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6" /></svg>;
const IcHelp = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17.2h.01" /></svg>;
const IcPlay = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" /></svg>;
const IcPhone = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" /></svg>;
const Chev = () => <i className="kme-chev" aria-hidden="true">›</i>;

/** My Me tab */
export type MeViewProps = {
  /** m211: the app language, for the badge pills under the name */
  lang?: string;
  L: Tx; Lf: Txf; p: V5Profile; rank: number | null; posters: Record<string, string>; savedCount: number; savedImgs: string[];
  unread: boolean; verifyState: 'none' | 'pending' | 'verified';
  onTop10: () => void; onList: (k: 'followers' | 'following') => void; onSettings: () => void; onActivity: () => void;
  onEdit: () => void; onShare: () => void; onCode: () => void; onSaved: () => void; onRewards: () => void; onReel: (id: string) => void;
  onPost: () => void; onVerify: () => void; firstReelChip?: React.ReactNode;
  kx?: KxCardExtras | null; weekRank?: number | null; onRings?: () => void; onRanking?: () => void; ringsDot?: boolean;
  rankLine?: string; saved?: { count: number; thumbs: string[] } | null; onSavedReels?: () => void; onLink?: () => void;
  /** go-live build: the "Reels" / "Saved" tabs + grid; replaces the old saved row, the Reel strip and the long text blocks */
  reelsSlot?: React.ReactNode; onReplay?: () => void; gender?: string | null;
  /** 0061: the admin's own ghost card (only that phone sees this line) */
  ghost?: boolean;
  /** 16 Nov: the weekly-prize race card (no longer shown on Me since 17 Nov; the prize amount sits on the week line) */
  prizeSlot?: React.ReactNode;
  /** 0078: the one-time "Show my Reels on the web" ask (members with an approved Reel who were never asked) */
  webAskSlot?: React.ReactNode;
  /** 17 Nov: "Your next step" card, at the top. 19 Nov (A): shown only for a step that asks for an action (see nextKind) */
  nextSlot?: React.ReactNode; nextKind?: string | null;
  /** 0111: the gentle "Verify your face in 5 seconds" row can be hidden (×) for a while; it never blocks anything */
  verifyHidden?: boolean; onVerifyHide?: () => void;
  /** 19 Nov (A): Ask Kring Helper lives in the ⋯ menu; the week line shows this week's prize at my rank (0 = none) */
  onHelp?: () => void; weekPrize?: number | null;
  /** invite-1: friends who joined with my link (a number on the stats line) */
  invites?: { friends: number; rings: number } | null;
  /** revamp Phase 1: my approved + pending Reel count for the stats row (falls back to the profile's list) */
  reelCount?: number;
  /** 20 Nov: the weekly-board hook that replaced the Founding ฿100 card */
  weekHook?: WeekHookData | null;
  /** 21 Nov: the Share chip on the Me strip when close to a prize (my best Reel this week) */
  onShareBest?: () => void; onShareBestDown?: () => void;
  /** 0171: the daily-tasks line (mini ring · N of 4 · streak · Claim) */
  tasksSlot?: React.ReactNode;
  /** 20 Nov: no passed face check → one Verify line in place of the weekly ranking + daily rewards */
  lockSlot?: React.ReactNode;
  /** 25 Nov: six-step profile builder: how many steps are left, and the row that reopens it. Hidden at 0. */
  buildLeft?: number; buildLabel?: string; onBuild?: () => void;
  /** 25 Nov (mock F): today's tasks for the Rings chip + sheet, the sheet's links, and the claim (same kr8_task_claim as the tasks sheet) */
  chipTasks?: ChipTasks | null; onTasks?: () => void; onClaimTasks?: () => Promise<'ok' | 'face' | 'fail'>;
  /** the weekly board as loaded (for "N Rings to #2") */
  week?: { me: { rank: number; all_rank?: number; rings: number } | null; rows?: { all_rank?: number; rank: number; rings: number }[] } | null;
  /** the question bubble: tap opens the builder's question step */
  onQa?: () => void; qaKey?: string;
};

/**
 * 19 Nov, founder picked "A · Card + one line": the card, then ONE hairline line (This week · Rank · Prize now), then the stats line
 * (followers · following · likes · friends joined) and the Reels. Share card, Ask Kring Helper, Install app and Replay intro are one tap
 * away in the ⋯ menu. "Climb this week's board" is not shown (the week line says it); action steps (post a Reel, claim, face check) still show.
 */
export function MeView(props: MeViewProps) {
  const { L, Lf, p } = props;
  const [menu, setMenu] = useState(false);
  const pick = (f?: () => void) => () => { setMenu(false); f?.(); };
  const actionStep = !!props.nextKind && props.nextKind !== 'climb';
  const [chipOpen, setChipOpen] = useState(false);
  const closeChip = React.useCallback(() => setChipOpen(false), []);
  // 25 Nov: no passed face check → the Verify line stays in place of the weekly ranking + daily rewards, so no chip either
  const chip = props.lockSlot ? null : myChipData(props.kx, props.weekHook || { rank: props.weekRank ?? null, prize: props.weekPrize ?? 0, toLine: null, top: 0 },
    props.chipTasks ?? null, props.week);
  return (
    <div className="kme kme-a rv4-me" id="meView">
      <div className="rv4-msky" aria-hidden="true" />
      <div className="kme-top">
        <span className="cap">{L('Your Kring')}</span>
        {chip ? <RingsChip L={L} Lf={Lf} d={chip} mine onOpen={() => setChipOpen(true)} /> : null}
        <span className="kme-icons">
          <button type="button" id="activityBtn" aria-label={L('Activity')} onClick={props.onActivity}>
            <IcBell />{props.unread ? <i className="dot" /> : null}
          </button>
          <button type="button" className="kp-gear" id="meGear" aria-label={L('Settings')} onClick={props.onSettings}>
            {/* G (15 Nov): a real gear, same stroke as the bell (the old rays read as a light-mode sun) */}
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
          <button type="button" id="meMore" aria-label={L('More')} aria-expanded={menu} onClick={() => setMenu((m) => !m)}><IcMore /></button>
        </span>
      </div>
      {menu ? (
        <>
          <div className="kme-scrim" onClick={() => setMenu(false)} />
          <div className="kme-pop" id="meMoreList" role="menu">
            <button type="button" role="menuitem" id="meShare" onClick={pick(props.onCode)}><span className="ic"><IcShare /></span><span className="t">{L('Share card')}</span><Chev /></button>
            {props.onHelp ? <button type="button" role="menuitem" id="meHelpRow" onClick={pick(props.onHelp)}><span className="ic"><IcHelp /></span><span className="t">{L('Ask Kring Helper')}</span><Chev /></button> : null}
            {isStandalone() ? null : <button type="button" role="menuitem" id="installChip" onClick={pick(openInstallSheet)}><span className="ic"><IcPhone /></span><span className="t">{L('Install app')}</span><Chev /></button>}
            {props.onReplay ? <button type="button" role="menuitem" id="goReplay" onClick={pick(props.onReplay)}><span className="ic"><IcPlay /></span><span className="t">{L('Replay intro')}</span><Chev /></button> : null}
          </div>
        </>
      ) : null}
      {props.ghost ? <p className="kme-ghost" id="meGhost" role="status"><span aria-hidden="true">👻</span>{L('Ghost mode · nobody can see you')}</p> : null}
      {/* rv4 (founder pick Me round 2 · A, 20 Nov): Bangkok twilight skyline behind a gold-ringed photo with the stats beside it,
          name ✓ · area, ONE line (Rings · this week's board, Post when not on it), then the Reels / Saved grid edge to edge.
          Founding ฿100 is closed, so the line sells the weekly board (same copy as the live fix). */}
      {chip && chipOpen ? (
        <RingsSheet L={L} Lf={Lf} d={chip} mine onClose={closeChip} onRanking={props.onRanking} onHistory={props.onRings} onTasks={props.onTasks}
          onClaimPrize={props.onRings} onClaim={props.onClaimTasks} onShareBest={props.onShareBest} onShareBestDown={props.onShareBestDown} />
      ) : null}
      <MeHead L={L} lang={props.lang} p={p} onEdit={props.onEdit} note={<QaBubble L={L} q={p.qa_q} a={p.qa_answer} qKey={props.qaKey || 'soi_shop'} onTap={props.onQa} />} stats={(
        <div className="rv4-pst" id="meStats">
          <span id="statReels"><b>{fmtCount(props.reelCount ?? p.reels.length)}</b><span>{L('Reels')}</span></span>
          <button type="button" id="statFollowers" onClick={() => props.onList('followers')}><b>{fmtCount(p.followers)}</b><span>{L('Followers')}</span></button>
          <button type="button" id="statFollowing" onClick={() => props.onList('following')}><b>{fmtCount(p.following)}</b><span>{L('Following')}</span></button>
        </div>
      )} />
      {/* 25 Nov (founder): ONE compact block under the bio, no card / border / icon square / paragraph.
          Line 1 (only before the face check): "🔒 No ✓ yet" + "Verify · 5 sec" pill. Line 2 (only while the profile is unfinished):
          "✦ 1 step left on your profile ›", which opens the builder. */}
      {props.lockSlot || (props.buildLeft && props.onBuild) ? (
        <div className="me-status" id="meStatus">
          {props.lockSlot || null}
          {props.buildLeft && props.onBuild ? (
            <button type="button" className="me-st2" id="meBuild" onClick={props.onBuild}>
              <span aria-hidden="true">✦ </span>{props.buildLabel || L('Finish your profile')}<span aria-hidden="true"> ›</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {actionStep && props.nextKind !== 'reel' && props.nextKind !== 'pending' ? props.nextSlot : null}
      {props.webAskSlot || null}
      {props.reelsSlot ? props.reelsSlot : (
        <>
      {p.reels.length ? (
        <ReelRow reels={p.reels} posters={props.posters} onOpen={props.onReel} pending={L('Waiting for a quick check')} />
      ) : (
        <>{props.firstReelChip}
        <button type="button" className="kme-first" id="meFirstReel" onClick={props.onPost}>
          <b>{L('Post your first Reel')}</b><small>{L('Your Reels show here and count towards your next level')}</small>
        </button></>
      )}
        </>
      )}
      {/* 0111 (founder 18 Nov): a gentle nudge, not a gate. The face check is needed only to claim a prize; the row can be hidden. */}
      {!props.lockSlot && props.verifyState !== 'verified' && (p.reels.length > 0 || props.verifyState === 'pending' || !props.reelsSlot)
        && !(props.verifyState === 'none' && props.verifyHidden) && (
        <div className={`kme-verify${props.verifyState === 'pending' ? ' wait' : ''}`} id="meVerify">
          <button type="button" className="kme-vmain" id="meVerifyGo" onClick={props.onVerify} disabled={props.verifyState === 'pending'}>
            <span className="ic" aria-hidden="true">✓</span>
            <span className="t">
              <b>{props.verifyState === 'pending' ? L('We’re checking · usually within a day') : L('Verify your face in 5 seconds')}</b>
              <small>{props.verifyState === 'pending' ? L('You’ll see ✓ verified on your card when it’s done') : L('Be ready to claim your prize the moment you win.')}</small>
            </span>
            {props.verifyState === 'pending' ? null : <span className="go" aria-hidden="true">›</span>}
          </button>
          {props.verifyState === 'none' && props.onVerifyHide ? (
            <button type="button" className="kme-vx" id="meVerifyHide" aria-label={L('Hide')} onClick={props.onVerifyHide}>×</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** rv4 Me A head: skyline band (CSS), round photo with a thin gold ring (tap = edit card), stats beside it, name ✓ and area. */
function MeHead(props: { L: Tx; lang?: string; p: V5Profile; stats: React.ReactNode; onEdit: () => void; note?: React.ReactNode }) {
  // 0183: the bio under the name (own text, never translated); none yet → one quiet "+ Add a short bio" that opens the card editor
  const { L, p } = props;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { rvHeroIn(ref.current); }, []);
  const where = p.who === 'traveller' ? [L('Traveller'), rvArea(L(p.area))].filter(Boolean).join(' · ') : rvArea(L(p.area === 'Bangkok' ? 'Bangkok' : p.area));
  const flags = langFlags(L, p.langs);
  return (
    <section className="rv4-phd rv4-mhd" id="meIdentity" aria-label={p.first_name}>
      <div className="rv4-ptop">
        {props.note}
        <button type="button" className="rv4-pav" id="meEdit" ref={ref} aria-label={L('Edit card')} onClick={props.onEdit}
          style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined}>
          {p.photo ? null : <span aria-hidden="true">{initial(p.first_name)}</span>}
          <i className="rv4-pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg></i>
        </button>
        {props.stats}
      </div>
      <h2 className="rv4-pnm">{p.first_name}{p.verified ? <RvCheck L={L} /> : null}</h2>
      {/* m211: last week's board place + Founding Local, small pills under the name */}
      <ProfileBadges lang={props.lang || 'en'} badges={p.badges} lastWeek={p.last_week} id="meBadges" />
      {/* 25 Nov (mock F): emoji instead of labels: 📍 area, then a flag per language (a short name where no flag fits) */}
      {where || flags ? <p className="rv4-psub mc-meta" id="meMeta">{where ? <span>📍 {where}</span> : null}{flags ? <span className="mc-flags">{flags}</span> : null}</p> : null}
      {p.bio ? <p className="rv4-pbio" id="meBio">{p.bio}</p>
        : <button type="button" className="rv4-addbio" id="meAddBio" onClick={props.onEdit}><span aria-hidden="true">✏️ </span>{L('Add a short bio')}</button>}
    </section>
  );
}

/** 3 · Rings balance: prominent but calm (no casino glow). Taps open Rewards. Expands and settles once when the number changes. */
export function RingsBalance(props: { L: Tx; Lf: Txf; kx: KxCardExtras | null | undefined; dot: boolean; onOpen?: () => void }) {
  const { L, Lf, kx } = props;
  const ref = useRef<HTMLButtonElement>(null);
  const total = kx ? kx.lifetime ?? 0 : null;
  useEffect(() => { if (total) rvSettle(ref.current?.querySelector('.rv-rnum') as HTMLElement | null); }, [total]);
  return (
    <button type="button" className="rv-rings" id="meRings" ref={ref} onClick={props.onOpen}>
      <span className="rv-rl">{L('Your Rings')}</span>
      <span className="rv-rnum"><RingGlyph />{total === null ? '…' : fmtN(total)}</span>
      <span className="rv-rsub">{kx ? Lf('+{0} this week', fmtN(kx.week ?? 0)) : ''}</span>
      {props.dot ? <i className="kx-tdot" aria-label={L('New')} /> : null}
      <Chev />
    </button>
  );
}

/** Someone else's profile (opens from People, a Reel or a ?u= link) */
export function ProfileView(props: {
  L: Tx; Lf: Txf; p: V5Profile; rank: number | null; posters: Record<string, string>; busy: boolean;
  onBack: () => void; onTop10: () => void; onList: (k: 'followers' | 'following') => void; onFollow: () => void; onHi: () => void;
  onReport: () => void; onBlock: () => void; onShare: () => void; onReel: (id: string) => void; kx?: KxCardExtras | null;
}) {
  const { L, Lf, p } = props;
  const [menu, setMenu] = useState(false);
  return (
    <div className="kme kme-other" id="profileView" data-user={p.user_id}>
      <div className="kme-top">
        <button type="button" className="kme-back" id="profileBack" aria-label={L('Back')} onClick={props.onBack}>←</button>
        <button type="button" className="kme-back" aria-label={L('More')} onClick={() => setMenu((m) => !m)}>⋯</button>
      </div>
      <KxMemberCard L={L} Lf={Lf} p={p} kx={props.kx} compact />
      <QaLine L={L} q={p.qa_q} a={p.qa_answer} />
      <Stats L={L} p={p} onList={props.onList} />
      {!p.mine && (
        <div className="kme-ob">
          <button type="button" className={`f1${p.i_follow ? ' on' : ''}`} id="profileFollow" disabled={props.busy} onClick={props.onFollow}>
            {p.i_follow ? `✓ ${L('Following')}` : p.follows_me ? `+ ${L('Follow back')}` : `+ ${L('Follow')}`}
          </button>
          <button type="button" className="f2" id="profileHi" onClick={props.onHi}><svg className="hi-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 12.5V6.8a1.4 1.4 0 0 1 2.8 0v4.7M10.3 11V4.9a1.4 1.4 0 0 1 2.8 0V11M13.1 11V5.8a1.4 1.4 0 0 1 2.8 0v6.4M15.9 10.6V8.6a1.4 1.4 0 0 1 2.8 0v5.2c0 4.1-2.7 7.2-6.5 7.2-2.6 0-4.1-1.1-5.6-3.3l-2.3-3.6a1.45 1.45 0 0 1 2.3-1.75l1 1.25M3.2 6.2c.4-1.4 1.3-2.6 2.6-3.3M19.6 3.3c1.2.7 2 1.8 2.3 3.1" /></svg> {L('Say hi')}</button>
          <button type="button" className="f3" id="profileMore" aria-label={L('More')} onClick={() => setMenu((m) => !m)}>⋯</button>
        </div>
      )}
      {menu && (
        <div className="kme-menu" role="menu">
          <button type="button" role="menuitem" id="profileShare" onClick={() => { setMenu(false); props.onShare(); }}>{L('Share profile')}</button>
          {!p.mine && <button type="button" role="menuitem" id="profileReport" onClick={() => { setMenu(false); props.onReport(); }}>{L('Report')}</button>}
          {!p.mine && <button type="button" role="menuitem" className="bad" id="profileBlock" onClick={() => { setMenu(false); props.onBlock(); }}>{L('Block')}</button>}
        </div>
      )}
      <div className="kme-meta">
        {p.online ? <span className="g">● {L('Online')}</span> : p.here ? <span className="g">● {Lf('Here now · {0}', L(p.area))}</span> : null}
        {(p.interests || []).map((k) => INTEREST[k] ? <span key={k}>{INTEREST[k][0]} {L(INTEREST[k][1])}</span> : null)}
      </div>
      {p.bio ? <p className="kme-bio">{p.bio}</p> : null}
      {p.reels.length ? <ReelRow reels={p.reels} posters={props.posters} onOpen={props.onReel} /> : <p className="kme-empty">{L('No Reels yet')}</p>}
    </div>
  );
}

/** Followers / Following lists */
export function FollowSheet(props: { L: Tx; Lf: Txf; who: string; counts: [number, number]; initial: 'followers' | 'following';
  load: (k: 'followers' | 'following') => Promise<V5FollowRow[]>; onToggle: (r: V5FollowRow) => Promise<boolean>; onPerson: (id: string) => void; onClose: () => void }) {
  const { L, Lf } = props;
  const [kind, setKind] = useState(props.initial);
  const [rows, setRows] = useState<V5FollowRow[] | null>(null);
  useEffect(() => {
    let dead = false;
    setRows(null);
    props.load(kind).then((r) => { if (!dead) setRows(r || []); }).catch(() => { if (!dead) setRows([]); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const toggle = async (r: V5FollowRow) => {
    const on = await props.onToggle(r);
    setRows((prev) => (prev || []).map((x) => (x.user_id === r.user_id ? { ...x, i_follow: on } : x)));
  };
  return (
    <div className="v8-sheet kme-sheet" id="sh-follow">
      <div className="grab" />
      <div className="kme-ttl"><b>{props.who}</b><button type="button" className="xbtn" aria-label="Close" onClick={props.onClose}>✕</button></div>
      <div className="kme-tabs2">
        <button type="button" id="followTabFollowers" className={kind === 'followers' ? 'on' : ''} onClick={() => setKind('followers')}>{props.counts[0] === 1 ? L('1 follower') : Lf('{0} followers', fmtCount(props.counts[0]))}</button>
        <button type="button" id="followTabFollowing" className={kind === 'following' ? 'on' : ''} onClick={() => setKind('following')}>{Lf('{0} following', fmtCount(props.counts[1]))}</button>
      </div>
      {rows === null ? <p className="kme-empty">…</p> : rows.length === 0 ? <p className="kme-empty" id="followEmpty">{kind === 'followers' ? L('No followers yet') : L('Not following anyone yet')}</p> : (
        <div className="kme-list">
          {rows.map((r) => (
            <div className="li" key={r.user_id} data-follow-row={r.user_id}>
              <button type="button" className="who" onClick={() => props.onPerson(r.user_id)}>
                <Avatar photo={r.photo} name={r.first_name} size={42} />
                <span className="n">{r.first_name}{r.verified ? ' ✓' : ''}
                  <small>{[r.ig_handle ? `@${r.ig_handle}` : '', r.follows_me ? L('follows you') : '', r.who === 'traveller' ? L('visiting') : ''].filter(Boolean).join(' · ')}</small></span>
              </button>
              <button type="button" className={`pb${r.i_follow ? ' soft' : ''}`} data-follow-btn={r.user_id} onClick={() => void toggle(r)}>
                {r.i_follow ? L('Following') : r.follows_me ? L('Follow back') : L('Follow')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 21 Nov: the one short post time (postTime.ts), one language */
function ago(_L: Tx, _Lf: Txf, iso: string): string {
  return postAgo(iso);
}

/** Bangkok calendar day of an ISO time */
const bkkDayOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

/** 🔔 Activity (H, 15 Nov): full-height page, Today / Earlier, every row opens the Reel or the person, Mark all read, back. */
export function ActivitySheet(props: { L: Tx; Lf: Txf; rows: V5Activity[] | null; posters: Record<string, string>; onClose: () => void;
  onFollowBack: (id: string) => Promise<void>; onPerson: (id: string) => void; onReel: (id: string) => void; seenAt?: string; onMarkRead?: () => void;
  /** 0189: a 'comment' line opens that Reel's comments */ onComments?: (postId: string) => void;
  /** 0182: the friend-verify line is in the app's language only */ lang?: string;
  /** m213: an 'ask_reply' line opens that Ask BKK question */ onAsk?: (postId: string) => void }) {
  const { L, Lf } = props;
  // 0182: today's friend-verify line counts as today's one showing (My Reel stats then stays quiet)
  useEffect(() => {
    const t = bkkDayOf(new Date().toISOString());
    if ((props.rows || []).some((a) => a.kind === 'friend_verify' && bkkDayOf(a.at) === t)) fvMarkShown();
  }, [props.rows]);
  const [back, setBack] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState(props.seenAt || '');
  const today = bkkDayOf(new Date().toISOString());
  const rows = props.rows || [];
  const unread = rows.some((a) => !seen || a.at > seen);
  const open = (a: V5Activity) => (a.kind === 'hidden' ? undefined : a.kind === 'ask_reply' ? (a.post_id && props.onAsk ? props.onAsk(a.post_id) : undefined) : a.kind === 'comment' && a.post_id && props.onComments ? props.onComments(a.post_id) : a.post_id && a.kind !== 'follow' ? props.onReel(a.post_id) : a.actor_id ? props.onPerson(a.actor_id) : undefined);
  const row = (a: V5Activity, i: number) => {
    const thumb = a.poster_path && props.posters[a.poster_path];
    const text = a.kind === 'friend_verify' ? fvText(props.lang || 'en')
      : a.kind === 'follow' ? Lf('{0} started following you', a.actor_name || '')
      : a.kind === 'like' ? (a.n > 1 ? Lf('{0} and {1} others liked your Reel', a.actor_name || '', String(a.n - 1)) : Lf('{0} liked your Reel', a.actor_name || ''))
      // 0191: rank = 1 marks a reply to my comment
      : a.kind === 'comment' && a.rank === 1 ? [a.n > 1 ? Lf('{0} and {1} others replied to your comment', a.actor_name || '', String(a.n - 1)) : Lf('{0} replied to your comment', a.actor_name || ''),
          a.prize ? `“${a.prize}”` : ''].filter(Boolean).join(': ')
      : a.kind === 'comment' ? [a.n > 1 ? Lf('{0} and {1} others commented on your Reel', a.actor_name || '', String(a.n - 1)) : Lf('{0} commented on your Reel', a.actor_name || ''),
          a.prize ? `“${a.prize}”` : ''].filter(Boolean).join(': ')
      // m213: replies to my Ask BKK answer; the reply text travels in prize
      : a.kind === 'ask_reply' ? [a.n > 1 ? Lf('{0} and {1} others replied to your answer in Ask BKK', a.actor_name || '', String(a.n - 1)) : Lf('{0} replied to your answer in Ask BKK', a.actor_name || ''),
          a.prize ? `“${a.prize}”` : ''].filter(Boolean).join(': ')
      : a.kind === 'gift' ? Lf('Your Reel is #{0} · {1}', String(a.rank || ''), a.prize || '')
      // audit P2-3: hidden by the team, with the reason (the prize column carries it)
      : a.kind === 'hidden' && isNotYetNote(a.prize) ? [L('Not yet · tips for your next Reel'), reviewNoteText(a.prize)].filter(Boolean).join(' · ')
      : a.kind === 'hidden' ? [L('Your Reel was hidden'), reviewNoteText(a.prize)].filter(Boolean).join(' · ')
      : L('Your Reel is approved and live');
    const isNew = !seen || a.at > seen;
    return (
      <div className={`li${isNew ? ' new' : ''}`} key={`${a.kind}-${a.at}-${i}`} data-activity={a.kind}>
        {a.kind === 'follow' || a.kind === 'like' || a.kind === 'comment' || a.kind === 'friend_verify' || a.kind === 'ask_reply' ? (
          <button type="button" className="av" aria-label={a.actor_name || ''} onClick={() => a.actor_id && props.onPerson(a.actor_id)}><Avatar photo={a.actor_photo} name={a.actor_name || '?'} size={44} /></button>
        ) : <span className="kme-av kme-av-i" style={{ width: 44, height: 44 }}>{a.kind === 'gift' ? '🏆' : a.kind === 'hidden' ? '!' : '✓'}</span>}
        <button type="button" className="who" onClick={() => open(a)}>
          <span className="n">{text}<small>{ago(L, Lf, a.at)}</small></span>
        </button>
        {a.kind === 'follow' && a.actor_id && !a.i_follow && !back[a.actor_id] ? (
          <button type="button" className="pb" data-follow-back={a.actor_id} onClick={() => { const id = a.actor_id as string; void props.onFollowBack(id).then(() => setBack((b) => ({ ...b, [id]: true }))); }}>{L('Follow back')}</button>
        ) : thumb ? <button type="button" className="thumb" aria-label={L('Open Reel')} style={{ backgroundImage: `url('${thumb}')` }} onClick={() => a.post_id && (a.kind === 'comment' && props.onComments ? props.onComments(a.post_id) : props.onReel(a.post_id))} /> : null}
      </div>
    );
  };
  const todays = rows.filter((a) => bkkDayOf(a.at) === today);
  const earlier = rows.filter((a) => bkkDayOf(a.at) !== today);
  return (
    <div className="v8-sheet kme-sheet kme-full" id="sh-activity" role="dialog" aria-label={L('Activity')}>
      <div className="kme-ttl kme-pghd">
        <button type="button" className="kme-bk" aria-label={L('Back')} onClick={props.onClose}>‹</button>
        <b>{L('Activity')}</b>
        {unread && rows.length ? <button type="button" className="kme-mark" id="activityMarkRead" onClick={() => { setSeen(rows[0].at); props.onMarkRead?.(); }}>{L('Mark all read')}</button> : null}
      </div>
      {props.rows === null ? <p className="kme-empty">…</p> : rows.length === 0 ? (
        <p className="kme-empty" id="activityEmpty">{L('Nothing yet. Follows, likes and rewards show up here.')}</p>
      ) : (
        <div className="kme-list kme-scroll">
          {todays.length ? <div className="kme-grph">{L('Today')}</div> : null}
          {todays.map(row)}
          {earlier.length ? <div className="kme-grph">{L('Earlier')}</div> : null}
          {earlier.map(row)}
        </div>
      )}
    </div>
  );
}

/** Interests chips (Settings → Interests) */
export function InterestsSheet(props: { L: Tx; Lf: Txf; value: string[]; all: readonly string[]; onSave: (v: string[]) => Promise<void>; onClose: () => void }) {
  const { L, Lf } = props;
  const [v, setV] = useState<string[]>(props.value);
  const [busy, setBusy] = useState(false);
  const flip = (k: string) => setV((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 8 ? p : [...p, k]));
  return (
    <div className="v8-sheet kme-sheet" id="sh-interests">
      <div className="grab" />
      <div className="kme-ttl"><b>{L('Interests')}</b><span>{Lf('{0} of 8', String(v.length))}</span><button type="button" className="xbtn" aria-label="Close" onClick={props.onClose}>✕</button></div>
      <div className="kme-chips">
        {props.all.map((k) => (
          <button type="button" key={k} data-interest={k} aria-pressed={v.includes(k)} className={v.includes(k) ? 'on' : ''} onClick={() => flip(k)}>
            {INTEREST[k]?.[0]} {L(INTEREST[k]?.[1] || k)}
          </button>
        ))}
      </div>
      <button type="button" className="primary-cta" id="saveInterests" disabled={busy}
        onClick={() => { setBusy(true); void props.onSave(v).finally(() => setBusy(false)); }}>{L('Save')}</button>
    </div>
  );
}
