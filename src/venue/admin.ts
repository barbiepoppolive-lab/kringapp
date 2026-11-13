/**
 * Venue admin: kringapp.com/app/admin.html (admins only; checked again on the server by kr8_is_admin()).
 * Pending cafés → one tap Approve (photo uploaded to Storage, venue live in Deals or as a practice listing, owner LINE message) or Reject with a reason.
 * Venues → approved date, first swipe (Bew's ฿50 trigger), uses, practice switch, daily cap, stand + sticker files, pause.
 * STAFF SWIPE replaces the counter PIN (D-10NOV-C); the PIN reset stays as a hidden backup.
 */
import '../lib/sentry';
import { V5_AREAS, v5VerifyCode } from '../v8/v5Live';
import { bkkTime, el, rpc, staffLink, tx, v5Client, type TxPair } from './shared';
import { creatorsView, giftsView, reelsView, reportsView } from './reelsAdmin';
import { verifyView } from './verifyAdmin';
import { socialView } from './socialAdmin';
import { stayView } from './stayAdmin';

type App = {
  id: string; venue_name: string; owner_name: string; line_id: string | null; phone: string | null; category: string; band: number;
  band1_discount_thb: number | null; band1_min_bill_thb: number | null; city: string; district: string | null; maps_url: string;
  referral_host_code: string | null; status: string; reject_reason: string | null; created_at: string; photo_b64: string | null;
  kind: string | null; treat_text: string | null; extra_photos_b64: string[]; licensed_stay?: boolean | null;
};
type Stat = {
  venue_id: string; name: string; area: string; status: 'live' | 'paused'; approved_at: string; approved_by: string;
  referral_host_code: string | null; first_redeemed_at: string | null; redemptions: number; claims: number;
  failed_pin_tries_7d: number; pin_locked_until: string | null;
};

const T = {
  title: ['แอดมินร้านพาร์ทเนอร์', 'Kring venue admin'],
  email: ['อีเมลแอดมิน', 'Admin email'],
  send: ['ส่งรหัส', 'Send code'],
  code: ['รหัส 6 หลักจากอีเมล', '6-digit code from your email'],
  verify: ['เข้าสู่ระบบ', 'Sign in'],
  notAdmin: ['บัญชีนี้ไม่ใช่แอดมิน', 'This account is not an admin'],
  signOut: ['ออกจากระบบ', 'Sign out'],
  pending: ['รออนุมัติ', 'Pending'],
  venues: ['ร้านที่เปิดแล้ว · ยอดใช้โค้ด', 'Live venues · code checks'],
  none: ['ไม่มีใบสมัครรออนุมัติ', 'No applications waiting'],
  noVenues: ['ยังไม่มีร้านที่อนุมัติ', 'No approved venues yet'],
  area: ['ย่านที่แสดงในแอป', 'Area shown in the app'],
  cat: ['หมวดในแอป', 'Deals category'],
  hoursEn: ['เวลาเปิด (อังกฤษ)', 'Opening hours (English)'],
  hoursTh: ['เวลาเปิด (ไทย)', 'Opening hours (Thai)'],
  dealEn: ['ดีล (อังกฤษ) · เป็นบาท ห้ามใช้เปอร์เซ็นต์', 'Deal (English) · in baht, no percent'],
  dealTh: ['ดีล (ไทย)', 'Deal (Thai)'],
  nameTh: ['ชื่อร้านภาษาไทย (ถ้ามี)', 'Thai venue name (optional)'],
  photos: ['รูปเพิ่ม (สูงสุด 3 รูป · รูปหน้าร้านใส่ให้แล้ว)', 'More photos (up to 3 · shopfront photo already included)'],
  approve: ['อนุมัติ · เปิดในแอป', 'Approve · go live'],
  reject: ['ไม่อนุมัติ', 'Reject'],
  reason: ['เหตุผล (ร้านจะเห็น)', 'Reason (the venue sees this)'],
  confirmReject: ['ยืนยันไม่อนุมัติ', 'Confirm reject'],
  approved: ['อนุมัติแล้ว · ร้านขึ้นในแท็บดีลแล้ว', 'Approved · the venue is live in Deals'],
  approvedPractice: ['อนุมัติแล้ว · ร้านทดลอง (ซ่อนจากแท็บดีล)', 'Approved · practice listing (hidden from Deals)'],
  pinOnce: ['PIN พนักงาน · แสดงครั้งเดียว ส่งให้เจ้าของร้านทาง LINE', 'Staff PIN · shown once, send it to the owner on LINE'],
  link: ['ลิงก์หน้าตรวจโค้ดของร้าน', 'Counter page link for this venue'],
  copy: ['คัดลอก PIN + ลิงก์', 'Copy PIN + link'],
  copied: ['คัดลอกแล้ว', 'Copied'],
  resetPin: ['PIN สำรอง', 'Backup PIN'],
  pause: ['พักร้าน', 'Pause'],
  resume: ['เปิดอีกครั้ง', 'Resume'],
  working: ['กำลังทำ…', 'Working…'],
  needed: ['กรอกเวลาเปิดทั้งไทยและอังกฤษ', 'Fill in opening hours in Thai and English'],
  thVenue: ['ร้าน', 'Venue'], thApproved: ['อนุมัติ', 'Approved'], thFirst: ['ใช้โค้ดครั้งแรก', 'First code check'],
  thCount: ['ใช้แล้ว / รับไป', 'Redeemed / claimed'], thRef: ['ผู้แนะนำ', 'Referred by'],
} as const satisfies Record<string, TxPair>;

