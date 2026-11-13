/* R7 Instagram-style Host Stories: data model, 5 offline demo stories, expiry, seen ordering,
   stickers (activity, place, spots, poll, ask, nextDate, text), poll voting, likes, viewer list,
   and replies routed through the Kring chat guard. */
import { S, update } from './store'
import { ACTS, DEMO_ACTS, isProdBuild, t, aTitle, hostName, ph, baht, SL, type Act } from './data'
import { maskTxt, isSolicitation, isAbusive, isAroundKring, nameBlocked } from './guard'
import { isActBlocked, openChat, CHAT_DRAFT } from './chatLinks'
import { hasAccount } from './router'

export type MediaType = 'photo' | 'video'

export interface StorySticker {
  id: string
  kind: 'activity' | 'place' | 'spots' | 'poll' | 'ask' | 'nextDate' | 'text'
  x?: number // % from left
  y?: number // % from top
  text?: string
  textTh?: string
  /** Activity sticker: links to an Act id (max 1 per story) */
  actId?: string
  /** Place sticker */
  placeName?: string
  placeNameTh?: string
  /** Spots left sticker */
  spotsLeft?: number
  /** Poll sticker */
  question?: string
  questionTh?: string
  optA?: string
  optATh?: string
  optB?: string
  optBTh?: string
  votesA?: number
  votesB?: number
  /** Ask me sticker */
  prompt?: string
  promptTh?: string
  /** Next date sticker */
  nextDateLabel?: string
  nextDateLabelTh?: string
}

export interface StoryItem {
  id: string
  actId: string
  hostName: string
  hostNameTh: string
  isWoman: boolean
  area: string
  areaTh: string
  mediaUrl: string
  mediaType: MediaType
  durationSec: number
  caption?: string
  captionTh?: string
  stickers: StorySticker[]
  highlight: boolean
  highlightTitle?: string
  highlightTitleTh?: string
  createdAt: string // ISO
  expiresAt: string // ISO (createdAt + 24h)
  likesCount: number
  viewers: string[] // first names only
  /** posted by this phone's host (their own activity, which may not be a demo activity) */
  mine?: boolean
  /** the host's own activity: title, meeting place and first start time (overrides the demo activity) */
  actTitle?: string
  actPlace?: string
  actTime?: string
  /** the host's own price for that activity (0 = free) */
  actPrice?: number
}

export interface HostStoryGroup {
  actId: string
  act: Act
  host: string
  hostTh: string
  isWoman: boolean
  area: string
  areaTh: string
  stories: StoryItem[]
  unseen: boolean
  coverUrl: string
  /** the host's own stories (this phone) */
  mine?: boolean
}

const HOUR_MS = 3600 * 1000
export const STORY_TTL_MS = 24 * HOUR_MS
export const MAX_STORIES_PER_HOST_DAY = 10

/** This phone belongs to a host (host mode, a host profile, or an activity they published), even while browsing guest screens. */
export const amHost = (): boolean => !!(S.host || S.prof?.isHost || (S.myActs || []).some((x) => x && x.trim()) || (Array.isArray(S.myStories) && S.myStories.length))
/** The host's own activity id key used for their stories and reply setting. */
export const MINE = 'mine'

/** Key of a ring in the stories row (the host's own ring is MINE). */
export const groupKey = (g: { mine?: boolean; actId: string }): string => (g.mine ? MINE : g.actId)

/** Thai area name for an activity: the meeting place without a leading BTS/MRT/ARL station prefix. */
export function thArea(a: Act): string {
  const w = (a.placeTh || '').split('|')[0].trim().split(/\s+/).filter((x) => !/^(BTS|MRT|ARL|SRT)$/i.test(x))
  return w[0] || a.liveArea || ''
}

/** Demo stories in offline mode: Nicha, Beam, Mint (unseen by default); Ken, Golf (seen by default).
 *  Uses existing activity photos only — zero stock/AI faces. Never shown in production builds. */
