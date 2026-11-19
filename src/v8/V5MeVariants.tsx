/**
 * Me tab redesign PREVIEW (19 Nov, founder: "Me tab is too cluttered. Pls redesign. Show me 4 different variants.").
 * PREVIEW ONLY: a variant renders only with ?mev=1..4 on a dev / preview build (import.meta.env.DEV or VITE_ME_PREVIEW=1).
 * A production build never reads the switch, so members keep the current Me tab (MeView) unchanged.
 * Same look as today: the N2 neon card, Calm Luxe #0B0A12, hairlines, same fonts and colours, same bottom tabs.
 * One language per screen: every visible string goes through L().
 */
import React, { useState } from 'react';
import './meVariants.css';
import type { MeViewProps } from './V5Me';
import { KxMemberCard, FoundingChecklist, fmtCount } from './V5Me';
import { RingGlyph } from './V5KxCard';
import { InstallChip, isStandalone, openInstallSheet } from './A2HS';
import { fmtN } from './kxLogic';

export const ME_VARIANTS = [
  { n: 1, letter: 'A', name: 'Card + one line', line: 'Card, then ONE hairline line (Rings · Rank · Prize). Help, Install, Share, Replay go into the ⋯ menu.' },
  { n: 2, letter: 'B', name: 'Tabs: Reels / Rings / More', line: 'Card, then one tab bar: Reels · Saved · Rings (week, rank, prize, friends) · More (share, help, install).' },
  { n: 3, letter: 'C', name: 'Small card, Reels up', line: 'The card shrinks to a slim header so your Reels are on the first screen; week numbers are three light chips.' },
  { n: 4, letter: 'D', name: 'Quick circles', line: 'Card, then one row of five round buttons (Rings, Rank, Prize, Friends, Share). No boxes at all.' },
] as const;

/** ?mev=1..4, read only on a dev / preview build. Production (DEV false, no VITE_ME_PREVIEW) always returns 0 = the current Me tab. */
export function meVariantFromUrl(search?: string): number {
  // written as import.meta.env.X so Vite folds it at build time: in production DEV is false and the URL is never read
  if (!(import.meta.env.DEV || import.meta.env.VITE_ME_PREVIEW === '1')) return 0;
  let s = search;
  if (s === undefined) { try { s = window.location.search; } catch { s = ''; } }
  const v = Number(new URLSearchParams(s || '').get('mev'));
  return v >= 1 && v <= 4 ? v : 0;
}

const IcBell = () => <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
const IcGear = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);
const IcMore = () => <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
const IcShare = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6" /></svg>;
const IcHelp = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17.2h.01" /></svg>;
const IcPeople = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.7.6 2.7 2.1 3 4.7" /></svg>;
const IcPlay = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" /></svg>;
const IcPhone = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" /></svg>;
const Chev = () => <i className="mev-chev" aria-hidden="true">›</i>;
/** small caps label; Thai gets no letter-spacing / caps (spaced Thai letters read badly) */
const Cap = ({ t }: { t: string }) => <small className={/[\u0E00-\u0E7F]/.test(t) ? 'thai' : undefined}>{t}</small>;

function TopBar(props: { p: MeViewProps; more?: boolean; open?: boolean; onMore?: () => void; help?: boolean; install?: boolean; share?: boolean }) {
  const { L } = props.p;
  return (
    <div className="kme-top mev-top">
      <span className="cap">{L('Your Kring')}</span>
      {props.install ? <InstallChip L={L} /> : null}
      <span className="kme-icons">
        {props.share ? <button type="button" id="mevShareTop" aria-label={L('Share card')} onClick={props.p.onCode}><IcShare /></button> : null}
        {props.help ? <button type="button" id="mevHelpTop" aria-label={L('Ask Kring Helper')} onClick={props.p.onHelp}><IcHelp /></button> : null}
        <button type="button" id="activityBtn" aria-label={L('Activity')} onClick={props.p.onActivity}>
          <IcBell />{props.p.unread ? <i className="dot" /> : null}
        </button>
        <button type="button" className="kp-gear" id="meGear" aria-label={L('Settings')} onClick={props.p.onSettings}><IcGear /></button>
        {props.more ? <button type="button" id="mevMore" aria-label={L('More')} aria-expanded={!!props.open} onClick={props.onMore}><IcMore /></button> : null}
      </span>
    </div>
  );
}

