import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeTrustWithProtect,
  detectChatScamPhrase,
  detectRingFarmingPairs,
  evaluateReportedPostAction,
  fallbackAutopilotState,
  fallbackHealthWatch,
  fallbackProtectOverview,
  fallbackSelfFixStatus,
  type ProtectOverview,
} from './autopilotLogic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

let mockPr: ProtectOverview = {
  at: '2026-11-18T03:30:00Z',
  mode: 'dry_run',
  counts: {
    scam_chat: 1,
    link_tries: 1,
    ring_farming: 2,
    shared_signals: 1,
    reported_posts_3plus: 1,
  },
  flags: [
    {
      user_id: 'aaaa1111-1111-1111-1111-111111111111',
      member_no: 42,
      name: 'Nok',
      flag_key: 'scam_chat',
      severity: 'red',
      summary: 'money request (2 messages in 14d)',
      detail: { reason: 'money_request', hits_14d: 2 },
      last_at: '2026-11-18T03:20:00Z',
      trust: { score: 25, reasons: ['−25 money request phrase in chat'] },
    },
    {
      user_id: 'bbbb2222-2222-2222-2222-222222222222',
      member_no: 58,
      name: 'Beam',
      flag_key: 'ring_farming',
      severity: 'amber',
      summary: '4/4 Reel likes+saves went to #59 (3 back)',
      detail: { partner_no: 59, given_to_partner: 4, total_given: 4, received_from_partner: 3 },
      last_at: '2026-11-18T03:15:00Z',
      trust: { score: 35, reasons: ['−15 Ring farming pair with #59'] },
    },
  ],
  reported_posts: [
    {
      post_id: 'cccc3333-3333-3333-3333-333333333333',
      author_id: 'aaaa1111-1111-1111-1111-111111111111',
      member_no: 42,
      name: 'Nok',
      kind: 'reel',
      hidden: true,
      reporters: 3,
      latest_at: '2026-11-18T03:25:00Z',
    },
  ],
};

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_autopilot_state') {
        return { ...fallbackAutopilotState(), fallback: false, pg_cron_available: true };
      }
      if (fn === 'kr8_admin_health_watch') return fallbackHealthWatch();
      if (fn === 'kr8_admin_self_fix_status') return fallbackSelfFixStatus();
      if (fn === 'kr8_admin_protect_overview') return structuredClone(mockPr);
      if (fn === 'kr8_admin_protect_dismiss') {
        mockPr = {
          ...mockPr,
          flags: mockPr.flags.filter((f) => !(f.user_id === args.p_user && f.flag_key === args.p_flag_key)),
        };
        return { ok: true };
      }
      return {};
    }),
    v5Client: vi.fn(async () => ({
      auth: { getSession: async () => ({ data: {}, error: null }) },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) },
    })),
  };
});