const ERR: Record<string, TxPair> = {
  KR8_ADMIN_ONLY: T.notAdmin,
  KR8_DEAL_WORDS: ['ห้ามมีเปอร์เซ็นต์ คำว่าช่วงเงียบ ลิงก์ หรือเบอร์โทร', 'No percent sign, quiet-hours words, links or phone numbers'],
  KR8_DEAL_TEXT_REQUIRED: ['ใส่สิทธิพิเศษ (เป็นบาท) อย่างน้อยหนึ่งภาษา', 'Add the treat words (in baht) in at least one language'],
  KR8_ALREADY_REVIEWED: ['ใบสมัครนี้ถูกตรวจไปแล้ว', 'Already reviewed'],
  KR8_BAD_PHOTOS: ['อัปโหลดรูปไม่สำเร็จ', 'Photo upload failed'],
  KR8_BAD_AREA: ['เลือกย่าน', 'Pick an area'],
  KR8_REASON_REQUIRED: ['ใส่เหตุผลอย่างน้อย 3 ตัวอักษร', 'Give a reason (3+ characters)'],
  KR8_NEED_PHOTO: ['ต้องมีรูปอย่างน้อย 1 รูป', 'At least one photo is needed'],
};
const errOf = (e: unknown): TxPair => ERR[String((e as Error)?.message)] || ['ทำไม่สำเร็จ: ' + String((e as Error)?.message || e), 'Failed: ' + String((e as Error)?.message || e)];

const CAT_OF: Record<string, string> = { cafe: 'coffee', dessert: 'coffee', casual: 'food', restaurant: 'food', rooftop: 'food', studio: 'classes', experience: 'fun', stay: 'stay' };
const KIND_LABEL: Record<string, string> = { cafe: 'คาเฟ่ · Café', restaurant: 'ร้านอาหาร · Restaurant', dessert: 'ของหวาน · Dessert', stay: 'ที่พัก · Place to stay' };
const app = document.getElementById('app')!;
let view: 'pending' | 'venues' | 'reels' | 'creators' | 'gifts' | 'reports' | 'verify' | 'social' | 'stay' = 'reels';

function header(signedIn: boolean): HTMLElement {
  const h = el('h1', {}, el('span', { class: 'dot' }), el('span', { class: 'grow' }, tx(T.title)));
  if (signedIn) {
    const out = el('button', { class: 'ghost', id: 'signOut' }, tx(T.signOut));
    out.onclick = async () => { (await v5Client()).auth.signOut().catch(() => undefined); void boot(); };
    h.append(out);
  }
  return h;
}

