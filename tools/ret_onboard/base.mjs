import fs from 'node:fs'; import path from 'node:path';
import { start, settle, makeAvatars } from './harness.mjs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
await makeAvatars();
const browsers = {};
const s = await start(browsers, { lang: process.argv[3] || 'en' });
await s.page.screenshot({ path: path.join(out, 'feed.png') });
for (const t of ['people', 'me']) { await s.page.click(`nav.dock [data-tab="${t}"]`).catch((e) => console.log(e.message.slice(0, 200))); await settle(s.page, 2000); await s.page.screenshot({ path: path.join(out, t + '.png') }); }
console.log(s.page.errs.slice(0, 5), [...new Set(s.state.calls)].join(','));
await s.context.close(); for (const b of Object.values(browsers)) await b.close();
