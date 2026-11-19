/**
 * Fake Finder (0124, 19 Nov 2026): the admin DATA hook only (no screen here; the case cards are built elsewhere).
 * kr8_admin_fake_list() → red / amber members with plain-English reasons, photos and linked accounts, plus whether the four
 * live patches (board, People, claims, Founding) are on. kr8_admin_fake_decide(user, decision) → the founder's call.
 * Self-contained (only ./shared) so any admin screen can import it.
 */
import { rpc } from './shared';

export const FAKE_LIST_RPC = 'kr8_admin_fake_list';
export const FAKE_DECIDE_RPC = 'kr8_admin_fake_decide';
export const FAKE_RUN_RPC = 'kr8_admin_fake_run';

export type FakeLevel = 'green' | 'amber' | 'red';
/** clear = not fake (until new evidence) · keep_red = stays red · ghost = ghost mode + red · reset = undo the decision */
export type FakeDecision = 'clear' | 'keep_red' | 'ghost' | 'reset';
export type FakeCode = 'face_match' | 'face_check_lookalike' | 'photo_ai' | 'photo_mismatch' | 'same_device' | 'same_network_join'
  | 'bot_browser' | 'join_like_leave' | 'one_target' | 'clone_pattern' | 'mutual_pair' | 'no_return' | 'burst_booster'
  | 'chain_root' | 'chain_member';
export interface FakeWho { user_id: string; member_no: number | null; first_name: string | null }
export interface FakeReason { code: FakeCode | string; points: number; group: string; text: string; with: FakeWho[] }
export interface FakeLinked { user_id: string; member_no: number | null; first_name: string | null; photo: string | null; verified: boolean;
  ghost: boolean; reasons: { reason: string; detail: Record<string, unknown> }[]; dismissed: boolean }
export interface FakeMember { user_id: string; member_no: number | null; first_name: string | null; photo: string | null; verified: boolean;
  ghost: boolean; joined_at: string; last_active_at: string | null; score: number; level: FakeLevel; effective: FakeLevel; groups: number;
  reasons: FakeReason[]; override: 'clear' | 'keep_red' | 'ghost' | null; cleared_at: string | null; updated_at: string;
  held_claims: number; linked: FakeLinked[] }
export interface FakeList { at: string; effects_on: boolean; robot_on: boolean; last_run: string | null;
  /** per live function: 'patched' | 'already' = on; anything else = that effect is NOT on (patch by hand) */
  patches: Record<string, string>; members: FakeMember[] }

export function isFakeList(x: unknown): x is FakeList {
  const o = x as FakeList;
  return !!o && typeof o === 'object' && Array.isArray(o.members) && typeof o.patches === 'object' && o.patches !== null;
}

export async function fetchFakeList(): Promise<FakeList> {
  const r = await rpc<unknown>(FAKE_LIST_RPC);
  if (!isFakeList(r)) throw new Error('BAD_REPLY');
  return r;
}
export async function decideFake(userId: string, decision: FakeDecision): Promise<{ ok: boolean; level: FakeLevel; ghost: boolean }> {
  return rpc(FAKE_DECIDE_RPC, { p_user: userId, p_decision: decision });
}
export async function runFakeFinder(): Promise<{ ok: boolean; scored?: number; red?: number; amber?: number; off?: boolean }> {
  return rpc(FAKE_RUN_RPC);
}

/** live functions whose Fake Finder effect is NOT on (the founder sees "patch by hand") */
export function patchesMissing(l: Pick<FakeList, 'patches'>): string[] {
  return Object.entries(l.patches || {}).filter(([, v]) => v !== 'patched' && v !== 'already').map(([k]) => k).sort();
}
/** one line per member for a card title: "#202 Ann · red 70 · Face looks the same as #201 Bee (0.28, …)" */
export function fakeHeadline(m: Pick<FakeMember, 'member_no' | 'first_name' | 'effective' | 'score' | 'reasons'>): string {
  const who = `${m.member_no != null ? `#${m.member_no} ` : ''}${(m.first_name || 'member').trim()}`;
  const top = m.reasons[0]?.text;
  return `${who} · ${m.effective} ${m.score}${top ? ` · ${top}` : ''}`;
}
/** red first, then amber, highest score first */
export function sortFake(ms: FakeMember[]): FakeMember[] {
  const rank: Record<FakeLevel, number> = { red: 0, amber: 1, green: 2 };
  return [...ms].sort((a, b) => rank[a.effective] - rank[b.effective] || b.score - a.score || (a.member_no ?? 1e9) - (b.member_no ?? 1e9));
}
