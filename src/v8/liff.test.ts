// LIFF one-tap sign-in: line-auth LIFF path (verify request shape), ref through liff.state, the boot flow, the share link.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lineAuth, placeholderEmail, type LineAdmin, type LineEnv } from '../../supabase/functions/line-auth/core';

const SUB = 'U' + 'fedcba9876543210'.repeat(2);
const ENV: LineEnv = { channelId: '2012552357', channelSecret: '', redirects: ['https://kringapp.com/app/line-callback.html'] };
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJVMSJ9.c2lnbmF0dXJl';

function mkAdmin(links: Record<string, string> = {}) {
  const users: Record<string, string> = {};
  const admin: LineAdmin = {
    findLink: async (s) => links[s] || null,
    findUserByEmail: async (e) => users[e] || null,
    createUser: async (e) => { users[e] = 'new-1'; return 'new-1'; },
    saveLink: async (s, u) => { links[s] = u; },
    userEmail: async (id) => Object.keys(users).find((e) => users[e] === id) || 'known@kringapp.com',
    magicLinkHash: async (e) => 'hash-for-' + e,
  };
  return { admin, links };
}
function mkFetch(verify: Record<string, unknown> | null) {
  const seen: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const f = vi.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    seen.push({ url, init });
    return { ok: verify !== null, json: async () => verify || { error: 'invalid_request', error_description: 'IdToken expired.' } };
  }) as unknown as typeof fetch;
  return { f, seen };
}
const claims = (extra: Record<string, unknown> = {}) => ({ iss: 'https://access.line.me', aud: ENV.channelId, sub: SUB, name: 'Pich', picture: 'https://profile.line-scdn.net/x', ...extra });

describe('line-auth: LIFF ID token path', () => {
  it('verify request: one POST to LINE verify, form-encoded id_token + client_id = channel ID, no nonce, no secret, no token call', async () => {
    const { f, seen } = mkFetch(claims());
    const r = await lineAuth({ liff_id_token: TOKEN }, ENV, mkAdmin().admin, f);
    expect(r.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://api.line.me/oauth2/v2.1/verify');
    expect(seen[0].init.method).toBe('POST');
    expect(seen[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(seen[0].init.body);
    expect([...body.keys()].sort()).toEqual(['client_id', 'id_token']);
    expect(body.get('id_token')).toBe(TOKEN);
    expect(body.get('client_id')).toBe('2012552357');
  });
  it('new LINE member → same user creation + one-time token_hash as the web login; token never echoed', async () => {
    const { admin, links } = mkAdmin();
    const r = await lineAuth({ liff_id_token: TOKEN }, ENV, admin, mkFetch(claims()).f);
    expect(r).toEqual({ status: 200, body: { token_hash: 'hash-for-' + placeholderEmail(SUB), name: 'Pich', picture: 'https://profile.line-scdn.net/x', new_user: true } });
    expect(links[SUB]).toBe('new-1');
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
  });
  it('returning member (linked by the web login before) → same account', async () => {
    const r = await lineAuth({ liff_id_token: TOKEN }, ENV, mkAdmin({ [SUB]: 'u1' }).admin, mkFetch(claims()).f);
    expect(r.status === 200 && r.body.new_user).toBe(false);
  });
  it('works without the channel secret (LIFF needs none); web-login body still needs it', async () => {
    expect((await lineAuth({ liff_id_token: TOKEN }, ENV, mkAdmin().admin, mkFetch(claims()).f)).status).toBe(200);
    expect((await lineAuth({ code: 'x', redirect_uri: ENV.redirects[0], code_verifier: 'v'.repeat(64), nonce: 'n'.repeat(32) }, ENV, mkAdmin().admin, mkFetch(claims()).f)).body).toEqual({ error: 'LINE_OFF' });
    expect((await lineAuth({ liff_id_token: TOKEN }, { ...ENV, channelId: '' }, mkAdmin().admin, mkFetch(claims()).f)).body).toEqual({ error: 'LINE_OFF' });
  });
  it('LINE refuses (expired / other channel / other issuer / bad sub) → 401 LINE_VERIFY', async () => {
    for (const v of [null, claims({ aud: '1650000000' }), claims({ iss: 'https://evil.example' }), claims({ sub: 'nope' })]) {
      expect(await lineAuth({ liff_id_token: TOKEN }, ENV, mkAdmin().admin, mkFetch(v).f)).toEqual({ status: 401, body: { error: 'LINE_VERIFY' } });
    }
  });
  it('malformed token → 400 before calling LINE', async () => {
    const { f, seen } = mkFetch(claims());
    for (const t of ['', 'not-a-jwt', 42, 'a.b.c'.repeat(2000)]) expect((await lineAuth({ liff_id_token: t }, ENV, mkAdmin().admin, f)).body).toEqual({ error: 'LINE_BAD_REQUEST' });
    expect(seen).toHaveLength(0);
  });
});

// ── app side ──
const env = vi.hoisted(() => ({ liff: '2012552357-AbCd1234' }));
vi.mock('./lineEnv', () => ({
  lineChannel: () => '2012552357',
  appBase: () => '/app/',
  liffId: () => env.liff,
  liffOn: () => /^\d{6,12}-[A-Za-z0-9]{4,16}$/.test(env.liff),
  liffUrl: () => '',
}));
const invoke = vi.fn();
const verifyOtp = vi.fn();
const getSession = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ functions: { invoke }, auth: { verifyOtp, getSession }, rpc: async () => ({ data: null, error: null }) }),
}));