/** The secondary things, one tap away: Share card, Ask Kring Helper, Install app, Replay intro. */
function MoreList(props: { p: MeViewProps; cls?: string; onPick?: () => void }) {
  const { L } = props.p;
  const pick = (f?: () => void) => () => { props.onPick?.(); f?.(); };
  return (
    <div className={`mev-list ${props.cls || ''}`} id="mevMoreList">
      <button type="button" onClick={pick(props.p.onCode)}><span className="ic"><IcShare /></span><span className="t">{L('Share card')}</span><Chev /></button>
      <button type="button" onClick={pick(props.p.onHelp)}><span className="ic"><IcHelp /></span><span className="t">{L('Ask Kring Helper')}</span><Chev /></button>
      {isStandalone() ? null : <button type="button" onClick={pick(openInstallSheet)}><span className="ic"><IcPhone /></span><span className="t">{L('Install app')}</span><Chev /></button>}
      {props.p.onReplay ? <button type="button" onClick={pick(props.p.onReplay)}><span className="ic"><IcPlay /></span><span className="t">{L('Replay intro')}</span><Chev /></button> : null}
    </div>
  );
}

function Card(props: { p: MeViewProps; compact?: boolean }) {
  const { L, Lf, p } = props.p;
  return (
    <div className={`kme-cardwrap${props.compact ? ' mev-compact' : ''}`}>
      <KxMemberCard L={L} Lf={Lf} p={p} kx={props.p.kx} gender={props.p.gender} compact={props.compact} />
      <button type="button" className="kme-pencil" id="meEdit" aria-label={L('Edit card')} onClick={props.p.onEdit}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
      </button>
    </div>
  );
}

/** Only the next step that asks for an action shows (a Reel, a retry, a claim, a face check). "Climb the board" is already the week line. */
function NextIfAction({ p }: { p: MeViewProps }) {
  return p.nextKind && p.nextKind !== 'climb' ? <>{p.nextSlot}</> : null;
}

/** The conditional one-off rows stay exactly as today (they come and go on their own). */
function Conditionals({ p }: { p: MeViewProps }) {
  const { L, Lf, p: pr } = p;
  return (
    <>
      {p.webAskSlot || null}
      <FoundingChecklist L={L} Lf={Lf} kx={p.kx} hasSocial={!!(p.kx?.ig_handle || p.kx?.tiktok_handle || pr.ig_handle)} onLink={p.onLink || p.onEdit} onPost={p.onPost} />
      {p.verifyState !== 'verified' && (pr.reels.length > 0 || p.verifyState === 'pending') && !(p.verifyState === 'none' && p.verifyHidden) ? (
        <button type="button" className="mev-row mev-verify" id="meVerifyGo" onClick={p.onVerify} disabled={p.verifyState === 'pending'}>
          <span className="ic" aria-hidden="true">✓</span>
          <span className="t">{p.verifyState === 'pending' ? L('We’re checking · usually within a day') : L('Verify your face in 5 seconds')}</span>
          {p.verifyState === 'pending' ? null : <Chev />}
        </button>
      ) : null}
    </>
  );
}

function StatsLine({ p, friends, share }: { p: MeViewProps; friends?: boolean; share?: boolean }) {
  const { L, p: pr } = p;
  return (
    <div className="mev-stats" id="meStats">
      <button type="button" id="statFollowers" onClick={() => p.onList('followers')}><b>{fmtCount(pr.followers)}</b><span>{L('Followers')}</span></button>
      <button type="button" id="statFollowing" onClick={() => p.onList('following')}><b>{fmtCount(pr.following)}</b><span>{L('Following')}</span></button>
      <span><b>{fmtCount(pr.likes)}</b><span>{L('Likes')}</span></span>
      {friends && p.invites ? <span id="mevFriends"><b>{fmtN(p.invites.friends)}</b><span>{L('Friends joined')}</span></span> : null}
      {share ? <button type="button" className="kme-sharepill" id="meShare" aria-label={L('Share card')} onClick={p.onCode}><IcShare />{L('Share')}</button> : null}
    </div>
  );
}

const weekRings = (p: MeViewProps) => (p.kx ? fmtN(p.kx.week ?? 0) : '…');
const prizeText = (p: MeViewProps) => (p.weekPrize && p.weekPrize > 0 ? `฿${fmtN(p.weekPrize)}` : null);

