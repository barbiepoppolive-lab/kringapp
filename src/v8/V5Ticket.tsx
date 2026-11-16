/**
 * Live pass. OPTION A (D-10NOV-E, 0034): src 'here' from Deals → "I'm here" (opening = the use, staff just look). Old stand links (D-10NOV-C, 0032) still work. Opened by the venue's counter stand QR: kringapp.com/app/?v=<slug>&src=stand
 *  signed out → venue + treat + "Sign in to get your treat" (the ticket opens again right after sign-in)
 *  ready      → moving rings + live Bangkok clock (a screenshot can't fake it) + 10-minute countdown + "Slide to use" for the staff
 *  used       → big green ✅ Used + the time it was used (stays this way for the rest of the day at this café)
 *  errors     → used today · daily limit reached · expired (scan the stand again) · no treat right now · venue not found
 * One language per screen: every visible string goes through L().
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { v5ErrCode, v5HerePass, v5PassGiven, v5StandInfo, v5StandTicket, v5TicketUse, type V5StandInfo, type V5Ticket } from './v5Live';
import './ticket.css';

type Tx = (en: string) => string;
type Phase = 'loading' | 'signin' | 'ready' | 'used' | 'expired' | 'error' | 'far';

const ERR_TEXT: Record<string, [string, string]> = {
  NO_VENUE: ['We can’t find this place', 'Ask the staff for the Kring stand, or open Deals'],
  NO_TREAT: ['No treat here right now', 'This place has paused its treat. Check Deals for others nearby'],
  DAILY_CAP: ['Today’s treats are all used', 'This place has reached its daily limit. Try again tomorrow'],
  SOLD_OUT: ['Today’s treats are all used', 'This place has reached its daily limit. Try again tomorrow'],
  USED_TODAY: ['Already used today', 'One treat per person per place each day. See you tomorrow'],
  TICKET_EXPIRED: ['Ticket expired', 'Tickets last 10 minutes. One treat per person per place each day'],
  NO_TICKET: ['This ticket isn’t yours', 'Each pass works only on the phone that opened it'],
  OFFLINE: ['You’re offline', 'Connect to the internet and try again'],
  NETWORK: ['Connection problem', 'Check your internet and try again'],
};

export const bkkClock = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function V5TicketSheet(props: { L: Tx; lang: string; slug: string; src: string; lat?: number | null; lng?: number | null; signedIn: boolean; authReady: boolean; onSignIn: () => void; onClose: () => void; onDeals: () => void; onSettled?: () => void }) {
  const { L, lang } = props;
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<V5StandInfo | null>(null);
  const [tk, setTk] = useState<V5Ticket | null>(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(t);
  }, []);

  const here = props.src === 'here';
  const fail = (e: unknown) => {
    const c = v5ErrCode(e);
    if (c === 'FAR') { setPhase('far'); return; }
    if (c === 'SIGN_IN' || c === 'NO_CARD') { setPhase('signin'); return; }
    if (c === 'TICKET_EXPIRED') { setPhase('expired'); return; }
    setErr(c); setPhase('error');
  };

  useEffect(() => {
    let dead = false;
    (async () => {
      setPhase('loading');
      {
        const i = await v5StandInfo(props.slug).catch(() => null);
        if (dead) return;
        setInfo(i);
        // a Deals tile passes a treat id (not a venue slug): the pass itself brings the venue, so only plain place links must resolve here
        if (!i && !here) { setErr('NO_VENUE'); setPhase('error'); return; }
      }
      if (!props.signedIn) { if (props.authReady) setPhase('signin'); return; }
      try {
        const t = here ? await v5HerePass(props.slug, props.lat ?? null, props.lng ?? null) : await v5StandTicket(props.slug, props.src);
        if (dead) return;
        setTk(t);
        if (t.venue) setInfo(t.venue);
        setPhase(t.status === 'used' ? 'used' : 'ready');
      } catch (e) { if (!dead) fail(e); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug, props.signedIn, props.authReady]);

  // once the ticket is on screen for a signed-in member, the "resume after sign-in" note is no longer needed
  useEffect(() => { if (phase !== 'loading' && phase !== 'signin') props.onSettled?.(); }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps
  const left = tk && phase === 'ready' ? new Date(tk.expires_at).getTime() - now.getTime() : 0;
  useEffect(() => { if (phase === 'ready' && tk && left <= 0) setPhase(here ? 'used' : 'expired'); }, [phase, tk, left]);   // eslint-disable-line react-hooks/exhaustive-deps

  const anyway = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const t = await v5HerePass(props.slug, props.lat ?? null, props.lng ?? null, true);
      setTk(t); if (t.venue) setInfo(t.venue);
      setPhase(t.status === 'used' ? 'used' : 'ready');
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const given = async () => {
    if (!tk || busy || tk.given_at) return;
    setBusy(true);
    try {
      const r = await v5PassGiven(tk.code);
      setTk({ ...tk, given_at: r.given_at });
      try { navigator.vibrate?.(60); } catch { /* ignore */ }
    } catch (e) { fail(e); }
    setBusy(false);
  };

  const use = async () => {
    if (!tk || busy) return;
    setBusy(true);
    try {
      const r = await v5TicketUse(tk.code);
      setTk({ ...tk, status: 'used', used_at: r.used_at });
      setPhase('used');
      try { navigator.vibrate?.(60); } catch { /* ignore */ }
    } catch (e) { fail(e); }
    setBusy(false);
  };

  const venueName = info ? (lang === 'th' && info.name_th ? info.name_th : info.name) : '';
  const treat = info ? ((lang === 'th' ? info.deal_th || info.deal_en : info.deal_en || info.deal_th) || '') : '';
  const usedAt = tk?.used_at ? bkkClock(new Date(tk.used_at)) : '';

  return (
    <div className={`ktk ktk-${phase}`} role="dialog" aria-modal="true" aria-label={L('Kring ticket')} data-phase={phase}>
      <button type="button" className="ktk-x" aria-label={L('Close')} onClick={props.onClose}>×</button>
      <div className="ktk-head">
        <span className="ktk-brand">Kring</span>
        {info?.practice ? <span className="ktk-practice" id="tkPractice">{L('Practice')}</span> : null}
      </div>
      <div className="ktk-venue">
        <b id="tkVenue">{venueName || ' '}</b>
        {info?.area ? <small>{L(info.area)}</small> : null}
      </div>

      {phase === 'loading' && <div className="ktk-body"><div className="ktk-rings"><i /><i /></div></div>}

      {phase === 'signin' && (
        <div className="ktk-body">
          {treat ? <p className="ktk-treat" id="tkTreat">{treat}</p> : null}
          <p className="ktk-msg">{L('Sign in to get your treat')}</p>
          <small className="ktk-sub">{L('It takes a minute. Your ticket opens right after.')}</small>
          <button type="button" className="ktk-cta" id="tkSignIn" onClick={props.onSignIn}>{L('Sign in')}</button>
        </div>
      )}

      {phase === 'far' && (
        <div className="ktk-body">
          <div className="ktk-big">📍</div>
          <p className="ktk-msg" id="tkFar">{L('You seem far from this place')}</p>
          <small className="ktk-sub">{L('Use your treat when you’re there. It counts as used as soon as the pass opens.')}</small>
          <button type="button" className="ktk-cta" id="tkAnyway" disabled={busy} onClick={anyway}>{L('I’m here, open my pass')}</button>
          <button type="button" className="ktk-ghost" onClick={props.onClose}>{L('Not now')}</button>
        </div>
      )}

      {phase === 'ready' && tk && here && (
        <div className="ktk-body ktk-here">
          <div className="ktk-who">
            {tk.photo ? <img className="ktk-face" src={tk.photo} alt="" /> : <span className="ktk-face ph" aria-hidden="true">{(tk.name || 'K').slice(0, 1)}</span>}
            <b id="tkName">{tk.name || ''}</b>
          </div>
          <div className="ktk-rings live" aria-hidden="true"><i /><i /></div>
          <div className="ktk-clock" id="tkClock" aria-live="off">{bkkClock(now)}</div>
          <small className="ktk-sub">{L('Live pass · Bangkok time')}</small>
          <p className="ktk-treat" id="tkTreat">{treat}</p>
          {/* audit P3-9: once staff tapped Given, the countdown stops (it kept saying "Valid for 9:50") */}
          {tk.given_at ? null : <div className="ktk-left" id="tkLeft">{L('Valid for')} <b>{mmss(left)}</b></div>}
          <p className="ktk-staff">{L('Show this to the staff, any time: ordering, eating or paying.')}</p>
          {tk.given_at
            ? <div className="ktk-given" id="tkGiven">✅ {L('Given')} · {bkkClock(new Date(tk.given_at))}</div>
            : <button type="button" className="ktk-givebtn" id="tkGive" disabled={busy} onClick={given}>{L('Staff: tap when you give it')}</button>}
          <small className="ktk-code">{tk.code}</small>
        </div>
      )}

      {phase === 'ready' && tk && !here && (
        <div className="ktk-body">
          <div className="ktk-rings live" aria-hidden="true"><i /><i /></div>
          <div className="ktk-clock" id="tkClock" aria-live="off">{bkkClock(now)}</div>
          <small className="ktk-sub">{L('Live ticket · Bangkok time')}</small>
          <p className="ktk-treat" id="tkTreat">{treat}</p>
          <div className="ktk-left" id="tkLeft">{L('Valid for')} <b>{mmss(left)}</b></div>
          <p className="ktk-staff">{L('Show this to the staff. Staff: slide to use.')}</p>
          <Slider label={L('Slide to use')} busy={busy} onDone={use} />
          <small className="ktk-code">{tk.code}</small>
        </div>
      )}

      {phase === 'used' && (
        <div className="ktk-body">
          <div className="ktk-ok" aria-hidden="true">✅</div>
          <div className="ktk-usedword" id="tkUsed">{L('Used')}</div>
          <div className="ktk-clock small">{usedAt}</div>
          {treat ? <p className="ktk-treat">{treat}</p> : null}
          <p className="ktk-sub">{L('Enjoy! One treat per person per place each day.')}</p>
          <div className="ktk-clock tiny" aria-hidden="true">{bkkClock(now)}</div>
          <button type="button" className="ktk-ghost" onClick={props.onClose}>{L('Done')}</button>
        </div>
      )}

      {phase === 'expired' && (
        <div className="ktk-body">
          <div className="ktk-big">⏱</div>
          <p className="ktk-msg" id="tkErr" data-code="TICKET_EXPIRED">{L(ERR_TEXT.TICKET_EXPIRED[0])}</p>
          <small className="ktk-sub">{L(ERR_TEXT.TICKET_EXPIRED[1])}</small>
          <button type="button" className="ktk-ghost" onClick={props.onClose}>{L('Close')}</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ktk-body">
          <div className="ktk-big">{err === 'USED_TODAY' ? '✅' : '🙏'}</div>
          <p className="ktk-msg" id="tkErr" data-code={err}>{L((ERR_TEXT[err] || ['Something went wrong', 'Please try again'])[0])}</p>
          <small className="ktk-sub">{L((ERR_TEXT[err] || ['Something went wrong', 'Please try again'])[1])}</small>
          <button type="button" className="ktk-ghost" onClick={props.onDeals}>{L('See other deals')}</button>
        </div>
      )}
    </div>
  );
}

