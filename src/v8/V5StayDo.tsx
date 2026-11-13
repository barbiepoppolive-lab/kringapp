/**
 * Deals → "Stay & do" (T-209 simplified, founder "go T209" 11 Nov 17:34). Partner stays and workshops with a member price.
 * - The partner sets the price; Kring only shows it, plus an optional subtle saving. No other-site price, no comparison.
 * - Signed-in members only (the RPC returns nothing otherwise) and hidden until the admin switches the first listing live.
 * - "Book direct" opens the partner's LINE / IG / site with a pre-filled message carrying the member code KRING-1234;
 *   the message is also copied. No "I'm here" step: the tap itself is logged (kr8_listing_tap) as the proof for partners.
 * Copy rules: no host/guide/tour, no temples, no percent. Every visible string goes through L().
 */
import { useEffect, useState } from 'react';
import { v5ListingTap, v5Listings, type V5Listing } from './v5Live';
import './stayDo.css';

type Tx = (en: string) => string;
type Txf = (en: string, a: string) => string;

/** Admin-typed https photo link, made safe inside url('…'). */
const cssUrl = (u: string) => u.replace(/['"()\\\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

export function bookingMessage(l: Pick<V5Listing, 'name' | 'my_code'>): string {
  return `สวัสดี จองผ่านกริ๊ง! · ${l.name} · รหัสสมาชิก ${l.my_code}\nHi! Booking via Kring · ${l.name} · member code ${l.my_code}`;
}

/** Where "Book direct" goes. Only LINE official accounts take a pre-filled message in the link; the rest get it on the clipboard. */
export function bookingUrl(l: Pick<V5Listing, 'booking_kind' | 'booking_contact' | 'name' | 'my_code'>): string | null {
  const c = l.booking_contact.trim();
  if (l.booking_kind === 'line_oa') {
    const id = c.startsWith('@') ? c : '@' + c;
    if (!/^@[A-Za-z0-9._-]{2,40}$/.test(id)) return null;
    return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(bookingMessage(l))}`;
  }
  if (l.booking_kind === 'line') return /^[A-Za-z0-9._-]{2,40}$/.test(c) ? `https://line.me/ti/p/~${encodeURIComponent(c)}` : null;
  if (l.booking_kind === 'ig') { const h = c.replace(/^@/, ''); return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://ig.me/m/${h}` : null; }
  return /^https:\/\/[^\s"'<>]+$/.test(c) ? c : null;
}

export function StayDo(props: { L: Tx; Lf: Txf; thai: boolean; signedIn: boolean }) {
  const { L, Lf, thai, signedIn } = props;
  const [rows, setRows] = useState<V5Listing[]>([]);
  const [kind, setKind] = useState<'all' | 'stay' | 'do'>('all');
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) { setRows([]); return; }
    let on = true;
    v5Listings().then((r) => { if (on) setRows(Array.isArray(r) ? r : []); }).catch(() => { if (on) setRows([]); });
    return () => { on = false; };
  }, [signedIn]);
  if (!signedIn || rows.length === 0) return null;
  const kinds = new Set(rows.map((r) => r.kind));
  const shown = rows.filter((r) => kind === 'all' || r.kind === kind);
  const tap = (l: V5Listing) => {
    v5ListingTap(l.id).catch(() => undefined);
    try { void navigator.clipboard?.writeText(bookingMessage(l)).then(() => setCopied(l.id), () => undefined); } catch { /* ignore */ }
  };
  return (
    <section className="kstay" id="stayDo" aria-label={L('Stay & do')}>
      <div className="kstay-head">
        <h3>{L('Stay & do')}</h3>
        <span className="kstay-sub">{L('Member price')}</span>
      </div>
      {kinds.size > 1 ? (
        <div className="kstay-chips" role="tablist">
          {(['all', 'stay', 'do'] as const).map((k) => (
            <button type="button" key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? L('All') : k === 'stay' ? L('Stay') : L('Do')}
            </button>
          ))}
        </div>
      ) : null}
      <div className="kstay-list">
        {shown.map((l) => {
          const url = bookingUrl(l);
          const name = thai && l.name_th ? l.name_th : l.name;
          const blurb = thai ? l.blurb_th || l.blurb_en : l.blurb_en || l.blurb_th;
          const unit = thai ? l.price_unit_th || l.price_unit_en : l.price_unit_en || l.price_unit_th;
          return (
            <article className="kstay-card" key={l.id} data-listing={l.id}>
              <div className="kstay-photo" style={l.photos[0] ? { backgroundImage: `url('${cssUrl(l.photos[0])}')` } : undefined}>
                <span className="kstay-kind">{l.kind === 'stay' ? L('Stay') : L('Do')}</span>
                <span className="kstay-area">📍 {L(l.area)}</span>
              </div>
              <div className="kstay-body">
                <b className="kstay-name">{name}</b>
                {blurb ? <span className="kstay-blurb">{blurb}</span> : null}
                <div className="kstay-price">
                  <span className="kstay-ml">{L('Member price')}</span>
                  <b>฿{l.member_price_thb.toLocaleString('en-US')}</b>{unit ? <small> · {unit}</small> : null}
                </div>
                {l.saving_thb ? <span className="kstay-save">{Lf('save ฿{0}', l.saving_thb.toLocaleString('en-US'))}</span> : null}
                {url ? (
                  <a className="kstay-book" href={url} target="_blank" rel="noopener noreferrer" onClick={() => tap(l)}>{L('Book direct')} ↗</a>
                ) : null}
                {copied === l.id ? <small className="kstay-copied">{Lf('Member code {0} copied · paste it in the chat', l.my_code)}</small> : null}
              </div>
            </article>
          );
        })}
      </div>
      <p className="kstay-disc">{L('You book directly with the partner. Kring takes nothing from your booking.')}</p>
    </section>
  );
}
