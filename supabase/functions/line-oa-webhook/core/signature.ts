// x-line-signature verification (HMAC-SHA256, Web Crypto) + multi-OA routing.
import type { OaConfig } from './types.ts'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function computeLineSignature(rawBody: string, channelSecret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  return toBase64(new Uint8Array(sigBuf))
}

export async function verifyLineSignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !channelSecret) return false
  const expected = await computeLineSignature(rawBody, channelSecret)
  return timingSafeEqualStr(expected, signatureHeader.trim())
}

/** Read `destination` without trusting the rest of the body (used only to pick a secret). */
export function peekDestination(rawBody: string): string | null {
  try {
    const p = JSON.parse(rawBody)
    return typeof p?.destination === 'string' ? p.destination : null
  } catch {
    return null
  }
}

export type OaResolution =
  | { ok: true; oa: OaConfig; matchedBy: 'destination' | 'secret_scan' }
  | { ok: false; reason: 'no_oas_configured' | 'invalid_signature' }

/**
 * Pick the OA for a webhook request.
 * - destination matches a configured botUserId → verify with that OA's secret only.
 * - destination unknown → try every secret; the first that verifies wins.
 * - nothing verifies → reject.
 */
export async function resolveOa(rawBody: string, signature: string | null, oas: OaConfig[]): Promise<OaResolution> {
  if (oas.length === 0) return { ok: false, reason: 'no_oas_configured' }
  const destination = peekDestination(rawBody)
  const byDest = destination ? oas.find((o) => o.botUserId && o.botUserId === destination) : undefined
  if (byDest) {
    return (await verifyLineSignature(rawBody, signature, byDest.channelSecret))
      ? { ok: true, oa: byDest, matchedBy: 'destination' }
      : { ok: false, reason: 'invalid_signature' }
  }
  for (const oa of oas) {
    if (await verifyLineSignature(rawBody, signature, oa.channelSecret)) {
      return { ok: true, oa, matchedBy: 'secret_scan' }
    }
  }
  return { ok: false, reason: 'invalid_signature' }
}