export function getDemoStories(nowMs = Date.now()): StoryItem[] {
  if (isProdBuild()) return []
  const iso = (offsetHours: number) => new Date(nowMs + offsetHours * HOUR_MS).toISOString()
  return [
    {
      id: 'st-nicha-1',
      actId: 'eat',
      hostName: 'Nicha',
      hostNameTh: 'ณิชา',
      isWoman: true,
      area: 'Yaowarat',
      areaTh: 'เยาวราช',
      mediaUrl: ph('yaowarat-food'),
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Wok fire is up on Plaeng Nam Road — starting our walk at 18:30 tonight.',
      captionTh: 'ไฟกระทะร้อนแล้วที่ถนนแปลงนาม คืนนี้เริ่มเดินกินตอน 18:30 น. ค่ะ',
      stickers: [
        {
          id: 'stk-nicha-place',
          kind: 'place',
          placeName: 'Yaowarat · MRT Wat Mangkon',
          placeNameTh: 'เยาวราช · MRT วัดมังกร',
        },
        {
          id: 'stk-nicha-spots',
          kind: 'spots',
          spotsLeft: 2,
        },
        {
          id: 'stk-nicha-poll',
          kind: 'poll',
          question: 'First stop tonight?',
          questionTh: 'ร้านแรกคืนนี้ดีไหมคะ?',
          optA: 'Rolled noodles',
          optATh: 'ก๋วยจั๊บน้ำใส',
          optB: 'Crab omelette',
          optBTh: 'ไข่เจียวปู',
          votesA: 18,
          votesB: 9,
        },
        {
          id: 'stk-nicha-act',
          kind: 'activity',
          actId: 'eat',
        },
      ],
      highlight: true,
      highlightTitle: 'Yaowarat walk',
      highlightTitleTh: 'เดินกินเยาวราช',
      createdAt: iso(-2),
      expiresAt: iso(22),
      likesCount: 24,
      viewers: ['Emma', 'Liam', 'Ji-woo', 'Aarav'],
    },
    {
      id: 'st-nicha-2',
      actId: 'eat',
      hostName: 'Nicha',
      hostNameTh: 'ณิชา',
      isWoman: true,
      area: 'Yaowarat',
      areaTh: 'เยาวราช',
      mediaUrl: ph('thai-tea-fruit'),
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Fresh toasted buns & Thai tea waiting at stop #3.',
      captionTh: 'ขนมปังปิ้งเตาถ่านกับชาไทยรออยู่ที่จุดที่ 3 นะคะ',
      stickers: [
        {
          id: 'stk-nicha-ask',
          kind: 'ask',
          prompt: 'Any food allergies or spice questions?',
          promptTh: 'ถามเรื่องอาหารที่แพ้หรือความเผ็ดได้เลยค่ะ',
        },
        {
          id: 'stk-nicha-act-2',
          kind: 'activity',
          actId: 'eat',
        },
      ],
      highlight: true,
      highlightTitle: 'Sweet stops',
      highlightTitleTh: 'ร้านขนมหวาน',
      createdAt: iso(-1),
      expiresAt: iso(23),
      likesCount: 19,
      viewers: ['Emma', 'Liam'],
    },
    {
      id: 'st-beam-1',
      actId: 'muay',
      hostName: 'Beam',
      hostNameTh: 'บีม',
      isWoman: false,
      area: 'Lumpini',
      areaTh: 'ลุมพินี',
      mediaUrl: ph('muay-thai'),
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Fresh wraps and pads ready at Lumpini Gate 1 for the 17:00 beginner session.',
      captionTh: 'ผ้าพันมือกับเป้าซ้อมพร้อมแล้วที่สวนลุม ประตู 1 รอบ 17:00 น. ครับ',
      stickers: [
        {
          id: 'stk-beam-place',
          kind: 'place',
          placeName: 'Lumpini Park · Gate 1',
          placeNameTh: 'สวนลุมพินี · ประตู 1',
        },
        {
          id: 'stk-beam-spots',
          kind: 'spots',
          spotsLeft: 2,
        },
        {
          id: 'stk-beam-act',
          kind: 'activity',
          actId: 'muay',
        },
      ],
      highlight: true,
      highlightTitle: 'Pad work',
      highlightTitleTh: 'ซ้อมเตะเป้า',
      createdAt: iso(-3),
      expiresAt: iso(21),
      likesCount: 15,
      viewers: ['Alexei', 'Sam'],
    },
    {
      id: 'st-mint-1',
      actId: 'market',
      hostName: 'Mint',
      hostNameTh: 'มิ้นท์',
      isWoman: true,
      area: 'Pak Khlong',
      areaTh: 'ปากคลอง',
      mediaUrl: ph('flower-market'),
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Fresh jasmine and marigold garlands just arrived at Pak Khlong Talat.',
      captionTh: 'ดอกมะลิกับดาวเรืองสดเพิ่งลงที่ปากคลองตลาดเลยค่ะ',
      stickers: [
        {
          id: 'stk-mint-place',
          kind: 'place',
          placeName: 'MRT Sanam Chai · Exit 1',
          placeNameTh: 'MRT สนามไชย · ทางออก 1',
        },
        {
          id: 'stk-mint-next',
          kind: 'nextDate',
          nextDateLabel: 'Tomorrow · 06:30',
          nextDateLabelTh: 'พรุ่งนี้ · 06:30 น.',
        },
        {
          id: 'stk-mint-act',
          kind: 'activity',
          actId: 'market',
        },
      ],
      highlight: true,
      highlightTitle: 'Flower market',
      highlightTitleTh: 'ตลาดดอกไม้',
      createdAt: iso(-4),
      expiresAt: iso(20),
      likesCount: 31,
      viewers: ['Ji-woo', 'Emma', 'Nan'],
    },
    {
      id: 'st-ken-1',
      actId: 'oldtown',
      hostName: 'Ken',
      hostNameTh: 'เคน',
      isWoman: false,
      area: 'Talat Noi',
      areaTh: 'ตลาดน้อย',
      mediaUrl: ph('talat-noi-oldtown'),
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Afternoon light in the Talat Noi alleys — meeting at Marine Dept. pier.',
      captionTh: 'แสงบ่ายในตรอกตลาดน้อยสวยมาก เจอกันที่ท่าเรือกรมเจ้าท่าครับ',
      stickers: [
        {
          id: 'stk-ken-place',
          kind: 'place',
          placeName: 'Marine Dept. pier · Talat Noi',
          placeNameTh: 'ท่าเรือกรมเจ้าท่า · ตลาดน้อย',
        },
        {
          id: 'stk-ken-act',
          kind: 'activity',
          actId: 'oldtown',
        },
      ],
      highlight: true,
      highlightTitle: 'Talat Noi alleys',
      highlightTitleTh: 'ตรอกตลาดน้อย',
      createdAt: iso(-6),
      expiresAt: iso(18),
      likesCount: 12,
      viewers: ['Aarav', 'Kenji'],
    },
    {
      id: 'st-golf-1',
      actId: 'river',
      hostName: 'Golf',
      hostNameTh: 'กอล์ฟ',
      isWoman: false,
      area: 'Bang Krachao',
      areaTh: 'บางกระเจ้า',
      mediaUrl: ph('cycling-park'),
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Shaded elevated bike paths in Bang Krachao are quiet and breezy today.',
      captionTh: 'ทางจักรยานร่มรื่นในบางกระเจ้าวันนี้ลมเย็นมากครับ',
      stickers: [
        {
          id: 'stk-golf-place',
          kind: 'place',
          placeName: 'Khlong Toei pier',
          placeNameTh: 'ท่าเรือคลองเตย',
        },
        {
          id: 'stk-golf-act',
          kind: 'activity',
          actId: 'river',
        },
      ],
      highlight: true,
      highlightTitle: 'Green lung ride',
      highlightTitleTh: 'ปั่นบางกระเจ้า',
      createdAt: iso(-8),
      expiresAt: iso(16),
      likesCount: 16,
      viewers: ['Tom', 'Wei'],
    },
  ]
}

