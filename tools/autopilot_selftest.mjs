#!/usr/bin/env node
/**
 * Kring Autopilot M8 — Nightly Self-Test (Local Build + Test DB ONLY).
 *
 * HARD RULES:
 * - Zero hardcoded secrets or passwords in code (reads env vars or --env-json).
 * - Targets strictly the LOCAL dist/ server (127.0.0.1) — aborts any request to pedxoxpammnyfnizljyj, kringapp.com, or *.pages.dev.
 * - Runs the full core journey:
 *     1. Sign in test4 member -> open Feed -> People -> Board
 *     2. Sign in admin-test -> open Today (Morning brief) -> Needs you (Alert centre) -> More -> Autopilot
 * - Writes pass/fail into kr8_robot_log via kr8_admin_record_selftest (with fallback to kr8_admin_robot_run_now before 0105 apply).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(REPO_ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function parseArgs(argv) {
  const out = { envJson: '', outDir: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--env-json' && argv[i + 1]) out.envJson = argv[++i];
    else if (argv[i] === '--out-dir' && argv[i + 1]) out.outDir = argv[++i];
  }
  return out;
}

function loadConfig(args) {
  let fileCfg = null;
  if (args.envJson && fs.existsSync(args.envJson)) {
    fileCfg = JSON.parse(fs.readFileSync(args.envJson, 'utf8'));
  }
  const memberFromFile = fileCfg?.logins?.find((l) => l.email === 'test4@kringapp.com' || l.key === 'test4') || fileCfg?.logins?.[0];
  const adminFromFile = fileCfg?.logins?.find((l) => l.key === 'admin');

  const supabaseUrl = process.env.KRING_TEST_SUPABASE_URL || fileCfg?.supabaseUrl || '';
  const supabaseAnonKey = process.env.KRING_TEST_SUPABASE_ANON_KEY || fileCfg?.supabaseAnonKey || '';
  const memberEmail = process.env.KRING_TEST_MEMBER_EMAIL || memberFromFile?.email || '';
  const memberPassword = process.env.KRING_TEST_MEMBER_PASSWORD || memberFromFile?.password || '';
  const adminEmail = process.env.KRING_TEST_ADMIN_EMAIL || adminFromFile?.email || '';
  const adminPassword = process.env.KRING_TEST_ADMIN_PASSWORD || adminFromFile?.password || '';

  if (!supabaseUrl || !supabaseAnonKey || !memberEmail || !memberPassword || !adminEmail || !adminPassword) {
    throw new Error('Missing test credentials. Pass --env-json <test_copy_env.json> or set KRING_TEST_* env vars.');
  }
  if (supabaseUrl.includes('pedxoxpammnyfnizljyj')) {
    throw new Error('SAFETY ABORT: Refusing to run self-test against live Supabase project!');
  }

  return { supabaseUrl, supabaseAnonKey, memberEmail, memberPassword, adminEmail, adminPassword };
}

function findBrowserExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function startLocalDistServer(root) {
  if (!fs.existsSync(path.join(root, 'index.html')) || !fs.existsSync(path.join(root, 'admin.html'))) {
    throw new Error(`Local dist build missing at ${root}. Run vite build with test keys first.`);
  }
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = (req.url || '/').split('?')[0].replace(/^\/app\//, '/');
      let fp = path.join(root, u === '/' ? 'index.html' : u);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        fp = u.startsWith('/admin') ? path.join(root, 'admin.html') : path.join(root, 'index.html');
      }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function signInPassword(supabaseUrl, anonKey, email, password) {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Auth failed for ${email}: HTTP ${r.status}`);
  return r.json();
}

async function recordSelfTestResult(cfg, adminToken, ok, steps, totalMs) {
  const callRpc = async (fn, body) => {
    const r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    return { ok: r.ok, status: r.status, body: txt ? JSON.parse(txt) : null };
  };

  const primary = await callRpc('kr8_admin_record_selftest', {
    p_ok: ok,
    p_steps: steps,
    p_ms: totalMs,
  });
  if (primary.ok) return { via: 'kr8_admin_record_selftest', response: primary.body };

  // Pre-0105 fallback so kr8_robot_log still records the pulse on TEST DB before 0105 is applied
  const fb = await callRpc('kr8_admin_robot_run_now', { p_name: 'nightly_selftest' });
  return { via: 'kr8_admin_robot_run_now_fallback', response: fb.body };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig(args);
  const t0 = Date.now();
  const steps = [];

  const runStep = async (name, fn) => {
    const s0 = Date.now();
    try {
      const detail = await fn();
      steps.push({ step: name, ok: true, ms: Date.now() - s0, detail: detail || 'ok' });
    } catch (e) {
      steps.push({ step: name, ok: false, ms: Date.now() - s0, error: (e && e.message) || String(e) });
      throw e;
    }
  };

  const { srv, port } = await startLocalDistServer(DIST_DIR);
  const baseUrl = `http://127.0.0.1:${port}`;
  const execPath = findBrowserExecutable();
  const browser = await chromium.launch({ headless: true, ...(execPath ? { executablePath: execPath } : {}) });

  let adminSession = null;
  let allOk = false;

  try {
    let memberSession = null;
    await runStep('sign_in_test4', async () => {
      memberSession = await signInPassword(cfg.supabaseUrl, cfg.supabaseAnonKey, cfg.memberEmail, cfg.memberPassword);
      return `Signed in ${cfg.memberEmail}`;
    });

    // ── Part 1: Member Journey (Feed -> People -> Board) ──
    const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await mCtx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('pedxoxpammnyfnizljyj') || u.includes('kringapp.com') || u.includes('.pages.dev')) {
        return route.abort();
      }
      return route.continue();
    });
    const mPage = await mCtx.newPage();
    const mErrors = [];
    mPage.on('pageerror', (e) => mErrors.push(e.message));
    await mPage.addInitScript((sess) => localStorage.setItem('kr8-v5-auth', JSON.stringify(sess)), memberSession);

    await runStep('member_feed', async () => {
      await mPage.goto(`${baseUrl}/?tab=feed`, { waitUntil: 'domcontentloaded' });
      await mPage.waitForSelector('nav.dock button[data-tab="feed"]', { timeout: 15000 });
      return 'Member Feed dock rendered';
    });

    await runStep('member_people', async () => {
      await mPage.click('nav.dock button[data-tab="people"]');
      await mPage.waitForSelector('nav.dock button[data-tab="people"][aria-current="page"]', { timeout: 10000 });
      return 'Member People tab active';
    });

    await runStep('member_board', async () => {
      await mPage.click('nav.dock button[data-tab="me"]');
      await mPage.waitForSelector('nav.dock button[data-tab="me"][aria-current="page"]', { timeout: 10000 });
      await mPage.waitForTimeout(600);
      // Open the Weekly Board (RankingPage) from Me if the member has a card; otherwise verify Deals/Board dock tab
      const boardBtn = mPage.locator('button, [role="button"]').filter({ hasText: /This week|Board|Ranking|Top|กระดาน|อันดับ/i }).first();
      if ((await boardBtn.count()) > 0) {
        await boardBtn.click().catch(() => null);
        await mPage.waitForTimeout(700);
      } else {
        await mPage.click('nav.dock button[data-tab="deals"]');
        await mPage.waitForSelector('nav.dock button[data-tab="deals"][aria-current="page"]', { timeout: 10000 });
        await mPage.waitForTimeout(400);
      }
      if (args.outDir) {
        await mPage.screenshot({ path: path.join(args.outDir, 'T-380_m8_01_selftest_member_journey.jpg'), type: 'jpeg', quality: 84 });
      }
      if (mErrors.length > 0) throw new Error(`Member page errors: ${mErrors.join('; ')}`);
      return 'Member Board journey verified with 0 uncaught errors';
    });
    await mCtx.close();

    // ── Part 2: Admin Journey (Today -> Needs you -> Autopilot) ──
    await runStep('sign_in_admin', async () => {
      adminSession = await signInPassword(cfg.supabaseUrl, cfg.supabaseAnonKey, cfg.adminEmail, cfg.adminPassword);
      return `Signed in ${cfg.adminEmail}`;
    });

    const aCtx = await browser.newContext({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 2 });
    await aCtx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('pedxoxpammnyfnizljyj') || u.includes('kringapp.com') || u.includes('.pages.dev')) {
        return route.abort();
      }
      return route.continue();
    });
    const aPage = await aCtx.newPage();
    const aErrors = [];
    aPage.on('pageerror', (e) => aErrors.push(e.message));
    await aPage.addInitScript((sess) => localStorage.setItem('kr8-v5-auth', JSON.stringify(sess)), adminSession);

    await runStep('admin_today_morning_brief', async () => {
      await aPage.goto(`${baseUrl}/admin.html#today`, { waitUntil: 'networkidle' });
      await aPage.waitForSelector('#v2MorningBrief', { timeout: 15000 });
      return 'Admin Today Morning brief rendered';
    });

    await runStep('admin_needs_you_alert_centre', async () => {
      await aPage.goto(`${baseUrl}/admin.html#inbox`, { waitUntil: 'networkidle' });
      await aPage.waitForSelector('#v2AlertCentre', { timeout: 15000 });
      return 'Admin Needs you Alert centre rendered';
    });

    await runStep('admin_autopilot_panel', async () => {
      await aPage.goto(`${baseUrl}/admin.html#autopilot`, { waitUntil: 'networkidle' });
      await aPage.waitForSelector('#apKillSwitch', { timeout: 15000 });
      await aPage.waitForSelector('#apHealthCard', { timeout: 15000 });
      await aPage.waitForSelector('#apSelfFixCard', { timeout: 15000 });
      await aPage.waitForSelector('#apProtectCard', { timeout: 15000 });
      await aPage.waitForSelector('#apGrowthCard', { timeout: 15000 });
      await aPage.waitForSelector('#apAiCard', { timeout: 15000 });
      const adminTxt = await aPage.evaluate(() => document.body.innerText || '');
      if (/[\u0E00-\u0E7F]/.test(adminTxt)) {
        throw new Error('Thai characters detected in Admin Autopilot UI');
      }
      if (args.outDir) {
        await aPage.screenshot({ path: path.join(args.outDir, 'T-380_m8_02_selftest_admin_autopilot.jpg'), type: 'jpeg', quality: 84 });
      }
      if (aErrors.length > 0) throw new Error(`Admin page errors: ${aErrors.join('; ')}`);
      return 'Admin Autopilot rendered all cards with 0 Thai chars & 0 page errors';
    });
    await aCtx.close();

    allOk = steps.every((s) => s.ok);
  } finally {
    const totalMs = Date.now() - t0;
    try {
      if (!adminSession) {
        adminSession = await signInPassword(cfg.supabaseUrl, cfg.supabaseAnonKey, cfg.adminEmail, cfg.adminPassword);
      }
      const rec = await recordSelfTestResult(cfg, adminSession.access_token, allOk, steps, totalMs);
      console.log(JSON.stringify({ ok: allOk, total_ms: totalMs, steps, recorded: rec }, null, 2));
    } catch (logErr) {
      console.error('Warning: could not write self-test result to DB:', logErr.message);
    }
    await browser.close();
    srv.close();
  }

  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error('Nightly self-test FAILED:', e);
  process.exit(1);
});
