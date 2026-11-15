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
    expect(visitsHint(live.today)).toBe('+79 US, mostly our own testing · tap for 7 days');
    expect(visitsHint({ ...live.today, us: 0 })).toBe('tap for 7 days');
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
    expect(html).toContain("s=(navigator.webdriver?'zztest':'')+(Math.random().toString(36).slice(2,12)||'x')");
    expect(/^[a-z0-9]{1,40}$/.test('zztest' + 'abcdefghij')).toBe(true);
  });
});
