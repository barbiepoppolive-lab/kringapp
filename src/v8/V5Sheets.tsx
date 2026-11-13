/** V5 sheets: real sign-in (Google + email code), member card create/edit, scannable QR pass. Only used when VITE_AUTH_LIVE=1. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { v5StoredRef, v5AcceptTerms, v5CompressImage, v5ErrCode, v5SaveCard, v5SetIgHandle, v5SendCode, v5SignInGoogle, v5SignInLine, v5TakeLinePrefill, v5VerifyCode, V5_AREAS, V5_LANGS, v5LineOn, V5_TERMS_VERSION } from './v5Live';
import type { V5Card, V5Me } from './v5Live';
import { v5ErrText } from './v5Strings';
import { inAppBrowser } from './A2HS';
import { liffUrl } from './lineEnv';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;
const noteStyle: React.CSSProperties = { margin: '0 0 12px', padding: '10px 12px', borderRadius: 14, background: 'rgba(91,108,255,0.18)', fontSize: 13, fontWeight: 700 };
const smallStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 12.5, color: 'rgba(255,247,236,0.78)', lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 800, margin: '10px 0 6px', color: 'rgba(255,247,236,0.86)' };

/** "By continuing you agree to the {0} and the {1}." with real links (A-05). */
export function TermsLine(props: { L: Tx; id?: string; style?: React.CSSProperties }) {
  const { L } = props;
  const parts = L('By continuing you agree to the {0} and the {1}.').split(/(\{0\}|\{1\})/);
  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener" style={{ color: '#FF8CC4', fontWeight: 800 }}>{label}</a>
  );
  return (
    <p id={props.id} style={{ ...smallStyle, ...props.style }}>
      {parts.map((x, i) => (x === '{0}' ? <React.Fragment key={i}>{link('/terms.html', L('Terms'))}</React.Fragment>
        : x === '{1}' ? <React.Fragment key={i}>{link('/privacy.html', L('Privacy notice'))}</React.Fragment> : <React.Fragment key={i}>{x}</React.Fragment>))}
    </p>
  );
}

function useErr(L: Tx, Lf: Txf) {
  return (e: unknown, name = '') => {
    const [k, a] = v5ErrText(typeof e === 'string' ? e : v5ErrCode(e), name);
    return a !== undefined ? Lf(k, a) : L(k);
  };
}

/** Google refuses sign-in inside app browsers (LINE, Instagram, TikTok, Facebook: "disallowed_useragent"), so it is never offered there. */
const googleHere = () => import.meta.env.VITE_GOOGLE_ON === '1' && !inAppBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent);
/** "pich" → "Pich" for the invite line. */
const refName = (r: string) => r.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 24);

