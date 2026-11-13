// T-202: ?ref= / ?src= captured on first open, kept through the email-code sign-in, sent once the member has a card.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: [string, Record<string, unknown>][] = [];
let fail = false;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      return fail ? { data: null, error: { message: 'KR8_NO_CARD' } } : { data: args.p_code, error: null };
    },
    auth: {},
  }),
}));

import { v5CaptureAttribution, v5SyncAttribution } from './v5Live';

describe('recruiter + channel attribution', () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; fail = false; });

  it('keeps the first ?ref= and ?src= seen on this phone, lower-cased', () => {
    v5CaptureAttribution('?ref=Pich&src=stay-ari01');
    v5CaptureAttribution('?ref=someone_else&src=ads-tt');
    expect(localStorage.getItem('kr8_ref')).toBe('pich');
    expect(localStorage.getItem('kr8_src')).toBe('stay-ari01');
  });
  it('ignores bad codes', () => {
    v5CaptureAttribution('?ref=a&src=%3Cscript%3E');
    expect(localStorage.getItem('kr8_ref')).toBeNull();
    expect(localStorage.getItem('kr8_src')).toBeNull();
  });
  it('before the card exists the call fails quietly and is retried after sign-in', async () => {
    v5CaptureAttribution('?ref=pich');
    fail = true;
    await v5SyncAttribution();
    expect(localStorage.getItem('kr8_ref_sent')).toBeNull();
    fail = false;
    await v5SyncAttribution();
    expect(calls.filter((c) => c[0] === 'kr8_set_ref').pop()).toEqual(['kr8_set_ref', { p_code: 'pich' }]);
    expect(localStorage.getItem('kr8_ref_sent')).toBe('pich');
  });
  it('sends each code once', async () => {
    v5CaptureAttribution('?ref=pich&src=ads-line');
    await v5SyncAttribution();
    await v5SyncAttribution();
    expect(calls.map((c) => c[0])).toEqual(['kr8_set_ref', 'kr8_set_src']);
  });
});
