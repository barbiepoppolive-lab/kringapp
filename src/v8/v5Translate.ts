/**
 * Automatic chat translation (15 Nov 2026).
 *  1. FREE, on the device: the browser's own Translator (Chrome / Edge, version 138+). It downloads a language pack once, by
 *     itself, the first time the member taps inside a chat (no banner, no question), then translates on the device: nothing is
 *     sent anywhere, nothing costs anything.
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
/** Several messages in ONE request (the function translates them in one provider call). Missing ids count as "fail". */
export async function serverTranslateMany(ids: string[], target: Lang, fetchFn: typeof fetch = fetch): Promise<Record<string, ServerOut>> {
  const fail = (): Record<string, ServerOut> => Object.fromEntries(ids.map((id) => [id, { status: 'fail' } as ServerOut]));
  if (!ids.length) return {};
  try {
    const c = await v5Client();
    const { data } = await c.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return Object.fromEntries(ids.map((id) => [id, { status: 'stop' } as ServerOut]));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    const r = await fetchFn(FN_URL, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', apikey: FN_KEY, authorization: `Bearer ${token}` },
      body: JSON.stringify({ message_ids: ids.map(Number), target }) }).finally(() => clearTimeout(timer));
    const j = (await r.json().catch(() => null)) as { status?: string; items?: { id: number; status: string; text?: string }[] } | null;
    if (r.status === 401 || r.status === 403 || j?.status === 'off') return Object.fromEntries(ids.map((id) => [id, { status: 'stop' } as ServerOut]));
    if (!j || !Array.isArray(j.items)) return fail();
    const out = fail();
    for (const it of j.items) {
      const id = String(it.id);
      if (!(id in out)) continue;
      if (it.status === 'ok' && typeof it.text === 'string' && it.text) out[id] = { status: 'ok', text: it.text };
      else if (it.status === 'same') out[id] = { status: 'same' };
      else if (it.status === 'off' || it.status === 'forbidden' || it.status === 'limit_member' || it.status === 'limit_day') out[id] = { status: 'stop' };
      // too_long, limit_minute, unavailable: "fail" (shown as the original; tried again a little later)
    }
    return out;
  } catch { return fail(); }
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
export interface ChatTranslate { map: Record<string, TrState>; onDevice: boolean; stats: { device: number; server: number; slowestMs: number } }