/** Default seen map in offline demo: Ken & Golf start seen so the Locals row shows 3 gold unseen rings + 2 grey seen rings. */
export function isStorySeen(storyId: string): boolean {
  if (storyId in (S.seenStories || {})) return !!S.seenStories[storyId]
  return storyId === 'st-ken-1' || storyId === 'st-golf-1'
}

export function markStorySeen(storyId: string): void {
  if (!storyId) return
  update((st) => {
    st.seenStories = { ...(st.seenStories || {}), [storyId]: true }
  })
}

/** True when a story is still within its 24h window. */
export function isStoryActive(item: StoryItem, nowMs = Date.now()): boolean {
  const exp = Date.parse(item.expiresAt)
  return Number.isFinite(exp) && exp > nowMs
}

/** True when a story is hidden (by user hide, host mute, host block, or >= 3 reports). */
export function isStoryHidden(item: StoryItem): boolean {
  if ((S.hiddenStories || {})[item.id]) return true
  if ((S.mutedStories || {})[item.actId]) return true
  if (((S.storyReports || {})[item.id] || 0) >= 3) return true
  if (isActBlocked(item.actId)) return true
  return false
}

/** All active (non-expired, non-hidden) stories across demo + host-created stories. */
export function getAllActiveStories(nowMs = Date.now()): StoryItem[] {
  const custom = Array.isArray(S.myStories) ? (S.myStories as StoryItem[]) : []
  const all = [...custom, ...getDemoStories(nowMs)]
  return all.filter((item) => isStoryActive(item, nowMs) && !isStoryHidden(item))
}

