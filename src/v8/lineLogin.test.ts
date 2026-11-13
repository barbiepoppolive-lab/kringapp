// T-205 · Sign up with LINE: the Edge Function core (token → verify → user → token_hash) and the app side (PKCE, state, prefill).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lineAuth, placeholderEmail, type LineAdmin, type LineEnv } from '../../supabase/functions/line-auth/core';

const SUB = 'U' + '0123456789abcdef'.repeat(2);
const ENV: LineEnv = { channelId: '2001234567', channelSecret: 'test-secret', redirects: ['https://kringapp.com/app/line-callback.html'] };
const BODY = { code: 'abc123', redirect_uri: ENV.redirects[0], code_verifier: 'v'.repeat(64), nonce: 'n'.repeat(32) };

function mkAdmin(seed: { links?: Record<string, string>; users?: Record<string, string> } = {}) {
  const links = { ...(seed.links || {}) };
  const users = { ...(seed.users || {}) };   // email → id
  const calls: string[] = [];
  const admin: LineAdmin = {
    findLink: async (s) => links[s] || null,
    findUserByEmail: async (e) => users[e] || null,
    createUser: async (e) => { calls.push('create:' + e); if (users[e]) throw new Error('EXISTS'); users[e] = 'new-' + Object.keys(users).length; return users[e]; },
    saveLink: async (s, u) => { calls.push('link:' + u); links[s] = u; },
    userEmail: async (id) => Object.keys(users).find((e) => users[e] === id) || 'x@y.z',
    magicLinkHash: async (e) => 'hash-for-' + e,
  };
  return { admin, links, users, calls };
}
function mkFetch(verify: Record<string, unknown> | null, token: Record<string, unknown> | null = { id_token: 'ID.TOKEN.X' }) {
  const seen: { url: string; body: URLSearchParams }[] = [];
  const f = (async (url: string, init: { body: string }) => {
    seen.push({ url, body: new URLSearchParams(init.body) });
    const j = url.endsWith('/token') ? token : verify;
    return { ok: j !== null, json: async () => j || { error: 'invalid' } };
  }) as unknown as typeof fetch;
  return { f, seen };
}
const okVerify = (extra: Record<string, unknown> = {}) => ({ iss: 'https://access.line.me', aud: ENV.channelId, sub: SUB, name: 'Pim ✿', picture: 'https://profile.line-scdn.net/abc', ...extra });

