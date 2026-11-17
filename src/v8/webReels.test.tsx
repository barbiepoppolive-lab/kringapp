// 0078 (17 Nov): "Show my Reels on the web". Off until the member says yes (Thai PDPA); the public kringapp.com pages only ever get
// safe fields from kr8_web_reels.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { MeView } from './V5Me';
import { V5_L } from './v5Strings';
import type { V5Profile } from './v5Live';

describe('Me: the one-time ask', () => {
  const L = (s: string) => s;
  const Lf = (s: string, ...a: string[]) => a.reduce((x, v, i) => x.replace(`{${i}}`, v), s);
  const p = { user_id: 'u', first_name: 'Ploy', photo: null, langs: ['TH'], bio: '', area: 'Ari', who: 'local', verified: true, ig_handle: null, interests: [],
    member_no: '00037', online: true, here: false, mine: true, level: { level: 'tea', posts: 3, visits: 0, points: 15, next: 'pandan', need_points: 10, pct: 60 },
    followers: 1, following: 1, likes: 1, gifts: 0, i_follow: false, follows_me: false, reels: [] } as unknown as V5Profile;
  const view = (slot: React.ReactNode) => (
    <div className="v8-app-root">
      <MeView L={L} Lf={Lf as never} p={p} rank={null} posters={{}} savedCount={0} savedImgs={[]} unread={false} verifyState="verified" onTop10={() => undefined}
        onList={() => undefined} onSettings={() => undefined} onActivity={() => undefined} onEdit={() => undefined} onShare={() => undefined} onCode={() => undefined}
        onSaved={() => undefined} onRewards={() => undefined} onReel={() => undefined} onPost={() => undefined} onVerify={() => undefined} kx={null}
        reelsSlot={<div id="slot" />} webAskSlot={slot} />
    </div>
  );
  it('shows the ask card when given, nothing otherwise', () => {
    const a = render(view(<div id="meWebAsk" />));
    expect(a.container.querySelector('#meWebAsk')).toBeTruthy();
    a.unmount();
    const b = render(view(null));
    expect(b.container.querySelector('#meWebAsk')).toBeNull();
  });
  it('every new line has Thai', () => {
    for (const k of ['Show my Reels on the web', 'Approved Reels get a public page on kringapp.com. First name and area only.', 'Let your Reels show up on Google?',
      'Each approved Reel gets its own page on kringapp.com. First name and area only. Change it any time in Settings.', 'Yes, show them', 'No thanks',
      'Your Reels can now show on kringapp.com', 'Your Reels stay in the app only', 'Could not save. Try again.']) expect(V5_L.th[k], k).toBeTruthy();
  });
});

describe('0078 migration', () => {
  const sql = readFileSync('supabase/migrations/0078_kr8_web_reels.sql', 'utf8');
  it('is additive, one transaction, no policy changes', () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).not.toMatch(/^\s*(drop|truncate|delete from)\b/im);
    expect(sql).not.toMatch(/disable row level security|create policy|alter policy/i);
    expect(sql).toMatch(/add column if not exists web_reels boolean;/);   // no default: NULL = never asked = off
  });
  it('the public rule needs the member\'s yes and leaves out ghost, team, test, Feed-only and hidden', () => {
    const rule = /function public\.kr8_web_public_post[\s\S]*?\$\$;/.exec(sql)![0];
    for (const bit of ['m.web_reels is true', 'not coalesce(m.ghost, false)', 'not public.kr8_is_team(p.author)', 'not public.kr8_is_test_member(p.author)',
      'not coalesce(p.board_off, false)', 'not p.hidden', "p.status = 'approved'"]) expect(rule).toContain(bit);
  });
  it('the anon list returns only safe fields', () => {
    const fn = /function public\.kr8_web_reels\([\s\S]*?end \$\$;/.exec(sql)![0];
    const keys = [...fn.matchAll(/'([a-z_]+)', /g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(['area', 'at', 'caption', 'dur', 'h', 'name', 'outside', 'place_en', 'place_th', 'short', 'w'].sort());
    expect(fn).not.toMatch(/'(user_id|author|member_no|email|ig_handle|tiktok_handle|lat|lng|poster_path|video_path)'/);
  });
  it('storage paths only with the server secret; member switches need a sign-in', () => {
    expect(sql).toMatch(/kr8_web_reel_media[\s\S]*?share_open_key[\s\S]*?KR8_FORBIDDEN/);
    expect(sql).toMatch(/revoke all on function public\.kr8_set_web_reels\(boolean\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.kr8_web_public_post\(uuid\) from public, anon, authenticated;/);
  });
});
