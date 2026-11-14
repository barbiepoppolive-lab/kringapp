import { describe, expect, it, vi } from 'vitest';

const rows = [
  // real member post, guest view: kr8_feed returns no photo and no author id
  { id: '9b1f2c3d-0000-4000-8000-000000000001', kind: 'ask', area: 'Ari', body: 'Real question', photo: null, event_id: null, here: false, created_at: '', author_id: null,
    author_name: 'Delta', author_photo: null, author_langs: ['EN'], author_who: 'traveller', mine: false, answers: [] },
  { id: '9b1f2c3d-0000-4000-8000-000000000002', kind: 'plan', area: 'Ari', body: 'Real plan', photo: null, event_id: null, here: false, created_at: '', author_id: null,
    author_name: 'Mint', author_photo: null, author_langs: ['TH'], author_who: 'local', mine: false, answers: [] },
  // demo seed post (Bang Pu), guest view
  { id: '3670e009-c72f-5795-8481-930752ccf1de', kind: 'plan', area: 'Bangkok', body: 'Bang Pu', photo: null, event_id: null, here: false, created_at: '', author_id: null,
    author_name: 'มิ้นท์', author_photo: null, author_langs: ['TH'], author_who: 'local', mine: false, answers: [] },
];
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: async () => ({ data: rows, error: null }), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) }));

describe('guest feed avatars', () => {
  it('shows bundled AI avatars on demo seed posts only; real members stay hidden from guests', async () => {
    const { v5Feed } = await import('./v5Live');
    const { NEUTRAL_IMG } = await import('./v8Data');
    const feed = await v5Feed();
    const byId = Object.fromEntries(feed.map((f) => [f.id, f]));
    expect(byId['3670e009-c72f-5795-8481-930752ccf1de'].av).toMatch(/media\/demo\/faces\/mint\.jpg$/);
    expect(byId['9b1f2c3d-0000-4000-8000-000000000001'].av).toBe(NEUTRAL_IMG);   // a real member is never given a face
    expect(byId['9b1f2c3d-0000-4000-8000-000000000002'].av).toBe(NEUTRAL_IMG);   // same first name as a demo Local: still hidden
  });
  it('maps by exact post id only', async () => {
    const { demoPostAvatar } = await import('./v5DemoAvatars');
    expect(demoPostAvatar('3670e009-c72f-5795-8481-930752ccf1de')).toBeTruthy();
    expect(demoPostAvatar('3670e009-c72f-5795-8481-930752ccf1df')).toBeUndefined();
    expect(demoPostAvatar('')).toBeUndefined();
  });
});
