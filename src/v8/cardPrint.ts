/**
 * 0076: every card photo gets a face code (numbers, not a photo) so a 2nd account with the same face is flagged for the
 * team. Runs on the phone after the card photo passed checkProfilePhoto; once per photo (remembered in localStorage).
 * 17 Nov (founder): ONLY for members who agreed to the face consent that names the card photo (face-2026-11-17c, asked in the
 * Get-verified check). Older members are not asked again and get no card code: `allowed` says no → nothing is computed or sent.
 * Never throws and never blocks the member.
 */
export interface CardPrintDeps {
  describe: (src: string) => Promise<Float32Array | null>;
  save: (desc: Float32Array) => Promise<boolean>;
  /** has this member agreed to the card-photo face code? (server kr8_card_print_ok) Asked before any face work. */
  allowed?: () => Promise<boolean>;
  store?: Pick<Storage, 'getItem' | 'setItem'> | null;
}
export type CardPrintResult = 'saved' | 'done-before' | 'no-face' | 'off' | 'error' | 'busy';

/** short, stable key for one photo (a data URL is ~50 KB; the key must not be) */
export function photoKey(src: string): string {
  const s = src.split('?')[0];
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'kr8_cp1:' + s.length.toString(36) + ':' + (h >>> 0).toString(36);
}

const running = new Set<string>();
export async function ensureCardPrint(src: string | null | undefined, deps: CardPrintDeps): Promise<CardPrintResult> {
  if (!src) return 'no-face';
  const key = photoKey(src);
  const store = deps.store === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : deps.store;
  try { if (store?.getItem(key)) return 'done-before'; } catch { /* private mode: just do it */ }
  if (running.has(key)) return 'busy';
  running.add(key);
  const mark = (v: string) => { try { store?.setItem(key, v); } catch { /* ignore */ } };
  try {
    if (deps.allowed && !(await deps.allowed().catch(() => false))) return 'off';   // no consent: nothing computed, nothing sent
    const d = await deps.describe(src);
    if (!d || d.length !== 128) { mark('none'); return 'no-face'; }
    const ok = await deps.save(d);
    if (ok) mark('1');   // switched off on the server: not remembered, so it runs once the founder turns it on
    return ok ? 'saved' : 'off';
  } catch {
    return 'error';   // not remembered: tried again next time the app opens
  } finally {
    running.delete(key);
  }
}
