// Ranking look A proof: opens the REAL local build (vite dev, see ./dev.sh) on seeded data and saves screenshots.
// Usage: node tools/me_variants/run.mjs <out dir> [only]   (needs the dev server on 127.0.0.1:5317)
// LOCAL-ONLY: see fake_kring.mjs. Every host other than the local dev server is aborted.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { APP, initStorage, seed, wire } from './fake_kring.mjs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');

export const DEVICES = {
  pixel7: { engine: 'chromium', label: 'Pixel 7', ...pw.devices['Pixel 7'], viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 2 },
  iphone14: { engine: 'webkit', label: 'iPhone 14', ...pw.devices['iPhone 14'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  a360: { engine: 'chromium', label: 'Android 360', ...pw.devices['Galaxy S9+'], viewport: { width: 360, height: 780 }, screen: { width: 360, height: 780 }, deviceScaleFactor: 2 },
};

export async function open(browsers, dev, sc, opts = {}) {
  const d = DEVICES[dev];
  const { engine, label, defaultBrowserType, ...ctxOpts } = d;
  void label; void defaultBrowserType;
  const browser = browsers[engine] || (browsers[engine] = await pw[engine].launch());
  const data = seed(sc);
  const state = { data, calls: [] };
  const context = await browser.newContext({ ...ctxOpts, locale: opts.locale || 'en-US', timezoneId: 'Asia/Bangkok', serviceWorkers: 'block',
    reducedMotion: opts.reducedMotion || 'no-preference', ...(opts.video ? { recordVideo: { dir: opts.video, size: { width: d.viewport.width * 2, height: d.viewport.height * 2 } } } : {}) });
  const blocked = await wire(context, state);
  const store = initStorage(data, opts.storage || {});
  await context.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('kr8_a2hs_shown', '1'); } catch { /* ignore */ } }, store);
  const page = await context.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|realtime/i.test(m.text())) page.errs.push('console: ' + m.text().slice(0, 300)); });
  if (opts.clock !== false) {
    await page.clock.install({ time: data.scenario.now });
    await page.clock.resume();
  }
  await page.goto(APP + (opts.query || ''), { waitUntil: 'domcontentloaded' });
  return { page, context, state, blocked, data };
}

export async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

// quick baseline: the app as it is today (Feed, Me, Ranking) for one scenario
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || '/tmp/prize_base';
  const only = process.argv[3] || 'C';
  fs.mkdirSync(out, { recursive: true });
  const browsers = {};
  for (const dev of ['iphone14', 'a360']) {
    const { page, context, blocked, state } = await open(browsers, dev, only);
    await settle(page, 2500);
    await page.screenshot({ path: path.join(out, `${dev}_feed.png`) });
    await page.click('nav.dock [data-tab="me"]').catch((e) => console.log('dock', e.message));
    await settle(page, 2000);
    await page.screenshot({ path: path.join(out, `${dev}_me.png`) });
    await page.screenshot({ path: path.join(out, `${dev}_me_full.png`), fullPage: false });
    await page.evaluate(() => { const el = document.querySelector('#s-me'); const sc = el && (el.querySelector('.kme') || el); if (sc) sc.scrollTop = 420; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${dev}_me_scrolled.png`) });
    await page.click('#kxRankTile').catch((e) => console.log('rank', e.message));
    await settle(page, 1500);
    await page.screenshot({ path: path.join(out, `${dev}_ranking.png`) });
    console.log(dev, 'errors', page.errs, 'blocked', [...new Set(blocked)], 'calls', [...new Set(state.calls)].join(','));
    await context.close();
  }
  for (const b of Object.values(browsers)) await b.close();
}
