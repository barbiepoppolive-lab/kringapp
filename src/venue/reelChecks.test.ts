import { describe, expect, it } from 'vitest';
import { appOf, copyLabel, feedLabel, feedOffReason, loadReelChecks, setReelFeed, type ReelCheck } from './reelChecks';
import { ageVerdict, copyHits, copySummary, scanFramePaths } from '../../supabase/functions/face-check-aws/copyscan';

// Shaped like the 19 Nov live audit (kr8_reel_copy_checks): #160's clip with the TikTok end mark, #66's alamy stock clip,
// #68's Grok clip, #63's dog-fair poster that only shows @tags, and a clean Reel.
const base: ReelCheck = { post_id: 'p', copied: false, copy_kind: null, watermark: null, verdict: 'KEEP_IN_FEED', reasons: ['no place tagged'], feed_off: false, feed_off_reason: null };

describe('copied label on admin Reel cards', () => {
  it('names the app from the watermark text', () => {
    expect(copyLabel({ copied: true, copy_kind: 'app_watermark', watermark: 'TikTok' })).toBe("⚠️ Looks copied from TikTok (watermark 'TikTok')");
    expect(copyLabel({ copied: true, copy_kind: 'app_watermark', watermark: 'ل TikTok' })).toBe("⚠️ Looks copied from TikTok (watermark 'ل TikTok')");
    expect(copyLabel({ copied: true, copy_kind: 'app_watermark', watermark: 'Lemon8' })).toContain('copied from Lemon8');
    expect(appOf('ติ๊กต็อก')).toBe('TikTok');
    expect(appOf('CapCut template')).toBe('CapCut');
    expect(appOf('something')).toBe('another app');
  });
  it('says stock / AI / @handle in plain words, and nothing for a clean Reel', () => {
    expect(copyLabel({ copied: true, copy_kind: 'stock_watermark', watermark: 'alamy' })).toBe("⚠️ Stock video, not filmed by them (watermark 'alamy')");
    expect(copyLabel({ copied: true, copy_kind: 'ai_watermark', watermark: 'Grok' })).toBe("⚠️ AI-made video (watermark 'Grok')");
    expect(copyLabel({ copied: true, copy_kind: 'handle_only', watermark: '@a3b' })).toBe("Shows someone's @name ('@a3b') — check it is their own");
    expect(copyLabel(base)).toBeNull();
    expect(copyLabel(null)).toBeNull();
  });
});

describe('feed line + Hide from feed', () => {
  it('shows the suggestion without the "no place tagged" noise (every Reel has no place yet)', () => {
    expect(feedLabel({ ...base, verdict: 'SUGGEST_FEED_OFF', reasons: ['blurry', 'no place tagged'] })).toBe('Suggest: hide from feed · blurry');
    expect(feedLabel(base)).toBeNull();
  });
  it('a hidden-from-feed Reel says so and that the rest stays', () => {
    expect(feedLabel({ ...base, feed_off: true, feed_off_reason: 'blurry' })).toBe('Hidden from feed · blurry (profile, Rings and saves unchanged)');
  });
  it('the saved reason is the main suggestion, else the watermark, else the founder', () => {
    expect(feedOffReason({ ...base, reasons: ['very dark', 'no person seen', 'no place tagged'] })).toBe('very dark');
    expect(feedOffReason({ ...base, reasons: ['no place tagged'], copied: true, copy_kind: 'app_watermark', watermark: 'TikTok' })).toBe("Looks copied from TikTok (watermark 'TikTok')");
    expect(feedOffReason({ ...base, reasons: [] })).toBe("Founder's choice");
  });
  it('loads checks once per Reel and falls back to nothing before 0147', async () => {
    const calls: unknown[] = [];
    const ok = async <T,>(fn: string, args?: Record<string, unknown>) => { calls.push([fn, args]); return [{ ...base, post_id: 'a' }] as unknown as T; };
    const m = await loadReelChecks(ok, ['a', 'a', '', 'b']);
    expect(calls).toEqual([['kr8_admin_reel_checks', { p_ids: ['a', 'b'] }]]);
    expect(m.get('a')?.verdict).toBe('KEEP_IN_FEED');
    const fail = async <T,>(): Promise<T> => { throw new Error('function kr8_admin_reel_checks does not exist'); };
    expect((await loadReelChecks(fail, ['a'])).size).toBe(0);
    expect((await loadReelChecks(ok, [])).size).toBe(0);
  });
  it('one tap sends the right call (reason only when hiding)', async () => {
    const calls: unknown[] = [];
    const r = async <T,>(fn: string, args?: Record<string, unknown>) => { calls.push([fn, args]); return { id: 'a', feed_off: !!args?.p_off, reason: null } as unknown as T; };
    await setReelFeed(r, 'a', true, 'blurry');
    await setReelFeed(r, 'a', false, 'ignored');
    expect(calls).toEqual([['kr8_admin_reel_feed', { p_reel: 'a', p_off: true, p_reason: 'blurry' }], ['kr8_admin_reel_feed', { p_reel: 'a', p_off: false, p_reason: null }]]);
  });
});

