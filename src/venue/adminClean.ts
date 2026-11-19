/**
 * Admin clean-up (19 Nov): the old on-phone face checker (face-api.js / SFace, face prints, "Looks alike?" emails) is retired;
 * face checks are AWS Rekognition (face-check-aws). Pure helpers (no DOM) so vitest checks them:
 *  - which look-alike links are left over from the retired engine (never shown, never counted),
 *  - the real AWS look-alikes (kr8_face_lookalikes, sim >= 80) merged into the snapshot,
 *  - plain-English hold reasons, robot names and alert text (no snake_case codes, ids or "(flag only)").
 */
import type { Claim, Link, Snapshot } from './adminV2Logic';

/** 0141 kr8_admin_aws_lookalikes: AWS look-alike pairs (a < b) and the review reasons of each open held claim */
export interface AwsPair { a: string; b: string; sim: number; at: string; a_no: number | null; a_name: string | null; b_no: number | null; b_name: string | null; a_prize: boolean; b_prize: boolean }
export interface AwsFacts { pairs: AwsPair[]; holds: { claim_id: string; review: string[]; /** watched inviter at the top of the invite chain */ watch_no?: number | null; watch_name?: string | null }[] }
export function isAwsFacts(x: unknown): x is AwsFacts {
  const o = x as AwsFacts;
  return !!o && typeof o === 'object' && Array.isArray(o.pairs) && Array.isArray(o.holds);
}

/** A look-alike link made by the retired on-phone face checker: 'face_maybe' always; 'face' with a face-api distance or SFace score.
 *  AWS links ('face' with an AWS similarity, or with no old number at all) stay. */
export function isRetiredFaceLink(l: { reason: string; dist?: number | null; sface_sim?: number | null; aws_sim?: number | null; detail?: { dist?: number; sface_sim?: number; aws_sim?: number } | null }): boolean {
  if (l.reason === 'face_maybe') return true;
  if (l.reason !== 'face') return false;
  if (l.aws_sim != null || l.detail?.aws_sim != null) return false;
  return l.dist != null || l.sface_sim != null || l.detail?.dist != null || l.detail?.sface_sim != null;
}

/** Snapshot without the retired face links, with the AWS look-alikes added (as reason 'face' + aws_sim) and each held claim's review reasons. */
export function cleanSnapshot(s: Snapshot, aws: AwsFacts | null): Snapshot {
  const byId = new Map(s.people.map((p) => [p.user_id, p]));
  for (const p of s.people) p.links = p.links.filter((l) => !isRetiredFaceLink(l));
  for (const x of aws?.pairs || []) {
    for (const [me, other, oNo, oName] of [[x.a, x.b, x.b_no, x.b_name], [x.b, x.a, x.a_no, x.a_name]] as [string, string, number | null, string | null][]) {
      const p = byId.get(me); if (!p || !byId.has(other)) continue;
      const have = p.links.find((l) => l.user_id === other && l.reason === 'face');
      if (have) have.aws_sim = Math.max(have.aws_sim ?? 0, x.sim);
      else p.links.push({ user_id: other, no: oNo, name: oName, reason: 'face', dist: null, sface_sim: null, aws_sim: x.sim, at: x.at } as Link);
    }
  }
  const holds = new Map((aws?.holds || []).map((h) => [h.claim_id, h]));
  for (const c of s.claims) { const h = holds.get(c.id); if (h) { c.hold_review = h.review; if (h.watch_no != null) c.hold_watch = { no: h.watch_no, name: h.watch_name ?? null }; } }
  s.aws_pairs = aws?.pairs || [];
  return s;
}

/** "86%" */
export const pct = (sim: number) => `${Math.round(sim)}%`;
/** AWS look-alike in words: 95 %+ is the same face, 80–95 % looks alike */
export function awsWords(sim: number | null | undefined): { tone: 'r' | 'a'; text: string; strong: boolean } {
  if (sim == null) return { tone: 'a', text: 'Faces look alike (AWS)', strong: false };
  return sim >= 95 ? { tone: 'r', text: `Same face · ${pct(sim)} (AWS)`, strong: true } : { tone: 'a', text: `Faces look alike · ${pct(sim)} (AWS)`, strong: false };
}

/** The other member of an AWS look-alike pair who already has a prize ("Looks like #X, who already got a prize (AWS 86%)") */
export function lookalikeWithPrize(c: Pick<Claim, 'user_id'>, pairs: AwsPair[]): { no: number | null; name: string | null; sim: number } | null {
  const mine = pairs.filter((x) => x.a === c.user_id || x.b === c.user_id)
    .map((x) => (x.a === c.user_id ? { no: x.b_no, name: x.b_name, sim: x.sim, prize: x.b_prize } : { no: x.a_no, name: x.a_name, sim: x.sim, prize: x.a_prize }))
    .sort((a, b) => Number(b.prize) - Number(a.prize) || b.sim - a.sim);
  return mine[0] || null;
}

