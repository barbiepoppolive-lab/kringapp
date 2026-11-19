/**
 * Admin "Problems" + "Recruiters" (16 Nov, migration 0063): data shapes, plain-English meanings for phone-side failure codes,
 * and a small user-agent reader (device + in-app browser). No DOM here, so it is unit-tested directly.
 */

// ───────────────────────────── shapes (kr8_admin_problem_log / kr8_admin_recruiters) ─────────────────────────────
export type FunnelDay = { day: string; opened: number; opens: number; pick_failed: number; picked: number; posted: number; reels: number };
export type ProblemTotals = Omit<FunnelDay, 'day'> & { failures: number; failed_people: number };
export type ProblemGroup = { kind: string; code: string | null; n: number; people: number; last_at: string; details: string[] | null };
export type ProblemAgent = { ua: string | null; n: number; fails: number; people: number };
export type ProblemRow = { at: string; member_no: number | null; first_name: string | null; kind: string; code: string | null; detail: string | null; ua: string | null; fail: boolean };
export type ProblemLog = { since: string; hours: number; totals: ProblemTotals; days: FunnelDay[]; groups: ProblemGroup[]; agents: ProblemAgent[]; rows: ProblemRow[] };

export function isProblemLog(v: unknown): v is ProblemLog {
  const o = v as ProblemLog | null;
  return !!o && typeof o.hours === 'number' && !!o.totals && typeof o.totals.failures === 'number'
    && Array.isArray(o.days) && Array.isArray(o.groups) && Array.isArray(o.agents) && Array.isArray(o.rows)
    && o.groups.every((g) => !!g && typeof g.kind === 'string' && typeof g.n === 'number')
    && o.rows.every((r) => !!r && typeof r.kind === 'string' && typeof r.at === 'string');
}

export type RecruitMember = { user_id: string; member_no: number | null; first_name: string | null; joined_at: string; src_code: string | null;
  verified: boolean; approved_reels: number; how: 'link' | 'credited' | 'none'; credited_by: string | null; credited_at: string | null };
export type RecruitCode = { code: string; signups: number; via_link: number; credited: number; posted: number; verified: number; members: RecruitMember[] };
export type CreditLog = { at: string; action: 'credit' | 'remove'; ref_code: string | null; prev_code: string | null; by: string | null; member_no: number | null; first_name: string | null };
export type Recruiters = { codes: RecruitCode[]; no_code: RecruitMember[]; log: CreditLog[] };

export function isRecruiters(v: unknown): v is Recruiters {
  const o = v as Recruiters | null;
  return !!o && Array.isArray(o.codes) && Array.isArray(o.no_code) && Array.isArray(o.log)
    && o.codes.every((c) => !!c && typeof c.code === 'string' && typeof c.signups === 'number' && Array.isArray(c.members))
    && o.no_code.every((m) => !!m && typeof m.user_id === 'string');
}

/** Same rule as the database (kr8_admin_credit_ref): lower case, 2–30 of a-z 0-9 _ -. Returns '' when not valid. */
export function cleanRef(s: string): string {
  const c = s.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,29}$/.test(c) ? c : '';
}

// ───────────────────────────── what each kind / code means ─────────────────────────────
export const KIND_NAME: Record<string, string> = {
  reel_pick_fail: 'Clip refused when picked', reel_publish_fail: 'Reel did not post', reel_trim: 'Trim step',
  verify_fail: 'Face check did not send', verify_cam_fail: 'Face check camera', reel_open: 'Reel screen opened',
  card_photo_no: 'Card photo refused', card_photo_review: 'Card photo let through for review', verify_live_fail: 'Face check timed out / failed',
  verify_later: 'Face check: “Do it later” after a fail', verify_cam_open: 'Face check: tapped Open in browser', verify_slow: 'Face check: slow phone, more time given',
};
export const kindName = (k: string) => KIND_NAME[k] || k.replace(/_/g, ' ');

