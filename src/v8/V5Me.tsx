/**
 * Me tab (LOCKED by the founder 10 Nov 01:28 IST): member card, follow, activity, someone else's profile.
 * (The old Top 5 board + its card pill were removed 16 Nov: the weekly board is the Ranking sheet, Top 8 from kr8_rings_config.)
 * Visual source: scratch/opus_venue/me_tab_locked_10nov/ (me_tab_locked.html, top10_sheet.html, follow_screens.html).
 * Calm luxe #0B0A12, hairlines, Bricolage light numbers, spaced caps. No yellow anywhere (monarchy rule).
 * One language per screen: every visible string goes through L().
 */
import React, { useEffect, useState } from 'react';
import './me.css';
import { PerksCard } from './V5Perks';
import type { V5Activity, V5FollowRow, V5Level, V5Profile } from './v5Live';
import { NeonCard, progLine, RingGlyph } from './V5KxCard';
import { InstallChip } from './A2HS';
import { fmtN, levelFor, reviewNoteText } from './kxLogic';
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
  const where = L(p.area === 'Bangkok' ? 'Bangkok' : p.area);
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

/**
 * "Founding Local · ฿100": three steps under the card, step 1 already ticked (mock m5). Shows until the member is a Founding Local;
 * when all the spots are taken it becomes "3 steps to the board" with no ฿. The spots-left number is the true count from the server.
 */
export function FoundingChecklist(props: { L: Tx; Lf: Txf; kx: KxCardExtras | null | undefined; hasSocial: boolean; onLink: () => void; onPost: () => void }) {
  const { L, Lf, kx } = props;
  if (!kx || kx.founding_no || kx.founding_left === undefined) return null;
  const open = (kx.founding_left ?? 0) > 0;
  // polish #4: one "Next step" card: only the next thing to do; gone when everything is done
  if (kx.has_reel || (!open && kx.has_reel)) return null;
  const amt = `฿${fmtN(kx.founding_thb ?? 100)}`;
  // audit P3-13: the server pays Founding Local for the first APPROVED Reel (rules page §4). Instagram / TikTok is not a step,
  // so it shows as an optional link, never as "step 2". Steps: 1 card ✓ · 2 post a Reel at a place · 3 Kring approves it.
  return (
    <div className="kx-fc kx-next" id="kxFounding" data-left={kx.founding_left ?? 0} data-step={2}>
      <div className="h"><b>{open ? `${L('Founding Local')} · ${amt}` : L('3 steps to the board')}</b>{open ? <span id="kxFoundingLeft">{Lf('{0} of {1} spots left', String(kx.founding_left), '50')}</span> : null}</div>
      <div className="bar"><i style={{ width: `${(1 / 3) * 100}%` }} /></div>
      <div className="kx-next-l">{L('Next step')} · {Lf('{0} of {1}', '2', '3')}</div>
      <button type="button" className="st go" id="kxFoundingPost" onClick={props.onPost}>
        <i>2</i><span>{L('Post your first Reel at a place')}</span>{open ? <em>{amt}</em> : null}
      </button>
      {open ? <p className="kx-next-l" id="kxFoundingPaid">{L('Yours when Kring approves your Reel')}</p> : null}
      {!props.hasSocial ? (
        <button type="button" className="kx-go" id="kxFoundingAdd" onClick={props.onLink} style={{ marginTop: 6 }}>{L('Optional: add Instagram or TikTok')}</button>
      ) : null}
    </div>
  );
}

/** Same rule as FoundingChecklist: the Founding "Next step" card is on screen. */
export const foundingDue = (kx: KxCardExtras | null | undefined) => !!kx && !kx.founding_no && kx.founding_left !== undefined && !kx.has_reel;

