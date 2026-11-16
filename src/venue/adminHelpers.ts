/**
 * Venue-approval helpers shared by the admin (photo upload, treat split, owner LINE welcome message, stand links).
 * Moved out of admin.ts unchanged for the Admin v2 redesign (13 Nov).
 */
import { staffLink, v5Client } from './shared';

/** Downsizes a photo to max 1280 px JPEG (keeps uploads small on the free tier). */
export async function toJpeg(src: Blob, max = 1280): Promise<Blob> {
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
export async function uploadPhotos(appId: string, given: string[], extra: FileList | null): Promise<string[]> {
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
  // audit P3-3: the owner may have typed "คุณสมชาย" / "Khun Somchai" already (was "คุณคุณสมชาย"); the English half never shows Thai script
  const base = (o.contact || '').trim().replace(/^(คุณ|khun\.?\s|k\.\s?)\s*/i, '').trim();
  const enName = /[\u0E00-\u0E7F]/.test(base) ? (base.match(/[A-Za-z][A-Za-z .'-]*/)?.[0] || '').trim() : base;
  const hi = base ? `สวัสดีครับ คุณ${base}` : 'สวัสดีครับ';
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
    `Hello${enName ? ' ' + enName : ''}! Welcome to Kring, ${o.name} 🎉`,
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