describe('robot rules (face-check-aws copyscan)', () => {
  // DetectText lines as AWS returned them on 19 Nov (#158 / #160 poster, #63 dog fair, a clean café Reel)
  const tiktok = [{ DetectedText: 'TikTok', Type: 'LINE', Confidence: 99 }, { DetectedText: '@sirilak_mposh54', Type: 'LINE', Confidence: 98 }, { DetectedText: 'TikTok', Type: 'WORD', Confidence: 99 }];
  it('finds the TikTok watermark and the handle, once each', () => {
    const h = copyHits(tiktok, 'poster');
    expect(h).toEqual([{ text: 'TikTok', at: 'poster', why: 'tiktok' }, { text: '@sirilak_mposh54', at: 'poster', why: '@handle' }]);
    expect(copySummary(h)).toEqual({ copied: true, kind: 'app_watermark', watermark: 'TikTok', app: 'TikTok' });
  });
  it('stock, AI and @handle-only are told apart; shop signs are not watermarks', () => {
    expect(copySummary(copyHits([{ DetectedText: 'alamy', Confidence: 95 }], '12.0s')).kind).toBe('stock_watermark');
    expect(copySummary(copyHits([{ DetectedText: '0 Grok', Confidence: 95 }], 'poster'))).toMatchObject({ kind: 'ai_watermark', watermark: '0 Grok' });
    expect(copySummary(copyHits([{ DetectedText: 'BKK DOG FAIR' }, { DetectedText: 'LONGUUM @a3b blw' }], '16.0s'))).toMatchObject({ kind: 'handle_only', watermark: 'LONGUUM @a3b blw' });
    expect(copySummary(copyHits([{ DetectedText: 'Dirty cafe' }, { DetectedText: 'OPEN EVERYDAY' }, { DetectedText: '@' }], 'poster'))).toEqual({ copied: false, kind: null, watermark: null, app: null });
    expect(copyHits([{ DetectedText: 'TikTok', Confidence: 40 }], 'poster')).toEqual([]);
    expect(copyHits(null, 'poster')).toEqual([]);
  });
  it('age verdict: AWS top < 20 likely minor, low < 18 and top < 24 check', () => {
    expect(ageVerdict({ Low: 9, High: 15 })).toBe('LIKELY_MINOR');
    expect(ageVerdict({ Low: 13, High: 19 })).toBe('LIKELY_MINOR');
    expect(ageVerdict({ Low: 15, High: 21 })).toBe('CHECK');
    expect(ageVerdict({ Low: 18, High: 22 })).toBe('OK');
    expect(ageVerdict({ Low: 16, High: 24 })).toBe('OK');
    expect(ageVerdict(null)).toBeNull();
  });
  it('scan frames sit next to the video', () => {
    expect(scanFramePaths('u1/v.mp4')).toEqual(['u1/v.mp4.s1.jpg', 'u1/v.mp4.s2.jpg']);
  });
});