/** A · Card + one line */
function VariantA({ p }: { p: MeViewProps }) {
  const { L } = p;
  const [open, setOpen] = useState(false);
  const prize = prizeText(p);
  return (
    <div className="kme mev mev-a" id="meView" data-mev="1">
      <TopBar p={p} more open={open} onMore={() => setOpen((o) => !o)} />
      {open ? <><div className="mev-scrim" onClick={() => setOpen(false)} /><MoreList p={p} cls="mev-pop" onPick={() => setOpen(false)} /></> : null}
      <NextIfAction p={p} />
      {p.ghost ? <p className="kme-ghost" id="meGhost" role="status"><span aria-hidden="true">👻</span>{L('Ghost mode · nobody can see you')}</p> : null}
      <Card p={p} />
      <div className="mev-line" id="kxTiles">
        <button type="button" className="c" id="kxRingsHit" onClick={p.onRings}>
          <Cap t={L('This week')} /><b>{weekRings(p)} <RingGlyph /></b>
          {p.ringsDot || (p.kx?.prizes ?? 0) > 0 ? <i className="kx-tdot" aria-label={L('New')} /> : null}
        </button>
        <button type="button" className="c" id="kxRankTile" onClick={() => (p.onRanking ? p.onRanking() : p.onRings?.())}>
          <Cap t={L('Rank')} /><b className="gd">{p.weekRank ? `#${p.weekRank}` : '–'}</b>
        </button>
        <button type="button" className="c" id="mevPrize" onClick={p.onRings}>
          <Cap t={prize ? L('Prize now') : L('Rewards')} /><b>{prize || <Chev />}</b>
        </button>
      </div>
      <Conditionals p={p} />
      <StatsLine p={p} friends />
      {p.reelsSlot}
    </div>
  );
}

/** B · Tabs: Reels / Saved / Rings / More (the grid's own Reels / Saved switch becomes the first two tabs of one bar) */
type BTab = 'reels' | 'saved' | 'rings' | 'more';
function VariantB({ p, startTab }: { p: MeViewProps; startTab?: BTab }) {
  const { L, Lf } = p;
  const [tab, setTab] = useState<BTab>(startTab || 'reels');
  const prize = prizeText(p);
  const slot = React.isValidElement(p.reelsSlot) ? (p.reelsSlot as React.ReactElement<{ onTab?: (t: 'reels' | 'saved') => void }>) : null;
  const pick = (k: BTab) => { setTab(k); if ((k === 'reels' || k === 'saved') && slot?.props.onTab) slot.props.onTab(k); };
  return (
    <div className="kme mev mev-b" id="meView" data-mev="2">
      <TopBar p={p} />
      <NextIfAction p={p} />
      {p.ghost ? <p className="kme-ghost" id="meGhost" role="status"><span aria-hidden="true">👻</span>{L('Ghost mode · nobody can see you')}</p> : null}
      <Card p={p} />
      <StatsLine p={p} />
      <Conditionals p={p} />
      <div className="mev-tabs" role="tablist">
        {(['reels', 'saved', 'rings', 'more'] as const).map((k) => (
          <button type="button" role="tab" key={k} id={`mevTab-${k}`} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
            {k === 'reels' ? L('Reels') : k === 'saved' ? L('Saved') : k === 'rings' ? <>{L('Rings')}<span className="n">{weekRings(p)}</span></> : L('More')}
          </button>
        ))}
      </div>
      {tab === 'reels' || tab === 'saved' ? <div className="mev-b-reels">{p.reelsSlot}</div> : tab === 'rings' ? (
        <div className="mev-list" id="mevRings">
          <button type="button" id="kxRingsHit" onClick={p.onRings}><span className="ic"><RingGlyph /></span><span className="t">{L('This week')}</span><b>{weekRings(p)}</b><Chev /></button>
          <button type="button" id="kxRankTile" onClick={() => (p.onRanking ? p.onRanking() : p.onRings?.())}><span className="ic gd">#</span><span className="t">{L('Weekly Ranking')}</span><b className="gd">{p.weekRank ? Lf('Rank #{0}', String(p.weekRank)) : '–'}</b><Chev /></button>
          {prize ? <button type="button" id="mevPrize" onClick={p.onRings}><span className="ic">฿</span><span className="t">{L('Prize now')}</span><b>{prize}</b><Chev /></button> : null}
          {p.invites ? <button type="button" id="mevFriends" onClick={p.onCode}><span className="ic"><IcPeople /></span><span className="t">{L('Friends joined')}</span><b>{fmtN(p.invites.friends)} · +{fmtN(p.invites.rings)} <RingGlyph /></b><Chev /></button> : null}
          <button type="button" id="mevRewards" onClick={p.onRings}><span className="ic">★</span><span className="t">{L('Rewards')}</span><Chev /></button>
        </div>
      ) : <MoreList p={p} />}
    </div>
  );
}

