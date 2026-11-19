/**
 * 0138 (19 Nov, founder): "I'm a traveller" — the traveller tag (likes and saves count ×2) needs a passport check by the team.
 * The member adds ONE photo of the passport photo page (camera or gallery, shrunk to ~1200 px JPEG), it goes to the private
 * kr8-passport bucket, and the card shows the state: pending → "We'll check within 24 h", approved → traveller, refused → reason.
 * One language at a time (L()), light look: plain lines, a dashed photo frame, one gradient button.
 */
import { useEffect, useRef, useState } from 'react';
import './kx.css';
import { reasonText, travellerView, type TravellerState, type TravellerView } from './travellerLogic';
import { v5ErrCode, v5PassportJpeg, v5RequestTraveller } from './v5Live';
import { v5ErrText } from './v5Strings';

type Tx = (en: string) => string;

const ROW_SUB: Record<TravellerView, string> = {
  none: 'Visiting Bangkok? Ask for the traveller tag',
  pending: 'Checking your passport · within 24 h',
  approved: '✓ Verified traveller',
  refused: 'Not approved · tap to see why',
};

/** The row on the card edit screen (where "Visiting Bangkok / I live here" used to be). */
export function TravellerRow(props: { L: Tx; state: TravellerState | null; cardWho?: string | null; onOpen: () => void }) {
  const v = travellerView(props.state, props.cardWho);
  return (
    <button type="button" className={`kx-lr kt-row${v === 'approved' ? ' on' : ''}`} id="kxTravRow" data-state={v} onClick={props.onOpen}>
      <span className="kt-plane" aria-hidden="true">✈</span>
      <span>{props.L('Traveller tag')}<em className={v === 'refused' ? 'bad' : v === 'pending' ? 'wait' : undefined}>{props.L(ROW_SUB[v])}</em></span>
      <b className="kt-chev" aria-hidden="true">›</b>
    </button>
  );
}

/** Full page: the request form, or the pending / approved state. */
export function TravellerPage(props: {
  L: Tx; state: TravellerState | null; cardWho?: string | null; onClose: () => void; onSent: (s: TravellerState) => void;
  /** tests / harness: replaces the real upload */ send?: (b: Blob) => Promise<TravellerState>;
}) {
  const { L } = props;
  const view = travellerView(props.state, props.cardWho);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const [err, setErr] = useState('');
  const busyRef = useRef(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setShrinking(true); setErr('');
    try {
      const b = await v5PassportJpeg(f);
      setBlob(b);
      setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); });
    } catch { setErr(L('That photo didn’t work. Try another one.')); } finally { setShrinking(false); }
  };
  const send = async () => {
    if (!blob || busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr('');
    try {
      const s = await (props.send || v5RequestTraveller)(blob);
      setBlob(null);
      props.onSent(s);
    } catch (e) {
      const c = v5ErrCode(e);
      setErr(c === 'SLOW_DOWN' ? L('Slow down a little and try again soon.') : c === 'UPLOAD' || c === 'BAD_FILE' ? L('The upload didn’t finish. Tap Send again.') : L(v5ErrText(c)[0]));
    } finally { busyRef.current = false; setBusy(false); }
  };
  const file = (capture?: 'environment') => (
    <input type="file" accept="image/*" capture={capture} onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ''; }} />
  );
  const privacy = <p className="kt-priv" id="ktPrivacy"><span aria-hidden="true">🔒</span>{L('Only the Kring team sees this photo, never other members. We delete it as soon as we decide, and always within 30 days.')}</p>;

  if (view === 'pending' || view === 'approved') {
    return (
      <div className="kx-page kt-page" id="kxTraveller" data-state={view}>
        <div className="kx-hd">
          <button type="button" className="kx-x" aria-label={L('Close')} onClick={props.onClose}>✕</button>
          <h1>{L('Traveller tag')}</h1><span className="kx-st" />
        </div>
        <div className="kt-state" id={view === 'pending' ? 'ktPending' : 'ktApproved'} role="status">
          <span className={`kt-big ${view}`} aria-hidden="true">{view === 'pending' ? '✈' : '✓'}</span>
          <h2>{view === 'pending' ? L('We’re checking your passport') : L('You’re a verified traveller')}</h2>
          <p>{view === 'pending' ? L('We’ll check within 24 h') : L('Your likes and saves now count double.')}</p>
          {view === 'pending' ? privacy : null}
        </div>
        <div className="kx-cta"><button type="button" className="kx-btn ghost" id="ktDone" onClick={props.onClose}>{L('Done')}</button></div>
      </div>
    );
  }

  // the team's "other" note is written in English: shown as written only in English mode (one language at a time)
  const english = L('Traveller tag') === 'Traveller tag';
  const why = view === 'refused' ? reasonText(L, props.state?.request, english) : '';
  return (
    <div className="kx-page kt-page" id="kxTraveller" data-state={view}>
      <div className="kx-hd">
        <button type="button" className="kx-x" aria-label={L('Close')} onClick={props.onClose}>✕</button>
        <h1>{L('Traveller tag')}</h1><span className="kx-st" />
      </div>
      <div className="kt-body">
        {view === 'refused' ? (
          <p className="kt-refused" id="ktRefused" role="status">
            <b>{L('We couldn’t approve this')}</b>
            {why ? <span>{why}</span> : null}
            <small>{L('Try again with a new photo.')}</small>
          </p>
        ) : null}
        <h2 className="kt-h">{L('Visiting Bangkok?')}</h2>
        <p className="kt-lead">{L('A traveller’s likes and saves count double. To keep it fair, our team checks one photo of your passport first.')}</p>
        <label className={`kt-frame${url ? ' has' : ''}`} id="ktFrame">
          {url ? <img src={url} alt={L('Your passport photo page')} /> : (
            <>
              <span className="pl" aria-hidden="true">+</span>
              <b>{shrinking ? L('Checking photo…') : L('Add a photo of your passport photo page')}</b>
            </>
          )}
          {file()}
        </label>
        <div className="kt-pick">
          <label className="kt-link" id="ktCamera">{L('Take a photo')}{file('environment')}</label>
          <i aria-hidden="true">·</i>
          <label className="kt-link" id="ktGallery">{url ? L('Change photo') : L('Choose from gallery')}{file()}</label>
        </div>
        <div className="kt-check" id="ktCheck">
          <b>{L('What we check')}</b>
          <ul>
            <li>{L('Same name as on your card')}</li>
            <li>{L('The photo is you')}</li>
            <li>{L('It’s a non-Thai passport')}</li>
          </ul>
        </div>
        {privacy}
        <p className="kt-priv"><span aria-hidden="true">✋</span>{L('You can cover your passport number. We don’t need it.')}</p>
        <p className="kt-priv kt-consent" id="ktConsent"><span aria-hidden="true">✓</span>{L('By tapping Send, you agree that the Kring team may look at this photo only to check the traveller tag.')}</p>
        {err ? <p className="kx-err" role="alert" id="ktErr">{err}</p> : null}
      </div>
      <div className="kx-cta">
        <button type="button" className="kx-btn" id="ktSend" disabled={!blob || busy || shrinking} aria-busy={busy} onClick={() => void send()}>
          {busy ? L('Sending…') : L('Send for check')}
        </button>
      </div>
    </div>
  );
}