const TEST = ((import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === 'test');
const RETRY_MS = TEST ? 5 : 6000;      // a failed line is tried again after 6 s, 12 s, 18 s (then when the chat is reopened)
const MAX_TRIES = 3;
const BATCH = 20;
/** The other languages a reader most likely gets in Bangkok (the pack worth fetching when they tap inside a chat). */
const likelySources = (reader: Lang): Lang[] => (reader === 'th' ? ['en'] : ['th']);
const devState: Record<string, 'ready' | 'pending' | 'no'> = {};
/**
 * Gets the free on-device pack ready. The browser allows the download only right after a tap, so this runs on every tap inside
 * an open chat until the pack is in (no banner, no question). Never throws; true when that pair is ready.
 */
export async function warmDevice(source: Lang, reader: Lang): Promise<boolean> {
  const key = `${source}>${reader}`;
  if (devState[key] === 'ready') return true;
  if (devState[key] === 'pending' || devState[key] === 'no' || !deviceSupported()) return false;
  devState[key] = 'pending';
  const a = await deviceAvailability(source, reader);
  if (a === 'unavailable') { devState[key] = 'no'; return false; }
  const ok = await deviceCreate(source, reader);
  if (ok) devState[key] = 'ready';
  else delete devState[key];                       // not allowed yet (no tap) or the download failed: try again on the next tap
  return ok;
}
/** tests only */
export const _resetWarm = () => { for (const k of Object.keys(devState)) delete devState[k]; };

export function useChatTranslate(on: boolean, threadId: string | null, msgs: ChatMsg[], ui: string): ChatTranslate {
  const reader = readerLang(ui);
  const [map, setMap] = useState<Record<string, TrState>>({});
  const [tick, setTick] = useState(0);
  const [onDevice, setOnDevice] = useState(false);
  const stats = useRef({ device: 0, server: 0, slowestMs: 0 });
  const run = useRef(0);
  const stopped = useRef<Record<string, boolean>>({});
  const gotCache = useRef<Record<string, boolean>>({});
  const tries = useRef<Record<string, number>>({});
  const firstSeen = useRef<Record<string, number>>({});
  const mapRef = useRef(map); mapRef.current = map;
  const scope = `${threadId}|${reader}`;
  useEffect(() => { setMap({}); tries.current = {}; }, [scope]);
  // opening the chat again gives the lines that could not be translated another go
  useEffect(() => { if (on) { tries.current = {}; setMap((p) => (Object.values(p).some((v) => v.s === 'fail') ? Object.fromEntries(Object.entries(p).filter(([, v]) => v.s !== 'fail')) : p)); } }, [on]);
  // the free pack downloads by itself on a tap inside the chat (the browser needs a tap to start it)
  useEffect(() => {
    if (!on || !deviceSupported()) return;
    const tap = () => { for (const src of likelySources(reader)) void warmDevice(src, reader).then((ok) => { if (ok) { setOnDevice(true); setTick((t) => t + 1); } }); };
    tap();                                           // the tap that opened the chat usually still counts
    window.addEventListener('pointerdown', tap, true);
    window.addEventListener('keydown', tap, true);
    return () => { window.removeEventListener('pointerdown', tap, true); window.removeEventListener('keydown', tap, true); };
  }, [on, reader]);
  const sig = msgs.filter((m) => m.sender === 'them').map((m) => m.id).join(',');
  useEffect(() => {
    if (!on || !threadId) return;
    const my = ++run.current;
    const alive = () => my === run.current;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const done = (id: string, via: TrVia) => {
      const t0 = firstSeen.current[id];
      if (t0 !== undefined) { stats.current.slowestMs = Math.max(stats.current.slowestMs, Math.round(now() - t0)); delete firstSeen.current[id]; }
      stats.current[via] += 1;
    };
    const put = (id: string, v: TrState) => { if (alive()) setMap((p) => ({ ...p, [id]: v })); };
    let retry: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      let todo = needing(msgs, reader, mapRef.current);
      if (!todo.length) return;
      for (const x of todo) if (firstSeen.current[x.m.id] === undefined) firstSeen.current[x.m.id] = now();
      // 1. free, on the device, for every language pair whose pack is in
      if (deviceSupported()) {
        for (const source of [...new Set(todo.map((t) => t.source))]) {
          const key = `${source}>${reader}`;
          const ready = devState[key] === 'ready' || (await deviceAvailability(source, reader)) === 'available';
          if (!alive()) return;
          if (!ready) continue;
          devState[key] = 'ready';
          for (const x of todo.filter((t) => t.source === source)) {
            const out = await deviceTranslate(x.m.text, source, reader);
            if (!alive()) return;
            if (out) { done(x.m.id, 'device'); put(x.m.id, { s: 'ok', text: out, via: 'device' }); }
          }
          if (!onDevice) setOnDevice(true);
        }
        todo = needing(msgs, reader, { ...mapRef.current }).filter((t) => devState[`${t.source}>${reader}`] !== 'ready');
        if (!todo.length) return;
      }
      // 2. the server, for what the device cannot do: stored ones first, then the rest in one request
      if (stopped.current[scope]) return;
      if (!gotCache.current[scope]) {
        gotCache.current[scope] = true;
        const cached = await cachedTranslations(threadId, reader);
        if (!alive()) return;
        const hits = todo.filter((t) => cached[t.m.id]);
        hits.forEach((t) => done(t.m.id, 'server'));
        if (Object.keys(cached).length) setMap((p) => ({ ...Object.fromEntries(Object.entries(cached).map(([id, text]) => [id, { s: 'ok', text, via: 'server' } as TrState])), ...p }));
        todo = todo.filter((t) => !cached[t.m.id]);
      }
      todo = todo.filter((t) => (tries.current[t.m.id] || 0) < MAX_TRIES).slice(-BATCH);
      if (!todo.length) return;
      todo.forEach((t) => { tries.current[t.m.id] = (tries.current[t.m.id] || 0) + 1; });
      const res = await serverTranslateMany(todo.map((t) => t.m.id), reader);
      if (!alive()) return;
      let again = false;
      for (const t of todo) {
        const r = res[t.m.id] || { status: 'fail' };
        if (r.status === 'ok') { done(t.m.id, 'server'); put(t.m.id, { s: 'ok', text: r.text, via: 'server' }); }
        else if (r.status === 'same') put(t.m.id, { s: 'same' });
        else { put(t.m.id, { s: 'fail' }); if (r.status === 'stop') stopped.current[scope] = true; else if ((tries.current[t.m.id] || 0) < MAX_TRIES) again = true; }
      }
      // a busy moment: quietly try the failed lines again a little later (the original stays readable meanwhile)
      if (again && !stopped.current[scope]) {
        const n = Math.max(...todo.map((t) => tries.current[t.m.id] || 1));
        retry = setTimeout(() => { setMap((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v.s !== 'fail'))); setTick((x) => x + 1); }, RETRY_MS * n);
      }
    })();
    return () => { if (retry) clearTimeout(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, scope, sig, tick]);
  return { map, onDevice, stats: stats.current };
}