/** Why a claim is held, one plain line per reason. Retired reasons (Wave safety switch, the old phone face scan) are left out. */
export const REVIEW_WORDS: Record<string, string> = {
  ring_farming: 'Ring-farming check: most Rings came from one friend',
  fake_red: 'Fake Finder says this account looks fake',
};
const RETIRED_REVIEW = new Set(['manual_wave_hold', 'no_photo', 'no_verified_print', 'face_far', 'face_copy', 'first_print']);
export function holdLines(c: Pick<Claim, 'user_id' | 'hold_reason' | 'hold_others' | 'hold_review'> & { hold_watch?: Claim['hold_watch'] }, pairs: AwsPair[] = []): string[] {
  const out: string[] = [];
  for (const o of c.hold_others || []) {
    const r = o.reasons || [];
    out.push(`${r.includes('device') ? 'Same phone as' : r.includes('face') ? 'Same face as' : 'Linked to'} #${o.member_no ?? '?'}${o.first_name ? ` ${o.first_name}` : ''}, who already has a prize`);
  }
  for (const r of c.hold_review || []) {
    if (RETIRED_REVIEW.has(r)) continue;
    if (r === 'aws_look_alike') {
      const w = lookalikeWithPrize(c, pairs);
      out.push(w ? `Looks like #${w.no ?? '?'}${w.name ? ` ${w.name}` : ''}, who already got a prize (AWS ${pct(w.sim)})` : 'Looks like another member who already got a prize (AWS)');
    } else if (r === 'watched_invite_group') {
      const w = c.hold_watch;
      out.push(w ? `Joined through ${w.name || 'member'} #${w.no}'s invite chain (under watch)` : 'Joined through an invite chain you put under watch');
    } else out.push(REVIEW_WORDS[r] || 'Held for a check');
  }
  if (!out.length) out.push(c.hold_reason === 'review' ? 'Held for a check (no warning left: safe to pay)' : 'Held by the robot for a check');
  return [...new Set(out)];
}

/** robot names in plain words (the alert chips used the database names, e.g. health_watch) */
const ROBOT: Record<string, string> = { health_watch: 'Health watch', protect: 'Protect', self_fix: 'Self-fix', reel_file_watch: 'Reel video watch', fake_finder: 'Fake Finder',
  dup_robot: 'Duplicate guard', dup_sweep: 'Duplicate sweep', growth_nudges: 'Growth nudges', nightly_selftest: 'Nightly self-test', ai_helper: 'AI helper', sys: 'System' };
export function robotName(r: string | null | undefined): string {
  if (!r) return 'Robot';
  return ROBOT[r] || r.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
}

/** Phone error codes inside alert text → plain words. "Last error: verify_aws_fail NETWORK · ." → "Last error: weak connection during the face check." */
const ERR: [RegExp, string][] = [
  [/^verify_aws_cam_fail\s+NotAllowedError/i, 'camera permission blocked during the face check'],
  [/^(verify|claim)_\w*cam\w*\s+Not(Found|Readable)Error/i, 'the camera did not start'],
  [/^verify_aws_fail\s+NETWORK/i, 'weak connection during the face check'],
  [/^verify_aws_fail\s+DB/i, 'the face check server had a hiccup'],
  [/^verify_aws_fail\s+TIMEOUT/i, 'the face check took too long'],
  [/^claim_face_fail\s+TIMEOUT/i, 'the face scan at the prize claim timed out'],
  [/^claim_\w*fail/i, 'the prize claim did not go through'],
  [/^verify_\w*fail/i, 'the face check did not go through'],
];
export function plainAlertText(t: string | null | undefined): string {
  if (!t) return '';
  return t.replace(/Last error:\s*([^.]*?)\s*(?:·[^.]*)?\.(?=\s|$)/, (_m, code: string) => {
    const hit = ERR.find(([re]) => re.test(code.trim()));
    return `Last error: ${hit ? hit[1] : 'a problem in the app'}.`;
  }).replace(/\(flag only\)/gi, '').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

/** Alerts that are not shown any more: the AWS look-alike alert is now a Look-alike card in Needs you; retired face-engine alerts. */
export function hiddenAlert(a: { dedupe_key?: string | null; robot?: string | null }): boolean {
  const k = a.dedupe_key || '';
  return k.startsWith('face_aws:') || k.startsWith('face_alert') || k.startsWith('face_print') || /sface|face_api/i.test(k);
}

/** Alert detail → short plain lines: no ids, no technical keys */
const DETAIL_WORDS: Record<string, string> = { member_no: 'member', other_no: 'other member', aws_sim: 'AWS similarity', fails: 'fails', count: 'count', left: 'left' };
export function plainDetail(d: Record<string, unknown> | undefined): string[] {
  if (!d) return [];
  return Object.entries(d).filter(([k, v]) => DETAIL_WORDS[k] && v != null && v !== '' && typeof v !== 'object')
    .slice(0, 4).map(([k, v]) => `${DETAIL_WORDS[k]}: ${k.endsWith('_no') ? `#${v}` : k === 'aws_sim' ? `${Math.round(Number(v))}%` : String(v)}`);
}

/** Pending face check reasons from the AWS check, in plain words (only what the founder decides by eye) */
const CHECK_WORDS: Record<string, string> = {
  aws_same_face: 'Same face as another member (AWS)', aws_error: 'AWS did not answer: check by eye', many_faces: 'More than one face', no_face: 'No clear face',
  too_dark: 'Too dark', too_blurry: 'Blurry photo', sunglasses: 'Sunglasses', eyes_closed: 'Eyes closed',
};
/** card_mismatch is handled automatically now (the member is asked to change their photo), so it is never a reason for the founder */
export function checkReasons(review: string[] | null | undefined): string[] {
  return [...new Set((review || []).filter((r) => r !== 'card_mismatch').map((r) => CHECK_WORDS[r] || 'The robot was not sure'))];
}