/** Staff "slide to use": drag the knob to the end (keyboard: focus + → or End). Half-way slides spring back. */
function Slider(props: { label: string; busy: boolean; onDone: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLButtonElement>(null);
  const [x, setXs] = useState(0);
  const xRef = useRef(0);   // the latest position (pointer-up can arrive before React re-renders on a slow phone)
  const setX = (v: number) => { xRef.current = v; setXs(v); };
  const drag = useRef<{ start: number; max: number } | null>(null);
  const KNOB = 56;
  const done = () => { props.onDone(); };
  // the whole track listens (a thumb that lands a little off the knob still grabs it); capture keeps the drag on the track
  const down = (e: RPE) => {
    const t = track.current;
    if (props.busy || !t) return;
    // where the knob really is on screen (it may still be springing back from an earlier half slide)
    const kr = knob.current?.getBoundingClientRect();
    const tl = t.getBoundingClientRect().left + 2;
    const at = kr ? Math.max(0, kr.left - tl) : xRef.current;
    if (e.clientX < tl + at - 24 || e.clientX > tl + at + KNOB + 24) return;
    try { t.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drag.current = { start: e.clientX - at, max: t.clientWidth - KNOB - 8 };
    setX(at);
  };
  const move = (e: RPE) => {
    if (!drag.current) return;
    setX(Math.max(0, Math.min(drag.current.max, e.clientX - drag.current.start)));
  };
  const up = () => {
    if (!drag.current) return;
    const { max } = drag.current;
    drag.current = null;
    if (xRef.current >= max * 0.85) { setX(max); done(); } else setX(0);
  };
  return (
    <div className="ktk-slide" ref={track} id="tkSlide" data-busy={props.busy ? '1' : ''}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <span className="ktk-slide-label" style={{ opacity: Math.max(0, 1 - x / 160) }}>{props.label} →</span>
      <button type="button" ref={knob} className="ktk-knob" id="tkKnob" role="slider" aria-label={props.label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(track.current ? (x / Math.max(1, track.current.clientWidth - KNOB - 8)) * 100 : 0)}
        style={{ transform: `translateX(${x}px)`, transition: drag.current ? 'none' : 'transform .25s ease' }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'End') { e.preventDefault(); if (track.current) setX(track.current.clientWidth - KNOB - 8); done(); } }}>
        {props.busy ? '⏳' : '→'}
      </button>
    </div>
  );
}

