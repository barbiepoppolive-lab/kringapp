/** Admin "Post a Reel" (17 Nov): pure helpers, tested in src/venue/postReel.test.ts. The screen itself is postView() in adminApp.ts.
 *  One tap per platform: copy the caption, then hand the video to the phone's share sheet (Instagram / YouTube / X app).
 *  Desktop (no file sharing): copy the caption and open that platform's upload page. No backend, no keys, no paid APIs. */

export type Platform = 'instagram' | 'youtube' | 'x';
export const PLATFORMS: { id: Platform; name: string }[] = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'x', name: 'X' },
];

/** Thai line ("Show Bangkok from your side, and make new friends on Kring!") + English line + link + hashtags. */
export const REEL_CAPTION = [
  'โชว์กรุงเทพฯ ในมุมของคุณ แล้วหาเพื่อนใหม่บนกริ๊ง!',
  'Show your side of Bangkok and make new friends on Kring.',
  '👉 kringapp.com',
  '#Bangkok #Kring #กริ๊ง',
].join('\n');
export const REEL_CAPTION_EN = 'Thai line says: “Show Bangkok from your side, and make new friends on Kring!”';

/** Words Kring never uses in public copy. English ones match at a word start (so "ghost" is not "host"); Thai ones anywhere. */
export const BANNED_WORDS = ['meet', 'guide', 'tour', 'host', 'creator', 'reviews', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temples', 'ลุ้น'];
export function bannedIn(text: string): string[] {
  const s = String(text || '');
  return BANNED_WORDS.filter((w) => (/^[a-z ]+$/i.test(w) ? new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}`, 'i').test(s) : s.includes(w)));
}

/** Upload page for the desktop fallback. X gets the caption pre-filled. */
export function uploadUrl(p: Platform, caption: string): string {
  if (p === 'instagram') return 'https://www.instagram.com/';
  if (p === 'youtube') return 'https://studio.youtube.com/channel/UC/videos/upload?d=ud';
  return 'https://x.com/compose/post?text=' + encodeURIComponent(caption);
}

export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ShareEnv {
  copy: (text: string) => Promise<unknown> | unknown;
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; text: string }) => Promise<void>;
  open: (url: string) => unknown;
}
/** 'shared' = share sheet done · 'opened' = desktop upload page opened · 'cancelled' = he closed the share sheet · 'nofile' = no video picked. */
export type ShareResult = 'shared' | 'opened' | 'cancelled' | 'nofile';

/** Must be called straight from the tap: share() and open() both need the tap's user activation, so nothing is awaited before them. */
export async function shareReel(p: Platform, file: File | null, caption: string, env: ShareEnv): Promise<ShareResult> {
  if (!file) return 'nofile';
  const copied = Promise.resolve().then(() => env.copy(caption)).catch(() => undefined);
  let canFiles = false;
  try { canFiles = !!(env.share && env.canShare && env.canShare({ files: [file] })); } catch { canFiles = false; }
  if (canFiles) {
    try { await env.share!({ files: [file], text: caption }); await copied; return 'shared'; } catch (e) {
      await copied;
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // share failed for another reason (e.g. too big for this browser) → fall through to the upload page
    }
  }
  env.open(uploadUrl(p, caption));
  await copied;
  return 'opened';
}
