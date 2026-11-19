/**
 * One-tap invite sharing (invite-1, founder 18 Nov: "make it smooth and less clutter, it should be one tap sharing so everyone does it
 * as muscle memory"). Every share the app makes carries the member's own invite code (?ref=k00184, the code kr8_set_ref stores),
 * and one tap goes straight to the phone's share sheet: no in-between sheet, no QR, no list.
 *   · navigator.share → the phone's own share sheet (title + one short line + link)
 *   · LINE in-app browser → LINE's own share picker (https://line.me/R/share?text=…)
 *   · anything else (no share sheet: computer, Instagram/Facebook in-app on Android, or the sheet refused) → copy the link + "Link copied"
 * When the friend joins with the link and their first Reel is approved, both get +X Rings on the week's board (0109, rule changed in 0111_kr8_face_later.sql).
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

/** face-fixes (19 Nov): shared from inside LINE's built-in browser (UA " Line/"), a Kring link gets openExternalBrowser=1, so the
 *  friend who taps it in a LINE chat lands in the phone's real browser (camera, sign-in and dings work there). Other params and the
 *  #hash are kept; liff.line.me links (meant to open inside LINE), non-http links and other browsers are left as they are. */
export function lineOut(url: string, ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (!url || inAppBrowser(ua) !== 'line') return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || /(^|\.)line\.me$/i.test(u.hostname)) return url;
    u.searchParams.set('openExternalBrowser', '1');
    return u.toString();
  } catch { return url; }
}

/** LINE's official share picker with the text and the link. */
export const lineShareUrl = (text: string, url: string) => `https://line.me/R/share?text=${encodeURIComponent(text ? `${text}\n${url}` : url)}`;

export type ShareKind = 'my_reel' | 'my_reel_soon' | 'reel' | 'my_profile' | 'profile' | 'place' | 'invite';
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
    case 'my_reel_soon': // founder 18 Nov: share right after posting a Reel that is still in review. The link is my profile (+ref),
                         // which shows the Reel once it is approved, so a friend never lands on a hidden Reel.
      return th ? 'รีลใหม่ของฉันกำลังจะขึ้นบนกริ๊ง! กดติดตามไว้ก่อนเลย 🔥' : 'My new Reel is coming up on Kring · follow me so you don’t miss it 🔥';
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

/** The one quiet line next to a share button (Board button, post-success). Founder 18 Nov (2nd round): "Friend joins = +10 each"
 *  (both get the Rings once the friend's first Reel is approved; 0111). On screen: lead · amount · Kring rings icon · tail. */
export function inviteHintParts(lang: string, x: number = INVITE_RINGS_DEFAULT): { lead: string; amt: string; word: string; tail: string } {
  const v = x > 0 ? x : INVITE_RINGS_DEFAULT;
  return isTh(lang) ? { lead: 'เพื่อนสมัคร = ได้', amt: `+${v}`, word: 'ริง', tail: 'ทั้งคู่' } : { lead: 'Friend joins =', amt: `+${v}`, word: 'Rings', tail: 'each' };
}
/** Full text (screen readers, tests). On screen the word "Rings" is the Kring rings icon. */
export function inviteHint(lang: string, x: number = INVITE_RINGS_DEFAULT): string {
  const p = inviteHintParts(lang, x);
  return `${p.lead} ${p.amt} ${p.word} ${p.tail}`;
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
export async function oneTapShare(p0: SharePayload, d: ShareDeps): Promise<ShareResult> {
  const p = { ...p0, url: lineOut(p0.url, d.ua) };
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

/** "Your Reel is live · Share" (founder 18 Nov): the newest of my Reels that the TEAM approved (kr8_my_activity kind 'approved',
 *  reviewed_at set; Reels approved on upload never appear there) in the last 3 days, not shown on this phone yet. */
export interface LiveRow { kind: string; at: string; post_id: string | null }
export const LIVE_WINDOW_MS = 3 * 24 * 3600_000;
export function pickLiveReel(rows: LiveRow[] | null | undefined, seen: string[], now = Date.now()): string | null {
  const hit = (rows || [])
    .filter((r) => r.kind === 'approved' && !!r.post_id && !seen.includes(r.post_id) && now - Date.parse(r.at) < LIVE_WINDOW_MS && Date.parse(r.at) <= now + 60_000)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return hit?.post_id ?? null;
}
const liveKey = (uid: string) => `kr8_live_seen_${uid}`;
export function liveSeen(uid: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(liveKey(uid)) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
/** Mark one or more Reels as shown (the moment shows only the newest; older approvals in the same list are marked too). */
export function markLiveSeen(uid: string, id: string | string[]): void {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  try { localStorage.setItem(liveKey(uid), JSON.stringify([...liveSeen(uid).filter((x) => !ids.includes(x)), ...ids].slice(-50))); } catch { /* private mode */ }
}
