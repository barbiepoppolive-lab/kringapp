/**
 * Me tab (LOCKED by the founder 10 Nov 01:28 IST): member card, follow, activity, someone else's profile.
 * (The old Top 5 board + its card pill were removed 16 Nov: the weekly board is the Ranking sheet, Top 8 from kr8_rings_config.)
 * Visual source: scratch/opus_venue/me_tab_locked_10nov/ (me_tab_locked.html, top10_sheet.html, follow_screens.html).
 * Calm luxe #0B0A12, hairlines, Bricolage light numbers, spaced caps. No yellow anywhere (monarchy rule).
 * One language per screen: every visible string goes through L().
 */
import { rvArea, rvLangs } from './rvLabels';
import React, { useEffect, useRef, useState } from 'react';
import { rvHeroIn, rvSettle } from './rvMotion';
import './me.css';
import './meA.css';
import { PerksCard } from './V5Perks';
import type { V5Activity, V5FollowRow, V5Level, V5Profile } from './v5Live';
import { NeonCard, progLine, RingGlyph } from './V5KxCard';
import { isStandalone, openInstallSheet } from './A2HS';
import { fmtN, isNotYetNote, levelFor, reviewNoteText } from './kxLogic';
import type { KxCardExtras } from './v5Kx';

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
      {props.reels.slice(0, 9).map((r) => (
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
export type WeekHookData = { rank: number | null; prize: number; toLine: number | null; top: number };

/**
 * 20 Nov founder ("Remove those 0 of 50. We need put something catchy instead"): Founding Local seats are gone, so Me sells this
 * week's board in one tappable line. Not on the board: "Be Bangkok's face of the week · #1 wins ฿1,500". On the board but outside the
 * prizes: "You're #14 · 23 Rings to the prize line". In the prizes: "You're #3 · ฿600 this week 🏆". Tapping opens the weekly ranking.
 */
export function WeekHook(props: { L: Tx; Lf: Txf; hook: WeekHookData; onRanking?: () => void; onPost: () => void }) {
  const { L, Lf, hook: h } = props;
  const baht = (n: number) => `฿${fmtN(n)}`;
  const inPrize = !!h.rank && h.prize > 0;
  const onBoard = !!h.rank;
  const line = inPrize ? Lf('You’re #{0} · {1} this week 🏆', String(h.rank), baht(h.prize))
    : onBoard && h.toLine ? Lf('You’re #{0} · {1} Rings to the prize line', String(h.rank), fmtN(h.toLine))
    : h.top ? Lf('Be Bangkok’s face of the week · #1 wins {0}', baht(h.top)) : L('Climb this week’s board');
  return (
    <div className={`kx-hook${inPrize ? ' won' : ''}`} id="kxWeekHook" data-state={inPrize ? 'prize' : onBoard ? 'board' : 'off'}>
      <button type="button" className="kx-hook-t" id="kxWeekHookOpen" onClick={props.onRanking || props.onPost}>
        <span className="ic" aria-hidden="true">{inPrize ? '🏆' : '✦'}</span><b>{line}</b><i aria-hidden="true">›</i>
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

const IcBell = () => <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
const IcMore = () => <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
const IcShare = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6" /></svg>;
const IcHelp = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17.2h.01" /></svg>;
const IcPlay = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" /></svg>;
const IcPhone = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" /></svg>;
const Chev = () => <i className="kme-chev" aria-hidden="true">›</i>;
/** small caps label; Thai gets no letter-spacing / caps (spaced Thai letters read badly) */
const Cap = ({ t }: { t: string }) => <small className={/[฀-๿]/.test(t) ? 'thai' : undefined}>{t}</small>;

/** My Me tab */
export type MeViewProps = {
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
};

/**
 * 19 Nov, founder picked "A · Card + one line": the card, then ONE hairline line (This week · Rank · Prize now), then the stats line
 * (followers · following · likes · friends joined) and the Reels. Share card, Ask Kring Helper, Install app and Replay intro are one tap
 * away in the ⋯ menu. "Climb this week's board" is not shown (the week line says it); action steps (post a Reel, claim, face check) still show.
 */
export function MeView(props: MeViewProps) {
  const { L, Lf, p } = props;
  const lv = p.level;
  const visits = Math.ceil(lv.need_points / 5);
  const [menu, setMenu] = useState(false);
  const prize = props.weekPrize && props.weekPrize > 0 ? `฿${fmtN(props.weekPrize)}` : null;
  const pick = (f?: () => void) => () => { setMenu(false); f?.(); };
  const actionStep = !!props.nextKind && props.nextKind !== 'climb';
  return (
    <div className="kme kme-a" id="meView">
      <div className="kme-top">
        <span className="cap">{L('Your Kring')}</span>
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
      {/* revamp Phase 1 (ChatGPT), in this order: 1 identity · 2 social stats · 3 Rings balance · 4 My Reels / Saved · 5 weekly ranking & rewards */}
      <RvIdentity L={L} p={p} id="meIdentity" tools={(
        <button type="button" className="kme-pencil rv-pencil" id="meEdit" aria-label={L('Edit card')} onClick={props.onEdit}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
        </button>
      )} />
      <div className="kme-stats rv-stats" id="meStats">
        <span id="statReels"><b>{fmtCount(props.reelCount ?? p.reels.length)}</b><span>{L('Reels')}</span></span>
        <button type="button" id="statFollowers" onClick={() => props.onList('followers')}><b>{fmtCount(p.followers)}</b><span>{L('Followers')}</span></button>
        <button type="button" id="statFollowing" onClick={() => props.onList('following')}><b>{fmtCount(p.following)}</b><span>{L('Following')}</span></button>
      </div>
      <RingsBalance L={L} Lf={Lf} kx={props.kx} dot={!!props.ringsDot || (props.kx?.prizes ?? 0) > 0} onOpen={props.onRings} />
      {actionStep ? props.nextSlot : null}
      {props.webAskSlot || null}
      <FoundingChecklist L={L} Lf={Lf} kx={props.kx} hasSocial={!!(props.kx?.ig_handle || props.kx?.tiktok_handle || p.ig_handle)} onLink={props.onLink || props.onEdit} onPost={props.onPost}
        hook={props.weekHook} onRanking={props.onRanking} />
      {props.reelsSlot ? null : (
      <button type="button" className="kx-savedrow" id="kxSavedRow" onClick={props.onSavedReels || props.onSaved}>
        <span className="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" /></svg></span>
        <span className="t">{L('Saved Reels')}<small>{props.saved ? (props.saved.count === 1 ? L('1 Reel') : Lf('{0} Reels', String(props.saved.count))) : '…'}</small></span>
        <span className="th">{(props.saved?.thumbs || []).slice(0, 3).map((u, i) => <i key={i} style={{ backgroundImage: `url('${u}')` }} />)}</span>
        <span className="go">›</span>
      </button>
      )}
      {props.reelsSlot ? null : <PerksCard />}
      {props.reelsSlot ? props.reelsSlot : (
        <>
      <div className="kme-lvl" id="meLevel">
        <span className="cup" aria-hidden="true"><span className="liq" style={{ height: `${Math.max(8, Math.min(100, lv.pct))}%` }} /></span>
        <span className="t">
          <span className="cap">{lv.next ? L('Next level') : L('Top level')}</span>
          <b>{L(LEVEL_NAME[lv.next || lv.level])}</b>
          <small>{lv.next ? (visits === 1 ? Lf('{0} more posts or 1 partner-café visit to go', String(lv.need_points))
            : Lf('{0} more posts or {1} partner-café visits to go', String(lv.need_points), String(visits))) : L('Levels come from posts and visits, never from payment')}</small>
        </span>
      </div>
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
      {/* 5 · weekly ranking & rewards: position, weekly progress, the voucher I could win now. Rank → the board, the rest → Rewards */}
      <section className="rv-week" aria-label={L('Weekly ranking & rewards')}>
        <div className="rv-sech"><b>{L('Weekly ranking & rewards')}</b>
          {props.invites && props.invites.friends > 0 ? <span id="meFriends">{props.invites.friends === 1 ? L('1 friend joined') : Lf('{0} friends joined', fmtN(props.invites.friends))}</span> : null}</div>
        <div className="kme-line rv-wline" id="kxTiles">
          <button type="button" className="c" id="kxRankTile" onClick={() => (props.onRanking ? props.onRanking() : props.onRings?.())}>
            <Cap t={L('Position')} /><b className="gd">{props.weekRank ? `#${props.weekRank}` : '–'}</b>
          </button>
          <button type="button" className="c" id="kxRingsHit" aria-label={`${L('This week')} · ${L('Rewards')}`} onClick={props.onRings}>
            <Cap t={L('This week')} /><b>{props.kx ? fmtN(props.kx.week ?? 0) : '…'} <RingGlyph /></b>
          </button>
          <button type="button" className="c" id="kxPrizeNow" onClick={props.onRings}>
            <Cap t={prize ? L('Voucher now') : L('Rewards')} /><b>{prize || <Chev />}</b>
          </button>
        </div>
      </section>
      {/* 0111 (founder 18 Nov): a gentle nudge, not a gate. The face check is needed only to claim a prize; the row can be hidden. */}
      {props.verifyState !== 'verified' && (p.reels.length > 0 || props.verifyState === 'pending' || !props.reelsSlot)
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

/** 3 · Rings balance: prominent but calm (no casino glow). Taps open Rewards. Expands and settles once when the number changes. */
function RingsBalance(props: { L: Tx; Lf: Txf; kx: KxCardExtras | null | undefined; dot: boolean; onOpen?: () => void }) {
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

function ago(L: Tx, Lf: Txf, iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return L('now');
  if (m < 60) return Lf('{0}m', String(m));
  if (m < 1440) return Lf('{0}h', String(Math.round(m / 60)));
  return Lf('{0}d', String(Math.round(m / 1440)));
}

/** Bangkok calendar day of an ISO time */
const bkkDayOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

/** 🔔 Activity (H, 15 Nov): full-height page, Today / Earlier, every row opens the Reel or the person, Mark all read, back. */
export function ActivitySheet(props: { L: Tx; Lf: Txf; rows: V5Activity[] | null; posters: Record<string, string>; onClose: () => void;
  onFollowBack: (id: string) => Promise<void>; onPerson: (id: string) => void; onReel: (id: string) => void; seenAt?: string; onMarkRead?: () => void }) {
  const { L, Lf } = props;
  const [back, setBack] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState(props.seenAt || '');
  const today = bkkDayOf(new Date().toISOString());
  const rows = props.rows || [];
  const unread = rows.some((a) => !seen || a.at > seen);
  const open = (a: V5Activity) => (a.kind === 'hidden' ? undefined : a.post_id && a.kind !== 'follow' ? props.onReel(a.post_id) : a.actor_id ? props.onPerson(a.actor_id) : undefined);
  const row = (a: V5Activity, i: number) => {
    const thumb = a.poster_path && props.posters[a.poster_path];
    const text = a.kind === 'follow' ? Lf('{0} started following you', a.actor_name || '')
      : a.kind === 'like' ? (a.n > 1 ? Lf('{0} and {1} others liked your Reel', a.actor_name || '', String(a.n - 1)) : Lf('{0} liked your Reel', a.actor_name || ''))
      : a.kind === 'gift' ? Lf('Your Reel is #{0} · {1}', String(a.rank || ''), a.prize || '')
      // audit P2-3: hidden by the team, with the reason (the prize column carries it)
      : a.kind === 'hidden' && isNotYetNote(a.prize) ? [L('Not yet · tips for your next Reel'), reviewNoteText(a.prize)].filter(Boolean).join(' · ')
      : a.kind === 'hidden' ? [L('Your Reel was hidden'), reviewNoteText(a.prize)].filter(Boolean).join(' · ')
      : L('Your Reel is approved and live');
    const isNew = !seen || a.at > seen;
    return (
      <div className={`li${isNew ? ' new' : ''}`} key={`${a.kind}-${a.at}-${i}`} data-activity={a.kind}>
        {a.kind === 'follow' || a.kind === 'like' ? (
          <button type="button" className="av" aria-label={a.actor_name || ''} onClick={() => a.actor_id && props.onPerson(a.actor_id)}><Avatar photo={a.actor_photo} name={a.actor_name || '?'} size={44} /></button>
        ) : <span className="kme-av kme-av-i" style={{ width: 44, height: 44 }}>{a.kind === 'gift' ? '🏆' : a.kind === 'hidden' ? '!' : '✓'}</span>}
        <button type="button" className="who" onClick={() => open(a)}>
          <span className="n">{text}<small>{ago(L, Lf, a.at)}</small></span>
        </button>
        {a.kind === 'follow' && a.actor_id && !a.i_follow && !back[a.actor_id] ? (
          <button type="button" className="pb" data-follow-back={a.actor_id} onClick={() => { const id = a.actor_id as string; void props.onFollowBack(id).then(() => setBack((b) => ({ ...b, [id]: true }))); }}>{L('Follow back')}</button>
        ) : thumb ? <button type="button" className="thumb" aria-label={L('Open Reel')} style={{ backgroundImage: `url('${thumb}')` }} onClick={() => a.post_id && props.onReel(a.post_id)} /> : null}
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
