import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { problemsBlock, recruitersBlock } from '../venue/adminApp';
import { agentsByLabel, cleanRef, codeLine, codeMeaning, funnelLine, funnelRate, isProblemLog, isRecruiters, uaInfo,
  type ProblemLog, type Recruiters } from '../venue/problemsAdmin';

// user agents copied from live kr8_client_events rows (16 Nov 2026)
const UA = {
  samsungWv: 'Mozilla/5.0 (Linux; Android 15; SM-S721B Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.8103.38 Mobile Safari/537',
  samsungNet: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/26.17.0 LIFF',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0.0;FBBV/1]',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 14; CPH2591 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0]',
  igIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  tiktok: 'Mozilla/5.0 (Linux; Android 13; 2201117TG Build/TKQ1; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6',
};

describe('ua → phone + browser', () => {
  it('reads the live user agents', () => {
    expect(uaInfo(UA.samsungWv)).toMatchObject({ device: 'Samsung SM-S721B', os: 'Android 15', inApp: true, label: 'Samsung SM-S721B · in-app browser' });
    expect(uaInfo(UA.samsungNet)).toMatchObject({ device: 'Samsung', browser: 'Samsung Internet', inApp: false, label: 'Samsung · Samsung Internet' });
    expect(uaInfo(UA.lineIos)).toMatchObject({ device: 'iPhone', os: 'iOS 26.5', browser: 'LINE', inApp: true, label: 'iPhone · inside LINE' });
    expect(uaInfo(UA.chromeAndroid)).toMatchObject({ device: 'Android (model hidden)', browser: 'Chrome', inApp: false });
  });
  it('names Facebook, Instagram, TikTok and plain Safari', () => {
    expect(uaInfo(UA.fbIos).label).toBe('iPhone · inside Facebook');
    expect(uaInfo(UA.fbAndroid).label).toBe('OPPO CPH2591 · inside Facebook');
    expect(uaInfo(UA.igIos).label).toBe('iPhone · inside Instagram');
    expect(uaInfo(UA.tiktok)).toMatchObject({ browser: 'TikTok', inApp: true });
    expect(uaInfo(UA.tiktok).device).toMatch(/^Xiaomi/);
    expect(uaInfo(UA.safari)).toMatchObject({ browser: 'Safari', inApp: false, label: 'iPhone · Safari' });
    expect(uaInfo(null).label).toBe('Unknown device · Unknown browser');
  });
  it('folds user agents into one row per phone + browser, most failures first', () => {
    const rows = agentsByLabel([{ ua: UA.chromeAndroid, n: 3, fails: 0, people: 1 }, { ua: UA.samsungWv, n: 10, fails: 9, people: 1 },
      { ua: UA.lineIos, n: 2, fails: 0, people: 1 }, { ua: UA.lineIos.replace('26_5', '26_0_1'), n: 1, fails: 0, people: 1 }]);
    expect(rows[0]).toMatchObject({ label: 'Samsung SM-S721B · in-app browser', fails: 9 });
    expect(rows.find((r) => r.label === 'iPhone · inside LINE')).toMatchObject({ n: 3, people: 2 });
  });
});

