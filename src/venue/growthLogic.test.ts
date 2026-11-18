import { describe, expect, it } from 'vitest';
import { addDays, bkkToday, clampDay, dailyRange, dayName, isGrowthDaily, isGrowthDay, countryName, flag, groupSources, hostOf, isGrowth, isInternalRef, isNoiseHost, refLabel, seriesEnds, sourceOf, sparkPath, stepPct, trendWords, visibleRefs } from './growthLogic';

describe('growth: source grouping', () => {
  it('cleans referrers to hosts', () => {
    expect(hostOf('https://M.Facebook.com/story?x=1')).toBe('m.facebook.com');
    expect(hostOf('android-app://jp.naver.line.android')).toBe('jp.naver.line.android');
    expect(hostOf('localhost:5173')).toBe('localhost');
    expect(hostOf(null)).toBe('');
  });
  it('LINE: liff.line.me, line.me, the Android LINE app', () => {
    for (const h of ['liff.line.me', 'line.me', 'jp.naver.line.android', 'android-app://jp.naver.line.android']) expect(sourceOf(h)).toBe('line');
  });
  it('Google, Facebook (m. www. l.), Instagram, TikTok, Kring site', () => {
    expect(sourceOf('www.google.com')).toBe('google');
    expect(sourceOf('google.co.th')).toBe('google');
    expect(sourceOf('com.google.android.googlequicksearchbox')).toBe('google');
    for (const h of ['m.facebook.com', 'www.facebook.com', 'l.facebook.com', 'lm.facebook.com', 'facebook.com', 'com.facebook.katana']) expect(sourceOf(h)).toBe('facebook');
    expect(sourceOf('l.instagram.com')).toBe('instagram');
    expect(sourceOf('com.instagram.android')).toBe('instagram');
    expect(sourceOf('www.tiktok.com')).toBe('tiktok');
    expect(sourceOf('com.zhiliaoapp.musically')).toBe('tiktok');
    expect(sourceOf('kringapp.com')).toBe('kring');
    expect(sourceOf('www.kringapp.com')).toBe('kring');
  });
  it('does not mistake look-alike hosts', () => {
    expect(sourceOf('notfacebook.com.evil.io')).toBe('other');
    expect(sourceOf('kringapp.com.example.org')).toBe('other');
    expect(sourceOf('pipeline.me')).toBe('other');
    expect(sourceOf('bing.com')).toBe('other');
  });
  it('no referrer: Direct, a channel ?ref= word, or a shared link', () => {
    expect(sourceOf(null)).toBe('direct');
    expect(sourceOf('', 'ig')).toBe('instagram');
    expect(sourceOf(null, 'tiktok')).toBe('tiktok');
    expect(sourceOf(null, 'LINE')).toBe('line');
    expect(sourceOf(null, 'pich')).toBe('links');
    expect(sourceOf(null, 'k00184')).toBe('links');
    expect(sourceOf('www.google.com', 'pich')).toBe('google');   // a real referrer wins
  });
  it('noise and internal refs', () => {
    expect(isNoiseHost('localhost:5173')).toBe(true);
    expect(isNoiseHost('127.0.0.1')).toBe(true);
    expect(isNoiseHost('abc.kring.pages.dev')).toBe(true);
    expect(isNoiseHost('bartest.kringapp.com')).toBe(true);
    expect(isNoiseHost('kringapp.com')).toBe(false);
    for (const r of ['test1', 'testing', 'perf', 'demo', 'zz9', 'pwa-install']) expect(isInternalRef(r)).toBe(true);
    for (const r of ['pich', 'k00184', 'nattham']) expect(isInternalRef(r)).toBe(false);
  });
  it('groups rows, biggest first, with whole-number shares; noise dropped', () => {
    const g = groupSources([
      { host: null, ref: null, visitors: 40 }, { host: 'liff.line.me', ref: null, visitors: 20 }, { host: 'jp.naver.line.android', ref: null, visitors: 10 },
      { host: 'm.facebook.com', ref: null, visitors: 5 }, { host: 'l.facebook.com', ref: null, visitors: 5 }, { host: 'example.org', ref: null, visitors: 15 },
      { host: null, ref: 'pich', visitors: 5 }, { host: 'localhost', ref: null, visitors: 99 }, { host: null, ref: 'test1', visitors: 99 },
    ]);
    expect(g.map((x) => [x.key, x.visitors])).toEqual([['direct', 40], ['line', 30], ['other', 15], ['facebook', 10], ['links', 5]]);
    expect(g.reduce((a, x) => a + x.visitors, 0)).toBe(100);
    expect(g[0].share).toBe(40);
    expect(g.find((x) => x.key === 'other')!.hosts).toEqual(['example.org']);
    expect(g[0].label).toBe('Direct / in-app');
    expect(groupSources([])).toEqual([]);
  });
});