/** Highlights for a given host (actId): includes saved highlights even after 24h expiry, unless hidden/reported. */
export function getHostHighlights(actId: string, nowMs = Date.now()): StoryItem[] {
  const custom = Array.isArray(S.myStories) ? (S.myStories as StoryItem[]) : []
  const all = [...custom, ...getDemoStories(nowMs)]
  return all.filter((item) => item.actId === actId && item.highlight && !isStoryHidden(item))
}

/** Grouped host story rings for Locals tab: unseen hosts first, then seen hosts. Blocked/muted hosts never show. */
export function getStoryGroups(nowMs = Date.now()): HostStoryGroup[] {
  const active = getAllActiveStories(nowMs)
  const byAct = new Map<string, StoryItem[]>()
  for (const st of active) {
    const key = st.mine ? MINE : st.actId
    const list = byAct.get(key) || []
    list.push(st)
    byAct.set(key, list)
  }
  const groups: HostStoryGroup[] = []
  for (const [key, list] of byAct.entries()) {
    const mine = key === MINE
    const actId = list[0].actId
    const a = ACTS.find((x) => x.id === actId) || ACTS[0] || DEMO_ACTS[0]
    if (!mine && isActBlocked(a)) continue
    const unseen = list.some((s) => !isStorySeen(s.id))
    const hostPhoto = mine && S.prof.hostPhoto ? S.prof.hostPhoto : undefined
    groups.push({
      actId,
      act: a,
      host: list[0].hostName,
      hostTh: list[0].hostNameTh,
      isWoman: list[0].isWoman,
      area: list[0].area,
      areaTh: list[0].areaTh,
      stories: list,
      unseen,
      coverUrl: hostPhoto || list[0].mediaUrl || ph(a.img),
      mine,
    })
  }
  groups.sort((a, b) => (a.mine !== b.mine ? (a.mine ? -1 : 1) : a.unseen === b.unseen ? 0 : a.unseen ? -1 : 1))
  return groups
}

/** Relative time label for a story ("2 h", "45m"). */
export function storyAgoLabel(createdAtIso: string, nowMs = Date.now()): string {
  const diffMin = Math.max(1, Math.round((nowMs - Date.parse(createdAtIso)) / 60000))
  if (diffMin < 60) return `${diffMin}m`
  const h = Math.max(1, Math.round(diffMin / 60))
  return `${h} h`
}

/** Live Activity sticker summary: real title, start time, price and spots from the linked activity (or the host's own activity). */
export function getActivityStickerInfo(actId: string, story?: StoryItem): { act: Act; title: string; timeLabel: string; priceLabel: string; spotsLeft: number; free: boolean } {
  const a = ACTS.find((x) => x.id === actId) || ACTS[0] || DEMO_ACTS[0]
  const slots = SL(a)
  const mins = (x: string) => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0) }
  // a real bookable start time: the host's own, else the activity's slot closest to the story's planned time
  const want = a.liveStartTime ? mins(a.liveStartTime) : -1
  const time = story?.actTime || (want < 0 ? slots[0] : [...slots].sort((x, y) => Math.abs(mins(x) - want) - Math.abs(mins(y) - want) || mins(y) - mins(x))[0])
  const hr = parseInt(time, 10)
  const dayWord = (hr >= 17 ? t('whenTonight') : t('stToday')).toLowerCase()
  const ownPrice = typeof story?.actPrice === 'number' ? story.actPrice : undefined
  const free = ownPrice !== undefined ? ownPrice === 0 : !!(a.isVolunteer || a.price === 0)
  return {
    act: a,
    title: story?.actTitle || aTitle(a),
    timeLabel: `${dayWord} ${time}`,
    priceLabel: free ? t('volPrice') : baht(ownPrice ?? a.price),
    spotsLeft: Math.max(1, a.liveSpotsLeft ?? 2),
    free,
  }
}

/** Vote on a poll sticker and return the updated percentages [pctA, pctB] and user choice (0 | 1). */
export function voteStoryPoll(storyId: string, choice: 0 | 1): { pctA: number; pctB: number; choice: 0 | 1 } {
  update((st) => {
    st.storyVotes = { ...(st.storyVotes || {}), [storyId]: choice }
  })
  const st = getPollStats(storyId, 18, 9)
  return { pctA: st.pctA, pctB: st.pctB, choice }
}

