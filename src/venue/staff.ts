/**
 * Counter check for partner venues: kringapp.com/app/staff.html?v=<venue id>
 * Staff type their venue PIN and the guest's code (or scan the guest's QR). The server checks both, marks the code used
 * and logs it (kr8_staff_redeem). The PIN is never stored on the phone; it stays in memory for 10 minutes for the next guest.
 */
import '../lib/sentry';
import { bkkTime, el, rpc, tx, type TxPair } from './shared';

type RedeemResult = {
  ok: boolean;
  error?: 'NO_VENUE' | 'LOCKED' | 'PIN_WRONG' | 'CODE_UNKNOWN' | 'CODE_OTHER_VENUE' | 'ALREADY_REDEEMED' | 'EXPIRED';
  tries_left?: number;
  locked_until?: string;
  redeemed_at?: string;
  deal_en?: string;
  deal_th?: string;
  first_for_venue?: boolean;
};
type Venue = { id: string; name: string; name_th: string | null; area: string };

const T = {
  title: ['ตรวจโค้ดที่เคาน์เตอร์', 'Kring counter check'],
  venueCode: ['รหัสร้าน', 'Venue code'],
  open: ['เปิด', 'Open'],
  noVenue: ['ไม่พบร้านนี้ หรือร้านยังไม่เปิดใช้งาน', 'Venue not found or not live'],
  pin: ['PIN พนักงาน 6 หลัก', 'Staff PIN (6 digits)'],
  code: ['โค้ดของลูกค้า', 'Guest code'],
  scan: ['สแกน QR ของลูกค้า', 'Scan guest QR'],
  stopScan: ['หยุดสแกน', 'Stop scanning'],
  check: ['ตรวจและใช้โค้ด', 'Check and redeem'],
  next: ['ลูกค้าคนถัดไป', 'Next guest'],
  changeVenue: ['เปลี่ยนร้าน', 'Change venue'],
  redeemed: ['ใช้โค้ดแล้ว ให้ส่วนลดได้เลย', 'Redeemed · give the deal'],
  firstNote: ['โค้ดแรกของร้านนี้สำเร็จแล้ว', 'First code check for this venue done'],
  noScan: ['เครื่องนี้สแกนในหน้าไม่ได้ ใช้กล้องมือถือสแกน QR หรือพิมพ์โค้ดแทน', 'This phone cannot scan here. Use the phone camera on the QR, or type the code.'],
  needPin: ['ใส่ PIN 6 หลัก', 'Enter the 6-digit PIN'],
  needCode: ['ใส่โค้ดของลูกค้า', 'Enter the guest code'],
  network: ['เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', 'Could not reach Kring. Try again.'],
} as const satisfies Record<string, TxPair>;

function errText(r: RedeemResult): TxPair {
  switch (r.error) {
    case 'PIN_WRONG': return [`PIN ไม่ถูกต้อง · เหลืออีก ${r.tries_left ?? 0} ครั้ง`, `Wrong PIN · ${r.tries_left ?? 0} tries left`];
    case 'LOCKED': return [`ใส่ PIN ผิดหลายครั้ง พัก 15 นาที ถึง ${bkkTime(r.locked_until, false)} · ถ้าเกิดซ้ำ ทักกริ๊งทาง LINE @194hsqbc`,
      `Too many wrong PINs · paused 15 minutes, until ${bkkTime(r.locked_until, false)} · if it keeps happening, message Kring on LINE @194hsqbc`];
    case 'ALREADY_REDEEMED': return [`โค้ดนี้ใช้ไปแล้วเมื่อ ${bkkTime(r.redeemed_at)}`, `Already used at ${bkkTime(r.redeemed_at)}`];
    case 'EXPIRED': return ['โค้ดหมดอายุแล้ว ให้ลูกค้ากดรับใหม่ในแอป', 'Code expired · ask the guest to claim again in the app'];
    case 'CODE_OTHER_VENUE': return ['โค้ดนี้เป็นของร้านอื่น', 'This code is for another venue'];
    case 'CODE_UNKNOWN': return ['ไม่พบโค้ดนี้ ตรวจตัวอักษรอีกครั้ง', 'Code not found · check the letters'];
    case 'NO_VENUE': return T.noVenue;
    default: return T.network;
  }
}