function fakeLiff(o: { loggedIn?: boolean; inClient?: boolean; token?: string | null } = {}) {
  return {
    init: vi.fn(async () => undefined),
    isLoggedIn: vi.fn(() => o.loggedIn ?? true),
    isInClient: vi.fn(() => o.inClient ?? true),
    login: vi.fn(),
    logout: vi.fn(),
    getIDToken: vi.fn(() => (o.token === undefined ? TOKEN : o.token)),
  };
}

describe('ref through LIFF', () => {
  it('reads ref from ?ref= and from liff.state (plain, with a path, double-encoded)', async () => {
    const m = await import('./v5Liff');
    expect(m.liffRefFromUrl('?ref=Pich')).toBe('pich');
    expect(m.liffRefFromUrl('?liff.state=%3Fref%3Dpich')).toBe('pich');
    expect(m.liffRefFromUrl('?liff.state=%2Fapp%2F%3Fref%3Dpich%26src%3Dig')).toBe('pich');
    expect(m.liffRefFromUrl('?liff.state=' + encodeURIComponent(encodeURIComponent('?ref=pich')))).toBe('pich');
    expect(m.liffRefFromUrl('?liff.state=%3Fref%3D%3Cbad%3E')).toBe('');
    expect(m.liffStateQuery('?liff.state=%3Fref%3Dpich%23x')).toBe('?ref=pich');
  });
  it('knows a LIFF context from liff.state, the login return, the liff.line.me referrer or the LIFF browser', async () => {
    const m = await import('./v5Liff');
    expect(m.liffContext('?liff.state=%3Fref%3Dpich', '', '')).toBe(true);
    expect(m.liffContext('?code=1&liffClientId=2012552357', '', '')).toBe(true);
    expect(m.liffContext('', 'https://liff.line.me/2012552357-AbCd1234?ref=pich', '')).toBe(true);
    expect(m.liffContext('', '', 'Mozilla/5.0 (iPhone) Line/14.19.0 LIFF')).toBe(true);
    expect(m.liffContext('?ref=pich', 'https://www.instagram.com/', 'Mozilla/5.0 Line/14.19.0')).toBe(false);   // LINE chat browser: web login stays
    expect(m.liffContext('?ref=pich', 'https://kringapp.com/app/?liff.state=%3Fref%3Dpich', '')).toBe(true);   // after the SDK hop
    sessionStorage.setItem('kr8_liff_ctx', '1');
    expect(m.liffContext('?ref=pich', '', '')).toBe(true);
    sessionStorage.clear();
  });
  it('login return URL keeps ref, drops LIFF/OAuth params, stays under /app/', async () => {
    const m = await import('./v5Liff');
    const u = new URL(m.liffReturnUrl('https://kringapp.com/app/?liff.state=%3Fref%3Dpich&code=c&state=s&liffClientId=1', ''));
    expect(u.pathname).toBe('/app/');
    expect([...u.searchParams.keys()]).toEqual(['ref']);
    expect(u.searchParams.get('ref')).toBe('pich');
    expect(new URL(m.liffReturnUrl('https://kringapp.com/elsewhere', 'pich')).toString()).toBe('https://kringapp.com/app/?ref=pich');
  });
});

