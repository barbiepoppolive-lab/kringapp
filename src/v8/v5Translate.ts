/**
 * Automatic chat translation (15 Nov 2026).
 *  1. FREE, on the device: the browser's own Translator (Chrome / Edge on a computer, version 138+). It downloads a language
 *     pack once, then translates on the phone/computer itself: nothing is sent anywhere, nothing costs anything.
 *  2. Everywhere else (iPhone, Android browsers, LINE / Instagram in-app browsers): the server function kr8-translate, which
 *     checks the reader is in that chat, keeps each translation so it is paid for once, and has daily caps.
 * Chat never waits on either: a message is always shown first, the translation arrives under it or not at all.
 */
import { useEffect, useRef, useState } from 'react';
import { detectLang, isLang, type Lang } from '../../supabase/functions/kr8-translate/core';
import { v5Client } from './v5Live';

export { detectLang, isLang, type Lang };
export type TrVia = 'device' | 'server';
export type TrState = { s: 'ok'; text: string; via: TrVia } | { s: 'fail' } | { s: 'same' };
export type PackState = { s: 'none' } | { s: 'offer'; source: Lang } | { s: 'downloading'; source: Lang; pct: number } | { s: 'ready'; source: Lang } | { s: 'declined' };
export interface ChatMsg { id: string; sender: 'me' | 'them'; text: string }

/** The reader's language = the app language they chose (en, th, zh, hi, ja, ko). */
export const readerLang = (ui: string): Lang => (isLang(ui) ? ui : 'en');
/** Messages that need a translation for this reader: the other person's, written in another language, with a real server id. */
export function needing(msgs: ChatMsg[], reader: Lang, have: Record<string, TrState>, max = 40): { m: ChatMsg; source: Lang }[] {
  const out: { m: ChatMsg; source: Lang }[] = [];
  for (const m of msgs.slice(-max)) {
    if (m.sender !== 'them' || !/^\d+$/.test(m.id) || have[m.id]) continue;
    const source = detectLang(m.text);
    if (source && source !== reader) out.push({ m, source });
  }
  return out;
}

// ───────── 1. on the device ─────────
type Avail = 'available' | 'downloadable' | 'downloading' | 'unavailable';
interface DeviceTranslator { translate(text: string): Promise<string> }
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Avail>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<DeviceTranslator>;
}
const api = (): TranslatorApi | null => {
  try { const t = (globalThis as unknown as { Translator?: TranslatorApi }).Translator; return t && typeof t.availability === 'function' && typeof t.create === 'function' ? t : null; } catch { return null; }
};
export const deviceSupported = (): boolean => !!api();
export async function deviceAvailability(source: Lang, target: Lang): Promise<Avail> {
  const t = api();
  if (!t) return 'unavailable';
  try { const a = await Promise.race([t.availability({ sourceLanguage: source, targetLanguage: target }), new Promise<Avail>((r) => setTimeout(() => r('unavailable'), 3000))]); return (['available', 'downloadable', 'downloading'] as string[]).includes(a) ? a : 'unavailable'; } catch { return 'unavailable'; }
}
const made = new Map<string, DeviceTranslator>();
/** Must be called from a tap (the browser only starts a download from a user action). onProgress gets 0..1. */
export async function deviceCreate(source: Lang, target: Lang, onProgress?: (p: number) => void): Promise<boolean> {
  const t = api();
  if (!t) return false;
  const key = `${source}>${target}`;
  if (made.has(key)) return true;
  try {
    const tr = await t.create({ sourceLanguage: source, targetLanguage: target,
      monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(Math.max(0, Math.min(1, Number((e as unknown as { loaded?: number }).loaded) || 0)))) });
    made.set(key, tr);
    return true;
  } catch { return false; }
}
export async function deviceTranslate(text: string, source: Lang, target: Lang): Promise<string | null> {
  const key = `${source}>${target}`;
  if (!made.has(key) && !(await deviceCreate(source, target))) return null;
  try { const out = (await made.get(key)!.translate(text) || '').trim(); return out || null; } catch { return null; }
}
/** tests only */
export const _resetDevice = () => made.clear();

// ───────── 2. the server (fallback) ─────────
const ENV = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
const FN_URL = `${ENV.VITE_SUPABASE_URL || 'https://pedxoxpammnyfnizljyj.supabase.co'}/functions/v1/kr8-translate`;
const FN_KEY = ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';
export type ServerOut = { status: 'ok'; text: string } | { status: 'same' } | { status: 'stop' } | { status: 'fail' };
export async function serverTranslate(messageId: string, target: Lang, fetchFn: typeof fetch = fetch): Promise<ServerOut> {
  try {
    const c = await v5Client();
    const { data } = await c.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { status: 'stop' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetchFn(FN_URL, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', apikey: FN_KEY, authorization: `Bearer ${token}` },
      body: JSON.stringify({ message_id: Number(messageId), target }) }).finally(() => clearTimeout(timer));
    const j = (await r.json().catch(() => null)) as { status?: string; text?: string } | null;
    if (j?.status === 'ok' && typeof j.text === 'string' && j.text) return { status: 'ok', text: j.text };
    if (j?.status === 'same') return { status: 'same' };
    // caps reached, switched off, signed out or refused: stop asking for this chat (the originals stay readable)
    if (r.status === 429 || r.status === 401 || r.status === 403 || j?.status === 'off') return { status: 'stop' };
    return { status: 'fail' };
  } catch { return { status: 'fail' }; }
}
export async function cachedTranslations(thread: string, target: Lang): Promise<Record<string, string>> {
  try {
    const c = await v5Client();
    const { data, error } = await c.rpc('kr8_thread_translations', { p_thread: thread, p_target: target });
    if (error) return {};
    return Object.fromEntries(((data || []) as { id: number; text: string }[]).map((x) => [String(x.id), x.text]));
  } catch { return {}; }
}

