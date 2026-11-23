/**
 * 20 Nov (founder): "This or that" at the top of Ask BKK as a full-bleed hero. Before the vote: ~50% of the screen, the two
 * photos edge to edge split down the middle (no card, no border, no side margins), the question in bold over a soft top fade,
 * a glowing "or / หรือ" on the seam, each half one big tap target, no numbers (the server still hides them).
 * On vote: the existing reveal (glow + ✓ on the pick, the other dims, bars rise from the bottom, "Vote counted ✓", haptic);
 * ~2 s later it folds into a slim glass strip ("You picked Rooftop bar · 62%") and the questions rise; a tap opens it again.
 * Already voted on a later visit → the strip; a new day's question → the full hero again.
 *
 * 24 Nov (founder): three upgrades. (1) No digits under 10 votes — the count is said in words instead ("7 voted so far ·
 * result at 10"), and the folded strip drops the percentage too; the bars still rise. (2) Under the pair, the first names
 * (and photos) of up to 3 other voters plus a count. (3) Guess first: before the vote each side carries a big "?" and the
 * question line asks which side everyone else picked.
 */
import React, { useEffect, useState } from 'react';
import './totHero.css';

type K = 'a' | 'b';
export interface TotHeroProps {
  th: boolean; q: string; imgs: Record<K, string>; lab: (k: K) => string; pct: (k: K) => number;
  pick: K | null; busy: K | null; shown: boolean; grow: boolean; fresh: boolean;
  onPick: (k: K) => void; summary: string; counted: string; locked: string; ringChip: React.ReactNode; cap: React.ReactNode;
  /** 24 Nov: digits only from 10 votes (below that `countLine` says how many voted, in words) */
  nums: boolean; countLine: string; who: React.ReactNode;
  /** 24 Nov: before the vote both sides are covered with a "?" and `guessQ` sits under the question as the game */
  guessQ: string; picked: string;
  /** 24 Nov: one-tap reasons (m204) + the guess streak (m205). Rendered under the pair and OUTSIDE `.toth-hero`, so they
   *  survive the fold into the slim strip — the reason chips stay tappable after the hero has closed. */
  after?: React.ReactNode;
}
export const TOT_FOLD_MS = 2000;

export function TotHero(p: TotHeroProps) {
  const [folded, setFolded] = useState(p.shown && !p.fresh);
  // voted in this view (set on tap, before the store update re-renders us) → play the reveal, fold 2 s later
  const [here, setHere] = useState(false);
  const fresh = p.fresh || here;
  useEffect(() => {
    if (!p.shown) { setFolded(false); return undefined; }
    if (!fresh) { setFolded(true); return undefined; }
    const t = setTimeout(() => setFolded(true), TOT_FOLD_MS);
    return () => clearTimeout(t);
  }, [p.shown, fresh]);
  const mine = p.pick || p.busy;
  const chosen = (p.pick || p.busy || 'a') as K;
  const extra = p.shown && (!p.nums || !!p.who);
  return (
    <div className={`toth${p.shown ? ' shown' : ''}${folded ? ' folded' : ''}${mine ? ' voted' : ''}${extra ? ' extra' : ''}`} id="totCard" lang={p.th ? 'th' : 'en'}>
      <button type="button" className="toth-strip" aria-expanded={!folded} tabIndex={folded ? 0 : -1} aria-hidden={!folded}
        onClick={() => setFolded(false)} data-tot-strip="1">
        <span className="toth-thumb" style={{ backgroundImage: `url('${p.imgs[chosen]}')` }} aria-hidden="true" />
        <span className="toth-st">
          <b>{p.nums ? `${p.picked} · ${p.pct(chosen)}%` : p.picked}</b>
          {/* 24 Nov audit: folded, the count vanished and a quiet day looked finished. Under 10 votes the strip says
              how it stands; from 10 the percentage is on the line above, so the question comes back. */}
          <small>{p.nums || !p.countLine ? p.q : p.countLine}</small>
        </span>
        <span className="toth-chev" aria-hidden="true">⌄</span>
      </button>
      <div className="toth-hero" aria-hidden={folded}>
        <div className="toth-pair">
          {(['a', 'b'] as K[]).map((k) => {
            const me = mine === k;
            return (
              <button type="button" key={k} data-side={k} className={`toth-side${me ? ' mine' : mine ? ' other' : ''}`} disabled={!!mine} aria-pressed={me}
                tabIndex={folded ? -1 : 0} onClick={() => { setHere(true); p.onPick(k); }}>
                <img src={p.imgs[k]} alt="" draggable={false} />
                <span className="toth-bfade" aria-hidden="true" />
                {mine ? null : <span className="toth-qm" aria-hidden="true">?</span>}
                {me ? <span className="toth-check" aria-hidden="true">✓</span> : null}
                <span className="toth-nm">{p.lab(k)}</span>
                {p.shown ? <span className="toth-bar" aria-hidden="true"><i style={{ height: p.grow ? `${Math.max(6, p.pct(k))}%` : '0%' }} /></span> : null}
                {p.shown && p.nums ? <b className="toth-pc">{p.pct(k)}%</b> : null}
              </button>
            );
          })}
          <span className="toth-tfade" aria-hidden="true" />
          <div className="toth-top">
            <span className="toth-cap">{p.cap}</span>
            {/* 24 Nov audit: the question used to be REPLACED by the guess line, so a member voted without being told
                what they were voting on — fatal on a price check ("฿80 or ฿150" over two photos). The question always
                shows; the guess is the line under it. */}
            <h3 className="toth-q">{p.q}</h3>
            {mine ? null : <p className="toth-sub">{p.guessQ}</p>}
          </div>
          <span className="toth-or" aria-hidden="true">{p.th ? 'หรือ' : 'or'}</span>
          {extra ? (
            <div className="toth-under">
              {p.nums ? null : <span className="toth-cnt">{p.countLine}</span>}
              {p.who}
            </div>
          ) : null}
          {p.shown ? (
            <div className="toth-foot" role="status">
              <span className="toth-sum">{p.summary}</span>
              <span className="toth-chip ok">{fresh ? p.counted : p.locked}</span>{p.ringChip}
            </div>
          ) : null}
          {p.shown && !folded ? <button type="button" className="toth-fold" aria-label="⌃" onClick={() => setFolded(true)}>⌃</button> : null}
        </div>
      </div>
      {p.after}
    </div>
  );
}
