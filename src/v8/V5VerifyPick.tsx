/**
 * 0125 (19 Nov): which face check opens. kr8_rings_config face_aws_on = 1 → the server check (V5VerifyAws: 3 photos, AWS
 * Rekognition, nothing to download); anything else (0, missing, no answer in 2.5 s) → the on-phone check (V5Verify), unchanged.
 * Each one is its own download, so a member on the server check never loads the on-phone check (and its models).
 */
import { useEffect, useState } from 'react';
import { lazyPart } from './lazyPart';
import { kxRules } from './v5Kx';
import { withTimeout } from './camGuard';
import type { VerifyMode } from './V5Verify';

type Props = { L: (en: string) => string; photo: string | null; nudge?: boolean; mode?: VerifyMode; invited?: boolean; onClose: () => void; onSent: () => void; onVerified?: () => void;
  onAddPhoto: () => void; errText: (e: unknown) => string; onFeed?: () => void };

const Classic = lazyPart(() => import('./V5Verify').then((m) => m.V5VerifySheet));
const Aws = lazyPart(() => import('./V5VerifyAws').then((m) => m.V5VerifyAws));

export const FLAG_MS = 2500;
const KEEP_MS = 5 * 60_000;
let known: { on: boolean; at: number } | null = null;
/** the switch from the live rules (kr8_rings_rules); only exactly 1 turns it on */
export const faceAwsOn = (rules: Record<string, unknown> | null | undefined) => Number(rules?.face_aws_on) === 1;
/** team test: kringapp.com/app/?faceaws=1 opens the server check on this phone before it is switched on (the server lets only the team through) */
function forcedAws(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]faceaws=1\b/.test(location.search)) sessionStorage.setItem('kr8_faceaws', '1');
    return sessionStorage.getItem('kr8_faceaws') === '1';
  } catch { return false; }
}
export function faceAwsFlag(): Promise<boolean> {
  if (forcedAws()) return Promise.resolve(true);
  if (known && Date.now() - known.at < KEEP_MS) return Promise.resolve(known.on);
  return withTimeout(kxRules(), FLAG_MS).then(faceAwsOn, () => true)   // 19 Nov: the server check is live; a slow rules call no longer drops members onto the heavy phone check (FACE_AWS_OFF → onFallback).then((on) => { known = { on, at: Date.now() }; return on; });
}
/** test aid */
export function resetFaceAwsFlag(): void { known = null; }

export function V5VerifyPick(props: Props) {
  const [aws, setAws] = useState<boolean | null>(known && Date.now() - known.at < KEEP_MS ? known.on : null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (aws !== null) return undefined;
    let live = true;
    void faceAwsFlag().then((on) => { if (live) setAws(on); });
    return () => { live = false; };
  }, [aws]);
  if (aws === null) return null;
  if (aws && !fallback) return <Aws {...props} onFallback={() => { known = { on: false, at: Date.now() }; setFallback(true); }} />;
  return <Classic {...props} />;
}
