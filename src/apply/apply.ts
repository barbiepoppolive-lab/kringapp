/**
 * Partner sign-up, photo-first (founder UI gate 10 Nov 00:15): real footage on top, 3 picture cards, 4 fields on step 1,
 * the rest on step 2: kringapp.com/app/#apply (also #venue-onboard, #venue-consent, ?biz=, ?claim=).
 * Cafés, restaurants, dessert shops and places to stay (hostel, guesthouse, Airbnb). No account needed; the server
 * rate-limits per IP (kr8_apply_venue, migration 0025). Thai first, English under every label.
 */
import { v5Client, V5_AREAS } from '../v8/v5Live';
import '../v8/fonts-v8.css';
import './apply.css';

type Pair = readonly [th: string, en: string];
const T = {
  title: ['สมัครเป็นร้านพาร์ทเนอร์กริ๊ง!', 'Become a Kring partner'],
  hero: ['ลูกค้าใหม่มาที่ร้านคุณ', 'New customers come to your shop'],
  c1: ['ร้านคุณอยู่ในรีลของกริ๊ง!', 'Your place in Kring Reels'], c1s: ['ป้ายดีลของร้านอยู่บนคลิปจริง', 'Your deal tag on real clips'],
  c2: ['ลูกค้ากด “ฉันอยู่ที่ร้าน”', 'Guests tap “I’m here”'], c2s: ['บัตรสดขึ้นบนมือถือลูกค้า', 'A live pass opens on their phone'],
  c3: ['พนักงานดูแล้วให้ได้เลย', 'Staff look and give'], c3s: ['ไม่ต้องลงแอป ไม่ต้องสแกน', 'No app, no scanning'],
  promise: ['ร่วมกับกริ๊ง! ฟรีสำหรับพาร์ทเนอร์: ไม่มี GP และไม่มีค่าคอมมิชชันจากยอดขาย ค่าใช้จ่ายเดียวคือสิทธิพิเศษที่คุณเลือกเอง เปลี่ยนหรือหยุดได้โดยแจ้งล่วงหน้า 2 วัน ถ้าวันหนึ่งเรามีบริการเสริมแบบเสียเงิน จะเป็นทางเลือกเท่านั้น',
    'Joining Kring is free for partners: no GP and no commission on your sales. Your only cost is the treat you choose, and you can change or pause it with 2 days’ notice. If we ever add paid extras, they will be optional.'],
  step1: ['ขั้นที่ 1 จาก 2', 'Step 1 of 2'], step2: ['ขั้นที่ 2 จาก 2', 'Step 2 of 2'],
  next: ['ถัดไป', 'Next'], back: ['ย้อนกลับ', 'Back'],
  licensed: ['ที่พักของฉันได้รับอนุญาตให้รับแขก', 'My place is licensed to take guests'],
  photoBig: ['เพิ่มรูปร้าน (ไม่บังคับ สูงสุด 2 รูป)', 'Photos of your place (optional, up to 2)'],
  treatPhoto: ['ถ่ายรูปสิทธิพิเศษจริงของร้าน', 'Take a photo of your real treat'],
  treatPhotoSub: ['รูปนี้จะเป็นภาพดีลของร้านในแอป', 'This photo becomes your deal in the app'],
  ttype: ['เลือกแบบสิทธิพิเศษ', 'Pick your treat'],
  tFree: ['ของแถมฟรี', 'Free item'], tFreeS: ['เช่น ชาไทยฟรี', 'e.g. free Thai tea'],
  tSecond: ['ฟรีสำหรับคนที่สอง', 'Free for the 2nd person'], tSecondS: ['มา 2 คน คนที่สองฟรี', 'Brings people in pairs'],
  tSecret: ['เมนูลับกริ๊ง!', 'Kring secret menu'], tSecretS: ['เมนูที่ไม่มีในเมนูปกติ', 'Not on your normal menu'],
  cond: ['เงื่อนไข', 'Condition'],
  cNone: ['ไม่มี', 'None'], cOrder: ['เมื่อสั่งอะไรก็ได้', 'With any order'], cTwo: ['เมื่อมา 2 คนและสั่ง', 'When 2 people order'],
  cost: ['ต้นทุนต่อชิ้นของร้าน (บาท)', 'What one treat costs you (baht)'],
  daily: ['ให้ได้สูงสุดต่อวัน', 'Most treats per day'],
  maxcost: ['ต้นทุนสูงสุดของคุณ', 'Your maximum cost'],
  perday: ['ต่อวัน ปกติจะน้อยกว่านี้มาก', 'a day. Usually much less.'],
  suggest: ['ตัวอย่าง แตะเพื่อใช้', 'Examples · tap to use'],
  sub: ['ฟรี ใช้เวลาไม่ถึง 1 นาที เราจะทักกลับทาง LINE', 'Free, under a minute. We reply on LINE.'],
  name: ['ชื่อร้าน / ที่พัก', 'Place name'],
  nameTh: ['ชื่อร้านภาษาไทย (ถ้ามี)', 'Thai name (if any)'],
  hours: ['เวลาเปิด–ปิด', 'Opening hours'], closed: ['วันหยุด', 'Closed on'], everyday: ['เปิดทุกวัน', 'Open every day'],
  cardReady: ['บัตรกริ๊ง!ของร้านคุณพร้อมแล้ว', 'Your Kring café card is ready'],
  cardLater: ['เราจะตรวจสอบและแจ้งทาง LINE เมื่อสิทธิพิเศษของร้านขึ้นในแอปแล้ว (ปกติภายใน 24 ชั่วโมง)', 'We’ll check it and message you on LINE when your treat is live in the app (usually within 24 hours).'],
  cardSave: ['แคปหน้าจอนี้เก็บไว้ได้เลย', 'You can screenshot this card.'],
  kind: ['ประเภท', 'Type'],
  cafe: ['คาเฟ่', 'Café'], restaurant: ['ร้านอาหาร', 'Restaurant'], dessert: ['ร้านของหวาน', 'Dessert'],
  stay: ['โฮสเทล / เกสต์เฮาส์', 'Hostel / guesthouse'],
  area: ['ย่าน', 'Area'], otherArea: ['ย่านอื่นในกรุงเทพฯ', 'Other Bangkok area'],
  maps: ['ลิงก์ Google Maps ของร้าน', 'Google Maps link'],
  mapsHint: ['เปิด Google Maps → ร้านของคุณ → แชร์ → คัดลอกลิงก์', 'Open Google Maps → your place → Share → Copy link'],
  contact: ['ชื่อผู้ติดต่อ', 'Contact name'],
  line: ['LINE ID', 'LINE ID'],
  phone: ['เบอร์โทร (ไม่บังคับ)', 'Phone (optional)'],
  photos: ['รูปร้าน 1–3 รูป (ไม่บังคับ)', '1–3 photos of your place (optional)'],
  addPhoto: ['＋ เพิ่มรูป', '＋ Add photo'],
  treat: ['สิทธิพิเศษสำหรับสมาชิกกริ๊ง!', 'Your treat for Kring members'],
  treatHint: ['แก้คำได้ตามต้องการ ไม่ใช้เปอร์เซ็นต์', 'Edit the words as you like. No percentages.'],
  treatHintStay: ['เช่น “เครื่องดื่มต้อนรับฟรี” หรือ “ลด ฿100 เมื่อจองตรง”', 'e.g. “Free welcome drink” or “฿100 off when booking direct”'],
  ref: ['รหัสผู้แนะนำ', 'Referred by'],
  agree: ['ฉันยอมรับข้อตกลงพาร์ทเนอร์', 'I agree to the Partner terms'],
  send: ['ส่งใบสมัคร', 'Send application'],
  sending: ['กำลังส่ง…', 'Sending…'],
  thanks: ['ขอบคุณครับ! ได้รับใบสมัครแล้ว', 'Thank you! We got your application'],
  thanksSub: ['เราจะทักกลับทาง LINE ภายใน 24 ชั่วโมง', "We'll message you on LINE within 24 hours"],
  thanksLine: ['ทักเราได้เลย: LINE @194hsqbc', 'Or message us: LINE @194hsqbc'],
} as const satisfies Record<string, Pair>;

