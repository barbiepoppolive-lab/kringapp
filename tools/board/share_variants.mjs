// The 9 story-card variants (3 moments × looks A/B/C) per language, drawn by the APP's own canvas code (src/v8/rankStory.ts)
// inside the local dev build (tools/prize_ui/dev.sh) at exactly 1080×1920. Demo Reel frames from the app demo pack. Nothing leaves the machine.
//   node tools/board/share_variants.mjs <out dir> [th,en]
import fs from 'node:fs';
import path from 'node:path';
import { open, settle, DEVICES } from '../prize_ui/run.mjs';
import { FAKE } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/share';
const langs = (process.argv[3] || 'th,en').split(',');
const looks = (process.argv[4] || 'B,B2').split(',');
const FOCUS = { help: 0.78, challenge: 0.73, proof: 0.9 };
fs.mkdirSync(out, { recursive: true });
DEVICES.p390 = { ...DEVICES.iphone14, engine: 'chromium', isMobile: true, hasTouch: true };
const HERO = { help: 'fireworks', challenge: 'lantern', proof: 'erawan' };
const SAMPLE = { help: { rank: 7, daysLeft: 4, won: 0 }, challenge: { rank: 3, daysLeft: 2, won: 0 }, proof: { rank: 1, daysLeft: 0, won: 1500 } };
const NUM = { help: '1help', challenge: '2challenge', proof: '3proof' };
const browsers = {};
const o = await open(browsers, 'p390', 'TOP', { storage: { kr8_lang: 'th' } });
await settle(o.page, 2500);
// the live prize ladder the app reads (kr8_rings_rules prize_1..8) → pool + paid seats
const rules = { prize_1: 1500, prize_2: 900, prize_3: 600, prize_4: 500, prize_5: 400, prize_6: 250, prize_7: 150, prize_8: 100 };
const ladder = Object.keys(rules).sort().map((k) => rules[k]).filter((p) => p > 0);
const pool = ladder.reduce((a, b) => a + b, 0);
const files = [];
for (const lang of langs) for (const moment of ['help', 'challenge', 'proof']) for (const look of looks) {
  const card = { lang, moment, look, ...SAMPLE[moment], paidN: ladder.length, pool, code: 'k00037', hero: `${FAKE}/storage/v1/object/public/${HERO[moment]}.jpg`, focus: FOCUS[moment] };
  const url = await o.page.evaluate(async (c) => {
    const m = await import('/app/src/v8/rankStory.ts');
    const cv = document.createElement('canvas');
    await m.drawCard(cv, c);
    return cv.toDataURL('image/png');
  }, card);
  const tag = look === 'B' ? 'B1' : look;
  const f = path.join(out, `${tag.startsWith('B') ? 'SHAREB' : 'SHARE'}_${NUM[moment]}_${tag}_${lang.toUpperCase()}.png`);
  fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
  files.push(f);
}
console.log(JSON.stringify({ files, errors: o.page.errs, blocked: [...new Set(o.blocked)] }, null, 1));
await o.context.close();
for (const b of Object.values(browsers)) await b.close();