// ───────── the chat hook ─────────
const DECLINED = 'kr8_tr_pack_no';
const declined = () => { try { return localStorage.getItem(DECLINED) === '1'; } catch { return false; } };
export interface ChatTranslate { map: Record<string, TrState>; pack: PackState; download: () => void; notNow: () => void; onDevice: boolean }

const RETRY_MS = ((import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === 'test') ? 5 : 1500;
export function useChatTranslate(on: boolean, threadId: string | null, msgs: ChatMsg[], ui: string): ChatTranslate {
  const reader = readerLang(ui);
  const [map, setMap] = useState<Record<string, TrState>>({});
  const [pack, setPack] = useState<PackState>(() => (declined() ? { s: 'declined' } : { s: 'none' }));
  const run = useRef(0);
  const stopped = useRef<Record<string, boolean>>({});
  const gotCache = useRef<Record<string, boolean>>({});
  const mapRef = useRef(map); mapRef.current = map;
  const scope = `${threadId}|${reader}`;
  useEffect(() => { setMap({}); }, [scope]);
  // opening the chat again gives the messages that could not be translated last time another go
  useEffect(() => { if (on) setMap((p) => (Object.values(p).some((v) => v.s === 'fail') ? Object.fromEntries(Object.entries(p).filter(([, v]) => v.s !== 'fail')) : p)); }, [on]);
  const sig = msgs.filter((m) => m.sender === 'them').map((m) => m.id).join(',');
  useEffect(() => {
    if (!on || !threadId) return;
    const my = ++run.current;
    const alive = () => my === run.current;
    const put = (id: string, v: TrState) => { if (alive()) setMap((p) => ({ ...p, [id]: v })); };
    (async () => {
      let todo = needing(msgs, reader, mapRef.current);
      if (!todo.length) return;
      // 1. on the device, when this browser has the Translator and the member has not said "Not now"
      if (deviceSupported() && pack.s !== 'declined') {
        const source = todo[0].source;
        const a = await deviceAvailability(source, reader);
        if (!alive()) return;
        if (a === 'available' || (pack.s === 'ready' && pack.source === source)) {
          for (const x of todo.filter((t) => t.source === source)) {
            const out = await deviceTranslate(x.m.text, source, reader);
            if (!alive()) return;
            if (out) put(x.m.id, { s: 'ok', text: out, via: 'device' });
          }
          if (pack.s !== 'ready') setPack({ s: 'ready', source });
          todo = todo.filter((t) => t.source !== source);
          if (!todo.length) return;
        } else if (a === 'downloadable' || a === 'downloading') {
          if (pack.s === 'none') setPack({ s: 'offer', source });
          return;                                   // wait for the member: Download (free) or Not now (server)
        }
      }
      // 2. the server, for everything the device could not do
      if (stopped.current[scope]) return;
      if (!gotCache.current[scope]) {
        gotCache.current[scope] = true;
        const cached = await cachedTranslations(threadId, reader);
        if (!alive()) return;
        if (Object.keys(cached).length) setMap((p) => ({ ...Object.fromEntries(Object.entries(cached).map(([id, text]) => [id, { s: 'ok', text, via: 'server' } as TrState])), ...p }));
        todo = todo.filter((t) => !cached[t.m.id]);
      }
      for (const x of todo.slice(-25)) {
        let r = await serverTranslate(x.m.id, reader);
        if (!alive()) return;
        if (r.status === 'fail') {                    // a busy moment: one quiet second try before showing the note
          await new Promise((ok) => setTimeout(ok, RETRY_MS));
          if (!alive()) return;
          r = await serverTranslate(x.m.id, reader);
          if (!alive()) return;
        }
        if (r.status === 'ok') put(x.m.id, { s: 'ok', text: r.text, via: 'server' });
        else if (r.status === 'same') put(x.m.id, { s: 'same' });
        else { put(x.m.id, { s: 'fail' }); if (r.status === 'stop') { stopped.current[scope] = true; for (const y of todo) if (!mapRef.current[y.m.id] && y.m.id !== x.m.id) put(y.m.id, { s: 'fail' }); return; } }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, scope, sig, pack.s]);
  const download = () => {
    if (pack.s !== 'offer') return;
    const source = pack.source;
    setPack({ s: 'downloading', source, pct: 0 });
    void deviceCreate(source, reader, (p) => setPack((cur) => (cur.s === 'downloading' ? { ...cur, pct: Math.round(p * 100) } : cur)))
      .then((ok) => setPack(ok ? { s: 'ready', source } : { s: 'declined' }));     // a failed download quietly falls back to the server
  };
  const notNow = () => { try { localStorage.setItem(DECLINED, '1'); } catch { /* private mode */ } setPack({ s: 'declined' }); };
  return { map, pack, download, notNow, onDevice: pack.s === 'ready' };
}