const ERR: Record<string, Pair> = {
  name: ['ใส่ชื่อร้าน', 'Add the place name'],
  kind: ['เลือกประเภท', 'Pick a type'],
  maps: ['ใส่ลิงก์ Google Maps (maps.app.goo.gl/…)', 'Add a Google Maps link (maps.app.goo.gl/…)'],
  contact: ['ใส่ชื่อผู้ติดต่อ', 'Add a contact name'],
  line: ['ใส่ LINE ID (ตัวอักษรอังกฤษหรือตัวเลข)', 'Add a LINE ID (letters or numbers)'],
  phone: ['เบอร์โทรไม่ถูกต้อง', 'Check the phone number'],
  treat: ['บอกสิทธิพิเศษที่ให้สมาชิก (3–140 ตัวอักษร)', 'Describe your treat (3–140 characters)'],
  ttype: ['เลือกแบบสิทธิพิเศษ', 'Pick a treat type'],
  tphoto: ['ใส่รูปสิทธิพิเศษจริงของร้าน', 'Add a photo of your real treat'],
  KR8_TREAT_PHOTO: ['ใส่รูปสิทธิพิเศษจริงของร้าน', 'Add a photo of your real treat'],
  terms: ['กรุณายอมรับข้อตกลงพาร์ทเนอร์', 'Please accept the Partner terms'],
  licensed: ['ที่พักต้องได้รับอนุญาตให้รับแขก', 'Places to stay must be licensed to take guests'],
  KR8_LICENSE_REQUIRED: ['ที่พักต้องได้รับอนุญาตให้รับแขก', 'Places to stay must be licensed to take guests'],
  KR8_DEAL_WORDS: ['เขียนสิทธิพิเศษเป็นบาทหรือของแถม ไม่ใช้เปอร์เซ็นต์ ลิงก์ หรือเบอร์โทร', 'Write the treat in baht or a free item: no percent, links or phone numbers'],
  ALREADY_APPLIED: ['ร้านนี้สมัครแล้ว เราจะทักกลับทาง LINE', 'This place already applied. We will message you on LINE'],
  RATE_LIMIT: ['ส่งหลายครั้งเกินไปวันนี้ ลองพรุ่งนี้ หรือทัก LINE @194hsqbc', 'Too many applications today. Try tomorrow or message LINE @194hsqbc'],
  BAD_PHOTO: ['รูปนี้ใช้ไม่ได้ ลองรูปอื่น', 'This photo cannot be used. Try another'],
  NETWORK: ['เชื่อมต่อไม่ได้ ลองอีกครั้ง', 'Could not connect. Try again'],
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: (Node | string | null | false | undefined)[]) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') n.className = String(v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k) n.append(k);
  return n;
};
const tx = (p: Pair, cls = '') => el('span', { class: `tx ${cls}`.trim() }, el('span', { class: 'th' }, p[0]), el('span', { class: 'en' }, p[1]));
const field = (label: Pair, input: HTMLElement, hint?: Pair, id?: string) =>
  el('label', { class: 'af', id }, tx(label, 'lbl'), input, hint ? tx(hint, 'hint') : null, el('span', { class: 'ferr', 'data-err': '' }));