/** Deals → partner treat (OPTION A, D-10NOV-E): nothing at the place. Go there, tap "I'm here", show the live pass to staff. */
export function StandHowSheet(props: { L: Tx; venue: string; area: string; treat: string; mapsUrl?: string; busy?: boolean; onHere: () => void; onClose: () => void }) {
  const { L } = props;
  return (
    <div className="ktk ktk-how" role="dialog" aria-modal="true" aria-label={L('How to use')} data-phase="how" id="standHow">
      <button type="button" className="ktk-x" aria-label={L('Close')} onClick={props.onClose}>×</button>
      <div className="ktk-head"><span className="ktk-brand">Kring</span></div>
      <div className="ktk-venue"><b>{props.venue}</b><small>{L(props.area)}</small></div>
      <div className="ktk-body">
        {props.treat ? <p className="ktk-treat">{props.treat}</p> : null}
        <ol className="ktk-steps">
          <li><b>1</b><span>{L('Go to the place')}</span></li>
          <li><b>2</b><span>{L('Tap “I’m here” when you’re there')}</span></li>
          <li><b>3</b><span>{L('Show your live pass to the staff, any time')}</span></li>
        </ol>
        <small className="ktk-sub">{L('One treat per person per place each day.')}</small>
        <button type="button" className="ktk-cta" id="hereBtn" disabled={props.busy} onClick={props.onHere}>{props.busy ? L('Checking you’re at the place…') : L('I’m here')}</button>
        {props.mapsUrl ? <a className="ktk-ghost" href={props.mapsUrl} target="_blank" rel="noopener noreferrer">{L('Open in Maps')}</a> : null}
      </div>
    </div>
  );
}
