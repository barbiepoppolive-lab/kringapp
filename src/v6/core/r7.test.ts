import { beforeEach, describe, expect, it } from 'vitest'
import { S, update } from './store'
import {
  isStoryActive,
  isStoryHidden,
  getStoryGroups,
  markStorySeen,
  getActivityStickerInfo,
  sendStoryReplyToChat,
  setStoryRepliesOff,
  areStoryRepliesOff,
  createHostStory,
  voteStoryPoll,
  reportStory,
  type StoryItem,
  amHost,
  groupKey,
  thArea,
  MINE,
} from './stories'
import { ACTS } from './data'

const screenSources = import.meta.glob('../screens/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const resetR7State = () => {
  S.seenStories = {}
  S.likedStories = {}
  S.storyVotes = {}
  S.mutedStories = {}
  S.hiddenStories = {}
  S.storyReports = {}
  S.myStories = []
  S.hostStoryRepliesOff = {}
  S.blocked = []
  S.chats = {}
  S.prof = { ...S.prof, idVerified: true, idSubmittedAt: '2026-10-31T00:00:00Z' }
  S.myActs = ['Yaowarat street food walk']
}

describe('R7 Host Stories & Locked Design Rules', () => {
  beforeEach(() => {
    resetR7State()
  })

  it('enforces 24h story expiry (expires_at > now) and hides reported stories at 3 flags', () => {
    const now = Date.parse('2026-11-01T12:00:00Z')
    const activeStory: StoryItem = {
      id: 'st_test_active',
      actId: 'eat',
      hostName: 'Nicha',
      hostNameTh: 'ณิชา',
      isWoman: true,
      area: 'Yaowarat',
      areaTh: 'เยาวราช',
      mediaUrl: '/app/photos/yaowarat-food.jpg',
      mediaType: 'photo',
      durationSec: 6,
      caption: 'Fresh mango sticky rice',
      stickers: [],
      highlight: false,
      createdAt: new Date(now - 2 * 3600_000).toISOString(),
      expiresAt: new Date(now + 22 * 3600_000).toISOString(),
      likesCount: 12,
      viewers: [],
    }
    const expiredStory: StoryItem = {
      ...activeStory,
      id: 'st_test_expired',
      createdAt: new Date(now - 26 * 3600_000).toISOString(),
      expiresAt: new Date(now - 2 * 3600_000).toISOString(),
    }

    expect(isStoryActive(activeStory, now)).toBe(true)
    expect(isStoryActive(expiredStory, now)).toBe(false)

    // Auto-hide for all viewers after 3 reports
    const r1 = reportStory(activeStory.id)
    expect(r1.count).toBe(1)
    expect(r1.hiddenForAll).toBe(false)
    const r2 = reportStory(activeStory.id)
    expect(r2.count).toBe(2)
    expect(r2.hiddenForAll).toBe(false)
    const r3 = reportStory(activeStory.id)
    expect(r3.count).toBe(3)
    expect(r3.hiddenForAll).toBe(true)
    expect(isStoryHidden(activeStory)).toBe(true)
  })

  it('orders Locals story rings with unseen hosts before seen hosts, and excludes blocked/muted hosts', () => {
    const groups0 = getStoryGroups()
    expect(groups0.length).toBe(5)
    // Unseen hosts come first (eat=Nicha, muay=Beam, market=Mint), seen hosts after (oldtown=Ken, river=Golf)
    const unseenIds = groups0.filter((g) => g.unseen).map((g) => g.actId)
    const seenIds = groups0.filter((g) => !g.unseen).map((g) => g.actId)
    expect(unseenIds).toEqual(['eat', 'muay', 'market'])
    expect(seenIds).toEqual(['oldtown', 'river'])
    expect(groups0.map((g) => g.actId)).toEqual(['eat', 'muay', 'market', 'oldtown', 'river'])

    // Mark Nicha (eat) stories seen -> moves to seen section after Beam and Mint
    for (const st of groups0[0].stories) markStorySeen(st.id)
    const groups1 = getStoryGroups()
    expect(groups1.filter((g) => g.unseen).map((g) => g.actId)).toEqual(['muay', 'market'])
    expect(groups1.filter((g) => !g.unseen).map((g) => g.actId)).toContain('eat')

    // Blocked host never appears in the story row
    S.blocked = [{ id: 'host:muay', name: 'Beam' }]
    expect(getStoryGroups().some((g) => g.actId === 'muay')).toBe(false)
  })

  it('links activity sticker to the real activity price, time and spots, and limits to max 1 activity sticker per story', () => {
    const info = getActivityStickerInfo('eat')
    expect(info.title.length).toBeGreaterThan(0)
    expect(info.priceLabel).toBe('฿1,000')
    expect(info.timeLabel).toContain('18:30') // a real slot of the activity (17:00 / 18:30 / 19:30), closest to the planned 18:00
    expect(info.spotsLeft).toBeGreaterThanOrEqual(1)

    const created = createHostStory({
      actId: 'eat',
      mediaUrl: '/app/photos/yaowarat-food.jpg',
      mediaType: 'photo',
      caption: 'Testing two activity stickers',
      highlight: true,
      stickers: [
        { id: 'stk1', kind: 'activity', actId: 'eat' },
        { id: 'stk2', kind: 'activity', actId: 'muay' },
        { id: 'stk3', kind: 'poll', question: 'Spicy or mild?', optA: '🌶️ Spicy', optB: '🥥 Mild' },
      ],
    })
    expect(created.ok).toBe(true)
    expect(created.story).toBeDefined()
    expect(created.story!.stickers.filter((s: { kind: string }) => s.kind === 'activity')).toHaveLength(1)

    // Poll voting updates live percentage
    const pollRes = voteStoryPoll(created.story!.id, 0)
    expect(pollRes.choice).toBe(0)
    expect(pollRes.pctA + pollRes.pctB).toBe(100)
  })

  it('routes story replies and "Ask me" through the Kring chat guard (masks phones/LINE/links and blocks banned words)', () => {
    // 1. Banned solicitation/hotel diversion is blocked
    const bad = sendStoryReplyToChat('eat', 'Come to my hotel room tonight for sex', false)
    expect(bad.ok).toBe(false)
    expect(bad.blockedReason).toBe('solicit')

    // 2. Abuse / swearing is blocked
    const abuse = sendStoryReplyToChat('eat', 'fuck you idiot', false)
    expect(abuse.ok).toBe(false)
    expect(abuse.blockedReason).toBe('abuse')

    // 3. Without an account the reply waits in the chat box (sign-up + 20+ check first), nothing is sent
    update((s) => { s.signedIn = false; s.prof.termsAt = null })
    const before = (S.chats['eat'] || []).length
    const pending = sendStoryReplyToChat('eat', 'Is it spicy?', false)
    expect(pending.ok).toBe(true)
    expect(pending.pending).toBe(true)
    expect((S.chats['eat'] || []).length).toBe(before)

    // 4. Signed in: phone numbers, LINE IDs and external links are masked before saving to chat
    update((s) => { s.signedIn = true; s.prof.termsAt = new Date().toISOString() })
    const leak = sendStoryReplyToChat('eat', 'Add my line nichabkk or call 081-234-5678 before we meet', false)
    expect(leak.ok).toBe(true)
    expect(leak.maskedText).toBeDefined()
    expect(leak.maskedText).not.toContain('081-234-5678')
    expect(leak.maskedText).not.toContain('nichabkk')
  })

  it('allows women hosts to turn off story replies, blocking new story replies', () => {
    expect(areStoryRepliesOff('eat')).toBe(false)
    setStoryRepliesOff('eat', true)
    expect(areStoryRepliesOff('eat')).toBe(true)

    const res = sendStoryReplyToChat('eat', 'Is vegetarian mango sticky rice available?', false)
    expect(res.ok).toBe(false)
    expect(res.blockedReason).toBe('replies_off')
  })

  it('renders the animated 3D Kring logo (<Head />) ONLY on Explore (Experiences + Locals)', () => {
    const filesUsingHead = Object.entries(screenSources)
      .filter(([, src]) => /<Head\b/.test(src))
      .map(([p]) => p.split('/').pop()!)
    expect(filesUsingHead).toEqual(['explore.tsx'])
  })

  it('R7 audit: a host keeps host features on guest screens, and their story links to THEIR activity in its own ring', () => {
    update((st) => {
      st.host = false // browsing Locals as a guest screen
      st.prof.idSubmittedAt = new Date().toISOString()
      st.myActs = ['Board games at Samyan']
      st.hostActs = { 'Board games at Samyan': { cat: 'games', place: { th: 'สามย่านมิตรทาวน์', en: 'Samyan Mitrtown' }, times: ['19:00'] } }
    })
    expect(amHost()).toBe(true)
    const res = createHostStory({ actId: 'eat', mediaUrl: '/x.jpg', actTitle: 'Board games at Samyan', actPlace: 'Samyan Mitrtown', actTime: '19:00' })
    expect(res.ok).toBe(true)
    const groups = getStoryGroups()
    expect(groupKey(groups[0])).toBe(MINE) // own ring first, separate from Nicha's ring
    expect(groups.filter((g) => g.actId === 'eat' && !g.mine).length).toBeLessThanOrEqual(1)
    const info = getActivityStickerInfo('eat', res.story)
    expect(info.title).toBe('Board games at Samyan')
    expect(info.timeLabel).toContain('19:00')
  })

  it('R7 audit: Thai area never shows a bare station prefix (BTS/MRT)', () => {
    for (const a of ACTS) expect(['BTS', 'MRT', 'ARL', 'SRT']).not.toContain(thArea(a))
  })
})
