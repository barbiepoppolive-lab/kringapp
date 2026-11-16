// Preview of the admin "Where visitors come from" block with SAMPLE numbers (not real traffic).
import '../src/venue/admin2.css';
import { trafficBlock, type Traffic, type TrafficPeriod } from '../src/venue/adminApp';
const L: [string, string][] = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['google', 'Google'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['line', 'LINE'],
  ['reddit', 'Reddit'], ['ai', 'AI assistants'], ['other_search', 'Other search'], ['other_sites', 'Other websites'], ['member_links', 'Member & partner links'], ['direct', 'Direct']];
const mk = (v: Record<string, [number, number]>, k = 1): TrafficPeriod => ({ us: Math.round(79 * k),
  channels: L.map(([key, label]) => ({ key, label, visitors: Math.round((v[key] || [0, 0])[0] * k), signups: Math.round((v[key] || [0, 0])[1] * k) })),
  codes: [{ code: 'pich', visitors: Math.round(30 * k), signups: Math.round(2 * k) }, { code: 'nattham', visitors: Math.round(11 * k), signups: Math.round(1 * k) },
    { code: 'nattham-ari', visitors: Math.round(6 * k), signups: 0 }, { code: 'mem-k3f9', visitors: Math.round(3 * k), signups: Math.round(1 * k) }],
  hosts: [{ host: 'blog.example.com', visitors: Math.round(5 * k) }, { host: 'news.example.co.th', visitors: Math.round(3 * k) }, { host: 'forum.example.net', visitors: Math.round(2 * k) }] });
const base = { instagram: [120, 4], tiktok: [64, 2], direct: [48, 1], member_links: [50, 4], line: [22, 1], google: [14, 0], x: [9, 0], reddit: [7, 0], ai: [4, 0], facebook: [3, 0], other_sites: [10, 0], youtube: [2, 0] } as Record<string, [number, number]>;
const data: Traffic = { today: mk(base, 0.2), week: mk(base), month: mk(base, 3.4) };
// harness only: the app CSS pulled in by the imports paints bare buttons gold; the real admin page does not load it
const st = document.createElement('style'); st.textContent = '#app button:not(.on){background:none!important}'; document.head.append(st);
const wrap = document.createElement('div');
wrap.className = 'sheet'; wrap.style.cssText = 'position:static;max-width:560px;margin:0 auto;border-radius:0;max-height:none;overflow:visible';
const note = document.createElement('p'); note.className = 'dim sm'; note.textContent = 'SAMPLE numbers - preview only'; note.style.margin = '12px 0';
wrap.append(note, trafficBlock(data));
const main = document.createElement('main'); main.id = 'app'; main.append(wrap); document.getElementById('root')!.append(main);
