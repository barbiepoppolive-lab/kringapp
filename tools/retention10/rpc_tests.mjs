// Retention 10: server checks as the QA test accounts (REST, same calls the app makes)
import { rpcAs, ACCT } from './lib.mjs';
const out = [];
const ok = (c, name, extra = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const code = (r) => String(r.body?.message || '').match(/KR8_[A-Z_0-9]+/)?.[0] || r.status;
// 1 welcome
let x = await rpcAs('ploy', 'kr8_task_extra');
const picks = x.body?.welcome?.reels?.map((r) => r.id) || [];
ok(picks.length === 2 && x.body.welcome.done === false, 'welcome: 2 picks (one per newcomer, test-only), not done', picks.join(','));
let c = await rpcAs('ploy', 'kr8_task_extra_claim', { p_task: 'welcome' });
ok(code(c) === 'KR8_TASK_NOT_DONE', 'welcome: claim before liking is refused', String(code(c)));
for (const id of picks) await rpcAs('ploy', 'kr8_toggle_like', { p_post: id });
x = await rpcAs('ploy', 'kr8_task_extra');
ok(x.body?.welcome?.done === true && x.body.welcome.liked === 2, 'welcome: done after liking both');
const before = x.body.cap_left;
c = await rpcAs('ploy', 'kr8_task_extra_claim', { p_task: 'welcome' });
ok(c.body?.welcome?.claimed === true && c.body.cap_left === before - 2, 'welcome: claim +2 Rings inside the daily cap', `cap_left ${before} → ${c.body?.cap_left}`);
c = await rpcAs('ploy', 'kr8_task_extra_claim', { p_task: 'welcome' });
ok(c.body?.cap_left === before - 2, 'welcome: second claim pays nothing');
const td = await rpcAs('ploy', 'kr8_tasks_today');
ok(td.body?.rings_today >= 2 && td.body?.tasks?.length === 5, 'tasks_today (live function) unchanged: 5 rows, Rings today include the welcome', `rings_today ${td.body?.rings_today}`);
// 5 Bangkok at 5
let m = await rpcAs('ploy', 'kr8_b5_mark', { p_post: '7a10a000-0000-4000-8000-000000000005' });
ok(code(m) === 'KR8_B5_LATE', '5pm: an old Reel cannot be marked', String(code(m)));
m = await rpcAs('ploy', 'kr8_b5_mark', { p_post: '7a10a000-0000-4000-8000-000000000001' });
ok(code(m) === 'KR8_NOT_FOUND', '5pm: someone else’s Reel cannot be marked', String(code(m)));
const row = await rpcAs('ploy', 'kr8_b5_row');
ok(row.body?.n_today === 2 && row.body.items.every((i) => i.id.startsWith('7a10a000')), '5pm row: 2 approved test clips only', `n_today ${row.body?.n_today}`);
x = await rpcAs('fah', 'kr8_task_extra');
ok(x.body?.b5?.done === true, '5pm task: Fah’s approved clip completes it');
c = await rpcAs('fah', 'kr8_task_extra_claim', { p_task: 'b5' });
ok(c.body?.b5?.claimed === true, '5pm task: claim +1');
// 6 opening question
let h = await rpcAs('fah', 'kr8_send_hello', { p_to: ACCT.mint.id, p_body: 'Hi Mint!' });
ok(code(h) === 'KR8_ANSWER_FIRST', 'question on: a plain hello is refused', String(code(h)));
h = await rpcAs('fah', 'kr8_open_q_answer', { p_to: ACCT.mint.id, p_answer: 'call me at 0812345678' });
const bad = code(h);
h = await rpcAs('fah', 'kr8_open_q_answer', { p_to: ACCT.mint.id, p_answer: 'Try the rooftop at Ari station, go at 5:30' });
ok(typeof h.body === 'string' && h.body.length === 36, 'question on: answering opens the chat', `phone-number answer → ${bad}`);
const msgs = await rpcAs('mint', 'kr8_thread_messages', { p_thread: h.body, p_after: 0 });
ok(JSON.stringify(msgs.body || '').includes('Try the rooftop') && JSON.stringify(msgs.body || '').includes('“'), 'first message = the question quoted + the answer (Mint reads it)');
h = await rpcAs('fah', 'kr8_open_q_answer', { p_to: ACCT.mint.id, p_answer: 'again' });
ok(code(h) === 'KR8_ALREADY_SAID_HI', 'one opener per pair', String(code(h)));
h = await rpcAs('bee', 'kr8_send_hello', { p_to: ACCT.fah.id, p_body: 'Hi Fah!' });
ok(typeof h.body === 'string', 'no question: a normal hello still works (Bee → Fah)');
// 8 bestie
let bs = await rpcAs('bee', 'kr8_bestie_invite', { p_user: ACCT.mint.id });
ok(code(bs) === 'KR8_BESTIE_NEEDS_MUTUAL', 'bestie: needs mutual follow', String(code(bs)));
let st = await rpcAs('ploy', 'kr8_bestie_state');
const s0 = st.body?.items?.[0];
ok(s0?.streak?.count === 2 && s0?.nudged_me === true, 'bestie: Ploy + Mint streak = 2 days, Mint’s nudge shows', JSON.stringify(s0?.streak));
st = await rpcAs('ploy', 'kr8_bestie_nudge', { p_id: s0?.id });
ok(st.body?.items?.[0]?.i_nudged === true, 'bestie: nudge recorded (in-app only)');
const of = await rpcAs('fah', 'kr8_bestie_of', { p_user: ACCT.mint.id });
ok(of.body?.[0]?.count >= 2 && of.body?.[0]?.partner?.first_name === 'Ploy', 'bestie on Mint’s profile (seen by Fah)', JSON.stringify(of.body));
// 9 fair play: reconciles with the board for every QA member
for (const k of ['bee', 'mint', 'ploy', 'fah']) {
  const f = await rpcAs('fah', 'kr8_fair_play', { p_user: ACCT[k].id });
  const d = f.body;
  const sum = d.likes_verified.rings + d.likes_newer.rings + d.saves.rings + d.opens.rings + d.rules_adjust + d.tasks + d.ask_opens + d.invites + d.lag;
  ok(sum === d.rings, `fair play adds up: ${k}`, `${sum} = ${d.rings} (rank ${d.rank}, lag ${d.lag})`);
  ok(!JSON.stringify(d).match(/device|session|net_range|"ip"|country|ua"/i), `fair play exposes no device/session/IP: ${k}`);
}
// 10 newcomers
const nc = await rpcAs('fah', 'kr8_newcomers_board');
ok(nc.body?.rows?.map((r) => r.first_name).join(',') === 'Mint,Ploy,Fah' && nc.body?.me?.next, 'newcomers league: Mint, Ploy, Fah (Bee joined 20 days ago: out)', JSON.stringify(nc.body?.me));
// 3 follow suggest
const fs3 = await rpcAs('ploy', 'kr8_onb_follow_suggest', { p_limit: 4 });
ok(fs3.body?.eligible && fs3.body.people.every((p) => ['Bee', 'Fah'].includes(p.first_name)), 'follow 3: verified test members not yet followed', fs3.body?.people?.map((p) => p.first_name).join(','));
// 4 profile only (member side)
const po = await rpcAs('ploy', 'kr8_my_profile_only');
ok(po.body?.reels?.[0]?.reason === 'noperson' && po.body.examples.length === 2, 'profile only: reason + 2 examples');
const po2 = await rpcAs('mint', 'kr8_admin_reel_profile_only', { p_reel: '7a10a000-0000-4000-8000-000000000001', p_reason: 'dark' });
ok(code(po2) === 'KR8_ADMIN_ONLY', 'profile only: admin button refused for members', String(code(po2)));
const anon = await fetch(`${(await import('./lib.mjs')).SUPA}/rest/v1/rpc/kr8_fair_play`, { method: 'POST', headers: { apikey: (await import('./lib.mjs')).ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user: ACCT.bee.id }) });
ok(anon.status === 401 || anon.status === 404 || anon.status === 403, 'visitors (anon) cannot call the new functions', String(anon.status));
console.log(out.join('\n'));
