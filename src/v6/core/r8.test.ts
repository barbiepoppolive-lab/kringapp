import { describe, expect, it } from 'vitest'
import { isTempleGuidingDesc } from './ticketsAndRails'
import { maskTxt } from './guard'
import { S, update } from './store'
import { createHostStory, getActivityStickerInfo, deleteMyStory } from './stories'

describe('R8 audit fixes', () => {
  it('blocks Thai verb-first temple guiding and keeps normal walks allowed', () => {
    expect(isTempleGuidingDesc('ฉันจะพานักท่องเที่ยวเข้าไปเดินบรรยายประวัติศาสตร์ในวัดพระแก้วและพระบรมมหาราชวัง')).toBe(true)
    expect(isTempleGuidingDesc('I will explain the history inside Wat Pho')).toBe(true)
    expect(isTempleGuidingDesc('เดินกินสตรีทฟู้ดเยาวราช ร้านเด็ดที่คนท้องถิ่นชอบ')).toBe(false)
    expect(isTempleGuidingDesc('Sunset photo walk along the river at Tha Tien pier')).toBe(false)
  })

  it('does not mask heights or sizes like 140cm', () => {
    expect(maskTxt('My son is 140cm, can he join? call me later')).toContain('140cm')
  })

  it("host's own story shows their own price, and the host can delete it", () => {
    update((st) => {
      st.prof.idSubmittedAt = new Date().toISOString()
      st.myActs = ['Board games at Samyan']
      st.hostActs = { 'Board games at Samyan': { cat: 'games', times: ['19:00'], price: 650 } }
    })
    const r = createHostStory({ actId: 'eat', mediaUrl: '/x.jpg', actTitle: 'Board games at Samyan', actTime: '19:00', actPrice: 650 })
    expect(r.ok).toBe(true)
    expect(getActivityStickerInfo('eat', r.story).priceLabel).toBe('฿650')
    deleteMyStory(r.story!.id)
    expect((S.myStories || []).some((x) => (x as { id: string }).id === r.story!.id)).toBe(false)
  })
})