const PICK: Record<string, string> = {
  TOO_LONG: 'clip over 10 min', TOO_SHORT: 'clip under 5 seconds', NOT_VERTICAL: 'clip is sideways (landscape), not vertical',
  TOO_BIG: 'file over 300 MB', HEVC: 'HEVC ("High efficiency") clip this browser can’t open',
  UNREADABLE: 'the browser couldn’t read the clip (often a cloud-only file or an in-app browser)',
  NOT_LOCAL: 'the phone couldn’t hand over the clip’s bytes even after 4 tries (cloud / Google Photos clip not downloaded)',
  EMPTY: 'file is 0 KB (a cloud file that was never downloaded)', NOT_VIDEO: 'not a video file',
};
const PUBLISH: Record<string, string> = {
  SIGN_IN: 'not signed in any more when Post was tapped', REPICK: 'the phone lost the video file; the member has to pick it again',
  INTERRUPTED: 'the screen closed while the Reel was being prepared', TOO_BIG: 'still over 50 MB after shrinking',
  TRIM_FAIL: 'the phone couldn’t cut the long clip', HEVC: 'HEVC clip this browser can’t open', UNREADABLE: 'the browser couldn’t read the clip',
};
const CAM: Record<string, string> = {
  NotAllowedError: 'camera permission blocked (the member tapped Block, or the browser blocks it)',
  NotFoundError: 'no front camera found', OverconstrainedError: 'no front camera found',
  NotReadableError: 'camera busy (another app is using it)', AbortError: 'camera start was cut off',
  SecurityError: 'this browser doesn’t allow the camera here (often an in-app browser)', UNKNOWN: 'camera did not start (no reason given)',
};
const VERIFY: Record<string, string> = {
  UPLOAD: 'the selfie upload failed (connection)', OFFLINE: 'the phone was offline', SIGN_IN: 'not signed in any more', FRAME: 'couldn’t take a frame from the camera',
};
const SERVER: Record<string, string> = {
  KR8_GHOST: 'ghost mode account (blocked on purpose)', KR8_BAD_AREA: 'no area picked', KR8_RATE_LIMIT: 'too many tries, server slowed them down',
};

function uploadMeaning(status: string | undefined): string {
  if (status === undefined) return 'upload stopped (older app build, no detail)';
  const n = Number(status);
  if (n === 0) return 'the phone lost connection during upload';
  if (n === 401 || n === 403) return 'sign-in ran out during the upload';
  if (n === 413) return 'the storage server said the file is too big';
  if (n === 400) return 'the storage server refused the file';
  if (n === 429) return 'too many uploads at once, server said slow down';
  if (n >= 500) return `the storage server failed (${n})`;
  return `the storage server said ${n}`;
}

/** Plain-English meaning of one kind + code, e.g. ('reel_publish_fail', 'UPLOAD:0') → 'the phone lost connection during upload'. */
export function codeMeaning(kind: string, code: string | null | undefined): string {
  const c = (code || '').trim();
  if (/^KR8_/.test(c)) return SERVER[c] || `the server refused it (${c})`;
  if (kind === 'reel_pick_fail') return PICK[c] || (c ? `clip refused (${c})` : 'clip refused');
  if (kind === 'reel_publish_fail') {
    const [head, status] = c.split(':');
    if (head === 'UPLOAD') return uploadMeaning(status);
    return PUBLISH[head] || (c ? `did not post (${c})` : 'did not post');
  }
  if (kind === 'reel_trim') {
    if (c === 'open') return 'a clip over 60 s opened the trim step';
    if (c === 'done') return 'member chose the part to keep';
    if (c === 'back') return 'member left the trim step';
    if (c.startsWith('fail:')) return 'the phone couldn’t cut the long clip, nothing was uploaded';
    return c || 'trim step';
  }
  if (kind === 'verify_cam_fail') return CAM[c] || `camera did not start (${c || 'no reason'})`;
  if (kind === 'verify_fail') return VERIFY[c] || (c ? `face check did not send (${c})` : 'face check did not send');
  if (kind === 'card_photo_no' || kind === 'card_photo_review') {
    const why = c === 'none' ? 'no face seen' : c === 'small' ? 'face too small' : c === 'group' ? 'group photo' : c;
    return kind === 'card_photo_review' ? `2nd refused photo (${why}) used anyway, marked “Photo needs a look”` : `photo refused: ${why}`;
  }
  if (kind === 'reel_open') return c === 'place' ? 'opened from a place' : c === 'feed' ? 'opened from the feed' : 'opened';
  return c || kind;
}
/** "UPLOAD:0 = the phone lost connection during upload" */
export const codeLine = (kind: string, code: string | null | undefined) => `${code || '–'} = ${codeMeaning(kind, code)}`;

// ───────────────────────────── user agent → device + browser ─────────────────────────────
export type UaInfo = { device: string; os: string; browser: string; inApp: boolean; label: string };
/**
 * Reads the phone and the browser from a user agent. In-app browsers (LINE, Facebook, Messenger, Instagram, TikTok) are named,
 * since most Reel and camera trouble happens there. Android Chrome now hides the model ("Android 10; K"): shown as "model hidden".
 */
