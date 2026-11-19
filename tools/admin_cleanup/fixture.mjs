// Admin clean-up (19 Nov) screenshots: SAMPLE data shaped like the live admin on 19 Nov (names are made up, no real member data).
// Answers every admin RPC the Needs you / claim / face check / alerts / More / member / Same person? screens call.
export const ORIGIN = 'http://127.0.0.1:5319';
export const APP = `${ORIGIN}/app/`;
const IMG = (n) => `${APP}harness/img/${n}.jpg`;
const now = Date.now();
const ago = (m) => new Date(now - m * 60000).toISOString();
const U = (n) => `6f1c2b1e-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ADMIN = U(9999);

const PIC = { 126: 'ploy', 137: 'mint', 130: 'lena', 150: 'yui', 127: 'ton', 118: 'nat', 114: 'minjun', 120: 'aom', 148: 'lena', 57: 'nat', 64: 'aom', 56: 'minjun', 53: 'ton', 58: 'yui', 141: 'mint', 133: 'ploy', 77: 'lena' };
const NAME = { 126: 'Yok', 137: 'Yokna', 130: 'June', 150: 'Siri', 127: 'Toon', 118: 'Kun', 114: 'Jaa', 120: 'Pim', 148: 'Mai', 57: 'Nok', 64: 'Fah', 56: 'Im', 53: 'Bee', 58: 'Pang', 141: 'Ploy', 133: 'Earn', 77: 'Lena' };
const joined = { 126: 3000, 137: 600, 130: 2800, 150: 140, 127: 900, 118: 2000, 114: 2500, 120: 1500, 148: 300, 57: 4000, 64: 4200, 56: 4100, 53: 5000, 58: 4800, 141: 200, 133: 120, 77: 3500 };
const link = (o, reason, extra = {}) => ({ user_id: U(o), no: o, name: NAME[o], reason, dist: null, sface_sim: null, at: ago(500), ...extra });
const LINKS = {
  126: [link(137, 'face'), link(56, 'face_maybe', { dist: 0.444 })], 137: [link(126, 'face')],
  130: [link(150, 'face'), link(57, 'face_maybe', { dist: 0.44 }), link(64, 'face_maybe', { dist: 0.5 })], 150: [link(130, 'face')],
  57: [link(130, 'face_maybe', { dist: 0.44 })], 64: [link(130, 'face_maybe', { dist: 0.5 })], 56: [link(126, 'face_maybe', { dist: 0.444 })],
  53: [link(58, 'face', { dist: 0.386 })], 58: [link(53, 'face', { dist: 0.386 })],
  127: [link(118, 'device'), link(114, 'network')], 118: [link(127, 'device')], 114: [link(127, 'network')],
};
const person = (no, o = {}) => ({ user_id: U(no), kind: 'real', no, name: NAME[no], who: 'local', area: 'Ari', joined_at: ago(joined[no]), last_active_at: ago(5), ref: null, src: null,
  verified: true, ig: null, tt: null, has_photo: true, photo_check: 'ok', email_hint: null, line: true, check: null,
  reels: { live: 1, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null }, claims: { n: 0, paid: 0, held: 0, thb: 0, first_at: null },
  links: LINKS[no] || [], shared_net: 0, refs: 0, board: null, score: { likes: 12, saves: 3, opens: 2, score: 31 }, ...o });
const people = [126, 137, 130, 57, 64, 56, 53, 58, 118, 114, 120, 148, 77].map((n) => person(n))
  .concat([person(150, { verified: false, check: { id: 'v150', status: 'pending', at: ago(30), auto: 'review', reason: null } }),
    person(127, { claims: { n: 2, paid: 1, held: 1, thb: 100, first_at: ago(860) } }),
    person(141, { photo_check: 'unchecked' }),
    person(133, { reels: { live: 0, waiting: 1, hidden: 0, board_off: 0, board_off_reason: null } })]);
const claims = [
  { id: 'c-held-127', user_id: U(127), no: 127, name: 'Toon', brand: 'truemoney', amount: 100, status: 'pending', held: true, used: false, created_at: ago(25), assigned_at: null, is_test: false,
    hold_reason: 'linked', decided: null, decided_at: null, face_dist: null, joined_at: ago(900),
    hold_others: [{ user_id: U(118), member_no: 118, first_name: 'Kun', reasons: ['device'], face_dist: null }], prize: { kind: 'weekly', week: '2026-11-16', rank: 4 } },
  { id: 'c-paid-120', user_id: U(120), no: 120, name: 'Pim', brand: 'truemoney', amount: 100, status: 'assigned', held: false, used: true, created_at: ago(300), assigned_at: ago(300), is_test: false,
    hold_reason: null, decided: null, decided_at: null, face_dist: null, joined_at: ago(1500), hold_others: null, prize: { kind: 'founding', week: null, rank: null } },
];
export const snapshot = { at: ago(0), day_start: ago(600), week_start: ago(5000), include_test: false,
  counts: { real: 61, real_today: 3, test: 3, team: 1, ghost: 2, admin: 1, nocard: 2 }, people, claims,
  codes: [{ brand: 'truemoney', amount: 100, available: 8, assigned: 40, used: 30 }],
  board: { week_start: ago(5000), paid_ranks: 8, floor: 25, rows: [] },
  pending: { reels: [{ id: 'r133', user_id: U(133), at: ago(40), poster_path: null, video_path: null, body: 'Coffee at Ari' }],
    checks: [{ id: 'v150', user_id: U(150), at: ago(30), auto: 'review', review: ['aws_same_face'], selfie_path: 'u150/selfie.jpg' }], reports: 0, places: 0 },
  alerts: [{ kind: 'face_alert', subject: 'Looks alike? #126 and #56 (0.44)', at: ago(400), sent: true, error: null }] };
const A = (id, robot, severity, title, body, dedupe_key, href, detail = {}, m = 20) => ({ id, robot, severity, title, body, dedupe_key, href, detail, at: ago(m), first_at: ago(m), last_at: ago(m), synthetic: false });
const alerts = [
  A('a1', 'self_fix', 'red', '1 member Help chat waiting > 45 min', 'Reply in Needs you before the 1-hour Help promise expires.', 'selffix:help_sla', '#inbox'),
  A('a2', 'health_watch', 'red', "#152 Nat can't verify their face (4 fails in 30 min)", 'Last error: verify_aws_fail DB · . Message them in Help now.', 'struggle:verify:' + U(152), '#inbox', { user_id: U(152), member_no: 152 }),
  A('a3', 'health_watch', 'red', "#139 Kra can't verify their face (9 fails in 30 min)", 'Last error: verify_aws_cam_fail NotAllowedError · line. Message them in Help now.', 'struggle:verify:' + U(139), '#inbox', { user_id: U(139), member_no: 139 }),
  A('a4', 'health_watch', 'red', "#138 Ek can't claim a prize (face check) (10 fails in 30 min)", 'Last error: claim_face_fail TIMEOUT · n2 f0 c0 near0 st0 best0ms 480x640. Message them in Help now.', 'struggle:claim:' + U(138), '#inbox', { user_id: U(138), member_no: 138 }),
  A('a5', 'reel_file_watch', 'red', 'Reel video deleted · #24 Joob', 'The video of this approved Reel (posted 17 Nov) is no longer in Kring. It was hidden and its Rings no longer count.', 'reel_gone:' + U(24), '#inbox', { reel_id: U(7024), user_id: U(24) }),
  A('a6', 'protect', 'red', 'Re-joined: #83 Proud has the same email as deleted prize winner #78', 'Same person came back 15 min after deleting. Blocked from prizes automatically. Nothing paid.', 'rejoin:83', '#inbox', { user_id: U(83), member_no: 83 }),
  A('a7', 'protect', 'amber', '3 member(s) flagged for Ring-farming or share-link spikes', 'Check flagged activity before approving weekly board payouts.', 'protect:ring_farming', '#autopilot'),
  A('a8', 'self_fix', 'amber', 'Restock ฿100 codes · 8 TrueMoney ฿100 left (11 committed)', 'Top up codes and paste into Codes before wave claims stall.', 'selffix:voucher_restock', '#codes'),
  A('a9', 'protect', 'amber', 'Look-alike: #150 and #130', 'New face check from #150 Siri looks like #130 June (AWS 100.0%). Nothing was blocked. Open Face checks, compare the photos and decide.', 'face_aws:v150', '#faces',
    { aws_sim: 100, user_id: U(150), other_no: 130, member_no: 150, other_user: U(130), verification_id: 'v150' }),
  A('a10', 'protect', 'amber', 'Look-alike: #137 and #126', 'New face check from #137 Yokna looks like #126 Yok (AWS 100.0%). Nothing was blocked. Open Face checks, compare the photos and decide.', 'face_aws:v137', '#faces',
    { aws_sim: 100, user_id: U(137), other_no: 126, member_no: 137, other_user: U(126), verification_id: 'v137' }),
  A('a11', 'self_fix', 'grey', 'Selfie clean-up ran', '25 old files queued for removal.', 'selffix:orphans', '#problems'),
];
const brief = { brief: { new_members: { today: 3, total: 61 }, held_payouts: { count: 1, thb: 100 }, voucher_stock: { available: 8, burn_7d: 20, days_left: 3 },
  face_checks: { today: 6, pass: 5, waiting: 1 }, posts: { reels_today: 4, asks_today: 1, reels_live: 52, reels_waiting: 1 }, errors: { total: 89, client_24h: 89, outbox_failed_24h: 0, robot_failed_24h: 0 },
  top3_needs_you: alerts.slice(0, 3).map((a) => ({ title: a.title, sub: a.body, href: a.href, severity: a.severity })) }, alerts };
const face = (id, no, o = {}) => ({ id, user_id: U(no), no, name: NAME[no], status: 'approved', at: ago(700), reviewed_at: ago(699), auto: true,
  live: { straight: true, left: true, right: true, blink: true, device: 'iPhone', match: 0.41, model: 'sface-2023' }, reason: null, selfie_path: `u${no}/selfie.jpg`, selfie_deleted_at: null, verified: true, undo: false, paid: 0, ...o });
const verification = { id: 'v150', user_id: U(150), first_name: 'Siri', profile_photo: IMG(PIC[150]), selfie_path: 'u150/selfie.jpg',
  live_check: { straight: true, left: true, right: true, match: 0.91, device: 'iPhone', model: 'aws-rekognition', auto: 'review', review: ['aws_same_face'],
    aws_dup: { user_id: U(130), member_no: 130, first_name: 'June', sim: 100 }, engine: 'aws', ms: 2300, real: 0.98, dup_sim: 100 },
  status: 'pending', created_at: ago(30), reviewed_at: null, reject_reason: null, approved_reels: 1, account_created: ago(140) };
const member141 = { user_id: U(141), kind: 'real', trust: { score: 80, reasons: ['+30 face verified', '+10 real photo'] },
  card: { no: 141, name: 'Ploy', photo: IMG('mint'), who: 'local', area: 'Thonglor', bio: null, langs: null, interests: null, gender: null, ig: null, tt: null, verified: true, photo_check: 'unchecked',
    ref: null, src: null, joined_at: ago(200), last_active_at: ago(3), age_ok_at: ago(200), ghost: false },
  email_hint: 'p***@gmail.com', signed_up_at: ago(210), last_sign_in_at: ago(3), line: true,
  consents: { terms_version: 'member-2026-11-17', terms_at: ago(200), promo_ok: true, promo_at: ago(200), web_reels: true, web_reels_at: ago(200), log: [] },
  reels: [], rings_week: { likes: 3, saves: 1, opens: 0, score: 6 }, board: null, rings_ledger: [], results: [], claims: [], referrals: [],
  links: [{ user_id: U(56), no: 56, name: 'Im', reason: 'face_maybe', dist: 0.47, at: ago(150), dismissed: false }],
  checks: [{ id: 'v141', status: 'approved', auto: 'pass', reason: null, at: ago(180), reviewed_at: ago(180), by_admin: false }], admin_log: [] };
const dupOverview = { links: [
    { a: U(126), b: U(137), reason: 'face', detail: { aws_sim: 100, sources: 'face check vs face (AWS Rekognition)' }, first_at: ago(500), dismissed: false },
    { a: U(56), b: U(126), reason: 'face_maybe', detail: { dist: 0.444, sources: 'card photo vs face check' }, first_at: ago(600), dismissed: false },
    { a: U(127), b: U(118), reason: 'device', detail: { where: 'share opens' }, first_at: ago(800), dismissed: false },
    { a: U(114), b: U(127), reason: 'network', detail: { where: 'claims' }, first_at: ago(800), dismissed: false }],
  members: [126, 137, 56, 127, 118, 114].map((n) => ({ user_id: U(n), member_no: n, first_name: NAME[n], photo: IMG(PIC[n]), joined_at: ago(joined[n]), verified: true, ghost: false, is_test: false, line: true, prints: 2,
    selfie_path: `u${n}/selfie.jpg`, reels: 1, prizes: n === 127 ? [{ id: 'pz', kind: 'weekly', amount: 100, status: 'claimed', week: '2026-11-16', rank: 4, founding_no: null }] : [] })),
  held: [{ claim_id: 'c-held-127', user_id: U(127), brand: 'truemoney', amount: 100, created_at: ago(25), reason: 'linked',
    detail: { others: [{ user_id: U(118), first_name: 'Kun', member_no: 118, reasons: ['device'] }], review: ['aws_look_alike', 'manual_wave_hold'], self_dist: null, verified_dist: 0.31, claim_photo: 'u127/claim.jpg' },
    face_dist: null, prize_kind: 'weekly', founding_no: null, week: '2026-11-16', rank: 4 }], mutual: [], flagged: [] };
export const awsLookalikes = { pairs: [
    { a: U(114), b: U(127), sim: 86, at: ago(60), a_no: 114, a_name: 'Jaa', b_no: 127, b_name: 'Toon', a_prize: true, b_prize: true },
    { a: U(120), b: U(148), sim: 86.1, at: ago(60), a_no: 120, a_name: 'Pim', b_no: 148, b_name: 'Mai', a_prize: true, b_prize: false },
    { a: U(126), b: U(137), sim: 100, at: ago(500), a_no: 126, a_name: 'Yok', b_no: 137, b_name: 'Yokna', a_prize: false, b_prize: false },
    { a: U(130), b: U(150), sim: 100, at: ago(30), a_no: 130, a_name: 'June', b_no: 150, b_name: 'Siri', a_prize: false, b_prize: false }],
  holds: [{ claim_id: 'c-held-127', review: ['aws_look_alike', 'watched_invite_group', 'manual_wave_hold'], watch_no: 114, watch_name: 'Jaa' }] };
const photos = Object.fromEntries(Object.entries(PIC).map(([n, p]) => [U(Number(n)), IMG(p)]));
export function adminRpc(fn, args) {
  switch (fn) {
    case 'kr8_is_admin': return true;
    case 'kr8_admin_v2_snapshot': return snapshot;
    case 'kr8_admin_morning_brief': return brief;
    case 'kr8_admin_aws_lookalikes': return awsLookalikes;
    case 'kr8_admin_v2_photos': return Object.fromEntries((args.p_users || []).map((u) => [u, photos[u] || '']));
    case 'kr8_admin_v2_face_checks': return args.p_user ? [face('f-' + args.p_user.slice(-3), Number(args.p_user.slice(-3)))] : [face('f126', 126), face('f141', 141, { live: { straight: true, left: true, right: true, match: 0.93, model: 'aws-rekognition', device: 'Android' } })];
    case 'kr8_admin_verifications': return [verification];
    case 'kr8_admin_verify_lookalikes': return { v150: { has_print: true, matches: [{ user_id: U(64), member_no: 64, first_name: 'Fah', verified: true, dist: 0.47, strength: 'maybe', sources: 'card vs selfie' }] } };
    case 'kr8_admin_lookalike_cards': return Object.fromEntries((args.p_users || []).map((u) => { const n = Number(u.slice(-3)); return [u, { member_no: n, first_name: NAME[n] || 'member', photo: photos[u] || null, ref_code: null, joined_at: ago(joined[n] || 100) }]; }));
    case 'kr8_admin_v2_member': return member141;
    case 'kr8_admin_dup_overview': return dupOverview;
    case 'kr8_admin_traveller_requests': return [];
    case 'kr8_admin_places_auto': case 'kr8_admin_dups_auto': case 'kr8_admin_help_cases': case 'kr8_admin_bug_spots': return [];
    case 'kr8_admin_v2_people_extra': return null;
    case 'kr8_admin_explain': return null;
    default: return null;
  }
}
