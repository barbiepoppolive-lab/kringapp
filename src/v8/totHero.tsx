/**
 * 20 Nov (founder): "This or that" at the top of Ask BKK as a full-bleed hero. Before the vote: ~50% of the screen, the two
 * photos edge to edge split down the middle (no card, no border, no side margins), the question in bold over a soft top fade,
 * a glowing "or / หรือ" on the seam, each half one big tap target, no numbers (the server still hides them).
 * On vote: the existing reveal (glow + ✓ on the pick, the other dims, bars rise from the bottom, "Vote counted ✓", haptic);
 * ~2 s later it folds into a slim glass strip ("You picked Rooftop bar · 62%") and the questions rise; a tap opens it again.
 * Already voted on a later visit → the strip; a new day's question → the full hero again.
 */
import React, { useEffect, useState } from 'react';
import './totHero.css';

type K = 'a' | 'b';
export interface TotHeroProps {
  th: boolean; q: string; imgs: Record<K, string>; lab: (k: K) => string; pct: (k: K) => number;
  pick: K | null; busy: K | null; shown: boolean; grow: boolean; fresh: boolean;
  onPick: (k: K) => void; summary: string; counted: string; locked: string; ringChip: React.ReactNode; cap: React.ReactNode;
}
export const TOT_FOLD_MS = 2000;

export function TotHero(p: TotHeroProps) {
  const [folded, setFolded] = useState(p.shown && !p.fresh);
  useEffect(() => {
    if (!p.shown) { setFolded(false); return undefined; }
    if (!p.fresh) { setFolded(true); return undefined; }
    const t = setTimeout(() => setFolded(true), TOT_FOLD_MS);
    return () => clearTimeout(t);
  }, [p.shown, p.fresh]);
  const mine = p.pick || p.busy;
  const chosen = (p.pick || p.busy || 'a') as K;
  return (
    <div className={`toth${p.shown ? ' shown' : ''}${folded ? ' folded' : ''}${mine ? ' voted' : ''}`} id="totCard" lang={p.th ? 'th' : 'en'}>
      <button type="button" className="toth-strip" aria-expanded={!folded} tabIndex={folded ? 0 : -1} aria-hidden={!folded}
        onClick={() => setFolded(false)} data-tot-strip="1">
        <span className="toth-thumb" style={{ backgroundImage: `url('${p.imgs[chosen]}')` }} aria-hidden="true" />
        <span className="toth-st">
          <b>{p.th ? `คุณเลือก ${p.lab(chosen)} · ${p.pct(chosen)}%` : `You picked ${p.lab(chosen)} · ${p.pct(chosen)}%`}</b>
          <small>{p.q}</small>
        </span>
        <span className="toth-chev" aria-hidden="true">⌄</span>
      </button>
      <div className="toth-hero" aria-hidden={folded}>
        <div className="toth-pair">
          {(['a', 'b'] as K[]).map((k) => {
            const me = mine === k;
            return (
              <button type="button" key={k} data-side={k} className={`toth-side${me ? ' mine' : mine ? ' other' : ''}`} disabled={!!mine} aria-pressed={me}
                tabIndex={folded ? -1 : 0} onClick={() => p.onPick(k)}>
                <img src={p.imgs[k]} alt="" draggable={false} />
                <span className="toth-bfade" aria-hidden="true" />
                {me ? <span className="toth-check" aria-hidden="true">✓</span> : null}
                <span className="toth-nm">{p.lab(k)}</span>
                {p.shown ? <span className="toth-bar" aria-hidden="true"><i style={{ height: p.grow ? `${Math.max(6, p.pct(k))}%` : '0%' }} /></span> : null}
                {p.shown ? <b className="toth-pc">{p.pct(k)}%</b> : null}
              </button>
            );
          })}
          <span className="toth-tfade" aria-hidden="true" />
          <div className="toth-top">
            <span className="toth-cap">{p.cap}</span>
            <h3 className="toth-q">{p.q}</h3>
          </div>
          <span className="toth-or" aria-hidden="true">{p.th ? 'หรือ' : 'or'}</span>
          {p.shown ? (
            <div className="toth-foot" role="status">
              <span className="toth-sum">{p.summary}</span>
              <span className="toth-chip ok">{p.fresh ? p.counted : p.locked}</span>{p.ringChip}
            </div>
          ) : null}
          {p.shown && !folded ? <button type="button" className="toth-fold" aria-label="⌃" onClick={() => setFolded(true)}>⌃</button> : null}
        </div>
      </div>
    </div>
  );
}