export function uaInfo(ua: string | null | undefined): UaInfo {
  const u = ua || '';
  let device = 'Unknown device', os = '';
  const ios = u.match(/\b(iPhone|iPad|iPod)\b.*?OS (\d+)[_.](\d+)/);
  const android = u.match(/Android (\d+(?:\.\d+)?)(?:; ([^;)]+))?/);
  if (ios) { device = ios[1]; os = `iOS ${ios[2]}.${ios[3]}`; }
  else if (/\biPhone\b/.test(u)) { device = 'iPhone'; os = 'iOS'; }
  else if (/\biPad\b/.test(u)) { device = 'iPad'; os = 'iOS'; }
  else if (android) {
    os = `Android ${android[1]}`;
    const model = (android[2] || '').replace(/\s*Build\/.*$/, '').trim();
    if (/^SM-|^SAMSUNG|^Galaxy/i.test(model) || /SamsungBrowser/.test(u)) device = model && model !== 'K' ? `Samsung ${model.replace(/^SAMSUNG\s*/i, '')}` : 'Samsung';
    else if (/^Pixel/i.test(model)) device = `Google ${model}`;
    else if (/^(Redmi|Mi |M2\d|2\d{3})/i.test(model) || /XiaoMi|MiuiBrowser/i.test(u)) device = `Xiaomi ${model}`.trim();
    else if (/^CPH\d/i.test(model)) device = `OPPO ${model}`;
    else if (/^RMX\d/i.test(model)) device = `realme ${model}`;
    else if (/^V\d{4}|^vivo/i.test(model)) device = `vivo ${model.replace(/^vivo\s*/i, '')}`;
    else if (/HUAWEI|^[A-Z]{3}-[A-Z]{1,2}\d/i.test(model)) device = `Huawei ${model.replace(/^HUAWEI\s*/i, '')}`;
    else if (!model || model === 'K' || model === 'wv') device = 'Android (model hidden)';
    else device = `Android ${model}`;
  } else if (/Macintosh|Mac OS X/.test(u)) { device = 'Mac'; os = 'macOS'; }
  else if (/Windows/.test(u)) { device = 'Windows PC'; os = 'Windows'; }
  else if (/Linux/.test(u)) { device = 'Linux PC'; os = 'Linux'; }

  const isIos = /iPhone|iPad|iPod/.test(u);
  let browser = '', inApp = true;
  if (/\bLine\/|LIFF/.test(u)) browser = 'LINE';
  else if (/MessengerForiOS|FB_IAB\/MESSENGER|\bOrca-Android\b|FBAN\/Messenger/i.test(u)) browser = 'Messenger';
  else if (/FBAN|FBAV|FB_IAB|FB4A|\[FB/.test(u)) browser = 'Facebook';
  else if (/Instagram/.test(u)) browser = 'Instagram';
  else if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(u)) browser = 'TikTok';
  else if (/KAKAOTALK/i.test(u)) browser = 'KakaoTalk';
  else if (/\bwv\)/.test(u)) browser = 'App browser (Android)';
  else {
    inApp = false;
    if (/SamsungBrowser/.test(u)) browser = 'Samsung Internet';
    else if (/EdgA?\/|EdgiOS/.test(u)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(u)) browser = 'Opera';
    else if (/FxiOS|Firefox\//.test(u)) browser = 'Firefox';
    else if (/CriOS|Chrome\//.test(u)) browser = 'Chrome';
    else if (isIos && /Safari\//.test(u)) browser = 'Safari';
    else if (isIos) { browser = 'App browser (iPhone)'; inApp = true; }
    else if (/Safari\//.test(u)) browser = 'Safari';
    else browser = u ? 'Other browser' : 'Unknown browser';
  }
  const label = `${device} · ${!inApp ? browser : browser.startsWith('App browser') ? 'in-app browser' : `inside ${browser}`}`;
  return { device, os, browser, inApp, label };
}

/** Failures by phone + browser label (several user agents can fold into one label). */
export function agentsByLabel(agents: ProblemAgent[]): { label: string; inApp: boolean; n: number; fails: number; people: number }[] {
  const m = new Map<string, { label: string; inApp: boolean; n: number; fails: number; people: number }>();
  for (const a of agents) {
    const i = uaInfo(a.ua);
    const k = m.get(i.label) || { label: i.label, inApp: i.inApp, n: 0, fails: 0, people: 0 };
    k.n += a.n; k.fails += a.fails; k.people += a.people;
    m.set(i.label, k);
  }
  return [...m.values()].sort((x, y) => y.fails - x.fails || y.n - x.n);
}

/** Funnel text for a day: "6 opened → 3 picked → 2 posted". */
export const funnelLine = (d: Pick<FunnelDay, 'opened' | 'picked' | 'posted'>) => `${d.opened} opened → ${d.picked} picked → ${d.posted} posted`;
/** Share of opens that ended in a post (people), or '' when nobody opened. */
export const funnelRate = (d: Pick<FunnelDay, 'opened' | 'posted'>) => (d.opened ? `${Math.round((Math.min(d.posted, d.opened) / d.opened) * 100)}%` : '');
