// kr8-translate · pure parts (no network, no Deno): language detection, masking, provider interface. Unit-tested from the app repo.

export const TARGETS = ['th', 'en', 'zh', 'hi', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ms', 'id', 'vi', 'ar'] as const;
export type Lang = (typeof TARGETS)[number];
export const isLang = (x: unknown): x is Lang => typeof x === 'string' && (TARGETS as readonly string[]).includes(x);

const LATIN_CARD = ['fr', 'de', 'es', 'ms', 'id', 'vi'];
/**
 * Which language a chat message is written in. Scripts are certain (Thai, Chinese, Japanese, Korean, Hindi, Arabic, Russian).
 * Latin letters cannot be told apart reliably in a short chat line, so they count as English unless the sender's card says their
 * first language is another Latin-script one (French, German, Spanish, Malay, Indonesian, Vietnamese) and English is not on it.
 * Returns null when there is nothing to translate (emoji, numbers, "555", a link).
 */
export function detectLang(text: string, senderLangs: string[] = []): Lang | null {
  const t = (text || '').replace(/https?:\/\/\S+/g, ' ');
  const n = (re: RegExp) => (t.match(re) || []).length;
  const th = n(/[฀-๿]/g), kana = n(/[぀-ヿ]/g), han = n(/[一-鿿]/g), ko = n(/[가-힯ᄀ-ᇿ]/g),
    hi = n(/[ऀ-ॿ]/g), ar = n(/[؀-ۿ]/g), ru = n(/[Ѐ-ӿ]/g), la = n(/[A-Za-zÀ-ɏḀ-ỿ]/g);
  const best = Math.max(th, kana + han, ko, hi, ar, ru, la);
  if (best === 0) return null;
  if (th === best) return 'th';
  if (kana + han === best) return kana > 0 ? 'ja' : 'zh';
  if (ko === best) return 'ko';
  if (hi === best) return 'hi';
  if (ar === best) return 'ar';
  if (ru === best) return 'ru';
  if (la < 2) return null;
  const card = senderLangs.map((x) => String(x).toLowerCase());
  const first = card.find((x) => LATIN_CARD.includes(x));
  if (/[Ạ-ỹăâđêôơưĂÂĐÊÔƠƯ]/.test(t) && (card.includes('vi') || n(/[Ạ-ỹđơư]/g) >= 2)) return 'vi';
  if (first && !card.includes('en')) return first as Lang;
  return 'en';
}

/**
 * Phone numbers, emails, links and @handles never go to the translation provider: they are swapped for [[n]] before the call
 * and put back after. "กริ๊ง!" / "Kring" are protected the same way so the brand is never translated.
 */
export function mask(text: string): { masked: string; parts: string[] } {
  const parts: string[] = [];
  const keep = (x: string) => { parts.push(x); return `[[${parts.length}]]`; };
  const masked = text
    .replace(/https?:\/\/\S+|www\.\S+/gi, keep)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, keep)
    .replace(/@[\w.]{3,}/g, keep)
    .replace(/\+?[\d๐-๙][\d๐-๙\s-]{6,}[\d๐-๙]/g, keep)
    .replace(/กริ๊ง!?|\bKring\b/g, keep);
  return { masked, parts };
}
/** Puts the protected parts back. If the provider lost or invented a placeholder the translation is not trusted (null). */
export function unmask(out: string, parts: string[]): string | null {
  let ok = true;
  const seen = new Set<number>();
  const res = out.replace(/\[\[\s*(\d+)\s*\]\]/g, (_m, d) => {
    const i = Number(d);
    if (i < 1 || i > parts.length) { ok = false; return ''; }
    seen.add(i);
    return parts[i - 1];
  });
  if (!ok || seen.size !== parts.length) return null;
  return res.trim();
}
/** Nothing worth sending: only placeholders, digits, laughter ("555", "lol" is kept), emoji or punctuation. */
export const nothingToTranslate = (masked: string): boolean => masked.replace(/\[\[\d+\]\]/g, '').replace(/[\s\d\p{P}\p{S}\p{Extended_Pictographic}]/gu, '').length < 2;

