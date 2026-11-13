// LINE Messaging API client (Reply = free, Push = counts against monthly quota).
import type { OutMessage } from './types.ts'
import type { FetchLike } from './llm.ts'

export const LINE_API = 'https://api.line.me/v2/bot'

export function toLineMessages(msgs: OutMessage[]): Record<string, unknown>[] {
  return msgs.slice(0, 5).map((m) => {
    const out: Record<string, unknown> = { type: 'text', text: m.text.slice(0, 5000) }
    if (m.quickReplies && m.quickReplies.length) {
      out.quickReply = {
        items: m.quickReplies.slice(0, 13).map((q) => ({
          type: 'action',
          action: { type: 'message', label: q.label.slice(0, 20), text: q.text.slice(0, 300) },
        })),
      }
    }
    return out
  })
}

export interface SendResult {
  ok: boolean
  status: number
}

export async function replyMessages(
  fetchImpl: FetchLike,
  accessToken: string,
  replyToken: string,
  msgs: OutMessage[],
): Promise<SendResult> {
  if (!accessToken || !replyToken || msgs.length === 0) return { ok: false, status: 0 }
  try {
    const r = await fetchImpl(`${LINE_API}/message/reply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: toLineMessages(msgs) }),
    })
    return { ok: r.ok, status: r.status }
  } catch {
    return { ok: false, status: 0 }
  }
}

export async function pushMessages(
  fetchImpl: FetchLike,
  accessToken: string,
  to: string,
  msgs: OutMessage[],
  retryKey: string,
): Promise<SendResult> {
  if (!accessToken || !to || msgs.length === 0) return { ok: false, status: 0 }
  try {
    const r = await fetchImpl(`${LINE_API}/message/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ to, messages: toLineMessages(msgs) }),
    })
    return { ok: r.ok, status: r.status }
  } catch {
    return { ok: false, status: 0 }
  }
}

export const LINE_DATA_API = 'https://api-data.line.me/v2/bot'
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024

export type ContentResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; status: number; tooLarge?: boolean; reason: string }

/** Download a user's image/video via the LINE content API (202 = video still transcoding). */
export async function downloadContent(
  fetchImpl: FetchLike,
  accessToken: string,
  messageId: string,
  maxBytes = MAX_MEDIA_BYTES,
): Promise<ContentResult> {
  if (!accessToken || !messageId) return { ok: false, status: 0, reason: 'missing_token_or_id' }
  try {
    const r = await fetchImpl(`${LINE_DATA_API}/message/${encodeURIComponent(messageId)}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (r.status === 202) return { ok: false, status: 202, reason: 'not_ready' }
    if (!r.ok) return { ok: false, status: r.status, reason: `http_${r.status}` }
    const len = Number(r.headers.get('content-length') || '')
    if (Number.isFinite(len) && len > maxBytes) {
      try {
        await r.body?.cancel()
      } catch {
        /* ignore */
      }
      return { ok: false, status: r.status, tooLarge: true, reason: 'too_large' }
    }
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.byteLength > maxBytes) return { ok: false, status: r.status, tooLarge: true, reason: 'too_large' }
    if (buf.byteLength === 0) return { ok: false, status: r.status, reason: 'empty' }
    return { ok: true, bytes: buf, contentType: r.headers.get('content-type') || 'application/octet-stream' }
  } catch {
    return { ok: false, status: 0, reason: 'network_error' }
  }
}

export async function getProfileName(fetchImpl: FetchLike, accessToken: string, userId: string): Promise<string | null> {
  if (!accessToken || !userId) return null
  try {
    const r = await fetchImpl(`${LINE_API}/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!r.ok) return null
    const j: any = await r.json().catch(() => null)
    return typeof j?.displayName === 'string' ? j.displayName.slice(0, 80) : null
  } catch {
    return null
  }
}