describe('line-auth function core', () => {
  it('new LINE member without email → user with a placeholder email, link saved, one-time token_hash back', async () => {
    const { admin, links, calls } = mkAdmin();
    const { f, seen } = mkFetch(okVerify());
    const r = await lineAuth(BODY, ENV, admin, f);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ token_hash: 'hash-for-' + placeholderEmail(SUB), name: 'Pim ✿', picture: 'https://profile.line-scdn.net/abc', new_user: true });
    expect(links[SUB]).toBeTruthy();
    expect(calls[0]).toBe('create:' + placeholderEmail(SUB));
    // PKCE verifier + secret go to LINE's token endpoint; our nonce goes to LINE's verify endpoint
    expect(seen[0].body.get('code_verifier')).toBe(BODY.code_verifier);
    expect(seen[0].body.get('client_secret')).toBe(ENV.channelSecret);
    expect(seen[1].body.get('nonce')).toBe(BODY.nonce);
    expect(JSON.stringify(r.body)).not.toContain('ID.TOKEN');
  });
  it('a returning LINE member signs into the same account (no new user)', async () => {
    const { admin, calls } = mkAdmin({ links: { [SUB]: 'u1' }, users: { 'pim@mail.com': 'u1' } });
    const r = await lineAuth(BODY, ENV, admin, mkFetch(okVerify()).f);
    expect(r.status).toBe(200);
    expect(r.status === 200 && r.body.token_hash).toBe('hash-for-pim@mail.com');
    expect(calls.some((c) => c.startsWith('create:'))).toBe(false);
  });
  it('LINE email that already has an email-code account → linked to that account', async () => {
    const { admin, links, calls } = mkAdmin({ users: { 'pim@mail.com': 'u7' } });
    const r = await lineAuth(BODY, ENV, admin, mkFetch(okVerify({ email: 'Pim@Mail.com' })).f);
    expect(r.status).toBe(200);
    expect(links[SUB]).toBe('u7');
    expect(calls.some((c) => c.startsWith('create:'))).toBe(false);
  });
  it('rejects a token for another LINE channel, another issuer, or a bad sub', async () => {
    for (const bad of [okVerify({ aud: '999' }), okVerify({ iss: 'https://evil.example' }), okVerify({ sub: 'U123' })]) {
      const r = await lineAuth(BODY, ENV, mkAdmin().admin, mkFetch(bad).f);
      expect(r).toEqual({ status: 401, body: { error: 'LINE_VERIFY' } });
    }
  });
  it('LINE refusing the id_token (wrong nonce, expired) → 401', async () => {
    expect((await lineAuth(BODY, ENV, mkAdmin().admin, mkFetch(null).f)).body).toEqual({ error: 'LINE_VERIFY' });
    expect((await lineAuth(BODY, ENV, mkAdmin().admin, mkFetch(okVerify(), null).f)).body).toEqual({ error: 'LINE_TOKEN' });
  });
  it('rejects unknown callback URLs and malformed input before calling LINE', async () => {
    const { f, seen } = mkFetch(okVerify());
    expect((await lineAuth({ ...BODY, redirect_uri: 'https://evil.example/cb' }, ENV, mkAdmin().admin, f)).body).toEqual({ error: 'LINE_REDIRECT' });
    expect((await lineAuth({ ...BODY, code_verifier: 'short' }, ENV, mkAdmin().admin, f)).body).toEqual({ error: 'LINE_BAD_REQUEST' });
    expect((await lineAuth({ ...BODY, nonce: '' }, ENV, mkAdmin().admin, f)).body).toEqual({ error: 'LINE_BAD_REQUEST' });
    expect((await lineAuth(null, ENV, mkAdmin().admin, f)).body).toEqual({ error: 'LINE_BAD_REQUEST' });
    expect(seen.length).toBe(0);
  });
  it('without the channel secret the function stays off', async () => {
    expect((await lineAuth(BODY, { ...ENV, channelSecret: '' }, mkAdmin().admin, mkFetch(okVerify()).f)).body).toEqual({ error: 'LINE_OFF' });
  });
  it('a second tap racing the first (email just taken) still signs in', async () => {
    const m = mkAdmin();
    m.admin.createUser = async () => { m.users[placeholderEmail(SUB)] = 'u9'; throw new Error('EXISTS'); };
    const r = await lineAuth(BODY, ENV, m.admin, mkFetch(okVerify()).f);
    expect(r.status).toBe(200);
    expect(m.links[SUB]).toBe('u9');
  });
});

// ── app side ──
const invoke = vi.fn();
const verifyOtp = vi.fn();
const env = vi.hoisted(() => ({ channel: '2001234567' }));
vi.mock('./lineEnv', () => ({ lineChannel: () => env.channel, appBase: () => '/app/' }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ functions: { invoke }, auth: { verifyOtp }, rpc: async () => ({ data: null, error: null }) }),
}));

