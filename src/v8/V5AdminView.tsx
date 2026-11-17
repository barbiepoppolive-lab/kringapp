/**
 * Admin view (17 Nov, founder): the small "Admin view · ghost" pill at the top of every screen, and the Me tab for an admin
 * sign-in without a card. English only, like the admin page (founder, 13 Nov).
 */
import { useState } from 'react';
import './adminView.css';

type L = (en: string) => string;

/** Top pill. Tap → "Open admin panel" / "Exit admin view". */
export function AdminViewPill(props: { L: L; panelHref: string; onExit: () => void }) {
  const { L } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="kav-wrap" id="adminViewPill">
      <button type="button" className="kav-pill" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="kav-dot" aria-hidden="true" />{L('Admin view · ghost')}
      </button>
      {open ? (
        <div className="kav-menu" role="menu">
          <a role="menuitem" className="kav-item" href={props.panelHref} id="adminViewPanel">{L('Open admin panel')}</a>
          <button role="menuitem" type="button" className="kav-item exit" id="adminViewExit" onClick={() => { setOpen(false); props.onExit(); }}>{L('Exit admin view')}</button>
          <p className="kav-note">{L('Read-only. Nobody sees you; nothing you open is counted.')}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Me tab for an admin without a card: shortcuts to the screens a member reaches from Me. */
export function AdminViewMe(props: { L: L; panelHref: string; onRanking: () => void; onRewards: () => void; onPending: () => void; onExit: () => void }) {
  const { L } = props;
  return (
    <div className="kav-me" id="adminViewMe">
      <div className="kav-me-h">
        <span className="kav-rings" aria-hidden="true"><i /><i /></span>
        <h1>{L('Admin view')}</h1>
        <p>{L('You are looking at Kring as members see it. You have no card, so nobody sees you.')}</p>
      </div>
      <button type="button" className="kav-row" id="adminViewRanking" onClick={props.onRanking}><span>{L('Weekly ranking')}</span><em>›</em></button>
      <button type="button" className="kav-row" id="adminViewRewards" onClick={props.onRewards}><span>{L('Rewards and Rings rules')}</span><em>›</em></button>
      <button type="button" className="kav-row" id="adminViewPending" onClick={props.onPending}><span>{L('Reels waiting for review')}</span><em>›</em></button>
      <a className="kav-row" href={props.panelHref}><span>{L('Open admin panel')}</span><em>›</em></a>
      <button type="button" className="kav-row exit" onClick={props.onExit}><span>{L('Exit admin view')}</span></button>
    </div>
  );
}