describe('T-380 M5: Protect Robot (scam chat, link tries, Ring farming, >=3 reports auto-hide, kr8_trust)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('defaults to dry_run and detects money/scam/LINE-hunting phrases in Thai & English without false positives', () => {
    expect(fallbackProtectOverview().mode).toBe('dry_run');

    expect(detectChatScamPhrase('Can you send money urgently via Western Union?')).toBe('money_request');
    expect(detectChatScamPhrase('ตอนนี้ร้อนเงิน ช่วยโอนให้หน่อยได้ไหม')).toBe('money_request');
    expect(detectChatScamPhrase('พร้อมเพย์ ๐๘๑๒๓๔๕๖๗๘')).toBe('money_request');
    expect(detectChatScamPhrase('Join my USDT crypto investment group, guaranteed profit')).toBe('crypto_or_gambling');
    expect(detectChatScamPhrase('สนใจปั่นบาคาร่า เว็บพนันแตกง่าย')).toBe('crypto_or_gambling');
    expect(detectChatScamPhrase('แอดไลน์มาคุยกันนะ line id: bkk99')).toBe('line_hunting');

    // Normal friendly Bangkok messages pass cleanly
    expect(detectChatScamPhrase('ร้านกาแฟแถวอารีย์บรรยากาศดีมาก ลองแวะดูนะ')).toBeNull();
    expect(detectChatScamPhrase('Best pad kra pao spot near Talad Noi!')).toBeNull();
  });

  it('detects mutual Ring-farming pairs while ignoring normal diverse likes', () => {
    const pairs = detectRingFarmingPairs([
      // Pair u1 <-> u2 only like each other (4/4 and 3/3)
      { giver: 'u1', receiver: 'u2' },
      { giver: 'u1', receiver: 'u2' },
      { giver: 'u1', receiver: 'u2' },
      { giver: 'u1', receiver: 'u2' },
      { giver: 'u2', receiver: 'u1' },
      { giver: 'u2', receiver: 'u1' },
      { giver: 'u2', receiver: 'u1' },
      // Normal user u3 likes 4 different creators
      { giver: 'u3', receiver: 'u1' },
      { giver: 'u3', receiver: 'u2' },
      { giver: 'u3', receiver: 'u4' },
      { giver: 'u3', receiver: 'u5' },
    ]);

    expect(pairs.map((p) => `${p.userId}->${p.partnerId}`)).toEqual(['u1->u2', 'u2->u1']);
  });

  it('auto-hides posts at >=3 reports with lossless unhide_post Undo and feeds kr8_trust while preserving shared Wi-Fi = 0 alone', () => {
    expect(evaluateReportedPostAction(2, false, 'on').shouldHideNow).toBe(false);

    const dry = evaluateReportedPostAction(3, false, 'dry_run');
    expect(dry.shouldHideNow).toBe(false);
    expect(dry.dryRunPreview).toBe(true);
    expect(dry.raiseFounderAlert).toBe(true);

    const act = evaluateReportedPostAction(3, false, 'on');
    expect(act.shouldHideNow).toBe(true);
    expect(act.undoKind).toBe('unhide_post');
    expect(act.raiseFounderAlert).toBe(true);

    // Shared Wi-Fi ALONE counts 0 (founder 18 Nov rule preserved!)
    const wifiOnly = computeTrustWithProtect(80, ['+30 face verified'], { sharedWifi: true });
    expect(wifiOnly.score).toBe(80);
    expect(wifiOnly.reasons).not.toContain('−10 same Wi-Fi as a claimer');

    // Scam chat (-25) + shared Wi-Fi (-10 because another warning sign exists) = -35
    const scamPlusWifi = computeTrustWithProtect(80, ['+30 face verified'], {
      hasScamChat: true,
      scamReason: 'money_request',
      sharedWifi: true,
    });
    expect(scamPlusWifi.score).toBe(45);
    expect(scamPlusWifi.reasons).toContain('−25 money request phrase in chat');
    expect(scamPlusWifi.reasons).toContain('−10 same Wi-Fi as a claimer');
  });

  it('renders #apProtectCard in plain English with Dismiss Undo toast and 0 auto-bans', async () => {
    const { autopilotView } = await import('./adminV2');
    await autopilotView();

    const card = document.getElementById('apProtectCard')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('NEVER auto-bans');
    expect(card.textContent).toContain('#42 · Chat scam / LINE hunt');
    expect(card.textContent).toContain('trust 25');   // 18 Nov: words first ("Risky"), the number is faint detail
    expect(card.textContent).toMatch(/Risky|Likely a second account/);
    expect(card.textContent).toContain('REEL by #42 · 3 reports');
    expect(/[\u0E00-\u0E7F]/.test(document.body.textContent || '')).toBe(false);

    const dismissBtn = document.getElementById('pfDismiss-aaaa1111-1111-1111-1111-111111111111-scam_chat') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    dismissBtn.click();
    expect(document.getElementById('apProtectCard')!.textContent).toContain('1 active');
  });
});
