/**
 * Shared bits for the two venue pages (admin.html, staff.html): Supabase client, Thai + English labels, tiny DOM helpers.
 * Everything goes through the kr8_* RPCs from supabase/migrations/0023 — no direct table access.
 */
import { v5Client, v5RpcKeepalive } from '../v8/v5Live';
import './venue.css';

export { v5Client };

/** Thai first, English under it (founder rule: never Thai without English). */
export type TxPair = readonly [th: string, en: string];

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') n.className = String(v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : document.createTextNode(k));
  return n;
}

/** Two-line label: Thai on top, English underneath. */
export function tx(p: TxPair, cls = ''): HTMLSpanElement {
  return el('span', { class: `tx ${cls}`.trim() }, el('span', { class: 'th' }, p[0]), el('span', { class: 'en' }, p[1]));
}

export function bkkTime(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    ...(withDate ? { day: 'numeric', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const c = await v5Client();
  const { data, error } = await c.rpc(fn, args);
  if (error) {
    const m = String(error.message || '').match(/KR8_[A-Z_]+/);
    throw new Error(m ? m[0] : error.message || 'ERROR');
  }
  return data as T;
}

/** A write the admin can still Undo for 5 s. `spec` lets the page send it with keepalive when the tab closes (audit P3-11). */
export type RpcWrite = (() => Promise<unknown>) & { spec?: { fn: string; args: Record<string, unknown> } };
export function rpcWrite(fn: string, args: Record<string, unknown>): RpcWrite {
  return Object.assign(() => rpc(fn, args), { spec: { fn, args } });
}
export function sendKeepalive(w: RpcWrite): Promise<unknown> {
  return w.spec ? v5RpcKeepalive(w.spec.fn, w.spec.args) : w();
}

export function basePath(): string {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
}

export function staffLink(venueId: string): string {
  return `${location.origin}${basePath()}staff.html?v=${encodeURIComponent(venueId)}`;
}