/** Accepts "KR-1A2B3C4D", "1a2b 3c4d" or a scanned staff link (…/staff.html#c=KR-…). */
export function parseCode(raw: string): string {
  const s = (raw || '').trim();
  const fromUrl = s.match(/[#?&]c=([^&#\s]+)/);
  const v = decodeURIComponent(fromUrl ? fromUrl[1] : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hex = v.startsWith('KR') && v.length === 10 ? v.slice(2) : v;
  return /^[0-9A-F]{8}$/.test(hex) ? `KR-${hex}` : s.toUpperCase();
}

function deviceLabel(): string {
  try {
    let d = localStorage.getItem('kr8_staff_device');
    if (!d) {
      d = 'counter-' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('kr8_staff_device', d);
    }
    return d;
  } catch {
    return 'counter';
  }
}

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
let venueId = (params.get('v') || '').toLowerCase();
try { if (!venueId) venueId = localStorage.getItem('kr8_staff_venue') || ''; } catch { /* private mode */ }
const startCode = parseCode(location.hash.replace(/^#/, '?'));
let pinMemo = '';
let pinTimer = 0;

function rememberPin(p: string) {
  pinMemo = p;
  window.clearTimeout(pinTimer);
  pinTimer = window.setTimeout(() => { pinMemo = ''; }, 10 * 60 * 1000);
}

function header(): HTMLElement {
  return el('h1', {}, el('span', { class: 'dot' }), tx(T.title));
}

function askVenue(msg?: TxPair) {
  const inp = el('input', { id: 'venueCode', autocomplete: 'off', autocapitalize: 'none', placeholder: 'baan-ari-coffee' });
  const go = el('button', { id: 'venueOpen', class: 'big' }, tx(T.open));
  go.onclick = () => { venueId = inp.value.trim().toLowerCase(); void start(); };
  app.replaceChildren(header(), el('div', { class: 'card' }, el('label', { class: 'f' }, tx(T.venueCode), inp), go, msg ? el('p', { class: 'err' }, tx(msg)) : null));
}

async function start() {
  if (!venueId) return askVenue();
  let v: Venue | null = null;
  try { v = await rpc<Venue | null>('kr8_staff_venue', { p_venue: venueId }); } catch { return askVenue(T.network); }
  if (!v) return askVenue(T.noVenue);
  try { localStorage.setItem('kr8_staff_venue', v.id); } catch { /* ignore */ }
  counter(v);
}

function counter(v: Venue, code = startCode) {
  const pin = el('input', { id: 'staffPin', class: 'pin-in', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', pattern: '[0-9]*' });
  pin.value = pinMemo;
  const codeIn = el('input', { id: 'guestCode', class: 'code-in', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'KR-XXXXXXXX' });
  codeIn.value = /^KR-[0-9A-F]{8}$/.test(code) ? code : '';
  const out = el('div', { id: 'result' });
  const btn = el('button', { id: 'redeemBtn', class: 'big' }, tx(T.check));
  const scanBtn = el('button', { id: 'scanBtn', class: 'ghost' }, tx(T.scan));
  const video = el('video', { class: 'scan', playsinline: true, muted: true, hidden: true });
  let stream: MediaStream | null = null;
  const stopScan = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.hidden = true; scanBtn.replaceChildren(tx(T.scan)); };

  scanBtn.onclick = async () => {
    if (stream) return stopScan();
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) { out.replaceChildren(el('p', { class: 'note' }, tx(T.noScan))); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { out.replaceChildren(el('p', { class: 'note' }, tx(T.noScan))); return; }
    video.srcObject = stream; video.hidden = false; await video.play().catch(() => undefined);
    scanBtn.replaceChildren(tx(T.stopScan));
    const det = new BD({ formats: ['qr_code'] });
    const tick = async () => {
      if (!stream) return;
      try {
        const hits = await det.detect(video);
        if (hits[0]?.rawValue) { codeIn.value = parseCode(hits[0].rawValue); stopScan(); pin.value.length === 6 ? btn.click() : pin.focus(); return; }
      } catch { /* keep trying */ }
      requestAnimationFrame(() => void tick());
    };
    void tick();
  };

  btn.onclick = async () => {
    const p = pin.value.replace(/\D/g, '');
    const c = parseCode(codeIn.value);
    if (p.length !== 6) { out.replaceChildren(el('p', { class: 'err' }, tx(T.needPin))); pin.focus(); return; }
    if (!/^KR-[0-9A-F]{8}$/.test(c)) { out.replaceChildren(el('p', { class: 'err' }, tx(T.needCode))); codeIn.focus(); return; }
    btn.disabled = true;
    let r: RedeemResult;
    try {
      r = await rpc<RedeemResult>('kr8_staff_redeem', { p_venue: v.id, p_pin: p, p_code: c, p_device: deviceLabel() });
    } catch {
      r = { ok: false };
    }
    btn.disabled = false;
    if (r.ok) {
      rememberPin(p);
      history.replaceState(null, '', location.pathname + location.search);
      const next = el('button', { id: 'nextGuest', class: 'big' }, tx(T.next));
      next.onclick = () => counter(v, '');
      out.replaceChildren(el('div', { class: 'result good', id: 'resultOk' },
        el('div', { class: 'mark' }, '✓'), el('div', { class: 'what' }, tx(T.redeemed)),
        r.deal_th || r.deal_en ? el('div', { class: 'deal' }, tx([r.deal_th || r.deal_en || '', r.deal_en || ''])) : null,
        el('p', { class: 'note' }, bkkTime(r.redeemed_at), ' · ', c),
        r.first_for_venue ? el('p', { class: 'note ok' }, tx(T.firstNote)) : null), next);
      codeIn.value = '';
    } else {
      if (r.error === 'PIN_WRONG' || r.error === 'LOCKED') { pin.value = ''; pinMemo = ''; }
      out.replaceChildren(el('div', { class: 'result bad', id: 'resultBad', 'data-error': r.error || 'NETWORK' },
        el('div', { class: 'mark' }, '✕'), el('div', { class: 'what' }, tx(errText(r)))));
    }
  };

  const change = el('button', { class: 'ghost', id: 'changeVenue' }, tx(T.changeVenue));
  change.onclick = () => { stopScan(); try { localStorage.removeItem('kr8_staff_venue'); } catch { /* ignore */ } venueId = ''; askVenue(); };

  app.replaceChildren(
    header(),
    el('div', { class: 'card' },
      el('div', { class: 'row' }, el('div', { class: 'grow' }, el('div', { class: 'venue-name', id: 'venueName' }, v.name_th || v.name),
        v.name_th ? el('div', { class: 'meta' }, v.name) : null, el('div', { class: 'meta' }, v.area)), change),
      el('label', { class: 'f' }, tx(T.pin), pin),
      el('label', { class: 'f' }, tx(T.code), codeIn),
      el('div', { class: 'row', style: 'margin-top:10px' }, scanBtn),
      video, btn, out));
  (pin.value ? codeIn : pin).focus();
}

void start();
