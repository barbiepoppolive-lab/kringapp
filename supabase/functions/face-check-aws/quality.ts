// quality (19 Nov 2026, 0150 Feed quality autopilot): turns AWS answers for one picture into a small feature record.
// No Deno / network here, so vitest runs it. The SCORE and the suggestion are worked out in the database
// (kr8_reel_quality_calc / kr8_people_quality_calc), so the founder's limits can be tuned without a deploy.

export interface LabelsResp {
  Labels?: { Name?: string; Confidence?: number }[];
  ImageProperties?: { Quality?: { Brightness?: number; Sharpness?: number; Contrast?: number } };
}
export interface FacesResp {
  FaceDetails?: { Confidence?: number; BoundingBox?: { Width?: number; Height?: number }; AgeRange?: { Low?: number; High?: number };
    Quality?: { Brightness?: number; Sharpness?: number } }[];
}
export interface TextResp { TextDetections?: { DetectedText?: string; Type?: string; Confidence?: number }[] }

export interface FaceF { a: number; conf: number; low: number | null; high: number | null; fb: number | null; fs: number | null }
export interface FrameF { at: string; b: number | null; s: number | null; c: number | null; person: number; labels: string[]; faces: FaceF[]; words: number; text: string[] }

const r1 = (n: number | undefined | null) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/** One picture → features. `at` = 'poster' | 'middle' | 'end' | 'photo'. */
export function frameFeatures(at: string, labels: LabelsResp | null, faces: FacesResp | null, text: TextResp | null): FrameF {
  const q = labels?.ImageProperties?.Quality || {};
  const ls = (labels?.Labels || []).filter((l) => (l.Confidence ?? 0) >= 70 && l.Name);
  const person = Math.max(0, ...(labels?.Labels || []).filter((l) => l.Name === 'Person').map((l) => l.Confidence ?? 0));
  const fs: FaceF[] = (faces?.FaceDetails || [])
    .map((f) => ({ a: Math.round((f.BoundingBox?.Width ?? 0) * (f.BoundingBox?.Height ?? 0) * 10000) / 10000, conf: r1(f.Confidence) ?? 0,
      low: f.AgeRange?.Low ?? null, high: f.AgeRange?.High ?? null, fb: r1(f.Quality?.Brightness), fs: r1(f.Quality?.Sharpness) }))
    .sort((x, y) => y.a - x.a).slice(0, 6);
  const lines = (text?.TextDetections || []).filter((t) => t.Type === 'LINE' && (t.Confidence ?? 0) >= 80).map((t) => (t.DetectedText || '').trim()).filter(Boolean);
  const words = (text?.TextDetections || []).filter((t) => t.Type === 'WORD' && (t.Confidence ?? 0) >= 80).length;
  return { at, b: r1(q.Brightness), s: r1(q.Sharpness), c: r1(q.Contrast), person: Math.round(person * 10) / 10,
    labels: ls.slice(0, 20).map((l) => l.Name as string), faces: fs, words, text: lines.slice(0, 10).map((t) => t.slice(0, 60)) };
}

/** base64 of a `data:image/...;base64,` photo, or null for anything else (an https link is fetched by the caller). */
export function dataUrlB64(photo: string | null | undefined): string | null {
  const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(photo || '');
  return m ? m[1] : null;
}
