/**
 * Deals → "For your trip" (bottom of Deals; partner café treats always first). Shown to everyone.
 * Cards and links: tickets/AFFILIATE_LINKS_FOR_YOUR_TRIP_10NOV.md (Travelpayouts, sub ID kring_app, founder approved 10 Nov 02:28).
 * One card per need: eSIM · airport pickup · things to do · leave your bags. "Photo-first" without stock photos: each card
 * leads with Kring's own Bangkok photo of that need (public/media/trip, 17 Nov AI photos) and one line icon badge. Links open in a new tab, rel="sponsored".
 * Copy rules: no tour/guide, no temples, no percent. One language per screen: every visible string goes through L().
 */
import { useState, type ReactNode } from 'react';
import './trip.css';

type Tx = (en: string) => string;

export interface TripPartner { id: string; need: string; icon: string; name: string; sub: string; cta: string; url: string; tone: 'blue' | 'green' | 'pink' | 'tea'; photo: string }

export const TRIP_PARTNERS: TripPartner[] = [
  { id: 'airalo', need: 'Thailand eSIM · data from landing', icon: 'esim', name: 'Airalo', sub: 'Online the moment you land', cta: 'See data packs', url: 'https://airalo.tpk.mx/nlhtRbJg', tone: 'green', photo: 'airalo' },
  { id: 'welcomepickups', need: 'Airport pickup, fixed price', icon: 'car', name: 'Welcome Pickups', sub: 'A driver waits at arrivals', cta: 'Book a pickup', url: 'https://tpk.mx/BnsZgC2u', tone: 'blue', photo: 'welcomepickups' },
  { id: 'klook', need: 'Things to do in Bangkok', icon: 'ticket', name: 'Klook', sub: 'Tickets, passes and boats', cta: 'See ideas', url: 'https://klook.tpk.mx/w8u5zsYQ', tone: 'pink', photo: 'klook' },
  { id: 'radicalstorage', need: 'Leave your bags', icon: 'bag', name: 'Radical Storage', sub: 'Short-term bag storage in Bangkok', cta: 'Find a spot', url: 'https://radicalstorage.tpk.mx/RsPrWtrl', tone: 'tea', photo: 'radicalstorage' },
];

/** One clean line icon per need (no brand logos are kept in the repo). */
const ICONS: Record<string, ReactNode> = {
  esim: <><path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M9.5 17v-2.5M12 17v-4.5M14.5 17v-6.5" /></>,
  car: <><path d="M5 16V12l1.6-4.2A2 2 0 0 1 8.5 6.5h7a2 2 0 0 1 1.9 1.3L19 12v4" /><path d="M4 16h16v2a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M5.5 12h13" /><circle cx="8" cy="14.3" r=".6" /><circle cx="16" cy="14.3" r=".6" /></>,
  ticket: <><path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h14a1.5 1.5 0 0 1 1.5 1.5v1.8a2 2 0 0 0 0 3.4v1.8A1.5 1.5 0 0 1 19 17H5a1.5 1.5 0 0 1-1.5-1.5v-1.8a2 2 0 0 0 0-3.4Z" /><path d="M14.5 7.5v1.5M14.5 11.25v1.5M14.5 15v1.5" /></>,
  bag: <><rect x="5" y="7.5" width="14" height="12" rx="2.5" /><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M9 11v5M15 11v5" /></>,
};
const THAI = /[\u0E00-\u0E7F]/;

/** Thai first, the English under it (only when the line really is Thai). */
function TwoLine(props: { L: Tx; en: string; className: string }) {
  const { L, en, className } = props;
  const main = L(en);
  return (
    <span className={className}>
      <span>{main}</span>
      {main !== en && THAI.test(main) ? <small lang="en">{en}</small> : null}
    </span>
  );
}

export function TripPerks(props: { L: Tx }) {
  const { L } = props;
  const [info, setInfo] = useState(false);
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/app/';
  return (
    <section className="ktrip" id="forYourTrip" aria-label={L('For your trip')}>
      <div className="ktrip-head">
        <h3><TwoLine L={L} en="For your trip" className="ktrip-title" /></h3>
        <button type="button" className={`ktrip-info${info ? ' on' : ''}`} aria-expanded={info} aria-controls="tripInfo" aria-label={L('Trusted travel partners')}
          onClick={() => setInfo((v) => !v)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".7" /></svg>
        </button>
      </div>
      {info ? (
        <p className="ktrip-infop" id="tripInfo">{L('Trusted travel partners')}</p>
      ) : null}
      <div className="ktrip-grid">
        {TRIP_PARTNERS.map((p) => (
          <a key={p.id} className={`ktrip-card ${p.tone}`} data-partner={p.id} href={p.url} target="_blank" rel="noopener noreferrer sponsored">
            {/* Kring's own Bangkok scene for the need (17 Nov AI photos), then one icon badge, the name, one value line, one button */}
            <span className="ktrip-photo" aria-hidden="true" style={{ backgroundImage: `url('${base}media/trip/${p.photo}.webp')` }} />
            <span className="ktrip-badge" role="img" aria-label={L(p.need)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[p.icon]}</svg>
            </span>
            <b className="ktrip-name">{p.name}</b>
            <TwoLine L={L} en={p.sub} className="ktrip-sub" />
            <span className="ktrip-cta">{L(p.cta)} <i aria-hidden="true">↗</i></span>
          </a>
        ))}
      </div>
      <p className="ktrip-disc" id="tripDisclosure">{L('Kring may earn a small commission. It never changes your price.')}</p>
    </section>
  );
}