function refCode(): string {
  const q = new URLSearchParams(location.search);
  const raw = q.get('ref') || q.get('biz') || (() => { try { return localStorage.getItem('kr8_ref'); } catch { return null; } })() || '';
  return /^[A-Za-z0-9_-]{3,40}$/.test(raw) ? raw.toLowerCase() : '';
}

async function toJpegB64(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  for (const [side, q] of [[1280, 0.8], [1024, 0.72], [800, 0.66], [640, 0.6]] as const) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    const b64 = url.slice(url.indexOf(',') + 1);
    if (b64.length * 0.75 <= 280_000) return b64;
  }
  throw new Error('BAD_PHOTO');
}

type TType = 'free' | 'second' | 'secret';
const TREAT_EXAMPLES: Record<TType, Pair[]> = {
  free: [['ชาไทยต้อนรับฟรี', 'Free welcome Thai tea'], ['ของหวานจานเล็กฟรี', 'Free mini dessert'], ['อัปไซซ์ใหญ่ฟรี', 'Free large size'], ['เครื่องดื่มซิกเนเจอร์ฟรี', 'Free signature drink']],
  second: [['เครื่องดื่มแก้วที่สองฟรี', 'Second drink free'], ['ของหวานชิ้นที่สองฟรี', 'Second dessert free']],
  secret: [['เมนูลับกริ๊ง!', 'Kring secret menu item'], ['ท็อปปิ้งพิเศษเฉพาะสมาชิกกริ๊ง!', 'Kring-only special topping']],
};
const COND: Record<string, Pair> = { none: ['', ''], order: ['เมื่อสั่งอะไรก็ได้', 'with any order'], two: ['เมื่อมา 2 คนและสั่ง', 'when 2 people order'] };

