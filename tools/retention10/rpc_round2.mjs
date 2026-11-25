// Round 2 server checks as the QA test accounts: photo task, 1 a day, Rings math, awards in fair play, kindness/award rules on server side.
import { rpcAs, ACCT } from './lib.mjs';
const out = []; const ok = (c, n, x = '') => out.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`);
const code = (r) => String(r.body?.message || '').match(/KR8_[A-Z_0-9]+/)?.[0] || r.status;
let t = await rpcAs('mint', 'kr8_tasks_today');
const post = t.body.tasks.find((x) => x.id === 'post');
ok(post.done === true, 'photo: today’s photo completes the post task', JSON.stringify({ done: post.done, claimed: post.claimed }));
const before = t.body.rings_today;
if (!post.claimed) { const c = await rpcAs('mint', 'kr8_task_claim', { p_task: 'post' }); t = c; }
t = await rpcAs('mint', 'kr8_tasks_today');
ok(t.body.rings_today - before === 3 || post.claimed, 'photo: claim pays the photo rate +3 (not the Reel +5)', `${before} → ${t.body.rings_today}`);
const two = await rpcAs('mint', 'kr8_create_photo', { p_photo: 'data:image/jpeg;base64,' + 'A'.repeat(5000), p_area: 'Bangkok', p_body: null, p_place: null });
ok(code(two) === 'KR8_PHOTO_DAY', 'photo: a second photo the same day is refused', String(code(two)));
const unv = await rpcAs('mint', 'kr8_create_photo', { p_photo: 'https://example.com/a.jpg' });
ok(code(unv) === 'KR8_BAD_PHOTO', 'photo: only an in-app JPEG upload is accepted (no links)', String(code(unv)));
const ph = await rpcAs('bee', 'kr8_member_photos', { p_user: ACCT.mint.id });
ok(ph.body?.length === 1 && ph.body[0].feed === true && ph.body[0].reason === null, 'photo: visible on Mint’s profile to Bee; promoted to Feed; no reason leaks to others');
const f = await rpcAs('bee', 'kr8_feed_ranked', { p_area: null, p_limit: 60, p_offset: 0, p_seed: 'x' });
ok((f.body || []).some((r) => r.kind === 'photo'), 'photo: promoted photo is a feed card (test viewers only)');
// fair play / board reconcile for all QA members (incl. photo +3 and award +5)
for (const k of ['bee', 'mint', 'ploy', 'fah']) {
  const d = (await rpcAs('fah', 'kr8_fair_play', { p_user: ACCT[k].id })).body;
  const sum = d.likes_verified.rings + d.likes_newer.rings + d.saves.rings + d.opens.rings + d.rules_adjust + d.tasks + d.ask_opens + (d.ask_awards || 0) + d.invites + d.lag;
  ok(sum === d.rings, `fair play = board: ${k}`, `${sum} = ${d.rings} (tasks ${d.tasks}, award ${d.ask_awards}, lag ${d.lag})`);
}
const aw = await rpcAs('mint', 'kr8_ask_awards_recent');
ok((aw.body || []).length === 2, 'awards: 2 test awards visible to test members', JSON.stringify((aw.body || []).map((x) => x.kind)));
const run = await rpcAs('mint', 'kr8_ask_awards_run', { p_test: true });
ok(run.status === 404 || run.status === 401 || code(run) === 'KR8_ADMIN_ONLY' || run.status === 403, 'awards: members cannot run the awards', String(run.status));
const ad = await rpcAs('mint', 'kr8_admin_photo_review', { p_post: ph.body?.[0]?.id, p_action: 'hide' });
ok(code(ad) === 'KR8_ADMIN_ONLY', 'photo: members cannot use the admin review', String(code(ad)));
console.log(out.join('\n'));
