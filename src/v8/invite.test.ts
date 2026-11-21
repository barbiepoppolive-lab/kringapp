// invite-1 (18 Nov): one-tap invite sharing — share URL, LINE fallback, hint text, and the 0109 credit rules.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { friendsLine, inviteHint, invitedByMember, lineShareUrl, liveSeen, markLiveSeen, oneTapShare, pickChannel, pickLiveReel, refCode, shareText, withRef } from './invite';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.3.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};
const BANNED = /\b(meet|guide|tour|host|creator|reviews|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples)\b|ลุ้น/i;

describe('share URL carries my invite code once', () => {
  it('member number → k00184', () => {
    expect(refCode(184)).toBe('k00184');
    expect(refCode('562')).toBe('k00562');
    expect(refCode(null)).toBe('');
    expect(refCode(0)).toBe('');
  });
  it('appends ?ref= to a plain link and & to a link with a query', () => {
    expect(withRef('https://kringapp.com/r/abc2345', 'k00184')).toBe('https://kringapp.com/r/abc2345?ref=k00184');
    expect(withRef('https://kringapp.com/app/?reel=1f', 'k00184')).toBe('https://kringapp.com/app/?reel=1f&ref=k00184');
  });
  it('never duplicates: sharing a link twice, or a link that already has a ref, gives exactly one ref', () => {
    const once = withRef('https://kringapp.com/app/?u=9', 'k00184');
    const twice = withRef(once, 'k00184');
    expect(twice).toBe(once);
    expect(twice.match(/ref=/g)).toHaveLength(1);
    const other = withRef('https://kringapp.com/app/?ref=pich&place=x#top', 'k00184');
    expect(other.match(/ref=/g)).toHaveLength(1);
    expect(other).toBe('https://kringapp.com/app/?place=x&ref=k00184#top');
  });
  it('no code (signed out / no card) or a bad code → the link is unchanged', () => {
    expect(withRef('https://kringapp.com/app/?reel=1', '')).toBe('https://kringapp.com/app/?reel=1');
    expect(withRef('https://kringapp.com/app/?reel=1', 'pich')).toBe('https://kringapp.com/app/?reel=1');
    expect(withRef('https://kringapp.com/app/?reel=1', '<x>')).toBe('https://kringapp.com/app/?reel=1');
  });
});