function base(): string {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
}
const rings = () => el('span', { class: 'rings', 'aria-hidden': 'true' }, el('i', {}), el('i', {}));

/** The 3 picture cards (no side scrolling): Reel with the place's deal tag · "I'm here" · live pass shown to staff. Real app screens. */
function pictureCards(): HTMLElement {
  const card = (cls: string, img: string, a: Pair, b: Pair, tag?: HTMLElement) => el('figure', { class: `pc ${cls}` },
    el('div', { class: 'pc-img', style: `background-image:url('${base()}media/${img}')` }, tag),
    el('figcaption', {}, tx(a), tx(b, 'small')));
  return el('div', { class: 'cards', id: 'apCards' },
    card('pc-reel', 'partner_card_reel.jpg', T.c1, T.c1s, el('span', { class: 'pc-tag' }, '📍 ', el('b', {}, 'ร้านของคุณ'))),
    card('pc-here', 'partner_here.jpg', T.c2, T.c2s),
    card('pc-pass', 'partner_pass.jpg', T.c3, T.c3s));
}

export function mountApply(root: HTMLElement) {
  document.title = 'Kring · สมัครพาร์ทเนอร์ · Partner sign-up';
  document.documentElement.lang = 'th';
  const ref = refCode();
  let kind = '';
  const photos: string[] = [];

  // ── step 1: place name, type, LINE ID, Google Maps link ──
  const name = el('input', { id: 'apName', maxlength: '120', autocomplete: 'organization' });
  const nameTh = el('input', { id: 'apNameTh', maxlength: '80', lang: 'th' });
  const kinds = el('div', { class: 'chips', id: 'apKinds', role: 'radiogroup' });
  const licensedBox = el('input', { id: 'apLicensed', type: 'checkbox' });
  const licensed = el('label', { class: 'agree', id: 'f-licensed', hidden: true }, licensedBox, tx(T.licensed), el('span', { class: 'ferr', 'data-err': '' }));
  for (const k of ['cafe', 'restaurant', 'dessert', 'stay'] as const) {
    const b = el('button', { type: 'button', class: 'chip', 'data-kind': k, role: 'radio', 'aria-checked': 'false' },
      el('span', { class: 'em', 'aria-hidden': 'true' }, { cafe: '☕', restaurant: '🍜', dessert: '🍧', stay: '🛏' }[k]), tx(T[k]));
    b.onclick = () => {
      kind = k;
      kinds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      licensed.hidden = k !== 'stay';
      treatHint.replaceChildren(...tx(k === 'stay' ? T.treatHintStay : T.treatHint, 'hint').childNodes);
    };
    kinds.append(b);
  }
  const line = el('input', { id: 'apLine', placeholder: '@yourshop', autocapitalize: 'none', autocomplete: 'off' });
  const maps = el('input', { id: 'apMaps', type: 'url', inputmode: 'url', placeholder: 'https://maps.app.goo.gl/…' });

  // ── step 2: photos, area, contact, phone, treat, terms ──
  const area = el('select', { id: 'apArea' });
  for (const a of V5_AREAS) if (a !== 'Bangkok') area.append(el('option', { value: a }, a));
  area.append(el('option', { value: 'Bangkok' }, `${T.otherArea[0]} · ${T.otherArea[1]}`));
  const contact = el('input', { id: 'apContact', maxlength: '80', autocomplete: 'name' });
  const phone = el('input', { id: 'apPhone', type: 'tel', inputmode: 'tel', placeholder: '+66 8x xxx xxxx' });
  const file = el('input', { id: 'apPhoto', type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const tile = el('button', { type: 'button', class: 'phototile', id: 'apAddPhoto' });
  const drawTile = () => {
    tile.replaceChildren(...(photos.length
      ? [el('span', { class: 'pv', style: `background-image:url('data:image/jpeg;base64,${photos[0]}')` }),
         el('span', { class: 'more' }, ...photos.slice(1).map((b) => el('i', { style: `background-image:url('data:image/jpeg;base64,${b}')` }))),
         el('span', { class: 'cnt' }, `${photos.length}/2 · ＋`)]
      : [el('span', { class: 'cam', 'aria-hidden': 'true' }, '📷'), tx(T.photoBig)]));
  };
  drawTile();
  tile.onclick = () => (photos.length >= 2 ? photos.splice(0, photos.length) && drawTile() : file.click());
  file.onchange = async () => {
    for (const f of Array.from(file.files || []).slice(0, 2 - photos.length)) {
      try { photos.push(await toJpegB64(f)); } catch { showErr('BAD_PHOTO'); }
    }
    file.value = '';
    drawTile();
  };
  // ── Pick your treat (D-10NOV-E): type → example or own words → condition → photo of the real treat → cost + daily limit ──
  let ttype: TType | '' = '';
  let cond = 'none';
  let daily = 20;
  let treatPhoto = '';
  const treat = el('textarea', { id: 'apTreat', rows: '2', maxlength: '140' });
  const treatHint = el('span', { class: 'tx hint' });
  treatHint.append(...tx(T.treatHint, 'hint').childNodes);
  const sugg = el('div', { class: 'sugg', id: 'apSuggest' });
  const drawSugg = () => sugg.replaceChildren(...(ttype ? TREAT_EXAMPLES[ttype] : []).map((p, i) => {
    const b = el('button', { type: 'button', class: 'sg', 'data-example': String(i) }, tx(p));
    b.onclick = () => { treat.value = `${p[0]} / ${p[1]}`; setErr('f-treat', null); };
    return b;
  }));
  const types = el('div', { class: 'tcards', id: 'apTypes', role: 'radiogroup' });
  for (const [k, em, a, b] of [['free', '🧋', T.tFree, T.tFreeS], ['second', '👯', T.tSecond, T.tSecondS], ['secret', '🤫', T.tSecret, T.tSecretS]] as const) {
    const btn = el('button', { type: 'button', class: 'tcard', 'data-type': k, role: 'radio', 'aria-checked': 'false' },
      el('span', { class: 'em', 'aria-hidden': 'true' }, em), tx(a), tx(b, 'small'));
    btn.onclick = () => {
      ttype = k;
      types.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === btn)));
      if (k === 'second') { cond = 'two'; conds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.getAttribute('data-cond') === 'two'))); }
      drawSugg(); setErr('f-ttype', null);
      const first = TREAT_EXAMPLES[k][0]; treat.value = `${first[0]} / ${first[1]}`;
    };
    types.append(btn);
  }
  const conds = el('div', { class: 'chips', id: 'apConds', role: 'radiogroup' });
  for (const [k, p] of [['none', T.cNone], ['order', T.cOrder], ['two', T.cTwo]] as const) {
    const b = el('button', { type: 'button', class: 'chip', 'data-cond': k, role: 'radio', 'aria-checked': String(k === 'none') }, tx(p));
    b.onclick = () => { cond = k; conds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); };
    conds.append(b);
  }
  const tfile = el('input', { id: 'apTreatPhoto', type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const ttile = el('button', { type: 'button', class: 'phototile treatphoto', id: 'apAddTreatPhoto' });
  const drawTTile = () => ttile.replaceChildren(...(treatPhoto
    ? [el('span', { class: 'pv', style: `background-image:url('data:image/jpeg;base64,${treatPhoto}')` }), el('span', { class: 'cnt' }, '✓ · ↺')]
    : [el('span', { class: 'cam', 'aria-hidden': 'true' }, '📸'), tx(T.treatPhoto), tx(T.treatPhotoSub, 'small')]));
  drawTTile();
  ttile.onclick = () => tfile.click();
  tfile.onchange = async () => {
    const f = tfile.files?.[0];
    if (f) { try { treatPhoto = await toJpegB64(f); setErr('f-tphoto', null); } catch { showErr('BAD_PHOTO'); } }
    tfile.value = '';
    drawTTile();
  };
  const DAYS: [string, string][] = [['จ.', 'Mon'], ['อ.', 'Tue'], ['พ.', 'Wed'], ['พฤ.', 'Thu'], ['ศ.', 'Fri'], ['ส.', 'Sat'], ['อา.', 'Sun']];
  const DAYS_TH = ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสฯ', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์'];
  const timeSel = (id: string, v: string) => {
    const s0 = el('select', { id });
    for (let h = 5; h <= 27; h++) for (const mm of ['00', '30']) {
      const t = `${String(h % 24).padStart(2, '0')}:${mm}`;
      s0.append(el('option', { value: t, selected: t === v }, t));
    }
    return s0;
  };
  const openSel = timeSel('apOpen', '09:00');
  const closeSel = timeSel('apClose', '18:00');
  const closedDays = new Set<number>();
  const closedBox = el('div', { class: 'chips days', id: 'apClosed' });
  DAYS.forEach((d, i) => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, tx(d));
    b.onclick = () => { if (closedDays.has(i)) closedDays.delete(i); else closedDays.add(i); b.setAttribute('aria-pressed', String(closedDays.has(i))); };
    closedBox.append(b);
  });
  const hoursText = (): [string, string] => {
    const span = `${openSel.value}–${closeSel.value}`;
    const off = [...closedDays].sort();
    if (!off.length) return [`${span} ทุกวัน`, `${span} daily`];
    return [`${span} · ปิด${off.map((i) => DAYS_TH[i]).join(' ')}`, `${span} · closed ${off.map((i) => DAYS[i][1]).join(', ')}`];
  };
  const cost = el('input', { id: 'apCost', type: 'number', inputmode: 'numeric', min: '0', max: '2000', placeholder: '25' });
  const dailyBox = el('div', { class: 'chips', id: 'apDaily', role: 'radiogroup' });
  const maxLine = el('p', { class: 'maxcost', id: 'apMaxCost' });
  const drawMax = () => {
    const c = Math.max(0, Math.round(Number(cost.value) || 0));
    maxLine.replaceChildren(...(c ? [tx([`${T.maxcost[0]} ฿${(c * daily).toLocaleString('en-US')} ${T.perday[0]}`, `${T.maxcost[1]}: ฿${(c * daily).toLocaleString('en-US')} ${T.perday[1]}`])] : []));
  };
  for (const n of [10, 20, 30, 50]) {
    const b = el('button', { type: 'button', class: 'chip', 'data-daily': String(n), role: 'radio', 'aria-checked': String(n === 20) }, String(n));
    b.onclick = () => { daily = n; dailyBox.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); drawMax(); };
    dailyBox.append(b);
  }
  cost.oninput = drawMax;
  const agree = el('input', { id: 'apAgree', type: 'checkbox' });
  const send = el('button', { type: 'submit', class: 'big', id: 'apSend' }, tx(T.send));
  const top = el('p', { class: 'ferr top', id: 'apError', role: 'alert' });
  const nextBtn = el('button', { type: 'button', class: 'big', id: 'apNext' }, tx(T.next));
  const backBtn = el('button', { type: 'button', class: 'linkbtn', id: 'apBack' }, `‹ `, tx(T.back));

  const s1 = el('section', { class: 'step', id: 'apStep1' },
    el('p', { class: 'stepno' }, tx(T.step1)),
    field(T.name, name, undefined, 'f-name'),
    field(T.nameTh, nameTh),
    el('div', { class: 'af', id: 'f-kind' }, tx(T.kind, 'lbl'), kinds, el('span', { class: 'ferr', 'data-err': '' })),
    licensed,
    field(T.line, line, undefined, 'f-line'),
    field(T.maps, maps, T.mapsHint, 'f-maps'),
    nextBtn);
  const s2 = el('section', { class: 'step', id: 'apStep2', hidden: true },
    el('p', { class: 'stepno' }, backBtn, tx(T.step2)),
    el('div', { class: 'af', id: 'f-ttype' }, tx(T.ttype, 'lbl'), types, el('span', { class: 'ferr', 'data-err': '' })),
    el('div', { class: 'af' }, tx(T.suggest, 'hint'), sugg),
    (() => { const f = field(T.treat, treat, undefined, 'f-treat'); f.insertBefore(treatHint, f.lastChild); return f; })(),
    el('div', { class: 'af' }, tx(T.cond, 'lbl'), conds),
    el('div', { class: 'af', id: 'f-tphoto' }, ttile, tfile, el('span', { class: 'ferr', 'data-err': '' })),
    el('div', { class: 'two' }, field(T.cost, cost), el('div', { class: 'af' }, tx(T.daily, 'lbl'), dailyBox)),
    maxLine,
    el('div', { class: 'af', id: 'f-hours' }, tx(T.hours, 'lbl'), el('div', { class: 'two hrs' }, openSel, closeSel),
      tx(T.closed, 'hint'), closedBox),
    el('div', { class: 'af' }, tile, file),
    field(T.area, area),
    el('div', { class: 'two' }, field(T.contact, contact, undefined, 'f-contact'), field(T.phone, phone, undefined, 'f-phone')),
    ref ? el('p', { class: 'refline', id: 'apRef' }, tx(T.ref), el('b', {}, ref)) : null,
    el('label', { class: 'agree', id: 'f-terms' }, agree,
      el('span', {}, el('a', { href: '/partner-terms.html', target: '_blank', rel: 'noopener' }, tx(T.agree))),
      el('span', { class: 'ferr', 'data-err': '' })),
    top, send);
  const form = el('form', { id: 'applyForm', novalidate: true }, s1, s2);

  function setErr(id: string, key: string | null) {
    const box = form.querySelector(`#${id} [data-err]`);
    if (box) box.replaceChildren(...(key ? [tx(ERR[key])] : []));
    form.querySelector(`#${id}`)?.classList.toggle('bad', !!key);
  }
  function showErr(key: string) { top.replaceChildren(tx(ERR[key] || ERR.NETWORK)); }
  const runChecks = (checks: [string, string, boolean][]) => {
    let first: string | null = null;
    for (const [id, key, ok] of checks) { setErr(id, ok ? null : key); if (!ok && !first) first = id; }
    if (first) form.querySelector(`#${first}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return !first;
  };
  const step1Checks = (): [string, string, boolean][] => [
    ['f-name', 'name', name.value.trim().length >= 2],
    ['f-kind', 'kind', !!kind],
    ['f-licensed', 'licensed', kind !== 'stay' || licensedBox.checked],
    ['f-line', 'line', /^@?[a-z0-9._-]{3,30}$/i.test(line.value.trim())],
    ['f-maps', 'maps', /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|maps\.google\.[a-z.]+\/|www\.google\.[a-z.]+\/maps)/i.test(maps.value.trim())],
  ];
  nextBtn.onclick = () => {
    if (!runChecks(step1Checks())) return;
    s1.hidden = true; s2.hidden = false;
    s2.scrollIntoView({ block: 'start' });
  };
  backBtn.onclick = () => { s2.hidden = true; s1.hidden = false; s1.scrollIntoView({ block: 'start' }); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    top.replaceChildren();
    if (!runChecks(step1Checks())) { s2.hidden = true; s1.hidden = false; return; }
    if (!runChecks([
      ['f-contact', 'contact', contact.value.trim().length >= 2],
      ['f-phone', 'phone', !phone.value.trim() || /^\+?[0-9][0-9 -]{7,15}$/.test(phone.value.trim())],
      ['f-ttype', 'ttype', !!ttype],
      ['f-treat', 'treat', treat.value.trim().length >= 3],
      ['f-tphoto', 'tphoto', !!treatPhoto],
      ['f-treat', 'KR8_DEAL_WORDS', !/%|เปอร์เซ็นต์|percent|https?:\/\/|\b0\d{8,9}\b/i.test(treat.value)],
      ['f-terms', 'terms', agree.checked],
    ])) return;
    send.disabled = true;
    send.replaceChildren(tx(T.sending));
    try {
      const c = await v5Client();
      const cd = COND[cond];
      const words = treat.value.trim() + (cond !== 'none' && cd[0] ? ` (${cd[0]} / ${cd[1]})` : '');
      const { error } = await c.rpc('kr8_apply_venue3', {
        p_name: name.value.trim(), p_kind: kind, p_area: area.value, p_maps_url: maps.value.trim(), p_contact: contact.value.trim(),
        p_line_id: line.value.trim(), p_phone: phone.value.trim() || null, p_photos_b64: [treatPhoto, ...photos],
        p_treat: words.slice(0, 140), p_ref: ref || null, p_terms_version: 'partner-2026-11-10b', p_licensed: kind === 'stay' ? licensedBox.checked : null,
        p_meta: { type: ttype, cond, cost: String(Math.max(0, Math.round(Number(cost.value) || 0))), daily: String(daily), name_th: nameTh.value.trim(), hours_th: hoursText()[0], hours_en: hoursText()[1] },
      });
      if (error) throw new Error((String(error.message).match(/KR8_[A-Z_]+|ALREADY_APPLIED|RATE_LIMIT|BAD_PHOTO/) || ['NETWORK'])[0]);
      const [hTh, hEn] = hoursText();
      const tw = treat.value.trim().split(' / ');
      const kindEm = ({ cafe: '☕', restaurant: '🍜', dessert: '🍧', stay: '🛏' } as Record<string, string>)[kind] || '☕';
      const ticket = el('div', { class: 'tcardB', id: 'apCardB' },
        el('div', { class: 'tph', style: `background-image:url('data:image/jpeg;base64,${treatPhoto}')` }, el('span', { class: 'tarea' }, `📍 ${area.value}`)),
        el('div', { class: 'tband' }, el('b', {}, tw[0] || treat.value.trim()), tw[1] ? el('small', {}, tw[1]) : null, el('i', {}), el('i', {})),
        el('div', { class: 'tfoot' }, el('div', {}, el('b', {}, nameTh.value.trim() || name.value.trim()),
          nameTh.value.trim() ? el('small', {}, name.value.trim()) : null, el('small', {}, `${kindEm} ${hEn}`)), el('span', { class: 'there' }, 'I’m here')));
      void hTh;
      root.replaceChildren(el('main', { class: 'apply done', id: 'applyDone' },
        el('div', { class: 'ring' }, '✓'), el('h1', {}, tx(T.cardReady)), ticket,
        el('p', {}, tx(T.cardLater)), el('p', { class: 'muted' }, tx(T.cardSave)), el('p', { class: 'muted' }, tx(T.thanksLine))));
      window.scrollTo(0, 0);
    } catch (err) {
      send.disabled = false;
      send.replaceChildren(tx(T.send));
      const k = String((err as Error).message);
      if (k === 'KR8_DEAL_WORDS') setErr('f-treat', 'KR8_DEAL_WORDS');
      if (k === 'KR8_TREAT_PHOTO') setErr('f-tphoto', 'KR8_TREAT_PHOTO');
      showErr(k);
    }
  };

  const video = el('video', { class: 'herovid', src: `${base()}media/partner_hero.mp4`, poster: `${base()}media/partner_hero.jpg`, muted: true, autoplay: true, loop: true, playsinline: true }) as HTMLVideoElement;
  video.muted = true;
  root.replaceChildren(el('main', { class: 'apply' },
    el('header', { class: 'hero' }, video, el('span', { class: 'brandmark' }, rings(), 'กริ๊ง!'),
      el('div', { class: 'heroline' }, tx(T.hero))),
    el('div', { class: 'paper' },
      el('h1', {}, tx(T.title)), el('p', { class: 'sub' }, tx(T.sub)),
      pictureCards(),
      el('p', { class: 'promise', id: 'apPromise' }, tx(T.promise)),
      form)));
  void video.play().catch(() => undefined);
}
