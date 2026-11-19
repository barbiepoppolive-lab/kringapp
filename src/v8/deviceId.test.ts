// 0124 Fake Finder: the phone's own device id (localStorage 'kr8_did') and the logger that sends it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { bkkDay, DID_KEY, deviceSeenDue, kr8DeviceId, OLD_DEVICE_KEY } from './deviceId';

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)), m };
}

describe('kr8DeviceId', () => {
  it('creates one id, keeps it, and writes both keys', () => {
    const s = memStore();
    const a = kr8DeviceId(s);
    expect(a).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(kr8DeviceId(s)).toBe(a);
    expect(s.m.get(DID_KEY)).toBe(a);
    expect(s.m.get(OLD_DEVICE_KEY)).toBe(a);
  });
  it('reuses the older kr8_device id so claims and events carry the same id', () => {
    const s = memStore({ [OLD_DEVICE_KEY]: 'old-device-id-123456' });
    expect(kr8DeviceId(s)).toBe('old-device-id-123456');
    expect(s.m.get(DID_KEY)).toBe('old-device-id-123456');
  });
  it('kr8_did wins and repairs a broken kr8_device', () => {
    const s = memStore({ [DID_KEY]: 'did-abcdefghijklmnop', [OLD_DEVICE_KEY]: 'bad!' });
    expect(kr8DeviceId(s)).toBe('did-abcdefghijklmnop');
    expect(s.m.get(OLD_DEVICE_KEY)).toBe('did-abcdefghijklmnop');
  });
  it('replaces a malformed id', () => {
    const s = memStore({ [DID_KEY]: 'x', [OLD_DEVICE_KEY]: '<script>' });
    expect(kr8DeviceId(s)).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  });
  it('no storage / storage throws → empty (nothing sent, as before)', () => {
    expect(kr8DeviceId(null)).toBe('');
    expect(kr8DeviceId({ getItem: () => { throw new Error('blocked'); }, setItem: () => undefined })).toBe('');
  });
});

describe('deviceSeenDue', () => {
  it('once per Bangkok day per member', () => {
    const s = memStore();
    const t = Date.UTC(2026, 10, 19, 10, 0);   // 17:00 in Bangkok
    expect(deviceSeenDue('u1', t, s)).toBe(true);
    expect(deviceSeenDue('u1', t + 3600_000, s)).toBe(false);
    expect(deviceSeenDue('u2', t, s)).toBe(true);
    expect(deviceSeenDue('u1', Date.UTC(2026, 10, 19, 17, 30), s)).toBe(true);   // 00:30 next day in Bangkok
  });
  it('no uid / no storage → never', () => {
    expect(deviceSeenDue('', Date.now(), memStore())).toBe(false);
    expect(deviceSeenDue('u1', Date.now(), null)).toBe(false);
  });
  it('bkkDay is UTC+7', () => {
    expect(bkkDay(Date.UTC(2026, 10, 19, 16, 59))).toBe('2026-11-19');
    expect(bkkDay(Date.UTC(2026, 10, 19, 17, 0))).toBe('2026-11-20');
  });
});

// the logger: sends p_did; a database without 0124 refuses p_did → sent again without it
const rpcCalls: Record<string, unknown>[] = [];
let refuseDid = false;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'kr8_log_client') rpcCalls.push(args);
      if (fn === 'kr8_log_client' && refuseDid && 'p_did' in args) return { data: null, error: { message: 'Could not find the function public.kr8_log_client(p_did, ...)' } };
      return { data: null, error: null };
    },
  }),
}));

describe('v5LogClient + v5DeviceSeen', () => {
  beforeEach(() => { rpcCalls.length = 0; refuseDid = false; try { localStorage.clear(); } catch { /* no storage */ } });
  const flush = () => new Promise((r) => setTimeout(r, 30));

  it('sends the device id with the event', async () => {
    const { v5LogClient } = await import('./v5Live');
    v5LogClient('reel_fail', 'X', 'detail');
    await flush();
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0]).toMatchObject({ p_kind: 'reel_fail', p_code: 'X', p_detail: 'detail' });
    expect(String(rpcCalls[0].p_did)).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(rpcCalls[0].p_did).toBe(localStorage.getItem('kr8_did'));
  });
  it('old database (no p_did): sends again without it', async () => {
    refuseDid = true;
    const { v5LogClient } = await import('./v5Live');
    v5LogClient('reel_fail');
    await flush();
    expect(rpcCalls.length).toBe(2);
    expect('p_did' in rpcCalls[1]).toBe(false);
  });
  it('device_seen once a day', async () => {
    const { v5DeviceSeen } = await import('./v5Live');
    v5DeviceSeen('user-1');
    v5DeviceSeen('user-1');
    await flush();
    expect(rpcCalls.filter((a) => a.p_kind === 'device_seen').length).toBe(1);
  });
  it('the app calls it on open, and claims use the same id', () => {
    expect(fs.readFileSync('src/v8/KringAppV8.tsx', 'utf8')).toContain('v5DeviceSeen(v5Uid)');
    expect(fs.readFileSync('src/v8/v5Kx.ts', 'utf8')).toContain('function deviceId(): string { return kr8DeviceId(); }');
  });
});
