import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_SLOT_MODEL,
  executeAiSlotSafe,
  fallbackAiSlotStatus,
  fallbackAutopilotState,
  fallbackGrowthNudgesPreview,
  fallbackHealthWatch,
  fallbackProtectOverview,
  fallbackSelfFixStatus,
  findBannedMemberWords,
  guardAiPayload,
} from './autopilotLogic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

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
      if (fn === 'kr8_admin_growth_nudges_preview') return fallbackGrowthNudgesPreview();
      if (fn === 'kr8_admin_ai_slot_status') {
        return { ...fallbackAiSlotStatus(), fallback: false };
      }
      if (fn === 'kr8_ai_call') {
        return {
          ok: true,
          task: args.p_task,
          model: AI_SLOT_MODEL,
          used_ai: false,
          fallback_reason: 'robot_off',
          output: { headline: '+3 real member(s) today · 0 held payout(s) (THB 0) · 12 voucher(s) left · 0 error(s) in 24h.' },
        };
      }
      return {};
    }),
    v5Client: vi.fn(async () => ({
      auth: { getSession: async () => ({ data: {}, error: null }) },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) },
    })),
  };
});

describe('T-380 M7: AI Slot (BUILT, OFF · xiaomi/mimo-v2-flash:free · PII Firewall · Rules Fallback)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('defaults to OFF with zero keys in code or SQL and restricts tasks to morning_brief, error_explain, caption_draft', () => {
    const st = fallbackAiSlotStatus();
    expect(st.mode).toBe('off');
    expect(st.model).toBe('xiaomi/mimo-v2-flash:free');
    expect(st.secret_configured).toBe(false);
    expect(st.fallback_active).toBe(true);

    // Verify no OpenRouter API key literal exists in migration or TS logic
    const sql = fs.readFileSync('supabase/migrations/0104_kr8_autopilot2_m7.sql', 'utf8');
    const ts = fs.readFileSync('src/venue/autopilotLogic.ts', 'utf8');
    expect(/sk-or-v1-[A-Za-z0-9]{16,}/.test(sql)).toBe(false);
    expect(/sk-or-v1-[A-Za-z0-9]{16,}/.test(ts)).toBe(false);

    // Forbidden tasks are blocked immediately
    expect(() => guardAiPayload('ban_member', { count: 1 })).toThrow(/KR8_AI_TASK_FORBIDDEN/);
    expect(() => guardAiPayload('approve_payout', { thb: 100 })).toThrow(/KR8_AI_TASK_FORBIDDEN/);
    expect(() => guardAiPayload('score_face', { ok: true })).toThrow(/KR8_AI_TASK_FORBIDDEN/);
  });

  it('BLOCKS member names, chats, photos, storage paths, emails, and 128-d face vectors (even when nested or OFF)', async () => {
    // 1. Member names
    expect(() => guardAiPayload('morning_brief', { first_name: 'Mint' })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);
    expect(() => guardAiPayload('morning_brief', { nested: { name: 'Ploy' } })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);

    // 2. Chats / messages
    expect(() => guardAiPayload('error_explain', { chat: 'hello there' })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);
    expect(() => guardAiPayload('error_explain', { messages: [{ text: 'hi' }] })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);

    // 3. Photos / base64 images / Supabase storage paths
    expect(() => guardAiPayload('caption_draft', { photo: 'https://example.com/a.jpg' })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);
    expect(() => guardAiPayload('caption_draft', { selfie_path: '11111111-2222-3333-4444-555555555555/abcd.jpg' })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);
    expect(() => guardAiPayload('caption_draft', { vibe: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);
    expect(() => guardAiPayload('caption_draft', { note: 'https://wulfcffljfuhrvjzrvuv.supabase.co/storage/v1/object/sign/kr8-verify/a.jpg' })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);

    // 4. Face data / 128-d embeddings
    const emb128 = Array.from({ length: 128 }, (_, i) => i * 0.01);
    expect(() => guardAiPayload('morning_brief', { emb: emb128 })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);
    expect(() => guardAiPayload('morning_brief', { metrics: [emb128] })).toThrow(/KR8_AI_PRIVACY_BLOCKED/);

    // Even when slot is OFF, executeAiSlotSafe still rejects PII first!
    await expect(
      executeAiSlotSafe('morning_brief', { first_name: 'Mint' }, { mode: 'off', hasSecret: false }),
    ).rejects.toThrow(/KR8_AI_PRIVACY_BLOCKED/);
  });

  it('falls back cleanly to rules when OFF, missing key, or provider fails — and checks caption drafts for banned words', async () => {
    const offRes = await executeAiSlotSafe(
      'morning_brief',
      { new_members_today: 5, held_count: 1, held_thb: 100, available_vouchers: 4, errors_24h: 0 },
      { mode: 'off', hasSecret: false },
    );
    expect(offRes.used_ai).toBe(false);
    expect(offRes.fallback_reason).toBe('robot_off');
    expect(offRes.output.headline).toContain('+5 real member(s) today');
    expect(offRes.output.next_step).toContain('Top up voucher codes');

    const missingKeyRes = await executeAiSlotSafe(
      'error_explain',
      { error_code: 'STORAGE_TIMEOUT', subsystem: 'kr8-reels' },
      { mode: 'on', hasSecret: false },
    );
    expect(missingKeyRes.used_ai).toBe(false);
    expect(missingKeyRes.fallback_reason).toBe('missing_secret');

    // Provider error -> clean rules fallback
    const failRes = await executeAiSlotSafe(
      'caption_draft',
      { area: 'Ari', vibe: 'specialty coffee' },
      {
        mode: 'on',
        hasSecret: true,
        providerCall: async () => {
          throw new Error('503 upstream');
        },
      },
    );
    expect(failRes.used_ai).toBe(false);
    expect(failRes.fallback_reason).toBe('provider_error_fallback');
    expect(findBannedMemberWords(failRes.output.caption_th)).toEqual([]);
    expect(findBannedMemberWords(failRes.output.caption_en)).toEqual([]);
  });

  it('renders #apAiCard in plain English showing OFF · RULES FALLBACK and runs safe rules fallback test', async () => {
    const { autopilotView } = await import('./adminV2');
    await autopilotView();

    const card = document.getElementById('apAiCard')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('AI helper slot · OFF');
    expect(card.textContent).toContain('xiaomi/mimo-v2-flash:free');
    expect(card.textContent).toContain('OFF · RULES FALLBACK');
    expect(/[\u0E00-\u0E7F]/.test(document.body.textContent || '')).toBe(false);

    const testBtn = document.getElementById('apAiTestFallbackBtn') as HTMLButtonElement;
    testBtn.click();
    await new Promise((r) => setTimeout(r, 25));

    const out = document.getElementById('apAiOut')!;
    expect(out.textContent).toContain('Rules fallback (robot_off)');
  });
});