describe('what each code means', () => {
  it('upload codes', () => {
    expect(codeLine('reel_publish_fail', 'UPLOAD:0')).toBe('UPLOAD:0 = the phone lost connection during upload');
    expect(codeMeaning('reel_publish_fail', 'UPLOAD')).toMatch(/older app build/);
    expect(codeMeaning('reel_publish_fail', 'UPLOAD:403')).toBe('sign-in ran out during the upload');
    expect(codeMeaning('reel_publish_fail', 'UPLOAD:413')).toMatch(/too big/);
    expect(codeMeaning('reel_publish_fail', 'UPLOAD:503')).toMatch(/failed \(503\)/);
    expect(codeMeaning('reel_publish_fail', 'REPICK')).toMatch(/pick it again/);
    expect(codeMeaning('reel_publish_fail', 'KR8_GHOST')).toMatch(/ghost/);
  });
  it('pick, trim and face check codes', () => {
    expect(codeLine('reel_pick_fail', 'TOO_LONG')).toBe('TOO_LONG = clip over 10 min');
    expect(codeMeaning('reel_pick_fail', 'HEVC')).toMatch(/High efficiency/);
    expect(codeMeaning('reel_trim', 'fail:webcodecs|record')).toMatch(/couldn’t cut/);
    expect(codeMeaning('reel_trim', 'open')).toMatch(/over 60 s/);
    expect(codeMeaning('verify_cam_fail', 'NotAllowedError')).toMatch(/camera permission blocked/);
    expect(codeMeaning('verify_fail', 'UPLOAD')).toMatch(/selfie upload/);
    expect(codeMeaning('something_new', 'X1')).toBe('X1');
  });
  it('funnel words', () => {
    expect(funnelLine({ opened: 6, picked: 3, posted: 2 })).toBe('6 opened → 3 picked → 2 posted');
    expect(funnelRate({ opened: 4, posted: 1 })).toBe('25%');
    expect(funnelRate({ opened: 0, posted: 2 })).toBe('');
    expect(funnelRate({ opened: 2, posted: 5 })).toBe('100%');
    expect(cleanRef(' Pich ')).toBe('pich');
    expect(cleanRef('bad code!')).toBe('');
    expect(cleanRef('x')).toBe('');
  });
});

// shapes returned by 0063 (values made up, codes and agents like the live rows)
const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60000).toISOString();
const sampleProblems: ProblemLog = {
  since: iso(1440), hours: 24,
  totals: { opened: 6, opens: 29, pick_failed: 1, picked: 4, posted: 3, reels: 3, failures: 12, failed_people: 3 },
  days: [{ day: '2026-11-16', opened: 6, opens: 29, pick_failed: 1, picked: 4, posted: 3, reels: 3 }],
  groups: [
    { kind: 'reel_publish_fail', code: 'UPLOAD:0', n: 9, people: 1, last_at: iso(95), details: ['video/mp4 6.7MB 43s 576x1024 inapp'] },
    { kind: 'verify_cam_fail', code: 'NotAllowedError', n: 2, people: 1, last_at: iso(20), details: null },
    { kind: 'reel_pick_fail', code: 'TOO_LONG', n: 1, people: 1, last_at: iso(92), details: ['video/mp4 34MB'] },
  ],
  agents: [{ ua: UA.samsungWv, n: 11, fails: 10, people: 1 }, { ua: UA.chromeAndroid, n: 2, fails: 2, people: 1 }, { ua: UA.lineIos, n: 14, fails: 0, people: 2 }],
  rows: [
    { at: iso(20), member_no: 26, first_name: 'Fon', kind: 'verify_cam_fail', code: 'NotAllowedError', detail: null, ua: UA.chromeAndroid, fail: true },
    { at: iso(92), member_no: 24, first_name: 'Beam', kind: 'reel_pick_fail', code: 'TOO_LONG', detail: 'video/mp4 34MB', ua: UA.samsungWv, fail: true },
    { at: iso(95), member_no: 24, first_name: 'Beam', kind: 'reel_publish_fail', code: 'UPLOAD:0', detail: 'video/mp4 6.7MB 43s 576x1024 inapp', ua: UA.samsungWv, fail: true },
    { at: iso(99), member_no: 24, first_name: 'Beam', kind: 'reel_trim', code: 'open', detail: '75s 34MB inapp', ua: UA.samsungWv, fail: false },
  ],
};
const sampleRecruiters: Recruiters = {
  codes: [
    { code: 'pich', signups: 9, via_link: 8, credited: 1, posted: 4, verified: 5, members: [
      { user_id: 'u1', member_no: 25, first_name: 'Ploy', joined_at: iso(300), src_code: null, verified: true, approved_reels: 2, how: 'link', credited_by: null, credited_at: null },
      { user_id: 'u2', member_no: 21, first_name: 'Nok', joined_at: iso(3000), src_code: 'pwa', verified: true, approved_reels: 1, how: 'credited', credited_by: 'founder@example.com', credited_at: iso(10) },
    ] },
  ],
  no_code: [{ user_id: 'u3', member_no: 22, first_name: 'Som', joined_at: iso(200), src_code: null, verified: false, approved_reels: 0, how: 'none', credited_by: null, credited_at: null }],
  log: [{ at: iso(10), action: 'credit', ref_code: 'pich', prev_code: null, by: 'founder@example.com', member_no: 21, first_name: 'Nok' }],
};

