import { describe, expect, it } from 'vitest';
import { DRAFT_MAX_AGE_MS, draftUsable, loadSignInDraft, saveSignInDraft } from './signInDraft';
describe('N · drafts survive sign-in', () => {
  it('kept for 2 hours only', () => {
    const now = Date.now();
    expect(draftUsable({ kind: 'reel', at: now - 1000 }, now)).toBe(true);
    expect(draftUsable({ kind: 'hi', at: now - DRAFT_MAX_AGE_MS - 1 }, now)).toBe(false);
    expect(draftUsable(null, now)).toBe(false);
  });
  it('greeting and caption come back (no IndexedDB in this test: text only, no crash)', async () => {
    await saveSignInDraft({ kind: 'hi', hi: { name: 'Mint', img: '', context: '', id: 'u1', message: 'สวัสดีค่ะ' } });
    const got = await loadSignInDraft();
    expect(got?.draft.hi?.message).toBe('สวัสดีค่ะ');
    expect(got?.video).toBeNull();
  });
});