/** C · Small card, Reels up */
function VariantC({ p }: { p: MeViewProps }) {
  const { L } = p;
  const [open, setOpen] = useState(false);
  const prize = prizeText(p);
  return (
    <div className="kme mev mev-c" id="meView" data-mev="3">
      <TopBar p={p} more open={open} onMore={() => setOpen((o) => !o)} />
      {open ? <><div className="mev-scrim" onClick={() => setOpen(false)} /><MoreList p={p} cls="mev-pop" onPick={() => setOpen(false)} /></> : null}
      <NextIfAction p={p} />
      {p.ghost ? <p className="kme-ghost" id="meGhost" role="status"><span aria-hidden="true">👻</span>{L('Ghost mode · nobody can see you')}</p> : null}
      <Card p={p} compact />
      <div className="mev-chips" id="kxTiles">
        <button type="button" id="kxRingsHit" onClick={p.onRings}><b>{weekRings(p)}</b> <RingGlyph /> <span>{L('This week')}</span></button>
        <button type="button" id="kxRankTile" className="gd" onClick={() => (p.onRanking ? p.onRanking() : p.onRings?.())}><b>{p.weekRank ? `#${p.weekRank}` : '–'}</b> <span>{L('Rank')}</span></button>
        {prize ? <button type="button" id="mevPrize" onClick={p.onRings}><b>{prize}</b> <span>{L('Prize now')}</span></button> : null}
      </div>
      <StatsLine p={p} friends />
      <Conditionals p={p} />
      {p.reelsSlot}
    </div>
  );
}

/** D · Quick circles */
function VariantD({ p }: { p: MeViewProps }) {
  const { L } = p;
  const prize = prizeText(p);
  return (
    <div className="kme mev mev-d" id="meView" data-mev="4">
      <TopBar p={p} help install />
      <NextIfAction p={p} />
      {p.ghost ? <p className="kme-ghost" id="meGhost" role="status"><span aria-hidden="true">👻</span>{L('Ghost mode · nobody can see you')}</p> : null}
      <Card p={p} />
      <div className="mev-circles" id="kxTiles">
        <button type="button" id="kxRingsHit" onClick={p.onRings}><span className="o"><b>{weekRings(p)}</b></span><small><RingGlyph /> {L('This week')}</small></button>
        <button type="button" id="kxRankTile" onClick={() => (p.onRanking ? p.onRanking() : p.onRings?.())}><span className="o gd"><b>{p.weekRank ? `#${p.weekRank}` : '–'}</b></span><small>{L('Rank')}</small></button>
        <button type="button" id="mevPrize" onClick={p.onRings}><span className="o"><b>{prize || '★'}</b></span><small>{prize ? L('Prize now') : L('Rewards')}</small></button>
        <button type="button" id="mevFriends" onClick={p.onCode}><span className="o"><b>{p.invites ? fmtN(p.invites.friends) : <IcPeople />}</b></span><small>{L('Friends')}</small></button>
        <button type="button" id="meShare" onClick={p.onCode}><span className="o ic"><IcShare /></span><small>{L('Share')}</small></button>
      </div>
      <StatsLine p={p} />
      <Conditionals p={p} />
      {p.reelsSlot}
    </div>
  );
}

export function MeVariantView(props: MeViewProps & { mev: number }) {
  const v = props.mev;
  if (v === 1) return <VariantA p={props} />;
  if (v === 2) return <VariantB p={props} startTab={(() => { try { const t = new URLSearchParams(window.location.search).get('mevtab'); return t === 'rings' || t === 'more' || t === 'saved' ? t : undefined; } catch { return undefined; } })()} />;
  if (v === 3) return <VariantC p={props} />;
  return <VariantD p={props} />;
}

export default MeVariantView;
void React;
