import { describe, expect, it } from 'vitest';
import { awsWords, checkReasons, cleanSnapshot, hiddenAlert, holdLines, isRetiredFaceLink, plainAlertText, plainDetail, robotName, type AwsFacts } from './adminClean';
import { buildInbox, type Person, type Snapshot } from './adminV2Logic';

const P = (id: string, no: number, links: Person['links'] = [], o: Partial<Person> = {}): Person => ({ user_id: id, kind: 'real', no, name: 'M' + no, who: 'local', area: null,
  joined_at: new Date(Date.now() - no * 60000).toISOString(), last_active_at: null, ref: null, src: null, verified: true, ig: null, tt: null, has_photo: true, photo_check: 'ok',
  email_hint: null, line: false, check: null, reels: null, claims: null, links, shared_net: 0, refs: 0, board: null, score: null, ...o });
const L = (user_id: string, no: number, reason: string, o: Partial<Person['links'][number]> = {}) => ({ user_id, no, name: 'M' + no, reason, dist: null, sface_sim: null, at: new Date().toISOString(), ...o });
const snap = (people: Person[], claims: Snapshot['claims'] = []): Snapshot => ({ at: new Date().toISOString(), day_start: new Date(0).toISOString(), week_start: new Date(0).toISOString(), include_test: false,
  counts: { real: people.length, real_today: 0, test: 0, team: 0, ghost: 0, admin: 0, nocard: 0 }, people, claims, codes: [], board: { week_start: '', paid_ranks: 8, floor: 25, rows: [] },
  pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [] });

describe('19 Nov admin clean-up', () => {
  it('drops the retired on-phone face links, keeps AWS / phone links', () => {
    expect(isRetiredFaceLink({ reason: 'face_maybe', dist: 0.44 })).toBe(true);
    expect(isRetiredFaceLink({ reason: 'face', dist: 0.38 })).toBe(true);
    expect(isRetiredFaceLink({ reason: 'face', sface_sim: 0.7 })).toBe(true);
    expect(isRetiredFaceLink({ reason: 'face', dist: null })).toBe(false);
    expect(isRetiredFaceLink({ reason: 'face', detail: { aws_sim: 100 } })).toBe(false);
    expect(isRetiredFaceLink({ reason: 'device' })).toBe(false);
  });
  it('Needs you shows AWS look-alikes as member ↔ member with the % and no old face_dist cards', () => {
    const s = snap([P('a', 1, [L('b', 2, 'face_maybe', { dist: 0.44 })]), P('b', 2, [L('a', 1, 'face_maybe', { dist: 0.44 })]), P('c', 3), P('d', 4)]);
    const aws: AwsFacts = { pairs: [{ a: 'c', b: 'd', sim: 86, at: new Date().toISOString(), a_no: 3, a_name: 'M3', b_no: 4, b_name: 'M4', a_prize: true, b_prize: false }], holds: [] };
    const items = buildInbox(cleanSnapshot(s, aws)).items.filter((i) => i.kind === 'lookalike');
    expect(items).toHaveLength(1);
    expect(items[0].what[0]).toBe('Faces look alike · 86% (AWS)');
    expect(items.map((i) => i.what.join(' ')).join(' ')).not.toMatch(/0\.\d\d/);
  });
  it('shared Wi-Fi alone is never a decision card', () => {
    const s = cleanSnapshot(snap([P('a', 1, [L('b', 2, 'network')]), P('b', 2, [L('a', 1, 'network')])]), null);
    expect(buildInbox(s).items.filter((i) => i.kind === 'lookalike')).toHaveLength(0);
  });
  it('held claim reasons are plain English; the Wave safety switch is gone', () => {
    const pairs = [{ a: 'x', b: 'y', sim: 86, at: '', a_no: 114, a_name: 'Jaa', b_no: 127, b_name: 'Toon', a_prize: true, b_prize: true }];
    const lines = holdLines({ user_id: 'y', hold_reason: 'linked', hold_others: [], hold_review: ['aws_look_alike', 'manual_wave_hold'] }, pairs);
    expect(lines).toEqual(['Looks like #114 Jaa, who already got a prize (AWS 86%)']);
    expect(holdLines({ user_id: 'y', hold_reason: 'review', hold_others: null, hold_review: ['manual_wave_hold'] }).join()).not.toMatch(/wave|manual_|_/i);
  });
  it('watched invite chain hold has a plain label with the inviter', () => {
    const s = cleanSnapshot(snap([P('y', 127)], [{ id: 'c1', user_id: 'y', no: 127, name: 'M127', brand: 'truemoney', amount: 100, status: 'pending', held: true, used: false, created_at: '', assigned_at: null,
      is_test: false, hold_reason: 'review', decided: null, decided_at: null, face_dist: null, joined_at: null, hold_others: null, prize: null }]),
      { pairs: [], holds: [{ claim_id: 'c1', review: ['watched_invite_group'], watch_no: 114, watch_name: 'Jaaaa' }] });
    expect(holdLines(s.claims[0])).toEqual(["Joined through Jaaaa #114's invite chain (under watch)"]);
    expect(holdLines({ user_id: 'y', hold_reason: 'review', hold_others: null, hold_review: ['watched_invite_group'] })).toEqual(['Joined through an invite chain you put under watch']);
  });
  it('alerts: plain robot names, no error codes, ids or "(flag only)"; AWS look-alike alerts become cards', () => {
    expect(robotName('health_watch')).toBe('Health watch');
    expect(plainAlertText('Last error: verify_aws_fail NETWORK · . Message them in Help now.')).toBe('Last error: weak connection during the face check. Message them in Help now.');
    expect(plainAlertText('Last error: claim_face_fail TIMEOUT · n2 f0 c0 near0 st0 best0ms 480x640. Message them in Help now.')).not.toMatch(/_|TIMEOUT|480x640/);
    expect(hiddenAlert({ dedupe_key: 'face_aws:79b2b1f7' })).toBe(true);
    expect(hiddenAlert({ dedupe_key: 'rejoin:83' })).toBe(false);
    expect(plainDetail({ user_id: '07914c59-d73c-41d7-8d3e-cad4dabca729', member_no: 150, aws_sim: 100 })).toEqual(['member: #150', 'AWS similarity: 100%']);
  });
  it('face check reasons: card photo mismatch is never the founder\'s question', () => {
    expect(checkReasons(['card_mismatch'])).toEqual([]);
    expect(checkReasons(['aws_same_face', 'card_mismatch'])).toEqual(['Same face as another member (AWS)']);
    expect(awsWords(97).strong).toBe(true);
  });
});
