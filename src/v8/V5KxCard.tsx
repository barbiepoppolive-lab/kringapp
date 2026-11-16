/**
 * Feature 1 · "Live mint" (approved variant 1A): the N2 neon card builds live while the member types,
 * Instagram / TikTok link sheet, "Card minted!" end screen. N2 = full photo in a glowing neon frame, small name.
 * Also the card used on Me and on other people's profiles (with IG / TikTok pills).
 */
import React, { useEffect, useRef, useState } from 'react';
import './kx.css';
import './go.css';
import { checkProfilePhoto } from './v5Face';
import { GenderChip, GenderRow, genderPayload, isGender, type Gender } from './V5Gender';
import { kxNotePhotoCheck, kxSetGender } from './v5Kx';
import { LEVEL_KEY, levelFor, memberNo, parseHandle, socialUrl, type Social } from './kxLogic';
import { kxSetTiktok } from './v5Kx';
import { v5AcceptTerms, v5CompressImage, v5ErrCode, v5SaveCard, v5SetIgHandle, v5TakeLinePrefill, V5_AREAS, V5_LANGS, V5_TERMS_VERSION } from './v5Live';
import type { V5Card, V5Me } from './v5Live';
import { v5ErrText } from './v5Strings';
import { TermsLine } from './V5Sheets';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

export const RingGlyph = ({ white, size }: { white?: boolean; size?: number }) => (
  <i className={`kx-rg${white ? ' wh' : ''}`} style={size ? { width: size * 1.25, height: size * 0.8 } : undefined} aria-hidden="true" />
);
export const SocialIcon = ({ kind, size }: { kind: Social; size?: number }) => (
  <i className={kind === 'ig' ? 'kx-ig' : 'kx-tt'} style={size ? { width: size, height: size } : undefined} aria-hidden="true" />
);

const TH_RE = /[\u0E00-\u0E7F]/;
/** "LV 1 LOCAL" in the member's language */
export function levelLabel(L: Tx, n: number): string {
  return `LV ${n} ${L(LEVEL_KEY[Math.min(5, Math.max(1, n)) - 1]).toLocaleUpperCase()}`;
}

/** "LV1 Local · 1,000 more Rings → Explorer" / "LV1 โลคอล · อีก 1,000 ริง → นักสำรวจ" */
export function progLine(L: Tx, Lf: (en: string, a: string, b?: string) => string, lv: { n: number; key: string; nextKey: string | null; toNext: number }): string {
  const head = `LV${lv.n} ${L(lv.key)}`;
  return lv.nextKey ? `${head} · ${Lf('{0} more Rings → {1}', lv.toNext.toLocaleString('en-US'), L(lv.nextKey))}` : `${head} · ${L('Top level')}`;
}

/** IG / TikTok pills. Tapping opens instagram.com/<h> or tiktok.com/@<h>; on a phone the OS hands it to the app. */
export function SocialPills(props: { ig?: string | null; tt?: string | null; compact?: boolean; slot?: React.ReactNode; onLinkMissing?: (k: Social) => void }) {
  const pill = (k: Social, h: string) => (
    <a key={k} className="kx-pill" data-social={k} href={socialUrl(k, h)} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
      <SocialIcon kind={k} /><span>@{h}</span>
    </a>
  );
  if (!props.ig && !props.tt && !props.slot) return null;
  return (
    <div className={`kx-links${props.compact ? ' compact' : ''}`}>
      {props.ig ? pill('ig', props.ig) : null}
      {props.tt ? pill('tt', props.tt) : null}
      {props.slot}
    </div>
  );
}

