// T-210 · social-send Edge Function core: rails come from the DB (prepare), the slot is always freed on failure,
// tokens never leave the function, and without Reddit secrets nothing is reserved.
import { describe, expect, it } from 'vitest';
import { socialSend, threadFullname, type RedditEnv, type SocialDb } from '../../supabase/functions/social-send/core';
import { mentionsKring } from '../venue/socialAdmin';

const ID = '11111111-2222-4333-8444-555555555555';
const ENV: RedditEnv = { clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rtok', userAgent: 'web:test:1.0 (by /u/x)' };
const THREAD = 'https://www.reddit.com/r/Bangkok/comments/1abc2d/where_to_eat/';

function mkDb(prepareErr?: string) {
  const log: string[] = [];
  const db: SocialDb = {
    prepare: async (id) => { log.push('prepare:' + id); if (prepareErr) throw new Error(prepareErr); return { text: 'Try the khao man gai.', thread_url: THREAD }; },
    done: async (_id, url) => { log.push('done:' + url); },
    fail: async (_id, e) => { log.push('fail:' + e); },
  };
  return { db, log };
}
function mkFetch(token: unknown, comment: unknown, ok = [true, true]) {
  const seen: { url: string; headers: Record<string, string>; body: URLSearchParams }[] = [];
  const f = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    seen.push({ url, headers: init.headers, body: new URLSearchParams(init.body) });
    const first = url.includes('access_token');
    return { ok: first ? ok[0] : ok[1], status: (first ? ok[0] : ok[1]) ? 200 : 403, json: async () => (first ? token : comment) };
  }) as unknown as typeof fetch;
  return { f, seen };
}
const okComment = { json: { errors: [], data: { things: [{ data: { permalink: '/r/Bangkok/comments/1abc2d/where_to_eat/kx1/' } }] } } };

describe('social-send', () => {
  it('posts on the thread with the refresh token, stores the comment link', async () => {
    const { db, log } = mkDb();
    const { f, seen } = mkFetch({ access_token: 'AT', scope: 'submit' }, okComment);
    const r = await socialSend({ id: ID }, ENV, db, f);
    expect(r).toEqual({ status: 200, body: { result_url: 'https://www.reddit.com/r/Bangkok/comments/1abc2d/where_to_eat/kx1/' } });
    expect(seen[0].body.get('grant_type')).toBe('refresh_token');
    expect(seen[0].headers.Authorization).toBe('Basic ' + btoa('cid:csecret'));
    expect(seen[1].url).toBe('https://oauth.reddit.com/api/comment');
    expect(seen[1].headers.Authorization).toBe('Bearer AT');
    expect(seen[1].body.get('thing_id')).toBe('t3_1abc2d');
    expect(seen[1].body.get('text')).toBe('Try the khao man gai.');
    expect(log).toEqual(['prepare:' + ID, 'done:https://www.reddit.com/r/Bangkok/comments/1abc2d/where_to_eat/kx1/']);
    expect(JSON.stringify(r)).not.toMatch(/AT"|rtok|csecret/);
  });
  it('no Reddit secrets → REDDIT_OFF and the queue is not touched', async () => {
    const { db, log } = mkDb();
    const r = await socialSend({ id: ID }, { ...ENV, refreshToken: '' }, db, mkFetch({}, {}).f);
    expect(r).toEqual({ status: 503, body: { error: 'REDDIT_OFF' } });
    expect(log).toEqual([]);
  });
  it('a DB rail refusing (too soon, day limit, 9:1) is passed through and Reddit is never called', async () => {
    for (const code of ['KR8_SOCIAL_TOO_SOON', 'KR8_SOCIAL_DAY_LIMIT', 'KR8_SOCIAL_RATIO']) {
      const { db } = mkDb(`ERROR: ${code}`);
      const { f, seen } = mkFetch({}, {});
      expect(await socialSend({ id: ID }, ENV, db, f)).toEqual({ status: 409, body: { error: code } });
      expect(seen.length).toBe(0);
    }
    expect((await socialSend({ id: ID }, ENV, mkDb('KR8_ADMIN_ONLY').db, mkFetch({}, {}).f)).status).toBe(403);
  });
  it('Reddit auth failure, missing submit scope, or comment error → slot freed with the reason', async () => {
    let m = mkDb();
    expect((await socialSend({ id: ID }, ENV, m.db, mkFetch({ error: 'invalid_grant' }, {}, [false, true]).f)).body.error).toBe('REDDIT_AUTH_403');
    expect(m.log.pop()).toBe('fail:REDDIT_AUTH_403');
    m = mkDb();
    expect((await socialSend({ id: ID }, ENV, m.db, mkFetch({ access_token: 'AT', scope: 'identity read' }, {}).f)).body.error).toBe('REDDIT_NO_SUBMIT_SCOPE');
    m = mkDb();
    const r = await socialSend({ id: ID }, ENV, m.db, mkFetch({ access_token: 'AT', scope: 'submit' }, { json: { errors: [['RATELIMIT', 'you are doing that too much', 'ratelimit']] } }).f);
    expect(r).toEqual({ status: 502, body: { error: 'REDDIT_RATELIMIT' } });
    expect(m.log.pop()).toBe('fail:REDDIT_RATELIMIT');
  });
  it('bad request ids are refused before anything', async () => {
    const { db, log } = mkDb();
    expect((await socialSend({ id: "x'; drop" }, ENV, db, mkFetch({}, {}).f)).status).toBe(400);
    expect(log).toEqual([]);
  });
  it('thread ids and Kring detection', () => {
    expect(threadFullname(THREAD)).toBe('t3_1abc2d');
    expect(threadFullname('https://old.reddit.com/r/ThailandTourism/comments/zz9y8x')).toBe('t3_zz9y8x');
    expect(threadFullname('https://evil.example/r/Bangkok/comments/1abc2d/')).toBeNull();
    expect(mentionsKring('I built KringApp for this')).toBe(true);
    expect(mentionsKring('ลองใช้กริ๊ง!')).toBe(true);
    expect(mentionsKring('Try the khao man gai')).toBe(false);
  });
});
