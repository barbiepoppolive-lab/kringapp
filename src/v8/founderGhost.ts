/**
 * 20 Nov (founder): a PERMANENT bookmark that opens the live app as his ghost account (#117):
 *   kringapp.com/app/?me=ghost   (kringapp.com/ghost redirects here)
 *
 * The link itself grants nothing (if it leaked, a stranger only gets "we sent a code to the founder's email"):
 *   · this browser already signed in as #117 (server says so: kr8_am_founder, 0180) → the app simply opens on the Feed.
 *     Ghost mode is already on for #117 (0061), so nobody sees him.
 *   · otherwise a small glass screen asks the Edge Function `founder-ghost` to email #117 a sign-in code. The function looks the
 *     address up server-side and can email no one else (3 a day). The code is typed here, in the same browser the bookmark lives in,
 *     so the sign-in is kept on this device (persistent Supabase session) and later opens need no email at all.
 *     This also works when the email app opens links somewhere else (Gmail in-app browser, Chrome custom tab, iPhone Mail → Safari).
 */
import { v5Client } from './v5Live';
import { mirrorActive } from './adminView';

const ENV = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
const SUPA_URL = (ENV.VITE_SUPABASE_URL || 'https://pedxoxpammnyfnizljyj.supabase.co').replace(/\/$/, '');
const SUPA_KEY = ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';
const FN = `${SUPA_URL}/functions/v1/founder-ghost`;
const SENT_KEY = 'kr8_fg_sent';
const RESEND_AFTER_MS = 10 * 60_000;

/** True when the address asks for the founder ghost (?me=ghost). Read before the boot removes it. */
export function founderGhostWanted(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try { return new URLSearchParams(search).get('me') === 'ghost'; } catch { return false; }
}

function stripParam(): void {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('me')) return;
    u.searchParams.delete('me');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  } catch { /* ignore */ }
}

/**
 * 'none' = not a ghost link; 'ok' = already signed in as #117 here; 'need' = show the founder sign-in screen.
 * Never throws. A network problem with a signed-in browser counts as 'ok' (the app shows its own offline state).
 */
export async function founderGhostBoot(): Promise<'none' | 'ok' | 'need'> {
  if (typeof window === 'undefined' || mirrorActive() || !founderGhostWanted()) return 'none';
  stripParam();
  try {
    const c = await v5Client();
    const s = (await c.auth.getSession()).data.session;
    if (!s?.user?.id) return 'need';
    const r = await c.rpc('kr8_am_founder');
    if (r.error) return /JWT|not authenticated|permission/i.test(r.error.message || '') ? 'need' : 'ok';
    return r.data === true ? 'ok' : 'need';
  } catch {
    return 'need';
  }
}