export interface NeonCardProps {
  /** shown only when the member switched "Show on my card" on */
  gender?: string | null;
  L: Tx; photo: string | null; name: string; level: number; no: number | null; ig?: string | null; tt?: string | null;
  size?: 'mint' | 'me' | 'hero'; tilt?: boolean; compact?: boolean; pts?: [string, string] | null; slot?: React.ReactNode; children?: React.ReactNode; id?: string; sub?: string;
  /** Founding Local number (first 50 members with an approved Reel): a permanent mark on the card. */
  founding?: number | null;
  /** I (15 Nov): level progress as ONE continuous bar + one line ("LV1 Local · 1,000 more Rings → Explorer"). Segments looked like a photo carousel. */
  prog?: { pct: number; line: string } | null;
}
/** The locked N2 card: photo full-bleed, neon pink frame, LV badge + #number on top, small name, 5-step bar, social pills. */
export function NeonCard(p: NeonCardProps) {
  return (
    <div className={`kx-n2 ${p.size || 'me'}${p.tilt ? ' tilt' : ''}`} id={p.id} style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined} data-level={p.level}>
      {!p.photo ? <span className="kx-n2-ph" aria-hidden="true">{(p.name || '?').trim().charAt(0).toUpperCase() || '?'}</span> : null}
      <div className="kx-n2-top"><span className={`kx-lv${TH_RE.test(levelLabel(p.L, p.level)) ? ' thai' : ''}`}>⚡ {levelLabel(p.L, p.level)}</span><span className="kx-id">{memberNo(p.no)}</span></div>
      <div className="kx-n2-b">
        {p.founding ? <div className={`kx-fl${TH_RE.test(p.L('Founding Local')) ? ' thai' : ''}`} data-founding={p.founding}>★ {p.L('Founding Local')} #{String(p.founding).padStart(2, '0')}</div> : null}
        <div className="kx-nm">{p.name || ' '}</div>
        {p.sub ? <div className="kx-sub">{p.sub}</div> : null}
        {p.gender ? <div className="kx-grow"><GenderChip L={p.L} gender={p.gender} /></div> : null}
        {p.prog ? (
          <div className="kx-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.prog.pct)} aria-label={p.prog.line}>
            <div className={`kx-prog-l${TH_RE.test(p.prog.line) ? ' thai' : ''}`}><RingGlyph /><span>{p.prog.line}</span></div>
            <div className="kx-prog-t"><i style={{ width: `${Math.max(3, Math.min(100, p.prog.pct))}%` }} /></div>
          </div>
        ) : (
          <div className="kx-prog" aria-hidden="true"><div className="kx-prog-t"><i style={{ width: `${Math.min(100, Math.max(1, p.level) * 20)}%` }} /></div></div>
        )}
        <SocialPills ig={p.ig} tt={p.tt} slot={p.slot} compact={p.compact} />
      </div>
      {p.children}
    </div>
  );
}

/** Small bottom sheet: one @username field, "or paste your profile link", error state. */
export function LinkSheet(props: { L: Tx; kind: Social; value: string | null; busy?: boolean; onSave: (h: string | null) => Promise<string | null | void>; onClose: () => void }) {
  const { L } = props;
  const [v, setV] = useState(props.value || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => inRef.current?.focus(), 80); return () => clearTimeout(t); }, []);
  const name = props.kind === 'ig' ? 'Instagram' : 'TikTok';
  const save = async (raw: string) => {
    const r = parseHandle(props.kind, raw);
    if (!r.ok) {
      setErr(r.error === 'WRONG_SITE' ? (props.kind === 'ig' ? L('That’s a TikTok link. Paste your Instagram link here.') : L('That’s an Instagram link. Paste your TikTok link here.'))
        : L('Use letters, numbers, . and _ only'));
      return;
    }
    setBusy(true);
    try { await props.onSave(r.handle); } catch (e) { const [k] = v5ErrText(v5ErrCode(e)); setErr(v5ErrCode(e) === 'BAD_HANDLE' ? L('Use letters, numbers, . and _ only') : L(k)); }
    finally { setBusy(false); }
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setV(t.trim()); setErr(''); const r = parseHandle(props.kind, t); if (r.ok && r.handle) setV(r.handle); }
    } catch { inRef.current?.focus(); }
  };
  const shown = v.replace(/^@/, '');
  return (
    <>
      <div className="kx-dim" onClick={props.onClose} />
      <div className="kx-lsheet" id={`kxLink-${props.kind}`} role="dialog" aria-label={name}>
        <div className="kx-grab" />
        <h2><SocialIcon kind={props.kind} size={34} />{props.kind === 'ig' ? L('Link Instagram') : L('Link TikTok')}</h2>
        <label className={`kx-fld${err ? ' bad' : ''}`}>
          <em>@</em>
          <input ref={inRef} id={`kxHandle-${props.kind}`} value={shown} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" maxLength={120}
            aria-invalid={!!err} placeholder={L('username')} onChange={(e) => { setV(e.target.value); setErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(v); }} />
          <button type="button" className="kx-paste" onClick={() => void paste()}>{L('Paste')}</button>
        </label>
        {err ? <p className="kx-err" role="alert" id="kxHandleErr">{err}</p> : <p className="kx-hint">{L('or paste your profile link')}</p>}
        <button type="button" className="kx-btn" id={`kxLinkSave-${props.kind}`} disabled={busy || props.busy} onClick={() => void save(v)}>
          {busy ? '…' : props.kind === 'ig' ? L('Link Instagram') : L('Link TikTok')}
        </button>
        {props.value ? <button type="button" className="kx-unlink" onClick={() => void save('')}>{L('Unlink')}</button> : null}
      </div>
    </>
  );
}

