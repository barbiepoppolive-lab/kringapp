/* 17 Nov "ขั้นต่อไปของคุณ · Your next step": Feed = a slim glass pill under the top row (floats over the Reel, never pushes it down);
   Me = the same step as a card at the top. Thai phones: one Thai line with small English under; other languages: one line in their language. */
import type { ReactNode } from 'react';
import './nextStep.css';
import type { NextStep, NextStepKind } from './nextStep';

type Tx = (en: string) => string;
type Txf = (en: string, ...a: string[]) => string;
const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;

/** Thai + English for each step (English is also the L() key). */
export function nextStepCopy(s: NextStep): { th: string; en: string; key: string; arg?: string; btnTh?: string; btnEn?: string } {
  switch (s.kind) {
    case 'reel':
      return s.amount
        ? { th: `โพสต์รีลแรก รับ ${baht(s.amount)}`, en: `Post your first Reel, get ${baht(s.amount)}`, key: 'Post your first Reel, get {0}', arg: baht(s.amount), btnTh: 'โพสต์', btnEn: 'Post' }
        : { th: 'โพสต์รีลแรกของคุณ', en: 'Post your first Reel', key: 'Post your first Reel', btnTh: 'โพสต์', btnEn: 'Post' };
    case 'retry': return { th: 'ลองโพสต์ใหม่อีกครั้ง', en: 'Try again', key: 'Try again', btnTh: 'โพสต์ใหม่', btnEn: 'Post again' };
    case 'pending': return { th: 'กำลังตรวจรีลของคุณ', en: 'We’re checking your Reel', key: 'We’re checking your Reel' };
    case 'claim': return { th: `รับ ${baht(s.amount || 100)} ของคุณ`, en: `Claim your ${baht(s.amount || 100)}`, key: 'Claim your {0}', arg: baht(s.amount || 100), btnTh: 'กดรับ', btnEn: 'Claim' };
    case 'verify': return { th: 'ยืนยันใบหน้าเพื่อรับโค้ด', en: 'Verify your face to get your code', key: 'Verify your face to get your code', btnTh: 'ยืนยัน', btnEn: 'Verify' };
    default: return { th: 'ไต่อันดับสัปดาห์นี้', en: 'Climb this week’s board', key: 'Climb this week’s board', btnTh: 'ดูอันดับ', btnEn: 'See board' };
  }
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function Icon({ kind }: { kind: NextStepKind }): ReactNode {
  switch (kind) {
    case 'reel': return <svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="14" height="14" rx="3.5" /><path d="M17 10.5l4-2.5v8l-4-2.5" /><path d="M10 9.5v5M7.5 12h5" /></svg>;
    case 'retry': return <svg viewBox="0 0 24 24" {...P}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></svg>;
    case 'pending': return <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case 'claim': return <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8.5" /><path d="M10 7.5v9M10 8h3.2a2 2 0 0 1 0 4H10h3.6a2.2 2.2 0 0 1 0 4.4H10M11.5 6v2M11.5 16.4v1.6" /></svg>;
    case 'verify': return <svg viewBox="0 0 24 24" {...P}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="10.5" r="2.6" /><path d="M7.8 16.4a4.6 4.6 0 0 1 8.4 0" /></svg>;
    default: return null;
  }
}

/** Rings meter for the "climb" step: this week's Rings out of the prize-seat floor. */
function Meter({ rings, floor }: { rings: number; floor: number }) {
  const r = 15, c = 2 * Math.PI * r, f = Math.min(1, floor > 0 ? rings / floor : 0);
  return (
    <svg viewBox="0 0 36 36" className="nx-meter" aria-hidden="true">
      <defs><linearGradient id="nxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4D6BFF" /><stop offset="1" stopColor="#FF4FA3" /></linearGradient></defs>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="url(#nxg)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="22.2" textAnchor="middle">{rings > 99 ? '99+' : rings}</text>
    </svg>
  );
}

export function NextStepCard(props: { step: NextStep; variant: 'pill' | 'card'; lang?: string; L: Tx; Lf: Txf; onGo: () => void; onHide: () => void }) {
  const { step: s, L, Lf } = props;
  const thai = !props.lang || props.lang === 'th';
  const c = nextStepCopy(s);
  const main = thai ? c.th : c.arg ? Lf(c.key, c.arg) : L(c.key);
  const sub = '';   // audit 18 Nov (founder rule): one language at a time. Thai mode had an English line under the Thai one.
  const ringsLine = s.kind === 'climb' && s.floor
    ? (s.gap ? { th: `${s.rings} ริง · อีก ${s.gap} ริงถึง ${s.floor}`, en: `${s.rings} Rings · ${s.gap} more to ${s.floor}`, k: Lf('{0} Rings · {1} more to {2}', String(s.rings), String(s.gap), String(s.floor)) }
      : { th: `${s.rings} ริง · ถึง ${s.floor} แล้ว`, en: `${s.rings} Rings · ${s.floor} reached`, k: Lf('{0} Rings · {1} reached', String(s.rings), String(s.floor)) })
    : null;
  // the pill has two lines: Thai + (English · note / Rings); the card has room for one more
  const pill = props.variant === 'pill';
  const extra = s.kind === 'retry' && s.note ? s.note : ringsLine ? (thai ? ringsLine.th : ringsLine.k) : '';
  const btn = c.btnEn ? (thai ? c.btnTh : L(c.btnEn)) : '';
  const label = `${thai ? 'ขั้นต่อไปของคุณ' : L('Your next step')}: ${main}${extra ? ` · ${extra}` : ''}`;
  const subLine = pill ? [sub, extra].filter(Boolean).join(' · ') : sub;
  return (
    <div className={`nx nx-${props.variant}`} id={pill ? 'nxPill' : 'nxCard'} data-kind={s.kind} data-one={thai ? 'th' : 'en'} role="group" aria-label={label}>
      <button type="button" className="nx-hit" onClick={btn ? props.onGo : undefined} disabled={!btn} aria-label={btn ? `${main} · ${btn}` : main}>
        <span className="nx-ic" aria-hidden="true">{s.kind === 'climb' ? <Meter rings={s.rings || 0} floor={s.floor || 25} /> : <Icon kind={s.kind} />}</span>
        <span className="nx-tx">
          {!pill ? <span className="nx-cap">{thai ? 'ขั้นต่อไปของคุณ' : L('Your next step')}</span> : null}
          <b className="nx-main">{main}</b>
          {subLine ? <small className="nx-sub">{subLine}</small> : null}
        </span>
        {pill ? (btn ? <span className="nx-btn">{btn}</span> : <span className="nx-wait" aria-hidden="true"><i /><i /><i /></span>) : (
          <span className="nx-foot">
            {extra ? <small className={`nx-extra${s.kind === 'retry' ? ' note' : ''}`}><span>{extra}</span></small> : <span className="nx-fill" />}
            {btn ? <span className="nx-btn">{btn}</span> : <span className="nx-wait" aria-hidden="true"><i /><i /><i /></span>}
          </span>
        )}
      </button>
      {s.dismissible ? (
        <button type="button" className="nx-x" aria-label={thai ? 'ซ่อนไว้ 1 วัน' : L('Hide for a day')} onClick={props.onHide}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
        </button>
      ) : null}
    </div>
  );
}