export function V5SignInSheet(props: { L: Tx; Lf: Txf; onClose: () => void; initialNotice?: string; invitedBy?: string }) {
  const { L, Lf } = props;
  const errText = useErr(L, Lf);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(props.initialNotice || '');
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (step !== 'code') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);
  const wait = Math.max(0, 30 - Math.floor((now - sentAt) / 1000));   // A-20: a new code after 30 s
  const busyRef = useRef(false); // double-tap guard
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const google = () =>
    run(async () => {
      const r = await v5SignInGoogle();
      if (r !== 'redirect') setNotice(errText(r));
    });
  // LIFF build + not inside LINE: "Join with LINE" opens the LINE app (liff.line.me), which asks permission natively.
  // Inside LINE (chat browser or LIFF) the one-tap web login below stays. Empty VITE_LIFF_ID: always '' (old behaviour).
  const liffJoin = import.meta.env.VITE_LIFF_ID && inAppBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent) !== 'line' ? liffUrl(v5StoredRef()) : '';
  const line = () =>
    run(async () => {
      if (liffJoin) {
        window.location.assign(liffJoin);
        return;
      }
      const r = await v5SignInLine();
      if (r !== 'redirect') setNotice(errText(r));
    });
  const sendCode = (again = false) =>
    run(async () => {
      const clean = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        setNotice(L('Enter a valid email first'));
        return;
      }
      await v5SendCode(clean);
      setStep('code');
      setCode('');
      setSentAt(Date.now());
      setNow(Date.now());
      setNotice(again ? L('New code sent. Check your inbox and Spam.') : '');
    });
  const verify = () =>
    run(async () => {
      if (!/^\d{6}$/.test(code.trim())) {
        setNotice(L('That code didn’t work. Check it or send a new one.'));
        return;
      }
      await v5VerifyCode(email, code); // the auth listener in the app takes over from here
    });
  return (
    <div className="v8-sheet" id="sh-signin" data-v5="signin">
      <div className="grab" />
      <div className="sh-head">
        <h3>{L('Join the community now')}</h3>
        <button type="button" className="xbtn" aria-label="Close" onClick={props.onClose}>✕</button>
      </div>
      {props.invitedBy && step === 'email' && (
        <p id="v5Invite" style={{ ...noteStyle, background: 'rgba(6,199,85,0.16)' }}>
          {Lf('{0} invited you to Kring. Join free, post short clips of your Bangkok and get seen.', refName(props.invitedBy))}
        </p>
      )}
      <p className="v5-tagline" style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>{L('Explore Bangkok, make new friends')}</p>
      <p className="v5-free" style={{ margin: '0 0 14px', fontSize: 12.5, fontWeight: 600, color: 'rgba(255,247,236,0.72)' }}>{L('Free · No download')}</p>
      {step === 'email' ? (
        <>
          {v5LineOn() && (
            <button type="button" className="primary-cta" id="v5LineBtn" disabled={busy} onClick={line}
              style={{ marginBottom: 10, background: '#06C755', color: '#fff', boxShadow: 'none', fontSize: 18, minHeight: 56 }}>
              {L('Join with LINE')}
            </button>
          )}
          {googleHere() && (
            <>
              <button type="button" className="primary-cta" id="v5GoogleBtn" disabled={busy} onClick={google} style={{ marginBottom: 12 }}>
                {L('Continue with Google')}
              </button>
              <p style={{ ...smallStyle, textAlign: 'center' }}>{L('or get a sign-in code by email')}</p>
            </>
          )}
          {v5LineOn() && !emailOpen && (
            <button type="button" className="ghost-cta" id="v5EmailBtn" disabled={busy} onClick={() => setEmailOpen(true)}
              style={{ width: '100%', minHeight: 52, background: 'rgba(255,247,236,0.08)', border: '1px solid rgba(255,247,236,0.3)', borderRadius: 999, color: '#FFF7EC', fontWeight: 800, fontSize: 16, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>
              {L('Continue with email')}
            </button>
          )}
          {(emailOpen || !v5LineOn()) && <>
          {!googleHere() && !v5LineOn() && <p style={{ ...smallStyle, textAlign: 'center' }}>{L('We’ll email you a 6-digit sign-in code')}</p>}
          {!googleHere() && v5LineOn() && <p id="v5OrEmail" style={{ ...smallStyle, textAlign: 'center' }}>{L('We’ll email you a 6-digit sign-in code')}</p>}
          <input autoFocus={emailOpen} type="email" inputMode="email" autoComplete="email" className="hi-box" id="v5Email" style={{ marginBottom: 8 }} value={email}
            onChange={(e) => { setEmail(e.target.value); setNotice(''); }} onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }}
            placeholder={L('Your email address')} />
          <button type="button" className={v5LineOn() ? 'ghost-cta' : 'primary-cta'} id="v5SendCode" disabled={busy} onClick={() => sendCode()}
            style={v5LineOn() ? { width: '100%', background: 'none', border: '1px solid rgba(255,247,236,0.3)', borderRadius: 999, color: '#FFF7EC', fontWeight: 800, padding: 12, marginBottom: 12 } : { marginBottom: 12 }}>
            {busy ? L('Sending…') : L('Send me a code')}
          </button>
          </>}
          <TermsLine L={L} id="v5Terms" />
        </>
      ) : (
        <>
          <p style={smallStyle}>{Lf('Enter the 6-digit code we sent to {0}', email.trim())}</p>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="hi-box" id="v5Code" style={{ marginBottom: 8, letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
            value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setNotice(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} placeholder={L('6-digit code')} />
          <button type="button" className="primary-cta" id="v5Verify" disabled={busy} onClick={verify} style={{ marginBottom: 8 }}>
            {L('Sign in · กริ๊ง!')}
          </button>
          <button type="button" className="ghost-cta" id="v5Resend" disabled={busy || wait > 0} onClick={() => sendCode(true)}
            style={{ width: '100%', background: 'none', border: '1px solid rgba(255,247,236,0.25)', borderRadius: 999, color: wait > 0 ? 'rgba(255,247,236,0.5)' : '#FFF7EC', fontWeight: 800, padding: 10, marginBottom: 6 }}>
            {wait > 0 ? Lf('Send a new code in {0} s', String(wait)) : L('Send a new code')}
          </button>
          <p style={{ ...smallStyle, textAlign: 'center', marginBottom: 4 }}>{L('Not there after a minute? Check Spam.')}</p>
          <button type="button" className="ghost-cta" id="v5Back" disabled={busy} onClick={() => { setStep('email'); setNotice(''); }}
            style={{ width: '100%', background: 'none', border: 0, color: 'rgba(255,247,236,0.8)', fontWeight: 700, padding: 10, marginBottom: 8 }}>
            {L('Use a different email')}
          </button>
        </>
      )}
      {notice && <p id="signinNotice" role="status" aria-live="polite" style={noteStyle}>{notice}</p>}
      <p style={{ ...smallStyle, marginBottom: 0 }}>{L('No password needed. We never post anything for you.')}</p>
    </div>
  );
}

export function V5CardSheet(props: { L: Tx; Lf: Txf; card: V5Card | null; uiLang: string; onSaved: (me: V5Me) => void; onClose: () => void; toast: (m: string) => void }) {
  const { L, Lf, card } = props;
  const errText = useErr(L, Lf);
  const isNew = !card;
  const defaultLang = ({ th: 'TH', zh: 'ZH', hi: 'HI', ja: 'JA', ko: 'KO' } as Record<string, string>)[props.uiLang] || 'EN';
  const [name, setName] = useState(card?.first_name || '');
  const [langs, setLangs] = useState<string[]>(card?.langs?.length ? card.langs : [defaultLang]);
  const [bio, setBio] = useState(card?.bio || '');
  const [ig, setIg] = useState(card?.ig_handle || '');
  const [area, setArea] = useState(card?.area || 'Bangkok');
  const [who, setWho] = useState<'local' | 'traveller'>(card?.who || (props.uiLang === 'th' || v5StoredRef() ? 'local' : 'traveller'));
  const [photo, setPhoto] = useState<string | null>(null);
  // new card after "Continue with LINE": LINE name (editable) and LINE picture (optional, skipped if it can't be loaded)
  useEffect(() => {
    if (card) return;
    const pre = v5TakeLinePrefill();
    if (!pre) return;
    if (pre.name) setName((n) => n || pre.name);
    if (pre.picture) v5CompressImage(pre.picture, 384, 110000).then((d) => setPhoto((p) => p || d)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [ageOk, setAgeOk] = useState(false);
  const [more, setMore] = useState(!isNew);   // new card: only photo, name and 20+ first; the rest is optional (13 Nov funnel fix)
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const shownPhoto = photo || card?.photo || '';
  const toggleLang = (l: string) => setLangs((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : prev.length >= 6 ? prev : [...prev, l]));
  const pick = async (f?: File | null) => {
    if (!f) return;
    try {
      setPhoto(await v5CompressImage(f, 384, 110000));
      setNotice('');
    } catch (e) {
      setNotice(errText(e));
    }
  };
  const save = async () => {
    if (busyRef.current) return;
    if (!name.trim()) return setNotice(L('Add your first name.'));
    if (!langs.length) return setNotice(L('Pick at least one language.'));
    if (isNew && !ageOk) return setNotice(L('Please confirm you are 20 or older.'));
    busyRef.current = true;
    setBusy(true);
    try {
      const me = await v5SaveCard({ first_name: name.trim(), langs, bio: bio.trim(), area, who, photo, age_ok: ageOk });
      if (card?.terms_version !== V5_TERMS_VERSION) {
        const at = await v5AcceptTerms().catch(() => null);   // agreed on the sign-in sheet; stored with the card (A-05)
        if (at && me.card) me.card = { ...me.card, terms_accepted_at: at, terms_version: V5_TERMS_VERSION };
      }
      if ((ig.trim() || null) !== (card?.ig_handle || null)) {
        const h = await v5SetIgHandle(ig.trim());
        if (me.card) me.card = { ...me.card, ig_handle: h };
        setIg(h || '');
      }
      props.toast(L('Card saved · กริ๊ง!'));
      props.onSaved(me);
    } catch (e) {
      setNotice(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="v8-sheet" id="sh-v5card" data-v5="card">
      <div className="grab" />
      <div className="sh-head">
        <h3>{L('Your Kring card')}</h3>
        <button type="button" className="xbtn" aria-label="Close" onClick={props.onClose}>✕</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: shownPhoto ? `center/cover url('${shownPhoto}')` : 'rgba(255,247,236,0.12)', flex: '0 0 auto' }} aria-hidden />
        <label className="ghost-cta" style={{ cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
          {shownPhoto ? L('Change photo') : L('＋ Add photo')}
          <input type="file" accept="image/*" id="v5Photo" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </div>
      <label style={labelStyle} htmlFor="v5Name">{L('First name')}</label>
      <input id="v5Name" className="hi-box" style={{ marginBottom: 0 }} maxLength={30} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
      {!more && (
        <button type="button" id="v5More" onClick={() => setMore(true)}
          style={{ display: 'block', margin: '10px 0 4px', background: 'none', border: 0, padding: 0, color: '#FF8CC4', fontWeight: 800, fontSize: 13 }}>
          {L('More about you (optional) ›')}
        </button>
      )}
      {more && (<>
      <span style={labelStyle}>{L('Languages you speak')}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group">
        {V5_LANGS.map((l) => (
          <button key={l} type="button" data-lang={l} aria-pressed={langs.includes(l)} onClick={() => toggleLang(l)}
            style={{ padding: '6px 10px', borderRadius: 999, fontWeight: 800, fontSize: 12, border: '1px solid rgba(255,247,236,0.3)',
              background: langs.includes(l) ? '#5B6CFF' : 'transparent', color: '#FFF7EC' }}>{l}</button>
        ))}
      </div>
      <label style={labelStyle} htmlFor="v5Bio">{L('One line about you')}</label>
      <input id="v5Bio" className="hi-box" style={{ marginBottom: 0 }} maxLength={80} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={L('e.g. Coffee walks, street food, sunset spots')} />
      <label style={labelStyle} htmlFor="v5Ig">{L('Instagram (optional)')}</label>
      <input id="v5Ig" className="hi-box" style={{ marginBottom: 0 }} maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@yourname" />
      <p style={{ ...smallStyle, marginTop: 4 }}>{L('Shown on your Reels as @name.')}</p>
      <label style={labelStyle} htmlFor="v5Area">{L('Your area')}</label>
      <select id="v5Area" className="hi-box" style={{ marginBottom: 4 }} value={area} onChange={(e) => setArea(e.target.value)}>
        {V5_AREAS.map((a) => <option key={a} value={a}>{a === 'Bangkok' ? L('All Bangkok') : L(a)}</option>)}
      </select>
      <p style={{ ...smallStyle, marginTop: 0 }}>{L('Shown as an area only, never your exact location.')}</p>
      <div className="trip-opts" style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
        <button type="button" id="v5WhoTraveller" className={who === 'traveller' ? 'on' : ''} aria-pressed={who === 'traveller'} onClick={() => setWho('traveller')}>{L('✈ Visiting Bangkok')}</button>
        <button type="button" id="v5WhoLocal" className={who === 'local' ? 'on' : ''} aria-pressed={who === 'local'} onClick={() => setWho('local')}>{L('🏠 I live here')}</button>
      </div>
      </>)}
      {isNew && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, fontWeight: 700, margin: '4px 0 12px' }}>
          <input type="checkbox" id="v5Age" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} style={{ width: 20, height: 20 }} />
          {L('I confirm I am 20 or older')}
        </label>
      )}
      {card?.terms_version !== V5_TERMS_VERSION && <TermsLine L={L} id="v5CardTerms" style={{ marginTop: 4 }} />}
      {notice && <p id="v5CardNotice" role="status" aria-live="polite" style={noteStyle}>{notice}</p>}
      <button type="button" className="primary-cta" id="v5SaveCard" disabled={busy} onClick={save}>{busy ? L('Saving…') : L('Save my card · กริ๊ง!')}</button>
    </div>
  );
}

/** Real, scannable QR (byte mode, error correction M) for a claimed treat code. */
export function V5Qr(props: { value: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(props.value);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n: n + 8, d };
  }, [props.value]);
  const size = props.size || 200;
  return (
    <svg role="img" aria-label="QR code" data-qr={props.value} width={size} height={size} viewBox={`0 0 ${svg.n} ${svg.n}`} shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 12, display: 'block', margin: '10px auto' }}>
      <path d={svg.d} fill="#0B0A12" />
    </svg>
  );
}

/** Small helper so the app can re-render a sheet once on mount (used for focus on the code box). */
export function useOnce(fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) {
      done.current = true;
      fn();
    }
  }, [fn]);
}
