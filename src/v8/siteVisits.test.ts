import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSiteVisits, joinedLine, realVisitors, sourceName, visitsHeadline, visitsHint, type SiteVisits } from '../venue/adminApp';

// Shape returned by public.kr8_admin_site_visits() (0052), copied from a live run on 15 Nov 2026 (trimmed to 2 days).
const live: SiteVisits = {
  today: { th: 1, us: 79, other: 15, signups: 0, visitors: 95 },
  week: { th: 54, us: 440, other: 49, signups: 3, visitors: 543 },
  days: [
    { day: '2026-11-15', th: 1, us: 79, other: 15, signups: 0, visitors: 95 },
    { day: '2026-11-14', th: 29, us: 11, other: 7, signups: 1, visitors: 47 },
  ],
  sources_today: [{ ref: 'direct', visitors: 15 }, { ref: 'pich', visitors: 1 }],
  sources_week: [{ ref: 'direct', visitors: 68 }, { ref: 'pich', visitors: 30 }, { ref: 'nattham', visitors: 5 }],
};

describe('admin site visits', () => {
  it('accepts the function output shape and rejects anything else', () => {
    expect(isSiteVisits(live)).toBe(true);
    expect(isSiteVisits(null)).toBe(false);
    expect(isSiteVisits({ ...live, today: { th: 1 } })).toBe(false);
    expect(isSiteVisits({ ...live, days: [{ day: 'x' }] })).toBe(false);
    expect(isSiteVisits({ ...live, sources_week: undefined })).toBe(false);
  });
  it('headline counts Thailand + other countries; the US is kept apart', () => {
    expect(realVisitors(live.today)).toBe(16);
    expect(visitsHeadline(live.today)).toBe('Site visits today: 16 (TH 1 · other 15)');
    expect(visitsHint(live.today)).toBe('unique phones per day (from 16 Nov) · +79 US, mostly our own testing · tap for 7 days');
    expect(visitsHint({ ...live.today, us: 0 })).toBe('unique phones per day (from 16 Nov) · tap for 7 days');
  });
  it('plain-words conversion and source names', () => {
    expect(joinedLine(live.today, 'today')).toBe('0 new members from 16 visitors today (0%)');
    expect(joinedLine(live.week, 'in 7 days')).toBe('3 new members from 103 visitors in 7 days (2.9%)');
    expect(joinedLine({ th: 0, other: 0, us: 4, signups: 1, visitors: 4 }, 'today')).toBe('1 new member from 0 visitors today');
    expect(sourceName('direct')).toBe('direct (no link code)');
    expect(sourceName('pich')).toBe('pich');
  });
  it('migration is additive, admin-only, has an UNDO line and skips bots + test sessions', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0052_kr8_admin_site_visits.sql'), 'utf8');
    expect(sql).toMatch(/-- UNDO: drop function if exists public\.kr8_admin_site_visits\(\);/);
    expect(sql).toMatch(/if not public\.kr8_is_admin\(\) then raise exception 'KR8_ADMIN_ONLY'/);
    expect(sql).toMatch(/revoke all on function public\.kr8_admin_site_visits\(\) from public, anon/);
    expect(sql).toMatch(/bot\|crawl\|spider\|headless\|playwright\|lighthouse\|preview\|python\|curl/);
    expect(sql).toMatch(/session_id not like 'zztest%'/);
    expect(sql).not.toMatch(/\b(drop table|alter table|drop policy|create policy|create trigger)\b/i);
  });
  it('the app visit counter marks automated browsers with the zztest prefix (letters only, fits the table check)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain("if(navigator.webdriver&&s.indexOf('zztest')!==0)s=('zztest'+s).slice(0,40)");
    expect(/^[a-z0-9]{1,40}$/.test('zztest' + 'abcdefghij')).toBe(true);
  });
});

// ───────────── 0056 · where visitors come from ─────────────
import { channelOf, conversionPct, isTraffic, trafficBlock, trafficRows, type Traffic, type TrafficPeriod } from '../venue/adminApp';

const labels: [string, string][] = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['google', 'Google'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['line', 'LINE'],
  ['reddit', 'Reddit'], ['ai', 'AI assistants'], ['other_search', 'Other search'], ['other_sites', 'Other websites'], ['member_links', 'Member & partner links'], ['direct', 'Direct']];
const mk = (v: Record<string, [number, number]>): TrafficPeriod => ({ us: 7, channels: labels.map(([key, label]) => ({ key, label, visitors: (v[key] || [0, 0])[0], signups: (v[key] || [0, 0])[1] })),
  codes: [{ code: 'pich', visitors: 30, signups: 2 }, { code: 'nattham-ari', visitors: 4, signups: 0 }], hosts: [{ host: 'blog.example.com', visitors: 3 }] });