describe('one tap', () => {
  const deps = (over: Partial<Parameters<typeof oneTapShare>[1]> = {}) => ({
    ua: UA.iphone, lang: 'en', open: vi.fn(), copy: vi.fn(async () => true), toast: vi.fn(), share: vi.fn(async () => undefined), ...over,
  });
  const P = { title: 'Kring · กริ๊ง!', text: shareText('th', 'my_reel'), url: 'https://kringapp.com/r/abc2345?ref=k00184' };

  it('LINE fallback URL is LINE’s official share picker with the text and link', () => {
    expect(lineShareUrl('สวัสดี', 'https://kringapp.com/r/x?ref=k00184'))
      .toBe(`https://line.me/R/share?text=${encodeURIComponent('สวัสดี\nhttps://kringapp.com/r/x?ref=k00184')}`);
  });
  it('picks the channel: LINE browser → LINE picker; share sheet → native; no share sheet → copy', () => {
    expect(pickChannel(UA.line, true)).toBe('line');
    expect(pickChannel(UA.iphone, true)).toBe('native');
    expect(pickChannel(UA.android, false)).toBe('copy');
    expect(pickChannel(UA.desktop, false)).toBe('copy');
  });
  it('phone: opens the share sheet straight away with title, one line and the link (nothing else)', async () => {
    const d = deps();
    expect(await oneTapShare(P, d)).toBe('native');
    expect(d.share).toHaveBeenCalledTimes(1);
    expect(d.share).toHaveBeenCalledWith({ title: P.title, text: P.text, url: P.url });
    expect(d.open).not.toHaveBeenCalled();
    expect(d.toast).not.toHaveBeenCalled();
  });
  it('inside LINE: one tap opens line.me/R/share, never the share sheet', async () => {
    const d = deps({ ua: UA.line });
    expect(await oneTapShare(P, d)).toBe('line');
    // face-fixes 19 Nov: shared from LINE, the link opens in the friend's real browser (openExternalBrowser=1)
    expect(d.open).toHaveBeenCalledWith(lineShareUrl(P.text, 'https://kringapp.com/r/abc2345?ref=k00184&openExternalBrowser=1'));
    expect(d.share).not.toHaveBeenCalled();
  });
  it('closing the share sheet is not a share (no copy, no toast)', async () => {
    const d = deps({ share: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }) });
    expect(await oneTapShare(P, d)).toBe('cancelled');
    expect(d.copy).not.toHaveBeenCalled();
  });
  it('anything else: copy the link + a small "Link copied" toast', async () => {
    const d = deps({ ua: UA.desktop, share: null });
    expect(await oneTapShare(P, d)).toBe('copy');
    expect(d.copy).toHaveBeenCalledWith(P.url);
    expect(d.toast).toHaveBeenCalledWith('Link copied');
    const t = deps({ ua: UA.desktop, share: null, lang: 'th' });
    await oneTapShare(P, t);
    expect(t.toast).toHaveBeenCalledWith('คัดลอกลิงก์แล้ว');
    const refused = deps({ share: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }) });
    expect(await oneTapShare(P, refused)).toBe('copy');
    const blocked = deps({ ua: UA.desktop, share: null, copy: vi.fn(async () => false) });
    await oneTapShare(P, blocked);
    expect(blocked.toast).toHaveBeenCalledWith(P.url);   // copy blocked: the link itself, never a false Link copied
  });
});

describe('copy: one language at a time, founder wording, no banned words', () => {
  it('reward hint, Thai mode = Thai only, English mode = English only, X from config', () => {
    // founder 18 Nov (2nd round): "Friend joins = +10 each" (both get the Rings)
    expect(inviteHint('th')).toBe('เพื่อนสมัคร = ได้ +10 ริง ทั้งคู่');
    expect(inviteHint('en')).toBe('Friend joins = +10 Rings each');
    expect(inviteHint('th', 25)).toBe('เพื่อนสมัคร = ได้ +25 ริง ทั้งคู่');
    expect(inviteHint('en')).not.toMatch(/likes|climb/);
    expect(inviteHint('en', 0)).toContain('+10');   // 0 / missing → default
    expect(inviteHint('th')).not.toMatch(/[A-Za-z]/);
    expect(inviteHint('en')).not.toMatch(/[฀-๿]/);
  });
  it('share text: a short challenge, one line, one language', () => {
    expect(shareText('th', 'my_reel')).toBe('ช่วยกดไลก์คลิปนี้หน่อย! ยิ่งไลก์ยิ่งได้ขึ้นอันดับบนกริ๊ง! 🔥\nสมัครแล้วยืนยันใบหน้า 30 วิ ฉันจะได้ 10 ริง');
    expect(shareText('en', 'my_reel')).toBe('Help me climb! Every like and save on Kring pushes me up the board 🔥\nSign up and do the 30-sec face check so I get 10 Rings');
    for (const lang of ['th', 'en']) for (const k of ['my_reel', 'my_reel_soon', 'reel', 'my_profile', 'profile', 'place', 'invite'] as const) {
      const t = shareText(lang, k, lang === 'th' ? 'มิ้นท์' : 'Mint');
      // invite-face (21 Nov): my own card / Reel shares have one extra short line asking for the 30-sec face check; others' things stay one line
      const lines = t.split('\n');
      expect(lines.length).toBe(['invite', 'my_profile', 'my_reel', 'my_reel_soon'].includes(k) ? 2 : 1);
      for (const ln of lines) expect(ln.length).toBeLessThan(90);
      expect(t).not.toMatch(BANNED);
      if (lang === 'th') expect(t.replace(/Kring/g, '')).not.toMatch(/[A-Za-z]/); else expect(t).not.toMatch(/[฀-๿]/);
    }
  });
  it('invite message asks for the 30-sec face check (21 Nov), one language only', () => {
    expect(shareText('th', 'invite').split('\n')[1]).toBe('สมัครแล้วยืนยันใบหน้า 30 วิ ฉันจะได้ 10 ริง');
    expect(shareText('en', 'invite').split('\n')[1]).toBe('Sign up and do the 30-sec face check so I get 10 Rings');
  });
  it('invitedByMember: only another member\'s k-code counts', () => {
    expect(invitedByMember('k00184', 'k00200')).toBe(true);
    expect(invitedByMember('K00184', '')).toBe(true);
    expect(invitedByMember('k00184', 'k00184')).toBe(false);
    expect(invitedByMember('test1', 'k00200')).toBe(false);
    expect(invitedByMember('', 'k00200')).toBe(false);
  });
  it('Me line', () => {
    expect(friendsLine('en', 2, 20)).toBe('Friends joined: 2 · +20 Rings');
    expect(friendsLine('th', 2, 20)).toBe('เพื่อนที่ชวนมา: 2 · +20 ริง');
    expect(`${inviteHint('en')} ${friendsLine('en', 1, 10)}`).not.toMatch(BANNED);
  });
  it('the app never draws Rings as 💍 next to share', () => {
    for (const f of ['src/v8/invite.ts', 'src/v8/V5Invite.tsx']) expect(readFileSync(f, 'utf8')).not.toContain('💍');
  });
});