export function getPollStats(storyId: string, baseA = 18, baseB = 9): { pctA: number; pctB: number; voted: 0 | 1 | undefined } {
  const voted = (S.storyVotes || {})[storyId]
  const a = baseA + (voted === 0 ? 1 : 0)
  const b = baseB + (voted === 1 ? 1 : 0)
  const total = Math.max(1, a + b)
  const pctA = Math.round((a / total) * 100)
  return { pctA, pctB: 100 - pctA, voted }
}

/** Toggle like on a story. */
export function toggleStoryLike(storyId: string): boolean {
  const next = !(S.likedStories || {})[storyId]
  update((st) => {
    st.likedStories = { ...(st.likedStories || {}), [storyId]: next }
  })
  return next
}

/** Report a story: hides immediately for this viewer; at 3 reports hides for everyone. */
export function reportStory(storyId: string): { count: number; hiddenForAll: boolean } {
  let count = 0
  update((st) => {
    count = ((st.storyReports || {})[storyId] || 0) + 1
    st.storyReports = { ...(st.storyReports || {}), [storyId]: count }
    st.hiddenStories = { ...(st.hiddenStories || {}), [storyId]: true }
  })
  return { count, hiddenForAll: count >= 3 }
}

export function hideStory(storyId: string): void {
  update((st) => {
    st.hiddenStories = { ...(st.hiddenStories || {}), [storyId]: true }
  })
}

export function muteHostStories(actId: string): void {
  update((st) => {
    st.mutedStories = { ...(st.mutedStories || {}), [actId]: true }
  })
}

/** Check whether a woman host has turned off story replies. */
export function areStoryRepliesOff(actId: string): boolean {
  if (actId === MINE) return !!(S.hostStoryRepliesOff || {})[MINE]
  const a = ACTS.find((x) => x.id === actId)
  if (!a || a.f !== 1) return false
  if (actId in (S.hostStoryRepliesOff || {})) return !!S.hostStoryRepliesOff[actId]
  return false
}

export function setStoryRepliesOff(actId: string, off: boolean): void {
  update((st) => {
    st.hostStoryRepliesOff = { ...(st.hostStoryRepliesOff || {}), [actId]: off }
    if (actId === st.act) st.prof.storyRepliesOff = off
  })
}

export interface StoryReplyResult {
  ok: boolean
  blockedReason?: 'replies_off' | 'solicit' | 'abuse' | 'around' | 'empty'
  maskedText?: string
  /** saved as a chat draft until the guest has an account */
  pending?: boolean
}

/** Send a reply or "Ask me" question from a story into the normal Kring chat, passing through the chat guard. */
export function sendStoryReplyToChat(actId: string, rawText: string, navigateToChat = true): StoryReplyResult {
  const trimmed = (rawText || '').trim()
  if (!trimmed) return { ok: false, blockedReason: 'empty' }
  if (areStoryRepliesOff(actId)) return { ok: false, blockedReason: 'replies_off' }
  if (isSolicitation(trimmed)) return { ok: false, blockedReason: 'solicit' }
  if (isAbusive(trimmed)) return { ok: false, blockedReason: 'abuse' }
  if (isAroundKring(trimmed)) return { ok: false, blockedReason: 'around' }

  // no account yet: keep the text in the chat box and let the chat ask for sign-up + the 20+ check (same as any chat)
  if (!hasAccount()) {
    CHAT_DRAFT[actId] = trimmed
    if (navigateToChat) openChat(actId, undefined, true)
    return { ok: true, pending: true }
  }
  const hist = (S.chats[actId] || []).map((x) => { try { const o = JSON.parse(x); return o && o.k === 'text' ? String(o.t) : '' } catch { return '' } }).filter(Boolean)
  const masked = maskTxt(trimmed, hist)
  const at = new Date().toTimeString().slice(0, 5)
  update((st) => {
    st.act = actId
    const list = st.chats[actId] || []
    list.push(JSON.stringify({ k: 'text', t: masked, at, pre: true }))
    st.chats = { ...st.chats, [actId]: list }
  })
  if (navigateToChat) openChat(actId, undefined, true)
  return { ok: true, maskedText: masked }
}

/** Validate and publish a new story from a host.
 *  Rules:
 *  - Only ID-verified (or submitted in preview) hosts with >= 1 published activity can post.
 *  - Max 10 stories per host per day.
 *  - Max 1 Activity sticker per story.
 *  - Captions, text stickers, and poll options are checked by the Kring guard (nameBlocked / solicitation / abuse / contact masking). */
