// 0187 (21 Nov 2026, founder): automatic pre-checks for a traveller-tag request. Pure functions (no network), unit-tested in
// travellercheck.test.ts. The edge function reads the passport photo page with OCR, finds the machine-readable zone (MRZ),
// compares the passport face with the member's face-check selfie (or card photo), and saves ONLY the outcome: nationality code,
// pass/fail flags, face similarity, name-match result. Never the MRZ text, the passport number, the birth date or the full name.
// The founder still taps Approve / Refuse; this only prepares the suggestion on the admin card.

export type Mrz = { issuing: string; nationality: string; surname: string; given: string[]; valid: boolean; checks: number };
export type NameResult = 'match' | 'close' | 'differs' | 'thai_script' | 'unknown';
export type FaceResult = 'ok' | 'unsure' | 'different' | 'no_face_passport' | 'no_reference' | 'skipped' | 'error';
export type Suggestion = 'pass' | 'fail' | 'check';

/** Similarity limits (AWS CompareFaces, 0–100): ≥ FACE_OK same person; < FACE_DIFF different person; in between = founder looks */
export const FACE_OK = 80;
export const FACE_DIFF = 60;

const ALPHA_FIX: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
/** OCR clean-up of one text line: upper case, no spaces, look-alike chevrons → '<' */
export function cleanLine(s: string): string {
  return (s || '').toUpperCase().replace(/[\s]+/g, '').replace(/[«‹≪<〈⟨]/g, '<');
}
/** ICAO 9303 check digit (weights 7, 3, 1; '<' = 0, A = 10 … Z = 35) */
export function checkDigit(s: string): number {
  const w = [7, 3, 1];
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === '<' ? 0 : /[0-9]/.test(c) ? Number(c) : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : 0;
    t += v * w[i % 3];
  }
  return t % 10;
}
/** a 3-letter state code from the MRZ (Germany is 'D<<'); OCR digits in a letter field are fixed (0 → O …) */
export function stateCode(raw: string): string | null {
  const s = raw.split('').map((c) => ALPHA_FIX[c] ?? c).join('');
  if (/^D<</.test(s)) return 'DEU';
  return /^[A-Z]{3}$/.test(s) ? s : /^[A-Z]{2}<$/.test(s) ? s.slice(0, 2) : null;
}

/** Find a passport (TD3) MRZ in the OCR lines. Line 1: P + type + issuing state + SURNAME<<GIVEN<NAMES; line 2: number, check,
 *  nationality, birth date, check, sex, expiry, check, … OCR (Rekognition) often drops the long '<' tails or splits a line, so the
 *  structure of the first 28 characters of line 2 is what counts, not the full 44-character length. Null = not a passport page. */