describe('app wiring: every share goes through the one tap with my code', () => {
  const app = readFileSync('src/v8/KringAppV8.tsx', 'utf8');
  it('no intermediate Reel share sheet; the feed Share opens the share at once', () => {
    expect(app).not.toContain('id="sh-reelshare"');
    expect(app).not.toContain("openReelSheet(p, 'reelshare')");
    expect(app).toContain('onClick={() => void shareReel(p)}');
  });
  it('profile, invite, Reel and place links all add my ref', () => {
    expect(app).toMatch(/const tapShare = [\s\S]{0,160}shareNow\(/);
    expect(app).toMatch(/const shareNow = [\s\S]{0,120}withRef\(url, getMyRef\(\)\)/);
    expect(app).toContain("shareUrl={(id) => withRef(");
    for (const fn of ['const shareProfile', 'const kxShareInvite', 'const kxShareReelId', 'const shareReel']) {
      const body = app.slice(app.indexOf(fn), app.indexOf(fn) + 700);
      expect(body).toContain('tapShare(');
      expect(body).not.toContain('navigator.share(');
    }
  });
  it('audit 18 Nov: Ask, places and the old share buttons use the same one tap (closing the sheet shows nothing)', () => {
    expect(app).toContain('shareLink={(url, text) => void shareNow(url, text)}');
    expect(app).toContain("shareLink={(url, name) => void shareNow(url, shareText(shareLang, 'place', name))}");
    const h = app.slice(app.indexOf('const handleShareLink'), app.indexOf('const handleShareLink') + 500);
    expect(h).toContain('shareNow(');
    expect(h).not.toContain('Link ready to share');
    expect(app).toContain("tapShare(kxInviteLink(no), 'invite')");
    expect(app).toContain('link: withRef(v5ProfileLink(v5Uid), getMyRef())');   // the QR card (if opened) carries the code too
  });
  it('audit 18 Nov: a shared Reel / profile / place link shows the thing first, not the join sheet', () => {
    expect(app).toContain("q0.get('ref') && !['reel', 'u', 'place', 'v', 'so', 'person'].some((k) => q0.get(k))");
  });
  it('hint only next to existing share buttons (Board + post-success)', () => {
    expect(readFileSync('src/v8/V5KxRanking.tsx', 'utf8')).toContain('<InviteHint lang={lang} x={cfg?.invite} />');   // board-1 v3: inside the Share sheet
    expect(app.match(/<InviteHint /g)).toHaveLength(1);   // post-success only (the Board has its own)
  });
});

describe('0109 credit rules (SQL)', () => {
  const sql = readFileSync('supabase/migrations/0109_kr8_invite_rings.sql', 'utf8');
  const fn = (name: string) => { const i = sql.indexOf(`function public.${name}(`); return sql.slice(i, sql.indexOf('$$;', i)); };
  it('audit 18 Nov: no circle (A invites B, B "invites" A back) and a full UNDO file', () => {
    expect(fn('kr8_invite_pair_ok')).toContain('substring(i.ref_code from 2)::int = f.member_no');
    const undo = readFileSync('supabase/undo/0109_kr8_invite_rings_UNDO.sql', 'utf8');
    for (const f of ['kr8_week_board', 'kr8_score_breakdown', 'kr8_member_rings']) expect(undo).toMatch(new RegExp(`function public\\.${f}\\(`, 'i'));
    expect(undo).not.toContain('kr8_invite_rings(m.author');
    expect(undo).toContain('drop trigger if exists kr8_invite_trg');
  });
  it('is one transaction, re-runnable, with an UNDO block', () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toContain('-- UNDO');
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql).not.toMatch(/create function /);   // always create or replace
  });
  it('X and the daily cap live in kr8_rings_config (default 10 / 20)', () => {
    expect(sql).toContain("('invite', 10,");
    expect(sql).toContain("('invite_day_cap', 20,");
    expect(fn('kr8_invite_try')).toContain("public.kr8_rcfg('invite', 10)");
    expect(fn('kr8_invite_try')).toContain("public.kr8_rcfg('invite_day_cap', 20)");
  });
  it('only after the face check, once per pair, both people, daily cap', () => {
    const t = fn('kr8_invite_try');
    expect(t).toContain('not coalesce(f.verified, false)');
    expect(t).toContain("reason = 'invite' and ref_id = p_friend::text");
    expect(t).toContain("'invite', p_friend::text) on conflict do nothing");
    expect(t).toContain("'invite_welcome', inv::text) on conflict do nothing");
    expect(t).toContain('kr8_bkk_day_start(now())');
    expect(t).toContain('pg_advisory_xact_lock');
  });
  it('no self-invite, no test, no ghost, no duplicate / look-alike accounts (network flags never block)', () => {
    const ok = fn('kr8_invite_pair_ok');
    expect(ok).toContain('p_inviter <> p_friend');
    expect(ok).toContain('kr8_is_test_member(p_inviter)');
    expect(ok).toContain('kr8_is_test_member(p_friend)');
    expect(ok).toContain('coalesce(f.ghost, false)');
    expect(ok).toContain('coalesce(i.ghost, false)');
    expect(ok).toContain("l.reason in ('face', 'face_maybe', 'device')");
    expect(ok).not.toContain("'network'");
  });
  it('counts on the board through the ledger, re-checked when read', () => {
    expect(fn('kr8_week_board')).toContain('kr8_invite_rings(m.author, p_w0, p_w0 + interval');
    expect(fn('kr8_invite_rings')).toContain('kr8_invite_pair_ok');
    expect(fn('kr8_score_breakdown')).toContain("'invites', inv");
    expect(sql).toContain("'invite', 'invite_welcome'));");
    expect(sql).toContain('grant execute on function public.kr8_my_invites() to authenticated');
    expect(sql).toMatch(/revoke all on function public\.kr8_invite_try\(uuid\) from public, anon, authenticated/);
  });
});

