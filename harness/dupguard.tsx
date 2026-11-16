// Preview of 0066 "one person, one account" screens with SAMPLE data (AI demo faces, not real members). ?v=claim | admin | email | week
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import '../src/v8/kx.css';
import { ClaimPage } from '../src/v8/V5KxRewards';
import { buildMail } from '../supabase/functions/notify-reward/mail.ts';
import { buildClusters, type DupOverview, type WeekReview } from '../src/venue/dupAdmin';
import type { KxPrize, KxRewards } from '../src/v8/v5Kx';

const v = new URLSearchParams(location.search).get('v') || 'claim';
const img = (n: string) => new URL(`./img/${n}.jpg`, import.meta.url).href;
const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const L = (s: string) => s;
const Lf = (s: string, a: string, b?: string) => s.replace('{0}', a).replace('{1}', b ?? '');

if (v === 'claim') {
  const prize: KxPrize = { id: 'p1', kind: 'founding', week: null, rank: null, founding_no: 14, amount: 100, rings: null, status: 'won', claim_id: null, created_at: iso(2) };
  const data = { week: 12, rank: 3, lifetime: 40, level: 2, gap: null, ends_at: iso(-50), member_no: 14, founding_no: 14, founding_left: 30, floor: 25,
    rules: { truemoney_payout_pct: 100 }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 0, checked_in_today: true, prizes: [prize], claims: [],
    line_linked: true, claim_needs_line: false, claim_face_check: true } as KxRewards;
  const root = document.getElementById('root')!;
  root.className = 'v8-app-root';
  root.style.cssText = 'position:relative;width:100%;height:100vh;overflow:hidden;background:#07060d';
  createRoot(root).render(<ClaimPage L={L} Lf={Lf} lang="th" data={data} prize={prize} onBack={() => undefined} onDone={() => undefined} toast={() => undefined}
    startStep="face" faceDemo={{ stage: 'look', img: img('mint'), held: 1900 }} />);
} else if (v === 'email') {
  const m = buildMail({ id: 'c9', brand: 'truemoney', amount_thb: 100, status: 'pending', held: true, hold_reason: 'linked', is_test: false, created_at: iso(0.1),
    prize_kind: 'founding', founding_no: 31, first_name: 'Fah', member_no: 31, payout_pct: 100, selfie_path: 's2',
    others: [{ first_name: 'Fah', member_no: 12, reasons: ['face', 'device'], selfie_path: 's1' }] }, { truemoney_100: 11 }, { s1: img('mint'), s2: img('mint') });
  document.title = m.subject;
  document.getElementById('root')!.innerHTML = `<div style="background:#f3f3f5;min-height:100vh;padding:14px 12px;font-family:system-ui,sans-serif">
    <div style="background:#fff;border-radius:14px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="font-size:12px;color:#888">Kring alerts &lt;hello@kringapp.com&gt; · SAMPLE</div>
    <div style="font-weight:700;font-size:16px;margin:4px 0 12px">${m.subject}</div>${m.html}</div></div>`;
} else {
  void (async () => {
    await import('../src/venue/admin2.css');
    const { dupBlock, weekBlock } = await import('../src/venue/adminApp');
    const { el } = await import('../src/venue/shared');
    const app = document.getElementById('app')!;
    app.className = 'scr';
    const back = (t: string) => el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('span', { class: 'icb' }, '‹'), el('h1', { style: 'font-size:26px' }, t));
    const note = el('p', { style: 'color:#ffc44d;font-size:12px;margin:0 0 8px' }, 'SAMPLE data · preview only');
    const mem = (id: string, no: number, name: string, days: number, extra: object = {}) => ({ user_id: id, member_no: no, first_name: name, photo: null, joined_at: iso(days * 24),
      verified: true, ghost: false, is_test: false, line: false, prints: 2, selfie_path: id, reels: 1, prizes: [], ...extra });
    if (v === 'admin') {
      const ov: DupOverview = {
        members: [mem('a', 12, 'Fah', 9, { prizes: [{ id: 'x', kind: 'founding', amount: 100, status: 'claimed', week: null, rank: null, founding_no: 12 }] }),
          mem('b', 31, 'Fah', 1, { prizes: [{ id: 'y', kind: 'founding', amount: 100, status: 'claimed', week: null, rank: null, founding_no: 31 }] }),
          mem('c', 27, 'Ploy', 4), mem('d', 29, 'Aom', 3)],
        links: [{ a: 'a', b: 'b', reason: 'face', detail: { dist: 0.33 }, first_at: iso(1), dismissed: false },
          { a: 'c', b: 'd', reason: 'network', detail: { where: 'claims' }, first_at: iso(2), dismissed: false },
          { a: 'a', b: 'b', reason: 'network', detail: { where: 'claims' }, first_at: iso(1), dismissed: false }],
        held: [{ claim_id: 'h1', user_id: 'b', brand: 'truemoney', amount: 100, created_at: iso(0.3), reason: 'linked',
          detail: { others: [{ user_id: 'a', first_name: 'Fah', member_no: 12, reasons: ['face', 'network'] }] }, face_dist: null, prize_kind: 'founding', founding_no: 31, week: null, rank: null },
        ],
        flagged: [{ claim_id: 'f1', user_id: 'd', first_name: 'Aom', member_no: 29, brand: 'grab', amount: 100, status: 'assigned', created_at: iso(5),
          flags: [{ user_id: 'c', first_name: 'Ploy', member_no: 27, reasons: ['network'] }], face_mismatch: false, face_dist: null }],
        mutual: [{ from: 'b', to: 'a', likes: 1, saves: 1 }],
      };
      const noop = { pay: () => undefined, refuse: () => undefined, resolve: () => undefined };
      const { dupFlagBlock } = await import('../src/venue/adminApp');
      app.append(note, back('Same person?'), el('p', { class: 'dim sm', style: 'margin:-6px 0 14px' }, 'Accounts linked by face, phone, network or LINE, and prize claims held for a check. Likes and saves between linked accounts already don’t count for Rings.'),
        dupFlagBlock(ov.flagged || []) || '', dupBlock(buildClusters(ov), { a: img('mint'), b: img('mint'), c: img('ploy'), d: img('aom') }, noop));
    } else {
      const P = [1500, 900, 600, 500, 400, 250, 150, 100];
      const ppl: [string, number, string, number, number][] = [['Ploy', 27, 'ploy', 212, 200], ['Fah', 31, 'mint', 160, 30], ['Aom', 29, 'aom', 141, 300], ['Nat', 18, 'nat', 118, 260],
        ['Ton', 22, 'ton', 97, 240], ['Yui', 35, 'yui', 74, 90], ['Lena', 40, 'lena', 52, 150], ['Min-jun', 44, 'minjun', 31, 120]];
      const r: WeekReview = { week: '2026-11-16', closed_at: '2026-11-22T17:00:00Z', approved_at: null, opens_at: '2026-11-23T17:00:00Z',
        rows: ppl.map(([n, no, im, rings, hAgo], i) => ({ rank: i + 1, user_id: 'u' + no, first_name: n, member_no: no, photo: img(im), rings, joined_at: iso(hAgo), verified: false, line: false, prints: 1,
          prize: { id: 'p' + i, amount: P[i], status: 'won' }, links: n === 'Fah' ? [{ other: 'u12', reason: 'face' as const, other_name: 'Fah', other_no: 12 }, { other: 'u12', reason: 'network' as const, other_name: 'Fah', other_no: 12 }] : [] })) };
      app.append(note, back('Approve week'), weekBlock(r, () => undefined, Date.parse('2026-11-23T03:00:00Z')));
    }
  })();
}
