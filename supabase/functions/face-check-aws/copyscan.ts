// copyscan (19 Nov 2026): pure rules for two robot checks in face-check-aws. No Deno / network here, so vitest runs them.
//  1. Reel copied from another app: AWS DetectText on the Reel's poster (+ the extra scan frames the app uploads, if any) →
//     watermark words (TikTok, CapCut, Douyin…), stock-video marks (alamy, depositphotos…), AI tools (Grok) or an @handle.
//  2. Under-18 check: AWS DetectFaces AGE_RANGE on the straight face-check frame → LIKELY_MINOR / CHECK / OK.
// Same rules as the 19 Nov one-off audit (migrations 0145 / 0146). Never hides or closes anything: it records and raises an alert.

export type CopyKind = 'app_watermark' | 'stock_watermark' | 'ai_watermark' | 'handle_only';
export interface TextDet { DetectedText?: string; Type?: string; Confidence?: number }
export interface CopyHit { text: string; at: string; why: string }

const APP: [string, string][] = [
  ['tiktok', 'TikTok'], ['ติ๊กต็อก', 'TikTok'], ['ติ๊กต๊อก', 'TikTok'], ['capcut', 'CapCut'], ['douyin', 'Douyin'], ['抖音', 'Douyin'],
  ['kuaishou', 'Kuaishou'], ['快手', 'Kuaishou'], ['likee', 'Likee'], ['instagram', 'Instagram'], ['lemon8', 'Lemon8'],
];
const STOCK = ['depositphotos', 'alamy', 'shutterstock', 'gettyimages', 'istock', 'dreamstime', 'pond5', 'storyblocks', 'envato'];
const AI = ['grok'];
const HANDLE = /^@[A-Za-z0-9._]{3,}$/;

/** Every watermark-like line / word AWS read on one frame (`at` = 'poster' or '12.3s'). Low-confidence reads (< 80) are ignored. */
export function copyHits(dets: TextDet[] | null | undefined, at: string): CopyHit[] {
  const out: CopyHit[] = [];
  const seen = new Set<string>();
  for (const d of dets || []) {
    const text = (d.DetectedText || '').trim();
    if (!text || (d.Confidence ?? 100) < 80) continue;
    const low = text.toLowerCase();
    let why = APP.find(([k]) => low.includes(k))?.[0] || STOCK.find((k) => low.includes(k)) || AI.find((k) => low.includes(k)) || null;
    if (!why && text.split(/\s+/).some((t) => HANDLE.test(t))) why = '@handle';
    if (!why || seen.has(text)) continue;
    seen.add(text);
    out.push({ text: text.slice(0, 80), at, why });
  }
  return out;
}

/** Strongest kind across all hits (an app watermark beats a stock mark beats AI beats a bare @handle) and the text to show. */
export function copySummary(hits: CopyHit[]): { copied: boolean; kind: CopyKind | null; watermark: string | null; app: string | null } {
  const of = (k: CopyKind) => hits.filter((h) => (k === 'app_watermark' ? APP.some(([a]) => a === h.why) : k === 'stock_watermark' ? STOCK.includes(h.why)
    : k === 'ai_watermark' ? AI.includes(h.why) : h.why === '@handle'));
  for (const k of ['app_watermark', 'stock_watermark', 'ai_watermark', 'handle_only'] as CopyKind[]) {
    const hs = of(k);
    if (!hs.length) continue;
    const best = hs.reduce((a, b) => (b.text.length < a.text.length ? b : a));
    return { copied: true, kind: k, watermark: best.text, app: k === 'app_watermark' ? APP.find(([a]) => a === best.why)?.[1] ?? null : null };
  }
  return { copied: false, kind: null, watermark: null, app: null };
}

export type AgeVerdict = 'LIKELY_MINOR' | 'CHECK' | 'OK';
/** AWS age ranges are wide: High < 20 → likely under 18; Low < 18 and High < 24 → have a look; else OK. */
export function ageVerdict(r: { Low?: number; High?: number } | null | undefined): AgeVerdict | null {
  if (!r || typeof r.Low !== 'number' || typeof r.High !== 'number') return null;
  if (r.High < 20) return 'LIKELY_MINOR';
  if (r.Low < 18 && r.High < 24) return 'CHECK';
  return 'OK';
}

/** The extra frames the app uploads next to a Reel video for this check (v5Reel scanFrames): `<video path>.s1.jpg`, `.s2.jpg`. */
export const scanFramePaths = (videoPath: string): string[] => [1, 2].map((n) => `${videoPath}.s${n}.jpg`);
