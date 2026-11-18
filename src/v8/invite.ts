/**
 * One-tap invite sharing (invite-1, founder 18 Nov: "make it smooth and less clutter, it should be one tap sharing so everyone does it
 * as muscle memory"). Every share the app makes carries the member's own invite code (?ref=k00184, the code kr8_set_ref stores),
 * and one tap goes straight to the phone's share sheet: no in-between sheet, no QR, no list.
 *   · navigator.share → the phone's own share sheet (title + one short line + link)
 *   · LINE in-app browser → LINE's own share picker (https://line.me/R/share?text=…)
 *   · anything else (no share sheet: computer, Instagram/Facebook in-app on Android, or the sheet refused) → copy the link + "Link copied"
 * When the friend joins with the link and passes the face check, both get +X Rings on the week's board (0109_kr8_invite_rings.sql).
 */
import { inAppBrowser } from './A2HS';

export const INVITE_RINGS_DEFAULT = 10;
const CODE_RE = /^k[0-9]{5,7}$/;

/** The member's invite code from their member number: 184 → "k00184" (same as kxLogic.inviteCode). */
export const refCode = (no: number | string | null | undefined): string => {
  const n = typeof no === 'string' ? parseInt(no, 10) : no;
  return n && Number.isFinite(n) && n > 0 ? `k${String(n).padStart(5, '0')}` : '';
};

/** The link with ?ref=<code> set exactly once (an older ref in the link is replaced, never doubled). No valid code → the link as it is. */
export function withRef(url: string, code: string | null | undefined): string {
  const c = (code || '').toLowerCase();
  if (!url || !CODE_RE.test(c)) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('ref');
    u.searchParams.set('ref', c);
    return u.toString();
  } catch {
    const [head, hash = ''] = url.split('#');
    const [path, q = ''] = head.split('?');
    const kept = q.split('&').filter((p) => p && !/^ref=/i.test(p));
    kept.push(`ref=${c}`);
    return `${path}?${kept.join('&')}${hash ? `#${hash}` : ''}`;
  }
}

/** LINE's official share picker with the text and the link. */
export const lineShareUrl = (text: string, url: string) => `https://line.me/R/share?text=${encodeURIComponent(text ? `${text}\n${url}` : url)}`;

export type ShareKind = 'my_reel' | 'reel' | 'my_profile' | 'profile' | 'place' | 'invite';
const isTh = (lang: string) => lang === 'th';

/** One short natural line, in the app's language only (Thai mode = Thai, every other mode = English). Founder 18 Nov: a challenge. */
export function shareText(lang: string, kind: ShareKind, name = ''): string {
  const th = isTh(lang);
  const n = (name || '').trim();
  switch (kind) {
    case 'my_reel':
      return th ? 'ช่วยกดไลก์คลิปนี้หน่อย! ยิ่งไลก์ยิ่งได้ขึ้นอันดับบนกริ๊ง! 🔥' : 'Help me climb! Every like and save on Kring pushes me up the board 🔥';
    case 'my_profile':   // audit 18 Nov: a profile link is not "this clip" (Thai said "like this clip" on a profile)
      return th ? 'ช่วยกดไลก์คลิปของฉันหน่อย! ยิ่งไลก์ยิ่งได้ขึ้นอันดับบนกริ๊ง! 🔥' : 'Help me climb! Every like and save on Kring pushes me up the board 🔥';
    case 'invite':       // audit 18 Nov: right after making a card there is no Reel yet, so no "like this clip"
      return th ? 'มาเล่นกริ๊งด้วยกัน! มาเที่ยว ได้เพื่อนใหม่ 🔥' : 'Join me on Kring! Explore Bangkok, make new friends 🔥';
    case 'reel':
      return th ? `${n ? `${n} กำลังไต่อันดับบนกริ๊ง` : 'คลิปนี้กำลังไต่อันดับบนกริ๊ง'} กดไลก์ช่วยดันหน่อย! 🔥` : `${n ? `${n} is climbing the Kring board` : 'This Reel is climbing the Kring board'} · one like pushes it up 🔥`;
    case 'profile':
      return th ? `${n || 'เพื่อน'} อยู่บนกริ๊งแล้ว มาดูกัน!` : `${n || 'A friend'} is on Kring · come say hi!`;
    case 'place':
      return th ? `${n} บนกริ๊ง 📍` : `${n} on Kring 📍`;
  }
  return '';
}