// SAMPLE numbers, not real traffic.
const sample: Traffic = { today: mk({ direct: [5, 0] }), week: mk({ instagram: [120, 4], tiktok: [60, 2], direct: [40, 1], member_links: [34, 2], other_sites: [3, 0] }), month: mk({ instagram: [300, 9] }) };

describe('admin traffic sources', () => {
  it('maps channel words, referrer hosts, member codes and direct the same way as the SQL', () => {
    for (const [r, ch] of [['ig', 'instagram'], ['Insta', 'instagram'], ['tt', 'tiktok'], ['twitter', 'x'], ['yt', 'youtube'], ['fb', 'facebook'], ['line', 'line'], ['google', 'google'], ['reddit', 'reddit']]) expect(channelOf(r, null)).toBe(ch);
    for (const [h, ch] of [['l.instagram.com', 'instagram'], ['tiktok.com', 'tiktok'], ['t.co', 'x'], ['x.com', 'x'], ['twitter.com', 'x'], ['www.google.co.th', 'google'], ['youtu.be', 'youtube'],
      ['m.facebook.com', 'facebook'], ['l.facebook.com', 'facebook'], ['liff.line.me', 'line'], ['line.me', 'line'], ['old.reddit.com', 'reddit'], ['chatgpt.com', 'ai'], ['chat.openai.com', 'ai'],
      ['perplexity.ai', 'ai'], ['gemini.google.com', 'ai'], ['www.bing.com', 'other_search'], ['duckduckgo.com', 'other_search'], ['blog.example.com', 'other_sites']]) expect(channelOf(null, h)).toBe(ch);
    expect(channelOf('pich', null)).toBe('member_links');
    expect(channelOf('nattham-ari', null)).toBe('member_links');
    expect(channelOf('tiktok', 'google.com')).toBe('tiktok');       // the link word beats the referrer
    expect(channelOf('pich', 'l.instagram.com')).toBe('instagram'); // the referrer beats a member code
    expect(channelOf(null, 'kringapp.com')).toBe('direct');         // our own site is not a source
    expect(channelOf('direct', null)).toBe('direct');
    expect(channelOf('', '')).toBe('direct');
  });
  it('checks the payload shape, sorts by visitors and computes conversion', () => {
    expect(isTraffic(sample)).toBe(true);
    expect(isTraffic(null)).toBe(false);
    expect(isTraffic({ ...sample, month: { us: 1 } })).toBe(false);
    expect(trafficRows(sample.week).map((c) => c.key)).toEqual(['instagram', 'tiktok', 'direct', 'member_links', 'other_sites']);
    expect(conversionPct(4, 120)).toBe('3.3%');
    expect(conversionPct(0, 0)).toBe('–');
  });
  it('renders the block from a sample payload and switches period', () => {
    const box = trafficBlock(sample);
    document.body.append(box);
    expect(box.textContent).toContain('Where visitors come from');
    expect(box.querySelectorAll('.tr-row').length).toBe(5);
    expect(box.querySelector('[data-ch="instagram"]')!.textContent).toContain('120');
    expect(box.querySelector('[data-ch="instagram"]')!.textContent).toContain('3.3%');
    expect(box.querySelector('[data-code="pich"]')!.textContent).toContain('30');
    expect(box.textContent).toContain('blog.example.com');
    (box.querySelector('[data-p="today"]') as HTMLButtonElement).click();
    expect(box.querySelectorAll('.tr-row').length).toBe(1);
    expect(box.querySelector('[data-ch="direct"]')).toBeTruthy();
    box.remove();
  });
  it('0056 migration is additive, admin-only, has an UNDO line and the same bot/test filters as 0052', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0056_kr8_admin_traffic_sources.sql'), 'utf8');
    expect(sql).toMatch(/-- UNDO: drop function if exists public\.kr8_admin_traffic_sources\(int\);/);
    expect(sql).toMatch(/if not public\.kr8_is_admin\(\) then raise exception 'KR8_ADMIN_ONLY'/);
    expect(sql).toMatch(/revoke all on function public\.kr8_admin_traffic_sources\(int\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.kr8_admin_traffic_sources\(int\) to authenticated/);
    expect(sql).toMatch(/bot\|crawl\|spider\|headless\|playwright\|lighthouse\|preview\|python\|curl/);
    expect(sql).toMatch(/session_id not like 'zztest%'/);
    expect(sql).toMatch(/Asia\/Bangkok/);
    expect(sql).toMatch(/kr8_is_test_member/);
    expect(sql).not.toMatch(/\b(drop table|alter table|drop policy|create policy|create trigger)\b/i);
    expect(sql.match(/create or replace function/g)!.length).toBe(1);
  });
});