type FgResult = { ok?: boolean; error?: string; access_token?: string; refresh_token?: string };
async function call(body: Record<string, unknown>): Promise<{ status: number; j: FgResult }> {
  const r = await fetch(FN, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as FgResult;
  return { status: r.status, j };
}

const MSG: Record<string, string> = {
  LIMIT: "Today's 3 emails are used. Use the newest code you got, or try again tomorrow.",
  RATE: 'Too many tries. Wait a minute, then try again.',
  BAD_CODE: "That code didn't work. Use the newest email's code.",
  NETWORK: 'No connection. Check the internet and try again.',
  SERVER: "Couldn't send right now. Try again in a minute.",
};

const CSS = `
.kfg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(8,8,24,.55);-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif;color:#fff;animation:kfgIn .25s ease-out}
.kfg *{font-family:inherit}
@keyframes kfgIn{from{opacity:0}to{opacity:1}}
.kfg-card{width:100%;max-width:340px;border-radius:24px;padding:22px 20px 18px;background:rgba(255,255,255,.10);
  border:1px solid rgba(255,255,255,.22);box-shadow:0 20px 60px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);text-align:center}
.kfg-ic{font-size:30px;line-height:1;margin-bottom:8px}
.kfg h2{margin:0 0 6px;font-size:19px;font-weight:800;letter-spacing:.2px}
.kfg p{margin:0 0 14px;font-size:14px;line-height:1.45;color:rgba(255,255,255,.82)}
.kfg input{width:100%;box-sizing:border-box;height:54px;border-radius:14px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.25);
  color:#fff;font-size:26px;font-weight:800;letter-spacing:10px;text-align:center;outline:none;font-variant-numeric:tabular-nums}
.kfg input:focus{border-color:#8fa0ff;box-shadow:0 0 0 3px rgba(120,140,255,.3)}
.kfg-go{width:100%;height:48px;margin-top:12px;border:0;border-radius:14px;background:#fff;color:#14143a;font-size:16px;font-weight:800}
.kfg-go:disabled{opacity:.5}
.kfg-err{min-height:18px;margin:10px 0 0;font-size:13px;color:#ffb4bd}
.kfg-row{display:flex;justify-content:center;gap:14px;margin-top:10px}
.kfg-link{background:none;border:0;color:rgba(255,255,255,.75);font-size:13px;text-decoration:underline;padding:6px}
.kfg-link:disabled{opacity:.45;text-decoration:none}
`;

/** The founder sign-in screen (plain DOM, on top of everything). Calls onSignedIn after a good code. */
export function mountFounderGhostScreen(onSignedIn: () => void, opts: { autoSend?: boolean } = {}): () => void {
  const st = document.createElement('style');
  st.textContent = CSS;
  const root = document.createElement('div');
  root.className = 'kfg';
  root.id = 'founderGhost';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `<form class="kfg-card" novalidate>
    <div class="kfg-ic" aria-hidden="true">👻</div>
    <h2>Founder sign-in</h2>
    <p id="kfgLine">Sending a sign-in code to your email…</p>
    <input id="kfgCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="••••••" aria-label="Code from the email" />
    <button class="kfg-go" id="kfgGo" type="submit" disabled>Open Kring</button>
    <p class="kfg-err" id="kfgErr" role="alert"></p>
    <div class="kfg-row"><button type="button" class="kfg-link" id="kfgAgain">Send a new code</button></div>
  </form>`;
  document.head.appendChild(st);
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(id: string) => root.querySelector('#' + id) as T;
  const line = $<HTMLParagraphElement>('kfgLine');
  const input = $<HTMLInputElement>('kfgCode');
  const go = $<HTMLButtonElement>('kfgGo');
  const err = $<HTMLParagraphElement>('kfgErr');
  const again = $<HTMLButtonElement>('kfgAgain');
  let busy = false;
  const close = () => { root.remove(); st.remove(); };

  const sentAt = (): number => { try { return Number(localStorage.getItem(SENT_KEY) || 0); } catch { return 0; } };
  const sentLine = (t: number) => {
    const hm = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    line.textContent = `We sent a sign-in code to your email (${hm}). Type it here — this phone then stays signed in.`;
  };

  async function send(): Promise<void> {
    if (busy) return;
    busy = true; again.disabled = true; err.textContent = '';
    line.textContent = 'Sending a sign-in code to your email…';
    try {
      const { status, j } = await call({ action: 'send' });
      if (status === 200 && j.ok) {
        const t = Date.now();
        try { localStorage.setItem(SENT_KEY, String(t)); } catch { /* private mode */ }
        sentLine(t);
      } else {
        const prev = sentAt();
        if (prev) sentLine(prev); else line.textContent = 'Type the code from your newest Kring email.';
        err.textContent = MSG[j.error || ''] || MSG.SERVER;
      }
    } catch {
      line.textContent = 'Type the code from your newest Kring email.';
      err.textContent = MSG.NETWORK;
    } finally {
      busy = false; again.disabled = false;
      try { input.focus(); } catch { /* ignore */ }
    }
  }

  async function verify(): Promise<void> {
    const code = input.value.replace(/\D/g, '');
    if (busy || code.length < 6) return;
    busy = true; go.disabled = true; err.textContent = '';
    go.textContent = 'Checking…';
    try {
      const { status, j } = await call({ action: 'verify', code });
      if (status === 200 && j.access_token && j.refresh_token) {
        const c = await v5Client();
        const { error } = await c.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
        if (error) throw new Error('SESSION');
        try { localStorage.removeItem(SENT_KEY); } catch { /* ignore */ }
        go.textContent = 'Signed in ✓';
        close();
        onSignedIn();
        return;
      }
      err.textContent = MSG[j.error || ''] || MSG.BAD_CODE;
    } catch {
      err.textContent = MSG.NETWORK;
    }
    busy = false;
    go.textContent = 'Open Kring';
    go.disabled = input.value.replace(/\D/g, '').length < 6;
  }

  input.addEventListener('input', () => {
    const v = input.value.replace(/\D/g, '').slice(0, 10);
    if (v !== input.value) input.value = v;
    go.disabled = busy || v.length < 6;
    if (v.length === 6) void verify();
  });
  root.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); void verify(); });
  again.addEventListener('click', () => void send());

  const prev = sentAt();
  if (opts.autoSend !== false && !(prev && Date.now() - prev < RESEND_AFTER_MS)) void send();
  else if (prev) sentLine(prev);
  else line.textContent = 'Tap "Send a new code" to get a sign-in code by email.';
  return close;
}