/** The one quiet line next to a share button (Board button, post-success). Founder 18 Nov copy. */
export function inviteHintParts(lang: string, x: number = INVITE_RINGS_DEFAULT): { lead: string; amt: string; word: string } {
  const v = x > 0 ? x : INVITE_RINGS_DEFAULT;
  return isTh(lang) ? { lead: 'เพื่อนไลก์ = ขึ้นอันดับ ·', amt: `+${v}`, word: 'ริง' } : { lead: 'Friends’ likes = you climb ·', amt: `+${v}`, word: 'Rings' };
}
/** Full text (screen readers, tests). On screen the word "Rings" is the Kring rings icon. */
export function inviteHint(lang: string, x: number = INVITE_RINGS_DEFAULT): string {
  const p = inviteHintParts(lang, x);
  return `${p.lead} ${p.amt} ${p.word}`;
}

/** The Me line: "Friends joined: 2 · +20 Rings". */
/** Parts for the Me line, with the Rings word drawn as the icon on screen. */
export function friendsParts(lang: string, friends: number, rings: number): { lead: string; amt: string } {
  return isTh(lang) ? { lead: `เพื่อนที่ชวนมา: ${friends} ·`, amt: `+${rings}` } : { lead: `Friends joined: ${friends} ·`, amt: `+${rings}` };
}
export function friendsLine(lang: string, friends: number, rings: number): string {
  return isTh(lang) ? `เพื่อนที่ชวนมา: ${friends} · +${rings} ริง` : `Friends joined: ${friends} · +${rings} Rings`;
}

export type ShareChannel = 'native' | 'line' | 'copy';
export function pickChannel(ua: string, hasNativeShare: boolean): ShareChannel {
  if (inAppBrowser(ua) === 'line') return 'line';
  if (hasNativeShare) return 'native';
  // audit 18 Nov: no share sheet (computer, Instagram / Facebook in-app on Android) → copy. LINE's picker is only for people inside LINE:
  // a traveller in Instagram without LINE would land on a LINE web page.
  return 'copy';
}

export interface ShareDeps {
  ua: string;
  share?: ((d: { title?: string; text?: string; url?: string }) => Promise<void>) | null;
  open: (url: string) => void;
  copy: (s: string) => Promise<boolean>;
  toast: (m: string) => void;
  lang: string;
  /** "Link copied" in the app's language (defaults: Thai / English) */
  copied?: string;
}
export interface SharePayload { title: string; text: string; url: string }
/** What happened: the channel used, or 'cancelled' when the person closed the share sheet. */
export type ShareResult = ShareChannel | 'cancelled';

/** ONE tap. Must be called straight from the tap (no awaits before it), so the phone allows the share sheet / copy. */
export async function oneTapShare(p: SharePayload, d: ShareDeps): Promise<ShareResult> {
  const ch = pickChannel(d.ua, typeof d.share === 'function');
  const copied = d.copied || (isTh(d.lang) ? 'คัดลอกลิงก์แล้ว' : 'Link copied');
  if (ch === 'line') { d.open(lineShareUrl(p.text, p.url)); return 'line'; }
  if (ch === 'native' && d.share) {
    try { await d.share({ title: p.title, text: p.text, url: p.url }); return 'native'; } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      // the phone refused the sheet (lost the tap, not allowed here): copy instead
    }
  }
  const ok = await d.copy(p.url).catch(() => false);
  d.toast(ok ? copied : p.url);   // copy blocked (old webview): show the link so it can be long-pressed
  return 'copy';
}