describe('app: Continue with LINE', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    verifyOtp.mockReset();
    env.channel = '2001234567';
    window.history.replaceState(null, '', '/app/?ref=pich');
  });
  const live = () => import('./v5Live');

  it('hidden when the build has no LINE channel', async () => {
    env.channel = '';
    const m = await live();
    expect(m.v5LineOn()).toBe(false);
    expect(await m.v5SignInLine()).toBe('LINE_OFF');
  });
  it('goes to LINE with PKCE (S256), state, nonce and our callback; remembers them on the phone', async () => {
    const m = await live();
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, origin: 'https://kringapp.com', pathname: '/app/', search: '?ref=pich', assign } });
    try {
      expect(await m.v5SignInLine()).toBe('redirect');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
    }
    const u = new URL(assign.mock.calls[0][0]);
    expect(u.origin + u.pathname).toBe('https://access.line.me/oauth2/v2.1/authorize');
    const saved = JSON.parse(localStorage.getItem('kr8_line_login')!);
    expect(u.searchParams.get('client_id')).toBe('2001234567');
    expect(u.searchParams.get('redirect_uri')).toBe('https://kringapp.com/app/line-callback.html');
    expect(u.searchParams.get('scope')).toBe('openid profile email');
    expect(u.searchParams.get('state')).toBe(saved.state);
    expect(u.searchParams.get('nonce')).toBe(saved.nonce);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saved.verifier)));
    const b64 = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(u.searchParams.get('code_challenge')).toBe(b64);
    expect(saved.back).toBe('/app/?ref=pich');
  });
  const seed = (over: Record<string, unknown> = {}) =>
    localStorage.setItem('kr8_line_login', JSON.stringify({ state: 'S'.repeat(32), nonce: 'N'.repeat(32), verifier: 'V'.repeat(64), back: '/app/?ref=pich', t: Date.now(), ...over }));

  it('callback: signs in with the one-time hash, keeps LINE name/picture for the card, returns to where the member was', async () => {
    const m = await live();
    seed();
    invoke.mockResolvedValue({ data: { token_hash: 'h1', name: 'Pim', picture: 'https://profile.line-scdn.net/p' }, error: null });
    verifyOtp.mockResolvedValue({ error: null });
    expect(await m.v5FinishLine(`?code=c1&state=${'S'.repeat(32)}`)).toBe('/app/?ref=pich');
    expect(invoke.mock.calls[0][1].body).toMatchObject({ code: 'c1', code_verifier: 'V'.repeat(64), nonce: 'N'.repeat(32) });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h1', type: 'email' });
    expect(localStorage.getItem('kr8_line_login')).toBeNull();
    expect(m.v5TakeLinePrefill()).toEqual({ name: 'Pim', picture: 'https://profile.line-scdn.net/p' });
    expect(m.v5TakeLinePrefill()).toBeNull();   // read once
  });
  it('callback: wrong state, expired, re-used, or cancelled → no call to the function', async () => {
    const m = await live();
    seed();
    await expect(m.v5FinishLine('?code=c1&state=forged')).rejects.toMatchObject({ code: 'LINE_STATE' });
    await expect(m.v5FinishLine(`?code=c1&state=${'S'.repeat(32)}`)).rejects.toMatchObject({ code: 'LINE_STATE' });   // one use
    seed({ t: Date.now() - 11 * 60_000 });
    await expect(m.v5FinishLine(`?code=c1&state=${'S'.repeat(32)}`)).rejects.toMatchObject({ code: 'LINE_STATE' });
    seed();
    await expect(m.v5FinishLine('?error=access_denied&state=x')).rejects.toMatchObject({ code: 'LINE_CANCEL' });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('callback: never sends the member off-site afterwards', async () => {
    const m = await live();
    seed({ back: 'https://evil.example/' });
    invoke.mockResolvedValue({ data: { token_hash: 'h1' }, error: null });
    verifyOtp.mockResolvedValue({ error: null });
    expect(await m.v5FinishLine(`?code=c1&state=${'S'.repeat(32)}`)).toBe('/app/');
  });
  it('callback: function or sign-in failure → LINE_FAIL', async () => {
    const m = await live();
    seed();
    invoke.mockResolvedValue({ data: null, error: new Error('500') });
    await expect(m.v5FinishLine(`?code=c1&state=${'S'.repeat(32)}`)).rejects.toMatchObject({ code: 'LINE_FAIL' });
  });
});