const D = '[0-9OISBQDZ]';
const L2 = new RegExp(`([A-Z0-9<]{9})(${D})([A-Z0-9<]{3})(${D}{6})(${D})([MFX<])(${D}{6})(${D})`);
const L1 = /^P[A-Z<]([A-Z0-9<]{3})([A-Z]+(?:<{1,2}[A-Z]+)*<[A-Z<]*)$/;   // line start, at least one '<' filler (never a printed word)
const digits = (x: string) => x.replace(/O|Q|D/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
export function findMrz(lines: string[]): Mrz | null {
  const L = lines.map(cleanLine).map((x) => x.replace(/[^A-Z0-9<]/g, '')).filter((x) => x.length >= 5);
  const tries = [...L, ...L.slice(0, -1).map((x, i) => x + L[i + 1])];   // single lines first, then each joined with the next
  let l1: RegExpMatchArray | null = null, issuing: string | null = null;
  for (const t of tries) {
    const m = t.match(L1);
    if (m && m[2].length >= 4) { const st = stateCode(m[1]); if (st) { l1 = m; issuing = st; break; } }
  }
  if (!l1 || !issuing) return null;
  for (const t of tries) {
    const m = t.match(L2);
    if (!m) continue;
    const nationality = stateCode(m[3]);
    if (!nationality) continue;
    const checks = [checkDigit(m[1]) === Number(digits(m[2])), checkDigit(digits(m[4])) === Number(digits(m[5])),
      checkDigit(digits(m[7])) === Number(digits(m[8]))].filter(Boolean).length;
    const names = l1[2].replace(/<+$/, '');
    const [sur, giv = ''] = names.split('<<');
    const surname = (sur || '').replace(/</g, ' ').trim();
    const given = giv.split('<').map((x) => x.trim()).filter((x) => x && !/^K{3,}$/.test(x));
    return { issuing, nationality, surname, given, valid: checks >= 2, checks };
  }
  return null;
}

/** letters only, accents removed, upper case; both ways of writing umlauts (Ü → U and UE) are kept */
function normVariants(s: string): string[] {
  const up = (s || '').toUpperCase();
  const a = up.replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/Å/g, 'AA').replace(/Ø/g, 'OE');   // ICAO spellings
  const out = new Set<string>();
  for (const v of [up, a]) {
    out.add(v.replace(/ß/g, 'SS').replace(/Æ/g, 'AE').replace(/Ø/g, 'O').replace(/Œ/g, 'OE').replace(/Ł/g, 'L').replace(/Đ/g, 'D')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]+/g, ' ').trim());
  }
  return [...out].filter(Boolean);
}
function lev(a: string, b: string): number {   // edit distance with swapped neighbours counted as one (Jonh ≈ John)
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
/** The card first name vs the passport names. A soft signal only: Thai nicknames and short forms often differ. */
export function nameMatch(cardFirst: string | null | undefined, surname: string, given: string[]): NameResult {
  const card = (cardFirst || '').trim();
  if (!card) return 'unknown';
  const pass = [...given, ...surname.split(/\s+/)].flatMap((x) => normVariants(x)).flatMap((x) => x.split(' ')).filter((x) => x.length >= 2);
  if (!pass.length) return 'unknown';
  const cardToks = normVariants(card).flatMap((x) => x.split(' ')).filter((x) => x.length >= 2);
  if (!cardToks.length) return /[฀-๿]/.test(card) ? 'thai_script' : 'unknown';
  if (cardToks.some((c) => pass.includes(c))) return 'match';
  const close = cardToks.some((c) => pass.some((p) => {
    if (c.length >= 3 && p.length >= 3 && (p.startsWith(c) || c.startsWith(p))) return true;   // Alex ≈ ALEXANDER
    const n = Math.min(c.length, p.length);
    return n >= 4 && lev(c, p) <= (n >= 7 ? 2 : 1);                                                 // Jonh ≈ JOHN, Katarina ≈ KATHARINA
  }));
  return close ? 'close' : 'differs';
}

/** AWS CompareFaces answer → face result (similarity rounded to 0.1) */
export function faceOf(resp: unknown): { result: FaceResult; sim: number | null } {
  const r = (resp || {}) as { FaceMatches?: { Similarity?: number }[]; UnmatchedFaces?: unknown[] };
  const m = r.FaceMatches || [], u = r.UnmatchedFaces || [];
  if (!m.length && !u.length) return { result: 'no_face_passport', sim: null };
  const best = Math.max(0, ...m.map((x) => x.Similarity ?? 0));
  const sim = Math.round(best * 10) / 10;
  return { result: sim >= FACE_OK ? 'ok' : sim < FACE_DIFF ? 'different' : 'unsure', sim };
}

export type Verdict = { suggestion: Suggestion; fail_code: 'not_passport' | 'thai' | 'photo' | null };
/** PASS = all fine; FAIL = not a passport page, a Thai passport, or a different face; CHECK = only the name differs or a step could not run */
export function verdict(x: { mrz: boolean; thai: boolean; face: FaceResult; name: NameResult; errors: string[] }): Verdict {
  if (!x.mrz) return { suggestion: x.errors.includes('ocr') ? 'check' : 'fail', fail_code: x.errors.includes('ocr') ? null : 'not_passport' };
  if (x.thai) return { suggestion: 'fail', fail_code: 'thai' };
  if (x.face === 'different') return { suggestion: 'fail', fail_code: 'photo' };
  if (x.face !== 'ok' || x.name !== 'match' && x.name !== 'close' || x.errors.length) return { suggestion: 'check', fail_code: null };
  return { suggestion: 'pass', fail_code: null };
}