function signInScreen(msg?: TxPair) {
  const email = el('input', { id: 'adminEmail', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
  const send = el('button', { id: 'adminSend', class: 'big' }, tx(T.send));
  const box = el('div', { class: 'card' }, el('label', { class: 'f' }, tx(T.email), email), send, msg ? el('p', { class: 'err' }, tx(msg)) : null);
  send.onclick = async () => {
    send.disabled = true;
    try {
      const { error } = await (await v5Client()).auth.signInWithOtp({ email: email.value.trim().toLowerCase(), options: { shouldCreateUser: false } });
      if (error) throw error;
    } catch (e) { send.disabled = false; box.append(el('p', { class: 'err' }, String((e as Error).message))); return; }
    const code = el('input', { id: 'adminCode', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' });
    const ver = el('button', { id: 'adminVerify', class: 'big' }, tx(T.verify));
    ver.onclick = async () => {
      ver.disabled = true;
      try { await v5VerifyCode(email.value, code.value); void boot(); } catch (e) { ver.disabled = false; box.append(el('p', { class: 'err' }, String((e as Error).message))); }
    };
    box.replaceChildren(el('p', { class: 'meta' }, email.value), el('label', { class: 'f' }, tx(T.code), code), ver);
    code.focus();
  };
  app.replaceChildren(header(false), box);
}

/** Downsizes a photo to max 1280 px JPEG (keeps uploads small on the free tier). */
async function toJpeg(src: Blob, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(src);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('KR8_BAD_PHOTOS'))), 'image/jpeg', 0.82));
}
function b64Blob(b64: string): Blob {
  const bin = atob(b64.replace(/\s/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: 'image/jpeg' });
}
async function uploadPhotos(appId: string, given: string[], extra: FileList | null): Promise<string[]> {
  const c = await v5Client();
  const files: Blob[] = [...given.map(b64Blob), ...Array.from(extra || [])].slice(0, 4);
  if (!files.length) throw new Error('KR8_NEED_PHOTO');
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = `${appId}/${Date.now()}-${i}.jpg`;
    let body: Blob = files[i];
    try { body = await toJpeg(files[i]); } catch { /* keep original */ }
    const { error } = await c.storage.from('kr8-venue-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error('KR8_BAD_PHOTOS');
    urls.push(c.storage.from('kr8-venue-photos').getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

/** Splits the owner's "ไทย / English" treat words into the Thai and English halves (either half may be missing). */
export function splitTreat(t: string | null | undefined): { th: string; en: string } {
  const s = (t || '').trim();
  if (!s) return { th: '', en: '' };
  const isTh = (x: string) => /[\u0E00-\u0E7F]/.test(x);
  const parts = s.split(/\s+\/\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const th = parts.filter(isTh).join(' / ');
    const en = parts.filter((x) => !isTh(x)).join(' / ');
    if (th && en) return { th, en };
  }
  return isTh(s) ? { th: s, en: '' } : { th: '', en: s };
}

/** Stand + door sticker download page for one venue (print files, 300 dpi). */
export function standLink(venueId: string): string {
  return staffLink(venueId).replace('staff.html', 'stand.html');
}

/** Ready-to-send LINE message for the owner (Thai first with ครับ, English under it). OPTION A (D-10NOV-E): nothing to print, guests tap "I'm here". */
export function lineMessage(o: { name: string; contact?: string | null; link: string; dealTh?: string | null; dealEn?: string | null; practice?: boolean; test?: string }): string {
  const hi = o.contact ? `สวัสดีครับ คุณ${o.contact}` : 'สวัสดีครับ';
  const th = o.dealTh || o.dealEn || '';
  const en = o.dealEn || o.dealTh || '';
  return [
    `${hi} 🎉 ยินดีต้อนรับร้าน ${o.name} สู่กริ๊ง!ครับ`,
    o.practice ? 'ตอนนี้เป็นร้านทดลอง (ยังไม่แสดงในแอป) ลองใช้ได้เต็มที่ครับ' : 'ร้านของคุณขึ้นในแอปกริ๊ง!แล้วครับ',
    o.practice && o.test ? `ลองเปิดบัตรสดของร้านด้วยมือถืออีกเครื่อง: ${o.test}` : '',
    th ? `สิทธิพิเศษของร้าน: ${th}` : '',
    'วิธีใช้:',
    '1) ลูกค้ามาที่ร้าน แล้วกด "ฉันอยู่ที่ร้าน" ในแอปกริ๊ง!',
    '2) บัตรสดขึ้นบนมือถือลูกค้า มีชื่อ รูป และนาฬิกาที่เดินอยู่',
    '3) พนักงานดูบัตรแล้วให้สิทธิพิเศษได้เลย ตอนสั่ง ตอนกิน หรือตอนจ่ายก็ได้ครับ',
    'ลูกค้า 1 คนใช้ได้วันละ 1 ครั้งต่อร้าน ไม่ต้องพิมพ์อะไร ไม่ต้องสแกน ไม่ต้องใช้รหัสครับ',
    o.link ? `ดูว่าวันนี้มีลูกค้ากริ๊ง!มากี่คน (ลิงก์ส่วนตัวของร้าน): ${o.link}` : '',
    'เปลี่ยนหรือหยุดสิทธิพิเศษได้ โดยแจ้งล่วงหน้า 2 วันทาง LINE นี้ครับ',
    '',
    `Hello${o.contact ? ' ' + o.contact : ''}! Welcome to Kring, ${o.name} 🎉`,
    o.practice ? 'You are a practice listing for now (not shown in the app yet), so try it as much as you like.' : 'Your place is now live in the Kring app.',
    o.practice && o.test ? `Try your live pass on a second phone: ${o.test}` : '',
    en ? `Your treat: ${en}` : '',
    'How it works:',
    '1) The guest comes to your place and taps "I\'m here" in Kring.',
    '2) A live pass opens on their phone, with their name, photo and a running clock.',
    '3) Your staff look at it and give the treat: when ordering, eating or paying.',
    'One treat per guest per day at your place. Nothing to print, scan or type.',
    o.link ? `See your Kring guests today (your private link): ${o.link}` : '',
    'To change or pause your treat, message us here 2 days before.',
    '— Barbie · Founder, KRING',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

type Owner = { name: string; contact?: string | null; dealTh?: string | null; dealEn?: string | null; line?: string | null; practice?: boolean };

/** Approval box: the owner's LINE message (swipe flow) + stand/sticker downloads. No PIN. */
function welcomeBox(venueId: string, title: TxPair, owner: Owner): HTMLElement {
  let msg = lineMessage({ name: owner.name, contact: owner.contact, link: '', dealTh: owner.dealTh, dealEn: owner.dealEn, practice: owner.practice, test: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}?v=${encodeURIComponent(venueId)}` });
  const box = el('textarea', { id: 'lineMsg', rows: '12', readonly: true, style: 'font-size:13px' });
  box.value = msg;
  // the owner's private "today" page link (owner_key, migration 0034)
  void rpc<string>('kr8_admin_owner_key', { p_venue: venueId }).then((k) => {
    if (!k) return;
    const link = staffLink(venueId).replace('staff.html', 'owner.html') + '&k=' + encodeURIComponent(k);
    msg = lineMessage({ name: owner.name, contact: owner.contact, link, dealTh: owner.dealTh, dealEn: owner.dealEn, practice: owner.practice, test: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}?v=${encodeURIComponent(venueId)}` });
    box.value = msg;
  }).catch(() => undefined);
  const copy = el('button', { id: 'copyLine' }, tx(['คัดลอกข้อความ LINE', 'Copy LINE message']));
  copy.onclick = () => {
    void navigator.clipboard?.writeText(msg).then(() => copy.replaceChildren(tx(T.copied))).catch(() => { box.select(); });
  };
  // A personal LINE ID can't receive a pre-filled message link (LINE shows an error): open their profile to add them, the message is copied first.
  // Only Official Account IDs (@xxxx) accept line.me/R/oaMessage. LINE limits that link, so the long welcome text is always pasted.
  const lid = (owner.line || '').trim();
  const safe = lid.replace(/[^A-Za-z0-9._@-]/g, "");
  const lineHref = safe.startsWith("@") ? `https://line.me/R/ti/p/${safe}` : `https://line.me/R/ti/p/~${safe}`;
  const openLine = lid
    ? el('a', { class: 'ghost', href: lineHref, target: '_blank', rel: 'noopener', id: 'openLine', style: 'color:var(--gold);align-self:center' },
        tx([`คัดลอกแล้วเปิด LINE ${lid}`, `Copy + open LINE ${lid}`]))
    : null;
  if (openLine) openLine.addEventListener('click', () => { void navigator.clipboard?.writeText(msg).catch(() => undefined); });
  return el('div', { class: 'card', id: 'pinCard' }, el('p', { class: 'ok' }, tx(title)),
    owner.practice ? el('p', { class: 'note', id: 'practiceNote' }, tx(['ร้านทดลอง · ไม่แสดงในแท็บดีล', 'Practice listing · hidden from Deals'])) : null,
    el('p', { class: 'meta' }, tx(['ข้อความ LINE พร้อมส่งให้เจ้าของร้าน', 'LINE message ready for the owner'])), box,
    el('div', { class: 'row', style: 'margin-top:10px' }, copy, openLine));
}

function printButtons(venueId: string): HTMLElement {
  const base = standLink(venueId);
  return el('div', { class: 'row' },
    el('a', { class: 'ghost btnlink', href: base + '&f=stand', target: '_blank', rel: 'noopener', id: 'dlStand-' + venueId }, tx(['ป้าย A6 (PDF)', 'A6 stand (PDF)'])),
    el('a', { class: 'ghost btnlink', href: base + '&f=sticker', target: '_blank', rel: 'noopener', id: 'dlSticker-' + venueId }, tx(['สติกเกอร์ประตู 10 ซม.', '10 cm door sticker'])));
}

/** Hidden backup only (D-10NOV-C): old counter PIN page for a venue that can't use the swipe. */
function pinBox(venueId: string, pin: string, title: TxPair): HTMLElement {
  const link = staffLink(venueId);
  return el('div', { class: 'card', id: 'pinCard' }, el('p', { class: 'ok' }, tx(title)),
    el('p', { class: 'meta' }, tx(['สำรองเท่านั้น · ปกติใช้การสไลด์', 'Backup only · normally staff just slide'])),
    el('div', { class: 'pin', id: 'pinValue' }, pin),
    el('p', {}, el('a', { href: link, target: '_blank', rel: 'noopener', style: 'color:var(--gold);word-break:break-all', id: 'staffLink' }, link)));
}

function appCard(a: App): HTMLElement {
  const sel = (id: string, opts: readonly string[], v: string) => {
    const s = el('select', { id });
    for (const o of opts) s.append(el('option', { value: o, selected: o === v }, o));
    return s;
  };
  const area = sel('area-' + a.id, V5_AREAS, (V5_AREAS as readonly string[]).includes(a.district || '') ? a.district! : 'Bangkok');
  const cat = sel('cat-' + a.id, ['coffee', 'food', 'classes', 'fun', 'stay'], CAT_OF[a.kind || a.category] || 'coffee');
  const hoursEn = el('input', { id: 'hoursEn-' + a.id, placeholder: '08:00–18:00 daily' });
  const hoursTh = el('input', { id: 'hoursTh-' + a.id, placeholder: '08:00–18:00 ทุกวัน' });
  const dealEn = el('input', { id: 'dealEn-' + a.id });
  const dealTh = el('input', { id: 'dealTh-' + a.id });
  if (a.treat_text) {
    const tr = splitTreat(a.treat_text);
    dealTh.value = tr.th; dealEn.value = tr.en;
  } else if (a.band === 1) {
    dealEn.value = `฿${a.band1_discount_thb} off when your bill is ฿${a.band1_min_bill_thb} or more`;
    dealTh.value = `ลด ฿${a.band1_discount_thb} เมื่อยอดครบ ฿${a.band1_min_bill_thb} ขึ้นไป`;
  }
  const nameTh = el('input', { id: 'nameTh-' + a.id });
  // 0035: the owner's own Thai name + opening hours from the sign-up form → nothing to type here
  void rpc<{ name_th?: string; hours_en?: string; hours_th?: string }>('kr8_admin_app_meta', { p_application: a.id }).then((m) => {
    if (m?.name_th && !nameTh.value) nameTh.value = m.name_th;
    if (m?.hours_en && !hoursEn.value) hoursEn.value = m.hours_en;
    if (m?.hours_th && !hoursTh.value) hoursTh.value = m.hours_th;
  }).catch(() => undefined);
  // link name in the stand QR (kringapp.com/app/?v=<this>); Thai-only names need a Latin one, e.g. "baan-noi"
  const autoSlug = a.venue_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  const slug = el('input', { id: 'slug-' + a.id, value: autoSlug, placeholder: 'baan-noi-cafe', autocapitalize: 'none' });
  // practice listing: full flow works, hidden from public Deals (first one: Saranya's restaurant, ref bew-fw)
  const practice = el('input', { id: 'practice-' + a.id, type: 'checkbox', checked: (a.referral_host_code || '').toLowerCase() === 'bew-fw' });
  const files = el('input', { id: 'photos-' + a.id, type: 'file', accept: 'image/*', multiple: true });
  const msg = el('div', {});
  const approve = el('button', { id: 'approve-' + a.id }, tx(T.approve));
  const reject = el('button', { class: 'ghost', id: 'reject-' + a.id }, tx(T.reject));
  const card = el('div', { class: 'card', 'data-app': a.id },
    a.photo_b64 ? el('img', { class: 'shop', src: `data:image/jpeg;base64,${a.photo_b64}`, alt: a.venue_name }) : el('p', { class: 'err' }, tx(['ไม่มีรูป · เพิ่มรูปด้านล่างก่อนอนุมัติ', 'No photo · add one below before approving'])),
    a.extra_photos_b64?.length ? el('div', { class: 'row' }, ...a.extra_photos_b64.map((b) => el('img', { src: `data:image/jpeg;base64,${b}`, alt: '', style: 'width:84px;height:84px;object-fit:cover;border-radius:10px' }))) : null,
    el('div', { class: 'row' }, el('b', { class: 'grow', style: 'font-size:18px' }, a.venue_name), el('span', { class: 'pill' }, KIND_LABEL[a.kind || ''] || a.category)),
    a.treat_text ? el('div', { class: 'meta' }, tx(['สิทธิพิเศษ (คำของร้าน)', 'Treat (their words)']), ' ', el('b', {}, a.treat_text)) : null,
    el('div', { class: 'meta' }, el('b', {}, a.owner_name), ' · ', a.line_id ? 'LINE ' + a.line_id : '', a.line_id && a.phone ? ' · ' : '', a.phone || ''),
    el('div', { class: 'meta' }, [a.district, a.city].filter(Boolean).join(', '), ' · ',
      el('a', { href: a.maps_url, target: '_blank', rel: 'noopener', style: 'color:var(--gold)' }, 'Google Maps')),
    el('div', { class: 'meta' }, bkkTime(a.created_at), a.referral_host_code ? ` · ref ${a.referral_host_code}` : ''),
    el('div', { class: 'grid2' }, el('label', { class: 'f' }, tx(T.area), area), el('label', { class: 'f' }, tx(T.cat), cat)),
    el('div', { class: 'grid2' }, el('label', { class: 'f' }, tx(T.hoursTh), hoursTh), el('label', { class: 'f' }, tx(T.hoursEn), hoursEn)),
    el('div', { class: 'grid2' }, el('label', { class: 'f' }, tx(T.dealTh), dealTh), el('label', { class: 'f' }, tx(T.dealEn), dealEn)),
    el('label', { class: 'f' }, tx(T.nameTh), nameTh),
    el('label', { class: 'f' }, tx(['ชื่อลิงก์ร้าน (ภาษาอังกฤษ) · ใช้ใน QR ป้าย', 'Link name (Latin letters) · used in the stand QR']), slug),
    el('label', { class: 'f' }, tx(T.photos), files),
    a.licensed_stay ? el('div', { class: 'meta ok' }, tx(['✓ ร้านยืนยันว่ามีใบอนุญาตรับแขก', '✓ Owner ticked "licensed to take guests"'])) : null,
    el('label', { class: 'row', style: 'gap:8px;margin-top:8px' }, practice, tx(['ร้านทดลอง (ไม่แสดงในแท็บดีล)', 'Practice listing (hidden from Deals)'])),
    el('div', { class: 'row', style: 'margin-top:14px' }, approve, reject), msg);

  approve.onclick = async () => {
    if (hoursEn.value.trim().length < 3 || hoursTh.value.trim().length < 3) { msg.replaceChildren(el('p', { class: 'err' }, tx(T.needed))); return; }
    approve.disabled = reject.disabled = true;
    msg.replaceChildren(el('p', { class: 'note' }, tx(T.working)));
    try {
      const photos = await uploadPhotos(a.id, [a.photo_b64, ...(a.extra_photos_b64 || [])].filter((x): x is string => !!x), files.files);
      const r = await rpc<{ venue_id: string; pin: string; deal_th: string; deal_en: string }>('kr8_admin_approve_venue2', {
        p_application: a.id, p_area: area.value, p_cat: cat.value, p_hours_en: hoursEn.value.trim(), p_hours_th: hoursTh.value.trim(),
        p_photos: photos, p_deal_en: dealEn.value.trim() || null, p_deal_th: dealTh.value.trim() || null, p_name_th: nameTh.value.trim() || null,
        p_practice: practice.checked,
        // "Baan Noi Café" → baan-noi-cafe (accents folded so the stand QR link reads well)
        p_slug: slug.value.trim() || null,
      });
      card.replaceWith(welcomeBox(r.venue_id, practice.checked ? T.approvedPractice : T.approved, { name: a.venue_name, contact: a.owner_name, line: a.line_id,
        dealTh: r.deal_th || dealTh.value.trim(), dealEn: r.deal_en || dealEn.value.trim(), practice: practice.checked }));
    } catch (e) {
      approve.disabled = reject.disabled = false;
      msg.replaceChildren(el('p', { class: 'err' }, tx(errOf(e))));
    }
  };
  reject.onclick = () => {
    const why = el('input', { id: 'reason-' + a.id });
    const go = el('button', { class: 'bad', id: 'confirmReject-' + a.id }, tx(T.confirmReject));
    go.onclick = async () => {
      go.disabled = true;
      try { await rpc('kr8_admin_reject_venue', { p_application: a.id, p_reason: why.value }); card.remove(); }
      catch (e) { go.disabled = false; msg.append(el('p', { class: 'err' }, tx(errOf(e)))); }
    };
    msg.replaceChildren(el('label', { class: 'f' }, tx(T.reason), why), el('div', { class: 'row', style: 'margin-top:10px' }, go));
    why.focus();
  };
  return card;
}

async function venuesView(body: HTMLElement) {
  const rows = await rpc<Stat[]>('kr8_admin_venue_stats');
  if (!rows.length) { body.replaceChildren(el('div', { class: 'card empty' }, tx(T.noVenues))); return; }
  // 0028 (V-03, V-04): different guests, "live" = 2nd different guest (pay the bonus from here), locked phones
  type Guests = { venue_id: string; guests: number; live_confirmed_at: string | null; new_account_guests: number; locked_phones: number; locked_until: string | null };
  const g = new Map((await rpc<Guests[]>('kr8_admin_venue_guests').catch(() => [] as Guests[])).map((x) => [x.venue_id, x]));
  // 0032: practice listing, daily cap, uses today, stand + sticker files
  type Flags = { venue_id: string; practice: boolean; daily_cap: number; used_today: number; deal_en: string | null; deal_th: string | null; name_th: string | null; licensed_stay: boolean | null };
  const fl = new Map((await rpc<Flags[]>('kr8_admin_venue_flags').catch(() => [] as Flags[])).map((x) => [x.venue_id, x]));
  const tbl = el('table', { id: 'statsTable' }, el('thead', {}, el('tr', {},
    el('th', {}, tx(T.thVenue)), el('th', {}, tx(T.thApproved)), el('th', {}, tx(T.thFirst)), el('th', {}, tx(['ร้านเปิดจริง (ลูกค้าคนที่ 2)', 'Live (2nd different guest)'])), el('th', {}, tx(T.thCount)), el('th', {}, tx(T.thRef)), el('th', {}, ''))));
  const tb = el('tbody', {});
  const extra = el('div', {});
  for (const s of rows) {
    const reset = el('button', { class: 'ghost', id: 'reset-' + s.venue_id }, tx(T.resetPin));
    reset.onclick = async () => {
      reset.disabled = true;
      try { const pin = await rpc<string>('kr8_admin_reset_pin', { p_venue: s.venue_id }); extra.replaceChildren(pinBox(s.venue_id, pin, [`PIN ใหม่ · ${s.name}`, `New PIN · ${s.name}`])); }
      catch (e) { extra.replaceChildren(el('p', { class: 'err' }, tx(errOf(e)))); }
      reset.disabled = false;
    };
    const gi = g.get(s.venue_id);
    const unlock = el('button', { class: 'ghost', id: 'unlock-' + s.venue_id }, tx(['ปลดล็อกเคาน์เตอร์', 'Unlock counter']));
    unlock.onclick = async () => {
      unlock.disabled = true;
      try { await rpc('kr8_admin_unlock_venue', { p_venue: s.venue_id }); void render(); }
      catch (e) { unlock.disabled = false; extra.replaceChildren(el('p', { class: 'err' }, tx(errOf(e)))); }
    };
    const live = s.status === 'live';
    const toggle = el('button', { class: 'ghost', id: 'toggle-' + s.venue_id }, tx(live ? T.pause : T.resume));
    toggle.onclick = async () => { await rpc('kr8_admin_set_venue_live', { p_venue: s.venue_id, p_live: !live }).catch(() => undefined); void render(); };
    const f = fl.get(s.venue_id);
    const prac = el('input', { type: 'checkbox', id: 'practice-' + s.venue_id, checked: !!f?.practice });
    prac.onchange = async () => { await rpc('kr8_admin_set_practice', { p_venue: s.venue_id, p_on: prac.checked }).catch((e) => extra.replaceChildren(el('p', { class: 'err' }, tx(errOf(e))))); void render(); };
    const cap = el('input', { type: 'number', min: '1', max: '500', id: 'cap-' + s.venue_id, value: String(f?.daily_cap ?? 30), style: 'width:70px;padding:4px 6px' });
    cap.onchange = async () => { await rpc('kr8_admin_set_daily_cap', { p_venue: s.venue_id, p_cap: Number(cap.value) }).catch((e) => extra.replaceChildren(el('p', { class: 'err' }, tx(errOf(e))))); };
    const msgBtn = el('button', { class: 'ghost', id: 'msg-' + s.venue_id }, tx(['ข้อความต้อนรับ', 'Welcome message']));
    msgBtn.onclick = () => extra.replaceChildren(welcomeBox(s.venue_id, [`ข้อความต้อนรับ · ${s.name}`, `Welcome message · ${s.name}`],
      { name: s.name, dealTh: f?.deal_th, dealEn: f?.deal_en, practice: !!f?.practice }));
    tb.append(el('tr', { 'data-venue': s.venue_id, 'data-practice': f?.practice ? '1' : '' },
      el('td', {}, el('b', {}, s.name), el('div', { class: 'meta' }, s.area, ' · ', el('span', { class: `pill ${s.status}` }, s.status),
          f?.practice ? el('span', { class: 'pill', style: 'margin-left:4px' }, tx(['ทดลอง', 'Practice'])) : null),
        el('label', { class: 'meta row', style: 'gap:6px' }, prac, tx(['ร้านทดลอง (ซ่อนจากดีล)', 'Practice (hidden from Deals)'])),
        el('label', { class: 'meta row', style: 'gap:6px' }, tx(['ใช้ได้ต่อวัน', 'Uses per day']), cap, el('span', { 'data-used-today': String(f?.used_today ?? 0) }, tx([`วันนี้ ${f?.used_today ?? 0}`, `today ${f?.used_today ?? 0}`]))),
        printButtons(s.venue_id),
        s.pin_locked_until ? el('div', { class: 'err' }, tx([`PIN ล็อกถึง ${bkkTime(s.pin_locked_until, false)}`, `PIN locked until ${bkkTime(s.pin_locked_until, false)}`])) : null,
        gi && gi.locked_phones ? el('div', { class: 'err', 'data-locked-phones': String(gi.locked_phones) }, tx([`โทรศัพท์ถูกพัก ${gi.locked_phones} เครื่อง (PIN ผิด)`, `${gi.locked_phones} phone(s) paused (wrong PIN)`])) : null),
      el('td', {}, bkkTime(s.approved_at), el('div', { class: 'meta' }, s.approved_by)),
      el('td', { class: s.first_redeemed_at ? 'ok' : 'meta', 'data-first': s.first_redeemed_at || '' }, s.first_redeemed_at ? bkkTime(s.first_redeemed_at) : '–'),
      el('td', { class: gi?.live_confirmed_at ? 'ok' : 'meta', 'data-live': gi?.live_confirmed_at || '', 'data-guests': String(gi?.guests ?? '') },
        gi?.live_confirmed_at ? bkkTime(gi.live_confirmed_at) : '–',
        el('div', { class: 'meta' }, tx([`ลูกค้าต่างคน ${gi?.guests ?? 0}`, `${gi?.guests ?? 0} different guest(s)`])),
        gi && gi.new_account_guests ? el('div', { class: 'err' }, tx([`บัญชีใหม่ไม่ถึง 24 ชม. ${gi.new_account_guests} คน · ตรวจก่อนจ่าย`, `${gi.new_account_guests} brand-new account(s) · check before paying`])) : null),
      el('td', { 'data-count': String(s.redemptions) }, `${s.redemptions} / ${s.claims}`),
      el('td', {}, s.referral_host_code || '–'),
      el('td', {}, el('div', { class: 'row' }, msgBtn, toggle, reset, (s.pin_locked_until || gi?.locked_phones) ? unlock : null))));
  }
  tbl.append(tb);
  body.replaceChildren(el('div', { class: 'card', style: 'overflow-x:auto' }, tbl), extra);
}

async function render() {
  const pendingBtn = el('button', { class: view === 'pending' ? 'on' : '', id: 'tabPending' }, tx(T.pending));
  const venuesBtn = el('button', { class: view === 'venues' ? 'on' : '', id: 'tabVenues' }, tx(T.venues));
  pendingBtn.onclick = () => { view = 'pending'; void render(); };
  venuesBtn.onclick = () => { view = 'venues'; void render(); };
  const mk = (v: typeof view, id: string, label: TxPair) => { const b = el('button', { class: view === v ? 'on' : '', id }, tx(label)); b.onclick = () => { view = v; void render(); }; return b; };
  const reelsBtn = mk('reels', 'tabReels', ['รีลรอตรวจ', 'Reels review']);
  const creatorsBtn = mk('creators', 'tabCreators', ['ครีเอเตอร์ · จ่ายผู้แนะนำ', 'Creators · recruiter payouts']);
  const giftsBtn = mk('gifts', 'tabGifts', ['ของรางวัล Top 5', 'Top-5 gifts']);
  const reportsBtn = mk('reports', 'tabReports', ['รายงาน', 'Reports']);
  const verifyBtn = mk('verify', 'tabVerify', ['ยืนยันตัวตน ✓', 'Verify ✓']);
  const socialBtn = mk('social', 'tabSocial', ['คิวโซเชียล', 'Social queue']);
  const stayBtn = mk('stay', 'tabStay', ['ที่พัก / กิจกรรม', 'Stay / Do']);
  const body = el('div', { id: 'body' });
  app.replaceChildren(header(true), el('div', { class: 'tabs', style: 'flex-wrap:wrap' }, reelsBtn, reportsBtn, verifyBtn, creatorsBtn, giftsBtn, socialBtn, stayBtn, pendingBtn, venuesBtn), body);
  try {
    if (view === 'venues') return await venuesView(body);
    if (view === 'reels') return await reelsView(body);
    if (view === 'creators') return await creatorsView(body);
    if (view === 'gifts') return await giftsView(body);
    if (view === 'verify') return await verifyView(body, (n) => verifyBtn.replaceChildren(tx([`ยืนยันตัวตน (${n})`, `Verify (${n})`])));
    if (view === 'social') return await socialView(body, (n) => socialBtn.replaceChildren(tx([`คิวโซเชียล (${n})`, `Social queue (${n})`])));
    if (view === 'stay') return await stayView(body, (n) => stayBtn.replaceChildren(tx([`ที่พัก / กิจกรรม (${n} live)`, `Stay / Do (${n} live)`])));
    if (view === 'reports') return await reportsView(body, (n) => reportsBtn.replaceChildren(tx([`รายงาน (${n})`, `Reports (${n})`])));
    const apps = await rpc<App[]>('kr8_admin_applications', { p_status: 'pending' });
    pendingBtn.replaceChildren(tx([`${T.pending[0]} (${apps.length})`, `${T.pending[1]} (${apps.length})`]));
    body.replaceChildren(...(apps.length ? apps.map(appCard) : [el('div', { class: 'card empty' }, tx(T.none))]));
  } catch (e) {
    body.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'err' }, tx(errOf(e)))));
  }
}

async function boot() {
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  if (!data.session) return signInScreen();
  const isAdmin = await rpc<boolean>('kr8_is_admin').catch(() => false);
  if (!isAdmin) return signInScreen(T.notAdmin);
  void render();
}

void boot();
