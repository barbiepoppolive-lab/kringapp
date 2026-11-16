// 0075 (Argon T-301, T301-001 P0): the server no longer trusts the phone's face code alone.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/0075_kr8_claim_face_server_check.sql', 'utf8');
const fn = sql.slice(sql.indexOf('create or replace function public.kr8_claim_prize'), sql.indexOf('create or replace function public.kr8_admin_held_count'));

describe('0075 claim face check on the server', () => {
  it('is one transaction and replaces the 4-argument claim with a 5-argument one (no PostgREST overload)', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toContain('drop function if exists public.kr8_claim_prize(uuid, text, text, real[]);');
    expect(fn).toContain('p_selfie text default null');
    expect(sql).toContain('grant execute on function public.kr8_claim_prize(uuid, text, text, real[], text) to authenticated');
  });
  it('compares only with team-approved verified prints, never with prints written by claims', () => {
    const trust = fn.slice(fn.indexOf('into trust_d'), fn.indexOf("v.status = 'approved'") + 30);
    expect(trust).toContain("f.source in ('verify', 'selfie', 'backfill-selfie')");
    expect(trust).toContain("v.status = 'approved'");
    expect(trust).not.toContain("'claim'");
  });
  it('holds (never pays) without a photo, without a verified print, too far, or a copy of the print', () => {
    for (const r of ['no_photo', 'no_verified_print', 'face_far', 'face_copy']) expect(fn).toContain(`'${r}'`);
    expect(fn).toContain('held := others is not null or cardinality(review) > 0;');
    expect(fn).toMatch(/if not held then\s+select \* into c from public\.kr8_reward_codes/);
    expect(sql).toContain("check (reason in ('linked', 'flag', 'review'))");
  });
  it('claim photo must be this member\'s own fresh upload, used once', () => {
    const ok = sql.slice(sql.indexOf('function public.kr8_claim_photo_ok'), sql.indexOf('drop function if exists public.kr8_claim_prize'));
    expect(ok).toContain("split_part(p_path, '/', 1) = p_uid::text");
    expect(ok).toContain("interval '15 minutes'");
    expect(ok).toContain('c.face_photo = p_path');
  });
  it('the founder gets a held alert that says "face check"', () => {
    expect(sql).toContain("'Prize claim held · face check'");
    expect(sql).toContain('kr8_admin_held_count');
  });
});

describe('0075 claim photo on the phone', () => {
  it('the claim screen sends the photo frame and the copy no longer says the photo is never kept', () => {
    const face = readFileSync('src/v8/V5ClaimFace.tsx', 'utf8');
    const page = readFileSync('src/v8/V5KxRewards.tsx', 'utf8');
    const kx = readFileSync('src/v8/v5Kx.ts', 'utf8');
    expect(face).not.toContain('never the photo');
    expect(face).toContain('props.onDone(d, photo)');
    expect(page).toContain('v5UploadClaimPhoto(photo)');
    expect(kx).toContain('p_selfie: selfie');
  });
});
