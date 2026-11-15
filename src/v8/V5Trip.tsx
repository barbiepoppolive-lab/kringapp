/**
 * Deals → "For your trip" (bottom of Deals; partner café treats always first). Shown to everyone.
 * Cards and links: tickets/AFFILIATE_LINKS_FOR_YOUR_TRIP_10NOV.md (Travelpayouts, sub ID kring_app, founder approved 10 Nov 02:28).
 * One card per need: eSIM · airport pickup · things to do · leave your bags. "Photo-first" without stock photos: each card
 * leads with its own colour panel + symbol (stock images are banned). Links open in a new tab, rel="sponsored".
 * Copy rules: no tour/guide, no temples, no percent. One language per screen: every visible string goes through L().
 */
import './trip.css';

type Tx = (en: string) => string;

export interface TripPartner { id: string; need: string; icon: string; name: string; sub: string; cta: string; url: string; tone: 'blue' | 'green' | 'pink' | 'tea'; photo: string }

export const TRIP_PARTNERS: TripPartner[] = [
  { id: 'airalo', need: 'Thailand eSIM · data from landing', icon: '📶', name: 'Airalo', sub: 'Online the moment you land', cta: 'See data packs', url: 'https://airalo.tpk.mx/nlhtRbJg', tone: 'green', photo: 'siam-square' },
  { id: 'welcomepickups', need: 'Airport pickup, fixed price', icon: '🚘', name: 'Welcome Pickups', sub: 'A driver waits at arrivals', cta: 'Book a pickup', url: 'https://tpk.mx/BnsZgC2u', tone: 'blue', photo: 'rama-viii-bridge' },
  { id: 'klook', need: 'Things to do in Bangkok', icon: '🎡', name: 'Klook', sub: 'Tickets, passes and boats', cta: 'See ideas', url: 'https://klook.tpk.mx/w8u5zsYQ', tone: 'pink', photo: 'asiatique-the-riverfront' },
  { id: 'radicalstorage', need: 'Leave your bags', icon: '🧳', name: 'Radical Storage', sub: 'Short-term bag storage in Bangkok', cta: 'Find a spot', url: 'https://radicalstorage.tpk.mx/RsPrWtrl', tone: 'tea', photo: 'hua-lamphong' },
];

export function TripPerks(props: { L: Tx }) {
  const { L } = props;
  return (
    <section className="ktrip" id="forYourTrip" aria-label={L('For your trip')}>
      <div className="ktrip-head">
        <h3><span aria-hidden="true">✈</span> {L('For your trip')}</h3>
        <span className="ktrip-trust">{L('Trusted travel partners')}</span>
      </div>
      <div className="ktrip-grid">
        {TRIP_PARTNERS.map((p) => (
          <a key={p.id} className={`ktrip-card ${p.tone}`} data-partner={p.id} href={p.url} target="_blank" rel="noopener noreferrer sponsored">
            {/* polish #9: one dark card style with a real Bangkok photo (Wikimedia Commons, credited below), no rainbow panels */}
            <span className="ktrip-photo" aria-hidden="true" style={{ backgroundImage: `url('${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/app/'}media/places/${p.photo}.jpg')` }}><i>{p.icon}</i></span>
            <small className="ktrip-kick">{L(p.need)}</small>
            <b className="ktrip-name">{p.name}</b>
            <span className="ktrip-sub">{L(p.sub)}</span>
            <span className="ktrip-cta">{L(p.cta)} ↗</span>
          </a>
        ))}
      </div>
      <p className="ktrip-disc" id="tripDisclosure">ⓘ {L('Kring may earn a small commission. It never changes your price.')} · {L('Photos: Wikimedia Commons')}</p>
    </section>
  );
}
