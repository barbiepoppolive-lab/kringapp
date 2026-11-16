/** Admin "Send notification" (16 Nov dings): pure helpers, tested in src/v8/push.test.ts. The screen itself is in adminApp.ts. */

/** The optional link, typed any way the team likes, → a path inside the app ('/app/...'), or null for none, or 'bad'.
 *  Accepts: '/app/?tab=me', '?tab=me', 'tab=deals', 'https://kringapp.com/app/?reel=…', 'kringapp.com/app/'. */
export function normAppLink(raw: string): string | null | 'bad' {
  const s = String(raw || '').trim();
  if (!s) return null;
  let path: string;
  if (/^https?:\/\//i.test(s) || /^(www\.)?kringapp\.com\//i.test(s)) {
    let u: URL;
    try { u = new URL(/^https?:/i.test(s) ? s : 'https://' + s); } catch { return 'bad'; }
    if (!/^(www\.)?kringapp\.com$/i.test(u.hostname)) return 'bad';
    path = u.pathname + u.search + u.hash;
  } else if (s.startsWith('/')) path = s;
  else if (s.startsWith('?')) path = '/app/' + s;
  else if (/^[a-z]+=/.test(s)) path = '/app/?' + s;
  else return 'bad';
  if (path === '/app') path = '/app/';
  return /^\/app\/[A-Za-z0-9_./?=&%#~+-]*$/.test(path) && path.length <= 300 ? path : 'bad';
}

export interface PushForm { all: boolean; memberNo: string; title: string; body: string; link: string }
/** → the RPC arguments for kr8_admin_push_send, or an error line for the screen. */
export function pushSendArgs(f: PushForm): { args: { p_member_no: number | null; p_all: boolean; p_title: string; p_body: string; p_url: string | null } } | { error: string } {
  const title = f.title.trim(), body = f.body.trim();
  if (!title) return { error: 'Add a title' };
  if (title.length > 80) return { error: 'Title: 80 characters at most' };
  if (!body) return { error: 'Add the message' };
  if (body.length > 240) return { error: 'Message: 240 characters at most' };
  const link = normAppLink(f.link);
  if (link === 'bad') return { error: 'The link must be a page inside the app (kringapp.com/app/…)' };
  let no: number | null = null;
  if (!f.all) {
    const m = f.memberNo.trim().replace(/^#/, '');
    if (!/^\d{1,7}$/.test(m)) return { error: 'Type the member no (e.g. 16)' };
    no = Number(m);
  }
  return { args: { p_member_no: no, p_all: f.all, p_title: title, p_body: body, p_url: link } };
}