export interface CreateStoryInput {
  actId?: string
  mediaUrl: string
  mediaType?: MediaType
  durationSec?: number
  caption?: string
  stickers?: StorySticker[]
  highlight?: boolean
  highlightTitle?: string
  actTitle?: string
  actPlace?: string
  actTime?: string
  actPrice?: number
}

export function validateStoryText(text: string): { ok: boolean; reason?: string } {
  const v = (text || '').trim()
  if (!v) return { ok: true }
  if (nameBlocked(v) || isSolicitation(v)) return { ok: false, reason: 'solicit' }
  if (isAbusive(v)) return { ok: false, reason: 'abuse' }
  if (isAroundKring(v)) return { ok: false, reason: 'around' }
  if (maskTxt(v) !== v) return { ok: false, reason: 'contact' }
  return { ok: true }
}

export function createHostStory(input: CreateStoryInput, nowMs = Date.now()): { ok: boolean; error?: string; story?: StoryItem } {
  if (!S.prof.idVerified && !S.prof.idSubmittedAt) {
    return { ok: false, error: 'not_verified' }
  }
  const hasPublished = (S.myActs || []).some((x) => x && x.trim())
  if (!hasPublished) {
    return { ok: false, error: 'no_published_activity' }
  }
  const custom = Array.isArray(S.myStories) ? (S.myStories as StoryItem[]) : []
  const todayCount = custom.filter((s) => nowMs - Date.parse(s.createdAt) < STORY_TTL_MS).length
  if (todayCount >= MAX_STORIES_PER_HOST_DAY) {
    return { ok: false, error: 'daily_limit' }
  }
  const capCheck = validateStoryText(input.caption || '')
  if (!capCheck.ok) return { ok: false, error: capCheck.reason }

  const rawStickers = input.stickers || []
  let actCount = 0
  const cleanStickers: StorySticker[] = []
  for (const stk of rawStickers) {
    if (stk.kind === 'activity') {
      if (actCount >= 1) continue // max 1 Activity sticker per story
      actCount++
    }
    for (const field of [stk.text, stk.question, stk.optA, stk.optB, stk.prompt]) {
      if (field) {
        const chk = validateStoryText(field)
        if (!chk.ok) return { ok: false, error: chk.reason }
      }
    }
    cleanStickers.push(stk)
  }

  const a = ACTS.find((x) => x.id === (input.actId || S.act)) || ACTS[0]
  const hName = (S.prof.name || '').trim() || hostName(a)
  const story: StoryItem = {
    id: 'st-custom-' + nowMs,
    actId: a.id,
    hostName: hName,
    hostNameTh: hName,
    isWoman: S.gender ? S.gender === 'f' : a.f === 1,
    area: a.liveArea || 'Yaowarat',
    areaTh: thArea(a),
    mediaUrl: input.mediaUrl || ph(a.img),
    mediaType: input.mediaType || 'photo',
    durationSec: Math.min(15, Math.max(3, input.durationSec || 6)),
    caption: (input.caption || '').trim() || undefined,
    stickers: cleanStickers.length ? cleanStickers : [{ id: 'stk-act-auto', kind: 'activity', actId: a.id }],
    highlight: !!input.highlight,
    highlightTitle: input.highlightTitle || aTitle(a),
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + STORY_TTL_MS).toISOString(),
    likesCount: 0,
    viewers: [],
    mine: true,
    actTitle: input.actTitle,
    actPlace: input.actPlace,
    actTime: input.actTime,
    actPrice: input.actPrice,
  }
  if (input.actPlace) { story.area = input.actPlace; story.areaTh = input.actPlace }
  update((st) => {
    st.myStories = [story, ...(Array.isArray(st.myStories) ? st.myStories : [])]
  })
  return { ok: true, story }
}

export function removeHostHighlight(storyId: string): void {
  update((st) => {
    if (Array.isArray(st.myStories)) {
      st.myStories = (st.myStories as StoryItem[]).map((s) => (s.id === storyId ? { ...s, highlight: false } : s))
    }
    st.hiddenStories = { ...(st.hiddenStories || {}), [storyId]: true }
  })
}

/** The host deletes one of their own stories (also removes it from highlights). */
export function deleteMyStory(storyId: string): void {
  update((st) => {
    if (Array.isArray(st.myStories)) st.myStories = (st.myStories as StoryItem[]).filter((x) => x.id !== storyId)
  })
}