const Confetti = () => (
  <div className="kx-confetti" aria-hidden="true">
    {[['6%', '18%', 'cy', 30], ['90%', '14%', 'pk', -40], ['93%', '50%', 'gd', 70], ['4%', '60%', 'pu', -20], ['82%', '73%', 'cy', 15], ['18%', '74%', 'pk', 50]].map(([l, t, c, r], i) => (
      <i key={i} className={`c-${c}`} style={{ left: l as string, top: t as string, transform: `rotate(${r}deg)` }} />
    ))}
    {[['6%', '36%', 18], ['91%', '30%', 24], ['87%', '67%', 13], ['14%', '11%', 12]].map(([l, t, s], i) => (
      <b key={i} style={{ left: l as string, top: t as string, fontSize: s as number }}>✦</b>
    ))}
  </div>
);

/**
 * Make / edit your card. New members: photo + first name + IG/TikTok + 20+ → "Mint my card" → "Card minted!".
 * Editing: same live card, plus the optional fields, "Save my card".
 */
const PHOTO_MSG: Record<'none' | 'small' | 'group', string> = {
  none: 'We can’t see a face in this photo. Use a photo where your face is clearly visible.',
  small: 'Your face is too small in this photo. Use a closer one.',
  group: 'This looks like a group photo. Use a photo of just you.',
};