/** Machine Thai sometimes hedges the polite ending as "คะ/ครับ" (female/male). A chat line reads better without it. */
export function tidy(out: string | null, target: Lang): string | null {
  if (!out) return out;
  if (target !== 'th') return out;
  return out.replace(/นะ(คะ|ค่ะ)\s*\/\s*นะครับ/g, 'นะ').replace(/\s*(คะ|ค่ะ)\s*\/\s*ครับ/g, '').replace(/\s*ครับ\s*\/\s*(คะ|ค่ะ)/g, '').replace(/\s+([?!])/g, '$1').trim() || null;
}

export interface Provider { name: string; translate(text: string, source: Lang, target: Lang): Promise<string | null> }

/** iApp Technology (Thai provider): POST form-data text / source_lang / target_lang, key in the "apikey" header. */
export function iappProvider(apiKey: string, fetchFn: typeof fetch = fetch, timeoutMs = 9000): Provider {
  return {
    name: 'iapp',
    async translate(text, source, target) {
      const fd = new FormData();
      fd.set('text', text); fd.set('source_lang', source); fd.set('target_lang', target);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetchFn('https://api.iapp.co.th/v1/text/translate', { method: 'POST', headers: { apikey: apiKey }, body: fd, signal: ctl.signal });
        if (!r.ok) return null;
        const j = (await r.json().catch(() => null)) as { translation?: string } | null;
        const out = typeof j?.translation === 'string' ? j.translation.trim() : '';
        return out || null;
      } catch { return null; } finally { clearTimeout(timer); }
    },
  };
}

export type Claim = { status: string; text?: string; source?: string; sender_langs?: string[] };
export interface Deps {
  /** who is calling (from their sign-in token); null = not signed in */
  userId: string | null;
  claim(user: string, message: number, target: string): Promise<Claim | null>;
  store(message: number, target: string, source: string, provider: string, text: string): Promise<void>;
  provider: Provider | null;
}
export interface Result { http: number; body: { status: string; text?: string; source?: string; via?: string } }

/** The whole decision, with the outside world passed in (so it can be tested without a network). Never returns the original text. */
export async function handle(input: { message_id?: unknown; target?: unknown }, d: Deps): Promise<Result> {
  if (!d.userId) return { http: 401, body: { status: 'sign_in' } };
  const id = Number(input?.message_id);
  if (!Number.isSafeInteger(id) || id <= 0 || !isLang(input?.target)) return { http: 400, body: { status: 'bad_request' } };
  const target = input.target as Lang;
  const c = await d.claim(d.userId, id, target).catch(() => null);
  if (!c) return { http: 200, body: { status: 'unavailable' } };
  if (c.status === 'forbidden') return { http: 403, body: { status: 'forbidden' } };
  if (c.status === 'cached') return { http: 200, body: { status: 'ok', text: c.text, source: c.source, via: 'cache' } };
  if (c.status !== 'go') return { http: c.status.startsWith('limit') ? 429 : 200, body: { status: c.status } };
  const text = c.text || '';
  const source = detectLang(text, c.sender_langs || []);
  if (!source || source === target) return { http: 200, body: { status: 'same' } };
  const { masked, parts } = mask(text);
  if (nothingToTranslate(masked)) return { http: 200, body: { status: 'same' } };
  if (!d.provider) return { http: 200, body: { status: 'unavailable' } };
  const raw = await d.provider.translate(masked, source, target).catch(() => null);
  const out = raw ? tidy(unmask(raw, parts), target) : null;
  if (!out) return { http: 200, body: { status: 'unavailable' } };
  await d.store(id, target, source, d.provider.name, out).catch(() => undefined);
  return { http: 200, body: { status: 'ok', text: out, source, via: d.provider.name } };
}
