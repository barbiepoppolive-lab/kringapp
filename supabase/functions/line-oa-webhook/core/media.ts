// Host media (profile video / photos): download from LINE, store privately, record in notes, thank the host.
import type { Lead, OaConfig } from './types.ts'
import type { Store } from './store.ts'
import type { FetchLike } from './llm.ts'
import type { Decision } from './stateMachine.ts'
import { downloadContent, MAX_MEDIA_BYTES } from './line.ts'
import { mediaReceived, mediaTooLarge } from './templates.ts'

export const CREATIVE_BUCKET = 'kring-creative'

export interface MediaInbound {
  kind: 'media'
  mediaType: 'video' | 'image'
  messageId: string
  external: boolean
  text: string
}

export function mediaPath(oaBasicId: string, leadId: string, messageId: string, mediaType: 'video' | 'image'): string {
  return `host_videos/${oaBasicId}/${leadId}/${messageId}.${mediaType === 'video' ? 'mp4' : 'jpg'}`
}

export interface MediaRecord {
  path: string
  at: string
  message_id: string
  bytes: number
  promo_consent: boolean
}

export async function hostMediaDecision(
  lead: Lead,
  inb: MediaInbound,
  oa: OaConfig,
  deps: { store: Store; fetchImpl: FetchLike },
  nowIso: string,
): Promise<Decision> {
  const lang = lead.lang
  const paused = lead.notes.paused === true
  const base = (reason: string, partial: Partial<Decision>): Decision => ({
    messages: [],
    patch: {},
    notes: {},
    reason,
    ...partial,
    ...(paused ? { messages: [], silent: true } : {}),
  })
  const flag = (reason: string, extra: Record<string, unknown> = {}) =>
    base(reason, {
      messages: [mediaReceived(inb.mediaType, lang)],
      notes: { needs_human: true, media_issue: { message_id: inb.messageId, type: inb.mediaType, reason, at: nowIso, ...extra } },
    })

  if (inb.external) return flag('media_external_provider')
  const dl = await downloadContent(deps.fetchImpl, oa.accessToken, inb.messageId, MAX_MEDIA_BYTES)
  if (!dl.ok) {
    if (dl.tooLarge) return base('media_too_large', { messages: [mediaTooLarge(lang)], notes: { media_too_large: inb.messageId } })
    return flag(dl.status === 202 ? 'media_not_ready' : `media_download_failed:${dl.reason}`)
  }
  const path = mediaPath(oa.basicId, lead.id, inb.messageId, inb.mediaType)
  const contentType = inb.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
  const up = await deps.store.uploadObject(CREATIVE_BUCKET, path, dl.bytes, contentType)
  if (!up.ok) return flag('media_upload_failed', { status: up.status })

  const rec: MediaRecord = { path, at: nowIso, message_id: inb.messageId, bytes: dl.bytes.byteLength, promo_consent: lead.notes.promo_consent !== false }
  const key = inb.mediaType === 'video' ? 'videos' : 'photos'
  const prev = Array.isArray(lead.notes[key]) ? (lead.notes[key] as MediaRecord[]) : []
  return base(`media_saved:${inb.mediaType}`, {
    messages: [mediaReceived(inb.mediaType, lang)],
    notes: { [key]: [...prev, rec].slice(-20) },
  })
}