describe('growth: numbers and labels', () => {
  it('step percent and trend words', () => {
    expect(stepPct(2, 3)).toBe('67%');
    expect(stepPct(0, 0)).toBe('—');
    expect(trendWords(12, 10, 7)).toBe('+20% vs previous 7 days');
    expect(trendWords(9, 10, 1)).toBe('−10% vs same time yesterday');
    expect(trendWords(10, 10, 30)).toBe('same as previous 30 days');
    expect(trendWords(5, 0, 7)).toBe('');
  });
  it('recruiter labels and order (internal hidden)', () => {
    expect(refLabel({ ref: 'k00184', member_no: 184, member_name: 'Mint' })).toBe('Mint #184 · invite');
    expect(refLabel({ ref: 'k00184', member_no: null, member_name: null })).toBe('Member #184 · invite');
    expect(refLabel({ ref: 'pich', member_no: null, member_name: null })).toBe('pich');
    const rows = visibleRefs([
      { ref: 'nattham', visitors: 30, joined: 1, reels: 0, member_no: null, member_name: null },
      { ref: 'pich', visitors: 10, joined: 3, reels: 1, member_no: null, member_name: null },
      { ref: 'test1', visitors: 99, joined: 9, reels: 9, member_no: null, member_name: null },
      { ref: 'pwa-install', visitors: 9, joined: 0, reels: 0, member_no: null, member_name: null },
      { ref: 'empty', visitors: 0, joined: 0, reels: 0, member_no: null, member_name: null },
    ]);
    expect(rows.map((r) => r.ref)).toEqual(['pich', 'nattham']);
  });
  it('countries and flags', () => {
    expect(countryName('TH')).toBe('Thailand');
    expect(countryName('zz')).toBe('ZZ');
    expect(countryName(null)).toBe('Unknown');
    expect(flag('th')).toBe('🇹🇭');
    expect(flag(null)).toBe('');
  });
  it('sparkline path and end labels', () => {
    const p = sparkPath([0, 5, 10], 100, 50);
    expect(p.line.startsWith('M0,46')).toBe(true);
    expect(p.line.endsWith('100,8')).toBe(true);
    expect(p.area.endsWith('Z')).toBe(true);
    expect(sparkPath([]).line).toBe('');
    expect(seriesEnds([{ t: '2026-11-12', visitors: 1 }, { t: '2026-11-18', visitors: 2 }], 7)).toEqual(['12 Nov', '18 Nov']);
    expect(seriesEnds([{ t: 0, visitors: 1 }, { t: 14, visitors: 2 }], 1)).toEqual(['00:00', '14:00']);
  });
  it('shape guard', () => {
    expect(isGrowth(null)).toBe(false);
    expect(isGrowth({ visitors: 1, visits: 1, funnel: {}, sources: [], refs: [], countries: [], series: [] })).toBe(true);
  });
});

describe('growth: day by day (0114)', () => {
  it('Bangkok today flips at midnight Bangkok (UTC+7), not UTC', () => {
    expect(bkkToday(Date.parse('2026-11-18T16:59:00Z'))).toBe('2026-11-18');
    expect(bkkToday(Date.parse('2026-11-18T17:00:00Z'))).toBe('2026-11-19');
  });
  it('steps days across month ends', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayName('2026-11-17')).toBe('Tue 17 Nov');
  });
  it('keeps a picked day between the first day and today', () => {
    expect(clampDay('2026-11-17', '2026-11-18')).toBe('2026-11-17');
    expect(clampDay('2026-11-25', '2026-11-18')).toBe('2026-11-18');
    expect(clampDay('2026-01-01', '2026-11-18', '2026-10-01')).toBe('2026-10-01');
    expect(clampDay('nope', '2026-11-18')).toBe('2026-11-18');
    expect(clampDay('2026-02-31', '2026-11-18')).toBe('2026-11-18');
    expect(clampDay(undefined, '2026-11-18')).toBe('2026-11-18');
  });
  it('table range ends today and covers 7 / 30 days', () => {
    expect(dailyRange(7, '2026-11-18')).toEqual(['2026-11-12', '2026-11-18']);
    expect(dailyRange(30, '2026-11-18')).toEqual(['2026-10-20', '2026-11-18']);
  });
  it('trend words for a past day say "the day before"', () => {
    expect(trendWords(12, 10, 1, true)).toBe('+20% vs the day before');
    expect(trendWords(12, 10, 1)).toBe('+20% vs same time yesterday');
  });
  it('shape guards', () => {
    expect(isGrowthDaily([{ day: '2026-11-18', visitors: 3, visits: 4, returning: 1, signins: 1, cards: 1, first_reels: 0 }])).toBe(true);
    expect(isGrowthDaily([{ day: '2026-11-18' }])).toBe(false);
    expect(isGrowthDaily(null)).toBe(false);
    expect(isGrowthDay({ visitors: 1, visits: 1, funnel: {}, sources: [], refs: [], countries: [], series: [], day: '2026-11-18' })).toBe(true);
    expect(isGrowthDay({ visitors: 1, visits: 1, funnel: {}, sources: [], refs: [], countries: [], series: [] })).toBe(false);
  });
});