/** My Me tab */
export function MeView(props: {
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
  /** 16 Nov: the weekly-prize race card, right under "This week" (hidden while the Founding "Next step" card shows: one next step at a time) */
  prizeSlot?: React.ReactNode;
}) {
  const { L, Lf, p } = props;
  const lv = p.level;
  const visits = Math.ceil(lv.need_points / 5);
  return (
    <div className="kme" id="meView">
      <div className="kme-top">
        <span className="cap">{L('Your Kring')}</span>
        <InstallChip L={L} />
        <span className="kme-icons">
          <button type="button" id="activityBtn" aria-label={L('Activity')} onClick={props.onActivity}>
            <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {props.unread ? <i className="dot" /> : null}
          </button>
          <button type="button" className="kp-gear" id="meGear" aria-label={L('Settings')} onClick={props.onSettings}>
            {/* G (15 Nov): a real gear, same stroke as the bell (the old rays read as a light-mode sun) */}
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
        </span>
      </div>
      {props.ghost ? <p className="kme-ghost" id="meGhost" role="status"><span aria-hidden="true">👻</span>{L('Ghost mode · nobody can see you')}</p> : null}
      <div className="kme-cardwrap">
        <KxMemberCard L={L} Lf={Lf} p={p} kx={props.kx} gender={props.gender} />
        <button type="button" className="kme-pencil" id="meEdit" aria-label={L('Edit card')} onClick={props.onEdit}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
        </button>
      </div>
      {/* polish #4: one "This week" row: Rings · rank · Rewards › (the Rewards page links to the full ranking) */}
      <div className="kx-tiles kx-week" id="kxTiles">
        <button type="button" className="kx-mtile rw kx-weekrow" id="kxRingsTile" onClick={props.onRings}>
          {props.ringsDot || (props.kx?.prizes ?? 0) > 0 ? <i className="kx-tdot" aria-label={L('New')} /> : null}
          <span className="kx-wk-l">{L('This week')}</span>
          <b>{props.kx ? fmtN(props.kx.week ?? 0) : '…'} <RingGlyph /></b>
          <span className="kx-wk-rk" id="kxRankTile" role="link" tabIndex={0} onClick={(e) => { if (props.onRanking) { e.stopPropagation(); props.onRanking(); } }}>{props.weekRank ? `#${props.weekRank}` : L('Ranking')}</span>
          <span className="kx-wk-go">{L('Rewards')} <i>›</i></span>
        </button>
      </div>
      {/* founder 17 Nov: the big ฿ prize card is gone from Me (the prize lives in the Feed ticker + Rewards) */}
      <FoundingChecklist L={L} Lf={Lf} kx={props.kx} hasSocial={!!(props.kx?.ig_handle || props.kx?.tiktok_handle || p.ig_handle)} onLink={props.onLink || props.onEdit} onPost={props.onPost} />
      {props.reelsSlot ? null : (
      <button type="button" className="kx-savedrow" id="kxSavedRow" onClick={props.onSavedReels || props.onSaved}>
        <span className="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" /></svg></span>
        <span className="t">{L('Saved Reels')}<small>{props.saved ? (props.saved.count === 1 ? L('1 Reel') : Lf('{0} Reels', String(props.saved.count))) : '…'}</small></span>
        <span className="th">{(props.saved?.thumbs || []).slice(0, 3).map((u, i) => <i key={i} style={{ backgroundImage: `url('${u}')` }} />)}</span>
        <span className="go">›</span>
      </button>
      )}
      {/* polish #4/#5: followers · following · likes on one line; one "Share card" button (the QR is inside it); Edit = pencil on the card */}
      <div className="kme-stline kme-stline2" id="meStats">
        <button type="button" id="statFollowers" onClick={() => props.onList('followers')}><b>{fmtCount(p.followers)}</b> {L('Followers')}</button>
        <i aria-hidden="true">·</i>
        <button type="button" id="statFollowing" onClick={() => props.onList('following')}><b>{fmtCount(p.following)}</b> {L('Following')}</button>
        <i aria-hidden="true">·</i>
        <span><b>{fmtCount(p.likes)}</b> {L('Likes')}</span>
        {/* 17 Nov de-clutter: Share is a small pill on the stats line, not a full-width button */}
        <button type="button" className="kme-sharepill" id="meShare" aria-label={L('Share card')} onClick={props.onCode}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6" /></svg>{L('Share')}
        </button>
      </div>
      {props.reelsSlot ? null : <PerksCard />}
      {/* 16 Nov: a new member's first step is their first Reel; the face check shows once they have one (or already sent it) */}
      {props.reelsSlot && !p.reels.length ? (
        <button type="button" className="kme-first kme-first-top" id="meFirstReelTop" onClick={props.onPost}>
          <b>{L('Post your first Reel')}</b><small>{L('Your Reels show here and count towards your next level')}</small>
        </button>
      ) : null}
      {props.verifyState !== 'verified' && (p.reels.length > 0 || props.verifyState === 'pending' || !props.reelsSlot) && (
        <button type="button" className="kme-verify" id="meVerify" onClick={props.onVerify} disabled={props.verifyState === 'pending'}>
          <span className="ic">✓</span>
          <span className="t">
            <b>{props.verifyState === 'pending' ? L('Verification sent · we check within 24 hours') : L('Get verified ✓')}</b>
            <small>{props.verifyState === 'pending' ? L('You’ll see ✓ verified on your card when it’s done') : L('A 20-second face check on your phone. People reply more to verified members.')}</small>
          </span>
          {props.verifyState === 'pending' ? null : <span className="go">›</span>}
        </button>
      )}
      {props.reelsSlot ? (
        <>{props.reelsSlot}
        {props.onReplay ? <button type="button" className="go-replay" id="goReplay" onClick={props.onReplay}>{L('Replay intro')}</button> : null}</>
      ) : (
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
    </div>
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
          {todays.length ? <div className="kme-grp">{L('Today')}</div> : null}
          {todays.map(row)}
          {earlier.length ? <div className="kme-grp">{L('Earlier')}</div> : null}
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