describe('LIFF boot', () => {
  const orig = window.location;
  const setUrl = (u: string) => {
    const url = new URL(u);
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, href: url.href, origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash } });
  };
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    invoke.mockReset();
    verifyOtp.mockReset();
    getSession.mockReset();
    getSession.mockResolvedValue({ data: { session: null } });
    env.liff = '2012552357-AbCd1234';
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  const boot = async (l: ReturnType<typeof fakeLiff>) => (await import('./v5Liff')).v5LiffBoot(async () => l);

  it('off without a LIFF ID, and off outside a LIFF context (never loads the SDK)', async () => {
    const l = fakeLiff();
    env.liff = '';
    setUrl('https://kringapp.com/app/?liff.state=%3Fref%3Dpich');
    expect(await boot(l)).toBe('off');
    env.liff = '2012552357-AbCd1234';
    setUrl('https://kringapp.com/app/?ref=pich');
    expect(await boot(l)).toBe('off');
    expect(l.init).not.toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  it('first hop (?liff.state=?ref=pich): ref stored BEFORE init, then the SDK redirect is left alone', async () => {
    const l = fakeLiff();
    let refAtInit: string | null = null;
    l.init.mockImplementation(async () => { refAtInit = localStorage.getItem('kr8_ref'); });
    setUrl('https://kringapp.com/app/?liff.state=%3Fref%3Dpich');
    expect(await boot(l)).toBe('redirect');
    expect(refAtInit).toBe('pich');
    expect(l.init).toHaveBeenCalledWith({ liffId: '2012552357-AbCd1234' });
    expect(invoke).not.toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  it('outside LINE, not logged in: liff.login back to this page with ?ref kept', async () => {
    const l = fakeLiff({ loggedIn: false, inClient: false });
    setUrl('https://kringapp.com/app/?ref=pich&liffClientId=2012552357');
    expect(await boot(l)).toBe('redirect');
    expect(l.login).toHaveBeenCalledWith({ redirectUri: 'https://kringapp.com/app/?ref=pich' });
    expect(localStorage.getItem('kr8_ref')).toBe('pich');   // persisted before leaving for LINE
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  it('inside LINE: ID token → line-auth { liff_id_token } → verifyOtp → signed in, LINE name kept for the card', async () => {
    const l = fakeLiff();
    setUrl('https://kringapp.com/app/?ref=pich');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone) Line/14.19.0 LIFF' });
    invoke.mockResolvedValue({ data: { token_hash: 'h1', name: 'Pich', picture: 'https://profile.line-scdn.net/x' }, error: null });
    verifyOtp.mockResolvedValue({ error: null });
    try {
      expect(await boot(l)).toBe('signed-in');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
    }
    expect(invoke).toHaveBeenCalledWith('line-auth', { body: { liff_id_token: TOKEN } });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h1', type: 'email' });
    expect(JSON.parse(localStorage.getItem('kr8_line_prefill')!)).toEqual({ name: 'Pich', picture: 'https://profile.line-scdn.net/x' });
    expect(l.login).not.toHaveBeenCalled();
  });
  it('already signed in → no function call', async () => {
    const l = fakeLiff();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    setUrl('https://kringapp.com/app/?ref=pich&liffClientId=1');
    expect(await boot(l)).toBe('had-session');
    expect(invoke).not.toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  it('function refuses: outside LINE re-login once, then LINE_FAIL; inside LINE LINE_FAIL at once', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('401') });
    setUrl('https://kringapp.com/app/?ref=pich&liffClientId=1');
    const out = fakeLiff({ inClient: false });
    expect(await boot(out)).toBe('redirect');
    expect(out.logout).toHaveBeenCalled();
    await expect(boot(fakeLiff({ inClient: false }))).rejects.toMatchObject({ code: 'LINE_FAIL' });
    sessionStorage.clear();
    await expect(boot(fakeLiff({ inClient: true }))).rejects.toMatchObject({ code: 'LINE_FAIL' });
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
});

describe('share link builder (lineEnv.liffUrl)', () => {
  it('builds https://liff.line.me/<id>?ref=<ref>, or nothing without a valid LIFF ID', async () => {
    const real = await vi.importActual<typeof import('./lineEnv')>('./lineEnv');
    expect(real.liffUrl('Pich', '2012552357-AbCd1234')).toBe('https://liff.line.me/2012552357-AbCd1234?ref=pich');
    expect(real.liffUrl('', '2012552357-AbCd1234')).toBe('https://liff.line.me/2012552357-AbCd1234');
    expect(real.liffUrl('<x>', '2012552357-AbCd1234')).toBe('https://liff.line.me/2012552357-AbCd1234');
    expect(real.liffUrl('pich', '')).toBe('');
    expect(real.liffOn()).toBe(false);   // this test build has no VITE_LIFF_ID
  });
});