describe('founder 18 Nov: share after posting for everyone, "Your Reel is live", QR in my ⋯ menu', () => {
  const app = readFileSync('src/v8/KringAppV8.tsx', 'utf8');
  const go = readFileSync('src/v8/V5Go.tsx', 'utf8');
  it('post-success share shows for approved AND in-review Reels', () => {
    expect(app).not.toContain("if (r.status === 'approved' && r.id) { setPostedShare(r.id)");
    expect(app).toContain("setPostedShare({ id: r.id, mode: 'posted' })");
    expect(app).toContain("else setPostedShare({ id: r.id, mode: 'pending' })");
  });
  it('a Reel in review shares my profile link (+ my ref), never the hidden Reel', () => {
    const f = app.slice(app.indexOf('const sharePosted'), app.indexOf('const sharePosted') + 400);
    expect(f).toContain("if (m.mode === 'pending') { if (v5Uid) void tapShare(v5ProfileLink(v5Uid), 'my_reel_soon'); return; }");
    expect(f).toContain('void kxShareReelId(m.id)');
    expect(shareText('en', 'my_reel_soon')).toBe('My new Reel is coming up on Kring · follow me so you don’t miss it 🔥\nSign up and do the 30-sec face check so I get 10 Rings');
    expect(shareText('th', 'my_reel_soon')).toBe('รีลใหม่ของฉันกำลังจะขึ้นบนกริ๊ง! กดติดตามไว้ก่อนเลย 🔥\nสมัครแล้วยืนยันใบหน้า 30 วิ ฉันจะได้ 10 ริง');
  });
  it('"Your Reel is live": newest team-approved Reel of the last 3 days, once per Reel', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    const h = (n: number) => new Date(now - n * 3600_000).toISOString();
    const rows = [
      { kind: 'like', at: h(0), post_id: 'L' },
      { kind: 'approved', at: h(5), post_id: 'A' },
      { kind: 'approved', at: h(1), post_id: 'B' },
      { kind: 'approved', at: h(80), post_id: 'OLD' },
      { kind: 'hidden', at: h(0), post_id: 'H' },
    ];
    expect(pickLiveReel(rows, [], now)).toBe('B');
    expect(pickLiveReel(rows, ['B'], now)).toBe('A');
    expect(pickLiveReel(rows, ['A', 'B'], now)).toBeNull();
    expect(pickLiveReel(null, [], now)).toBeNull();
    markLiveSeen('u1', 'B'); markLiveSeen('u1', 'B'); markLiveSeen('u1', 'A');
    expect(liveSeen('u1')).toEqual(['B', 'A']);
    expect(liveSeen('u2')).toEqual([]);
    markLiveSeen('u3', ['A', 'B', 'OLD']);   // one moment, the newest; the older approvals never follow on the next open
    expect(pickLiveReel(rows, liveSeen('u3'), now)).toBeNull();
  });
  it('live moment: from kr8_my_activity, on open / back to front / Feed / ding tap; Reels approved on upload never repeat it', () => {
    expect(app).toContain('const id = pickLiveReel(rows, liveSeen(uid));');
    expect(app).toContain("document.addEventListener('visibilitychange', vis);");
    expect(app).toContain("checkReelLiveRef.current(true); return; }");   // the existing "Reel approved" ding (0059) opens it
    expect(app).toContain("if (r.status === 'approved') { if (v5Uid) markLiveSeen(v5Uid, r.id);");
    expect(app).toContain("{L('Your Reel is live')}");
    expect(app).toMatch(/\{postedShare && tab === 'feed' && \(/);
  });
  it('"Show my QR" only on my own profile ⋯ menu, opens the QR card, closing goes back to the profile', () => {
    expect(go).toContain("{p.mine && props.onQr ? <button type=\"button\" role=\"menuitem\" id=\"profileQr\"");
    expect(app).toContain("qrBackRef.current = 'profile'; setSheet('mycode');");
    expect(app).toContain('const back = qrBackRef.current; qrBackRef.current = null; setSheet(back);');
  });
});
