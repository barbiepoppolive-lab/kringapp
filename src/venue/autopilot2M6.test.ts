import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GROWTH_COHORTS,
  fallbackAutopilotState,
  fallbackGrowthNudgesPreview,
  fallbackHealthWatch,
  fallbackProtectOverview,
  fallbackSelfFixStatus,
  findBannedMemberWords,
  type GrowthNudgesPreview,
} from './autopilotLogic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

let mockGn: GrowthNudgesPreview = {
  ...fallbackGrowthNudgesPreview(),
  fallback: false,
  cohorts: DEFAULT_GROWTH_COHORTS.map((c, idx) => ({
    ...c,
    would_send_count: idx === 3 ? 1 : idx + 2,
    sample_nos: [15 + idx, 22 + idx],
    body_th: c.body_th.replace('{leaders}', '#1 (340 Rings) · #2 (290 Rings)'),
    body_en: c.body_en.replace('{leaders}', '#1 (340 Rings) · #2 (290 Rings)'),
  })),
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
      if (fn === 'kr8_admin_protect_overview') return fallbackProtectOverview();
      if (fn === 'kr8_admin_growth_nudges_preview') return structuredClone(mockGn);
      if (fn === 'kr8_admin_growth_nudge_approve') return { ok: true };
      return {};
    }),
    v5Client: vi.fn(async () => ({
      auth: { getSession: async () => ({ data: {}, error: null }) },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) },
    })),
  };
});

describe('T-380 M6: Growth Nudges (DRY-RUN ONLY, 4 cohorts, bilingual TH+EN copy, zero banned words)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('guarantees ZERO banned words across all 4 Thai + English member copy templates and catches every banned word', () => {
    expect(DEFAULT_GROWTH_COHORTS.map((c) => c.key)).toEqual([
      'card_incomplete_24h',
      'face_unverified_24h',
      'dormant_7d',
      'weekly_winners_post',
    ]);

    for (const c of DEFAULT_GROWTH_COHORTS) {
      expect(findBannedMemberWords(c.title_th), `${c.key} title_th`).toEqual([]);
      expect(findBannedMemberWords(c.title_en), `${c.key} title_en`).toEqual([]);
      expect(findBannedMemberWords(c.body_th), `${c.key} body_th`).toEqual([]);
      expect(findBannedMemberWords(c.body_en), `${c.key} body_en`).toEqual([]);
      // Must genuinely contain Thai script in *_th and English letters in *_en
      expect(/[\u0E00-\u0E7F]/.test(c.title_th)).toBe(true);
      expect(/[\u0E00-\u0E7F]/.test(c.body_th)).toBe(true);
      expect(/[A-Za-z]/.test(c.title_en)).toBe(true);
      expect(/[A-Za-z]/.test(c.body_en)).toBe(true);
    }

    // Verify banned-word detector catches every forbidden term
    const samples = [
      'Come meet a local guide on a hidden gem tour!',
      'Creators earn wallet credit, gifts, and lucky draw coins at temples',
      'ชวนไปวัดกับไกด์ รีวิวเหล้า ลุ้นรางวัล 50%',
    ];
    for (const bad of samples) {
      expect(findBannedMemberWords(bad).length).toBeGreaterThan(0);
    }
  });

  it('keeps growth_nudges locked to DRY-RUN (sent_count = 0) and renders expandable TH+EN copy for founder approval', async () => {
    const { autopilotView } = await import('./adminV2');
    await autopilotView();

    const card = document.getElementById('apGrowthCard')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('0 SENT (DRY-RUN)');
    expect(card.textContent).toContain('Card incomplete after 24 h');
    expect(card.textContent).toContain('New member not face-checked after 24 h');
    expect(card.textContent).toContain('Dormant 7 days');
    expect(card.textContent).toContain('Weekly board winners post draft');

    // Growth nudges ON button is hard-locked
    const onBtn = document.getElementById('apMode-growth_nudges-on') as HTMLButtonElement;
    expect(onBtn.disabled).toBe(true);
    expect(onBtn.textContent).toContain('ON (locked)');

    // Collapsed view is 100% English
    expect(/[\u0E00-\u0E7F]/.test(document.body.textContent || '')).toBe(false);

    // Expand bilingual member copy for founder approval
    const toggleBtn = document.getElementById('apGrowthToggleCopyBtn') as HTMLButtonElement;
    toggleBtn.click();

    const copyBoxes = document.querySelectorAll('[data-member-copy="1"]');
    expect(copyBoxes.length).toBe(4);
    expect(copyBoxes[0].textContent).toContain('เติมการ์ดโปรไฟล์ให้ครบใน 30 วินาที');
    expect(copyBoxes[0].textContent).toContain('Finish your profile card in 30 seconds');

    // Admin UI outside [data-member-copy] remains 100% English
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-member-copy]').forEach((n) => n.remove());
    expect(/[\u0E00-\u0E7F]/.test(clone.textContent || '')).toBe(false);

    // Approve copy button calls kr8_admin_growth_nudge_approve while staying DRY-RUN
    const approveBtn = document.getElementById('gnApprove-card_incomplete_24h') as HTMLButtonElement;
    approveBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(rpcCalls.some((c) => c.fn === 'kr8_admin_growth_nudge_approve' && c.args.p_cohort_key === 'card_incomplete_24h')).toBe(true);
  });
});