describe('admin Problems page', () => {
  it('accepts the 0063 shape and rejects anything else', () => {
    expect(isProblemLog(sampleProblems)).toBe(true);
    expect(isProblemLog(null)).toBe(false);
    expect(isProblemLog({ ...sampleProblems, groups: [{ code: 'x' }] })).toBe(false);
  });
  it('renders funnel, meanings, phones and latest rows', () => {
    const b = problemsBlock(sampleProblems);
    const t = b.textContent || '';
    expect(b.querySelector('[data-total]')?.getAttribute('data-total')).toBe('6/4/3');
    expect(t).toContain('UPLOAD:0 = the phone lost connection during upload');
    expect(t).toContain('TOO_LONG = clip over 10 min');
    expect(b.querySelector('[data-ua="Samsung SM-S721B · in-app browser"]')?.textContent).toContain('10 failed');
    expect(b.querySelectorAll('.pb-r').length).toBe(4);
    expect(b.querySelectorAll('.pb-r.f').length).toBe(3);
    expect(t).toContain('Beam #24');
    expect(b.querySelector('#pbFails b')?.textContent).toBe('12');
  });
});

describe('admin Recruiters page', () => {
  it('accepts the 0063 shape', () => {
    expect(isRecruiters(sampleRecruiters)).toBe(true);
    expect(isRecruiters({ codes: [] })).toBe(false);
  });
  it('one row per code with totals, how each member came, credit audit and actions', () => {
    const calls: string[] = [];
    const b = recruitersBlock(sampleRecruiters, { credit: (m) => calls.push('credit ' + m.user_id), uncredit: (m) => calls.push('uncredit ' + m.user_id) });
    expect(b.querySelector('[data-code="pich"] [data-sum]')?.getAttribute('data-sum')).toBe('9/4/5');
    expect(b.querySelector('[data-rmember="u2"] [data-credit]')?.textContent).toContain('Credited by founder@example.com');
    expect(b.querySelector('#credit-u1')).toBeNull();   // joined with a link: no credit button, never changed
    (b.querySelector('#credit-u3') as HTMLButtonElement).click();
    (b.querySelector('#uncredit-u2') as HTMLButtonElement).click();
    expect(calls).toEqual(['credit u3', 'uncredit u2']);
    expect(b.querySelector('#rcLog')?.textContent).toContain('founder@example.com credited Nok #21 to pich');
    expect(recruitersBlock(sampleRecruiters, null).querySelector('#credit-u3')).toBeNull();
  });
});

describe('0063 migration', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0065_kr8_admin_problems_recruiters.sql'), 'utf8');
  it('every new function is admin-only and members cannot call it as anon', () => {
    const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
    expect(fns).toEqual(['kr8_admin_problem_log', 'kr8_admin_recruiters', 'kr8_admin_credit_ref', 'kr8_admin_uncredit_ref']);
    for (const f of fns) {
      const body = sql.slice(sql.indexOf(`function public.${f}`)).split('end $$;')[0];
      expect(body).toContain("if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'");
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`));
    }
  });
  it('is additive: no drop, no write to ref_code', () => {
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/\bdrop\b/i);
    expect(code).not.toMatch(/alter table public\.kr8_members/i);
    expect(code).not.toMatch(/update public\.kr8_members/i);
  });
});
