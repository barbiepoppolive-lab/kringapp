/* Ask a Thai GPS check in real Chrome (security audit H3). Needs the vite dev server on :5199 (npx vite --port 5199).
 * Runs the real canvas re-save (askReencodePhoto) and the full clean-up (askCleanFile) on __fixtures__/gps.jpg and
 * fails if any EXIF / GPS survives. Then saves a 390 px screenshot of the demo Ask a Thai thread with the ⋯ → Report sheet. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const out = process.argv[2] || 'AskThai_safe.png';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:5199/harness/askthai.html?demo=1&feed=ask', { waitUntil: 'networkidle' });
  const r = await p.evaluate(async () => {
    const m = await import('/src/v8/askThai.ts');
    const src = await (await fetch('/src/v8/__fixtures__/gps.jpg')).arrayBuffer();
    const f = new File([src], 'IMG.jpg', { type: 'image/jpeg' });
    const raw = new Uint8Array(await (await m.askReencodePhoto(f)).arrayBuffer());
    const clean = await m.askCleanFile(f);
    const cb = new Uint8Array(await clean.arrayBuffer());
    const s = (u) => Array.from(u, (c) => String.fromCharCode(c)).join('');
    return { inExif: s(new Uint8Array(src)).includes('Exif'), rawExif: s(raw).includes('Exif'), cleanExif: s(cb).includes('Exif'), cleanType: clean.type, len: cb.length,
      jpeg: cb[0] === 0xff && cb[1] === 0xd8 };
  });
  console.log(JSON.stringify(r));
  if (!r.inExif || r.rawExif || r.cleanExif || r.cleanType !== 'image/jpeg' || !r.jpeg) { console.log('GPS CHECK FAILED'); process.exitCode = 1; }
  else console.log('GPS CHECK PASSED: canvas copy and cleaned upload carry no EXIF');
  await p.goto('http://127.0.0.1:5199/harness/askthai.html?demo=1&feed=ask', { waitUntil: 'networkidle' });
  await p.waitForSelector('[data-ask-id="dq1"]');
  await p.click('[data-ask-id="dq1"] .at-tw-open');
  await p.waitForSelector('[data-ask-more="da2"]');
  await p.click('[data-ask-more="da2"]');
  await p.click('[data-ask-report="open"]');
  await p.waitForTimeout(400);
  await p.screenshot({ path: out });
  await b.close();
})();