export function V5MintSheet(props: {
  L: Tx; Lf: Txf; card: (V5Card & { tiktok_handle?: string | null; member_no?: number | null; gender?: string | null; show_gender?: boolean | null }) | null; uiLang: string;
  onSaved: (me: V5Me) => void; onClose: () => void; toast: (m: string) => void; onAfter: (what: 'share' | 'reel' | 'close', no: number | null) => void;
  /** 16 Nov: the saved photo shows no clear face, so a new one is required before saving */
  photoFix?: boolean;
}) {
  const { L, Lf, card } = props;
  const isNew = !card;
  const defaultLang = ({ th: 'TH', zh: 'ZH', hi: 'HI', ja: 'JA', ko: 'KO' } as Record<string, string>)[props.uiLang] || 'EN';
  const [name, setName] = useState(card?.first_name || '');
  const [langs, setLangs] = useState<string[]>(card?.langs?.length ? card.langs : [defaultLang]);
  const [bio, setBio] = useState(card?.bio || '');
  const [ig, setIg] = useState<string | null>(card?.ig_handle || null);
  const [tt, setTt] = useState<string | null>(card?.tiktok_handle || null);
  const [area, setArea] = useState(card?.area || 'Bangkok');
  // optional, never pre-filled: a new card starts with nothing chosen and "show" off
  const [gender, setGender] = useState<Gender | null>(isGender(card?.gender) ? card.gender : null);
  const [showGender, setShowGender] = useState<boolean>(isGender(card?.gender) && card?.show_gender === true);
  const [who, setWho] = useState<'local' | 'traveller'>(card?.who || 'local');
  const [photo, setPhoto] = useState<string | null>(null);
  /** did the face check run on `photo`? 'error' = it could not (old phone, model failed to load): saved as unchecked for the admin */
  const [photoVerdict, setPhotoVerdict] = useState<'ok' | 'error' | null>(null);
  const [checking, setChecking] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(props.photoFix ? 'Kring is for real people. Add a photo where your face is clearly visible.' : '');
  const [ageOk, setAgeOk] = useState(false);
  const [more, setMore] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState<Social | null>(null);
  const [minted, setMinted] = useState<{ no: number | null } | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    if (card) return;
    const pre = v5TakeLinePrefill();
    if (!pre) return;
    if (pre.name) setName((n) => n || pre.name);
    if (pre.picture) v5CompressImage(pre.picture, 384, 110000).then(async (d) => {
      // the LINE picture is used only when it shows a clear face (many are helmets, pets or scenery)
      const v = await checkProfilePhoto(d);
      if (v === 'ok' || v === 'error') { setPhoto((p) => p || d); setPhotoVerdict((x) => x || v); }
      else setPhotoMsg('Your LINE photo doesn’t show your face clearly. Add a photo of you.');
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const errText = (e: unknown) => { const [k, a] = v5ErrText(typeof e === 'string' ? e : v5ErrCode(e)); return a !== undefined ? Lf(k, a) : L(k); };
  const shownPhoto = photo || card?.photo || '';
  const pick = async (f?: File | null) => {
    if (!f) return;
    setChecking(true);
    try {
      const d = await v5CompressImage(f, 384, 110000);
      const v = await checkProfilePhoto(d);
      if (v === 'ok' || v === 'error') { setPhoto(d); setPhotoVerdict(v); setPhotoMsg(''); setNotice(''); }
      else setPhotoMsg(PHOTO_MSG[v]);
    } catch (e) { setNotice(errText(e)); } finally { setChecking(false); }
  };
  const toggleLang = (l: string) => setLangs((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : prev.length >= 6 ? prev : [...prev, l]));
  // For an existing card the handle is saved at once; for a new card it is saved right after the card is minted.
  const saveHandle = async (kind: Social, h: string | null) => {
    if (!isNew) {
      const saved = kind === 'ig' ? await v5SetIgHandle(h || '') : await kxSetTiktok(h || '');
      if (kind === 'ig') setIg(saved || null); else setTt(saved || null);
      props.toast(saved ? Lf('{0} linked', kind === 'ig' ? 'Instagram' : 'TikTok') : L('Unlinked'));
    } else if (kind === 'ig') setIg(h); else setTt(h);
    setLink(null);
  };
  const save = async () => {
    if (busyRef.current) return;
    if (checking) return;
    if ((isNew || props.photoFix) && !photo) { setPhotoMsg(photoMsg || 'Add a photo where your face is clearly visible.'); return setNotice(''); }
    if (!name.trim()) return setNotice(L('Add your first name.'));
    if (!langs.length) return setNotice(L('Pick at least one language.'));
    if (isNew && !ageOk) return setNotice(L('Please confirm you are 20 or older.'));
    busyRef.current = true;
    setBusy(true);
    try {
      const me = await v5SaveCard({ first_name: name.trim(), langs, bio: bio.trim(), area, who, photo, age_ok: ageOk });
      // audit P1-1: tell the server whether the face check really ran on this photo (never blocks the save)
      if (photo && photoVerdict) void kxNotePhotoCheck(photoVerdict === 'ok').catch(() => undefined);
      if (card?.terms_version !== V5_TERMS_VERSION) {
        const at = await v5AcceptTerms().catch(() => null);
        if (at && me.card) me.card = { ...me.card, terms_accepted_at: at, terms_version: V5_TERMS_VERSION };
      }
      // gender is its own small call so the card is saved even if this one fails; only sent when something changed
      const gp = genderPayload(gender, showGender);
      if (gp.gender !== (isGender(card?.gender) ? card.gender : null) || gp.show !== (card?.show_gender === true)) {
        try { const r = await kxSetGender(gp.gender, gp.show); if (me.card) me.card = { ...me.card, gender: r.gender, show_gender: r.show_gender } as V5Card; }
        catch { props.toast(L('Card saved. We couldn’t save “I am” this time, try again from Edit profile.')); }
      } else if (me.card) me.card = { ...me.card, gender: gp.gender, show_gender: gp.show } as V5Card;
      if (isNew) {
        let linkErr = '';
        if (ig) { try { const h = await v5SetIgHandle(ig); if (me.card) me.card = { ...me.card, ig_handle: h }; } catch (e) { linkErr = errText(e); setIg(null); } }
        if (tt) { try { const h = await kxSetTiktok(tt); if (me.card) me.card = { ...me.card, tiktok_handle: h } as V5Card; } catch (e) { linkErr = errText(e); setTt(null); } }
        if (linkErr) props.toast(linkErr);
        props.onSaved(me);
        setMinted({ no: (me.card as (V5Card & { member_no?: number }) | null)?.member_no ?? null });
      } else {
        props.toast(L('Card saved · กริ๊ง!'));
        props.onSaved(me);
        props.onAfter('close', card?.member_no ?? null);
      }
    } catch (e) {
      setNotice(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (minted) {
    const lv = levelFor(0);
    return (
      <div className="kx-page kx-minted" id="kxMinted">
        <div className="kx-halo" /><div className="kx-burst" /><Confetti />
        <button type="button" className="kx-x" aria-label={L('Close')} onClick={() => props.onAfter('close', minted.no)}>✕</button>
        <h1 className="kx-mt-h">{L('Card minted!')}</h1>
        <div className="kx-mt-card">
          <NeonCard L={L} photo={shownPhoto || null} name={name.trim()} level={1} no={minted.no} ig={ig} tt={tt} size="hero" tilt
            prog={{ pct: lv.pct, line: progLine(L, Lf, lv) }} />
        </div>
        <p className="kx-mt-st">{who === 'local' ? L('You’re a Bangkok local') : L('You’re on Kring')} <b>{memberNo(minted.no)}</b></p>
        <div className="kx-mt-acts">
          <button type="button" className="kx-btn" id="kxFirstReel" onClick={() => props.onAfter('reel', minted.no)}>{L('Post my first Reel')}</button>
          <button type="button" className="kx-btn ghost" id="kxShareCard" onClick={() => props.onAfter('share', minted.no)}>{L('Share my card')}</button>
          <p className="kx-mt-tip">{L('A clip you already have works')}</p>
        </div>
      </div>
    );
  }

  const lv = 1;
  return (
    <div className="kx-page kx-mint" id="sh-v5card" data-v5="card">
      <div className="kx-hd">
        <button type="button" className="kx-x" aria-label={L('Close')} onClick={props.onClose}>✕</button>
        <h1>{isNew ? L('Make your card') : L('Your Kring card')}</h1>
        <span className="kx-st">{isNew ? '2/3' : ''}</span>
      </div>
      <div className="kx-mint-card">
        <NeonCard L={L} photo={shownPhoto || null} name={name.trim()} level={lv} no={card?.member_no ?? null} ig={ig} tt={tt} size="mint"
          slot={!ig || !tt ? (
            <button type="button" className="kx-slot" onClick={() => setLink(!ig ? 'ig' : 'tt')}>{Lf('+ Add {0}', !ig ? 'Instagram' : 'TikTok')}</button>
          ) : null} />
        {/* 16 Nov (founder): an empty card shows a big + with "Add photo" right on the card */}
        {!shownPhoto && !checking ? (
          <label className="kx-addph" id="kxAddPhoto">
            <span className="pl" aria-hidden="true">+</span>
            <b>{L('Add photo')}</b>
            <input type="file" accept="image/*" onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          </label>
        ) : null}
        <label className="kx-cam" aria-label={shownPhoto ? L('Change photo') : L('Add photo')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#07060d" strokeWidth="2.4" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          <input type="file" accept="image/*" id="v5Photo" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      </div>
      {(checking || photoMsg || ((isNew || props.photoFix) && !photo)) ? (
        <div className="kx-photo-need" id="kxPhotoNeed" role="status" aria-live="polite">
          <p>{checking ? L('Checking photo…') : L(photoMsg || 'Add a photo where your face is clearly visible.')}</p>
          {!checking ? (
            <div className="kx-photo-btns">
              <label className="kx-btn" id="kxPhotoGallery">{L('Choose from gallery')}<input type="file" accept="image/*" onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
              <label className="kx-btn ghost" id="kxPhotoCamera">{L('Take a photo')}<input type="file" accept="image/*" capture="user" onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="kx-form">
        <label className="kx-in">
          <small>{L('First name')}</small>
          <input id="v5Name" maxLength={30} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('Your first name')} />
        </label>
        {(['ig', 'tt'] as Social[]).map((k) => {
          const h = k === 'ig' ? ig : tt;
          return (
            <button type="button" key={k} className={`kx-lr${h ? ' on' : ''}`} id={k === 'ig' ? 'kxIgRow' : 'kxTtRow'} onClick={() => setLink(k)}>
              <SocialIcon kind={k} size={30} />
              <span>{k === 'ig' ? 'Instagram' : 'TikTok'}{h ? <em>@{h}</em> : null}</span>
              {h ? <b className="kx-ok">✓ {L('Linked')}</b> : <b className="kx-go">{L('Link')}</b>}
            </button>
          );
        })}
        <GenderRow L={L} value={gender} show={showGender} disabled={busy} onChange={(g, sh) => { setGender(g); setShowGender(sh); }} />
        {!more && (
          <button type="button" className="kx-more" id="v5More" onClick={() => setMore(true)}>{L('More about you (optional) ›')}</button>
        )}
        {more && (
          <div className="kx-opt">
            <span className="kx-lab">{L('Languages you speak')}</span>
            <div className="kx-chips" role="group">
              {V5_LANGS.map((l) => (
                <button key={l} type="button" data-lang={l} aria-pressed={langs.includes(l)} className={langs.includes(l) ? 'on' : ''} onClick={() => toggleLang(l)}>{l}</button>
              ))}
            </div>
            <label className="kx-lab" htmlFor="v5Bio">{L('One line about you')}</label>
            <input id="v5Bio" className="kx-txt" maxLength={80} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={L('e.g. Coffee walks, street food, sunset spots')} />
            <label className="kx-lab" htmlFor="v5Area">{L('Your area')}</label>
            <select id="v5Area" className="kx-txt" value={area} onChange={(e) => setArea(e.target.value)}>
              {V5_AREAS.map((a) => <option key={a} value={a}>{a === 'Bangkok' ? L('All Bangkok') : L(a)}</option>)}
            </select>
            <div className="kx-who">
              <button type="button" id="v5WhoTraveller" className={who === 'traveller' ? 'on' : ''} aria-pressed={who === 'traveller'} onClick={() => setWho('traveller')}>{L('✈ Visiting Bangkok')}</button>
              <button type="button" id="v5WhoLocal" className={who === 'local' ? 'on' : ''} aria-pressed={who === 'local'} onClick={() => setWho('local')}>{L('🏠 I live here')}</button>
            </div>
          </div>
        )}
        {isNew && (
          <label className="kx-age">
            <input type="checkbox" id="v5Age" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} />
            <span>{L('I confirm I am 20 or older')}</span>
          </label>
        )}
        {card?.terms_version !== V5_TERMS_VERSION && <TermsLine L={L} id="v5CardTerms" style={{ margin: '6px 2px 0', fontSize: 12 }} />}
        {notice && <p id="v5CardNotice" className="kx-err" role="status" aria-live="polite">{notice}</p>}
      </div>
      <div className="kx-cta">
        {/* audit P2-4: while the photo is being checked the button is greyed and says so (a tap used to be silently ignored) */}
        <button type="button" className="kx-btn" id="v5SaveCard" disabled={busy || checking} aria-busy={checking || busy} onClick={() => void save()}>
          {busy ? L('Saving…') : checking ? L('Checking photo…') : isNew ? L('Mint my card') : L('Save my card')}
        </button>
      </div>
      {link && <LinkSheet L={L} kind={link} value={link === 'ig' ? ig : tt} onSave={(h) => saveHandle(link, h)} onClose={() => setLink(null)} />}
    </div>
  );
}
