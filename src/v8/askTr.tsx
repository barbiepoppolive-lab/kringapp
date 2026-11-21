/**
 * 20 Nov (founder: "one language at a time"): Ask BKK texts written by members show in the reader's app language.
 * The Edge Function kr8-ask-translate translates each text ONCE (cheap Gemini flash-lite, kept in kr8_ask_tr); this file asks for
 * the texts on screen in one batch and keeps the answers for the session. The original shows until a translation is ready, so
 * nothing ever waits on it. Under a translated text: "Translated · See original" (TH: "แปลแล้ว · ดูต้นฉบับ").
 */
import { useEffect, useState } from 'react';
import { hasThai, mostlyEnglish } from './askThai';

/** q / qd / a = Ask BKK texts; b (0183) = a member's bio (id = the member's user_id) */
export type TrKind = 'q' | 'qd' | 'a' | 'b';
type Entry = { text: string | null; done: boolean };
const cache = new Map<string, Entry>();
const subs = new Set<() => void>();
const retries = new Map<string, number>();
let queue: { kind: TrKind; id: string; target: 'en' | 'th' }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** the app language for Ask BKK: Thai mode reads Thai; every other language reads English */
export function askTarget(): 'en' | 'th' {
  try { return (localStorage.getItem('kr8_lang') || 'en') === 'th' ? 'th' : 'en'; } catch { return 'en'; }
}
/** already in the reader's language? (an English answer may quote one Thai word, so count letters) */
export function inTarget(text: string, target: 'en' | 'th'): boolean {
  if (!text.trim()) return true;
  return target === 'en' ? !hasThai(text) || mostlyEnglish(text) : hasThai(text) && !mostlyEnglish(text);
}
const key = (kind: TrKind, id: string, target: string) => `${kind}:${id}:${target}`;

async function flush() {
  timer = null;
  const batch = queue.splice(0, 40);
  if (!batch.length) return;
  const target = batch[0].target;
  const items = batch.filter((b) => b.target === target).map(({ kind, id }) => ({ kind, id }));
  queue.unshift(...batch.filter((b) => b.target !== target));
  try {
    const { v5Client } = await import('./v5Live');
    const c = await v5Client();
    const { data } = await c.functions.invoke('kr8-ask-translate', { body: { items, target } });
    const got = ((data as { items?: { kind: TrKind; id: string; status: string; text?: string }[] } | null)?.items) || [];
    for (const it of items) {
      const r = got.find((g) => g.kind === it.kind && g.id === it.id);
      // "later" (cap reached / provider busy) is asked again next time the text is shown; anything else is final for this session
      // (the provider can be busy for a moment: one quiet retry 4 s later while the text is on screen)
      if (r?.status === 'later') {
        const k = key(it.kind, it.id, target);
        const n = (retries.get(k) || 0) + 1; retries.set(k, n);
        if (n <= 2) setTimeout(() => { queue.push({ ...it, target }); if (!timer) timer = setTimeout(() => void flush(), 30); }, 4000);
        else cache.delete(k);
        continue;
      }
      cache.set(key(it.kind, it.id, target), { text: r?.status === 'ok' && r.text ? r.text : null, done: true });
    }
  } catch {
    for (const it of items) cache.delete(key(it.kind, it.id, target));   // offline / signed out: the original stays
  }
  subs.forEach((f) => f());
  if (queue.length) timer = setTimeout(() => void flush(), 30);
}

/** the translation of one text, or null (not needed / not ready / not possible) */
export function useAskTr(kind: TrKind, id: string, text: string, skip = false): string | null {
  const target = askTarget();
  const k = key(kind, id, target);
  const [, tick] = useState(0);
  const need = !skip && !!id && !!text && !inTarget(text, target);
  useEffect(() => {
    if (!need) return undefined;
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!cache.has(k)) {
      cache.set(k, { text: null, done: false });
      queue.push({ kind, id, target });
      if (!timer) timer = setTimeout(() => void flush(), 30);
    }
    return () => { subs.delete(f); };
  }, [need, k, kind, id, target]);
  return need ? cache.get(k)?.text ?? null : null;
}

/**
 * A member-written text in the reader's language. `toggle` adds the tiny "Translated · See original" switch (not inside the
 * feed cards, which are one big button: there no label at all, 21 Nov).
 */
export function AskText(props: { L: (en: string) => string; kind: TrKind; id: string; text: string; skip?: boolean; toggle?: boolean;
  as?: 'div' | 'h1' | 'p'; className?: string; wrap?: (s: string) => string }) {
  const { L, text } = props;
  const tr = useAskTr(props.kind, props.id, text, props.skip);
  const [orig, setOrig] = useState(false);
  const Tag = props.as || 'div';
  const shown = tr && !orig ? tr : text;
  return (
    <>
      <Tag className={props.className} lang={tr && !orig ? askTarget() : undefined}>{props.wrap ? props.wrap(shown) : shown}</Tag>
      {tr ? (
        props.toggle ? (
          <button type="button" className="at-tr" data-tr={orig ? 'orig' : 'tr'} onClick={() => setOrig((o) => !o)}>
            {orig ? L('See translation') : `${L('Translated')} · ${L('See original')}`}
          </button>
        ) : null   /* 21 Nov (founder): no "Translated" label in the feed cards; the opened thread keeps its subtle switch */
      ) : null}
    </>
  );
}
