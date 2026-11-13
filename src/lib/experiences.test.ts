import { beforeEach, describe, expect, it } from 'vitest'
import {
  EXPERIENCES,
  GROUPS,
  LOCAL_PROFILES,
  ONBOARD_FIRST,
  durationLabel,
  experiencesIn,
  getCity,
  getExperience,
  groupCounts,
  localsFor,
  priceLine,
  setCity,
  shortTitle,
  venueIn,
} from './experiences'
import { addSelfAlias, getLiveState, isSelf, isSelfAny, setLiveState, setSelfIdentity } from './selfGuard'
import { isPinned, togglePin } from './pins'

describe('Kring catalogue (round 2 · section C table)', () => {
  it('holds the full table: 59 experiences (54 + 5 two-way) in 10 groups, Bangkok + Pattaya, unique ids', () => {
    expect(EXPERIENCES).toHaveLength(59)
    expect(GROUPS).toHaveLength(10)
    expect(new Set(EXPERIENCES.map((e) => e.id)).size).toBe(EXPERIENCES.length)
    for (const g of GROUPS) expect(EXPERIENCES.some((e) => e.group === g.id)).toBe(true)
    expect(EXPERIENCES.some((e) => e.city.includes('bangkok'))).toBe(true)
    expect(EXPERIENCES.some((e) => e.city.includes('pattaya'))).toBe(true)
  })

  it('marks the 14 onboard-first (★) items exactly as the table does — all easy to host', () => {
    expect(ONBOARD_FIRST.map((e) => e.id)).toEqual([
      'street-food-walk', 'night-market-tasting', 'cafe-hop-desserts', 'temple-cafe-morning', 'salon-nails',
      'running-club', 'shopping-buddy', 'chatuchak-guide', 'night-market-live-music', 'thai-language-cafe',
      'airport-buddy', 'sim-banking-help', 'jomtien-run', 'video-trip-planning',
    ])
    for (const e of ONBOARD_FIRST) expect(e.ease).toBe('easy')
  })

  it('never lists alcohol, dating or private-room experiences; massage only at licensed spas', () => {
    const banned = /cocktail|beer|wine|whisky|bar crawl|\bpubs?\b|club night|\bdate\b|escort|nuru|erotic|happy.ending|condo meet|private room|hotel room|เหล้า|เบียร์/i
    for (const e of EXPERIENCES) {
      expect(`${e.title} ${e.titleTh} ${e.venueEn}`).not.toMatch(banned)
      if (/massage/i.test(e.title)) {
        expect(e.plusVenue).toBe('spa')
        expect(e.ease).toBe('licensed')
      }
    }
  })

  it('filters by city (Pattaya lights "Pattaya & sea"; Bangkok has none of it except the day trip)', () => {
    expect(groupCounts('pattaya').sea).toBe(4)
    expect(groupCounts('bangkok').sea).toBe(1)
    expect(experiencesIn('pattaya').every((e) => e.city.includes('pattaya'))).toBe(true)
    // ★ first
    expect(experiencesIn('bangkok')[0].onboardFirst).toBe(true)
  })

  it('formats "from ฿X · ~Nh" with baht only', () => {
    const e = getExperience('street-food-walk')!
    expect(priceLine(e)).toBe('from ฿1,200 · ~3h')
    expect(priceLine(getExperience('thai-massage-spa')!)).toBe('from ฿900 + spa · ~2h')
    expect(durationLabel(0.5)).toBe('30 min')
    expect(shortTitle(e)).toBe('Street-food walk')
  })

  it('finds the locals who host an experience in a city, signature hosts first', () => {
    const e = getExperience('street-food-walk')!
    const ids = localsFor(e, 'bangkok').map((p) => p.hostId)
    expect(ids[0]).toBe('host-kwan')
    expect(localsFor(getExperience('koh-larn-day')!, 'pattaya')[0].hostId).toBe('host-fah')
    // "Hosts at" only for fixed licensed venues
    for (const p of Object.values(LOCAL_PROFILES)) if (p.venueMode === 'hostsAt') expect(p.licensed).toBeTruthy()
  })
})

describe('city switch (shared with Kring Price)', () => {
  it('persists and broadcasts the city', () => {
    let heard = ''
    const on = (e: Event) => (heard = (e as CustomEvent<{ city: string }>).detail.city)
    window.addEventListener('kring:city', on)
    setCity('pattaya')
    expect(getCity()).toBe('pattaya')
    expect(window.localStorage.getItem('kring_city_v1')).toBe('pattaya')
    expect(heard).toBe('pattaya')
    setCity('bangkok')
    window.removeEventListener('kring:city', on)
  })
})

describe('silent self-guard', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setSelfIdentity(null)
  })

  it('isSelf compares id or name against the signed-in user (case-insensitive), never empty values', () => {
    expect(isSelf('host-mint')).toBe(false)
    setSelfIdentity({ userId: 'u-1', displayName: 'Mint', aliases: ['host-mint'] })
    expect(isSelf('host-mint')).toBe(true)
    expect(isSelf('MINT')).toBe(true)
    expect(isSelf('Ploy')).toBe(false)
    expect(isSelf('')).toBe(false)
    expect(isSelfAny('x', 'mint')).toBe(true)
    // the original two-argument form still works
    expect(isSelf('Bee', { userId: 'b', displayName: 'Bee' })).toBe(true)
  })

  it('falls back to the stored session and the published host ids', () => {
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'host-ploy', displayName: 'Ploy', role: 'host' }))
    expect(isSelf('host-ploy')).toBe(true)
    addSelfAlias('host-ploy-2')
    expect(isSelf('host-ploy-2')).toBe(true)
  })

  it('Live is the default; Paused is stored and broadcast', () => {
    expect(getLiveState()).toBe('live')
    let n = 0
    const on = () => (n += 1)
    window.addEventListener('kring:live-changed', on)
    setLiveState('paused')
    expect(getLiveState()).toBe('paused')
    expect(n).toBe(1)
    window.removeEventListener('kring:live-changed', on)
  })

  it('you cannot pin yourself (silent no-op); others pin and unpin', () => {
    setSelfIdentity({ userId: 'host-mint', displayName: 'Mint' })
    expect(togglePin('host-mint', 'Mint')).toBe(false)
    expect(isPinned('host-mint')).toBe(false)
    expect(togglePin('host-ploy', 'Ploy')).toBe(true)
    expect(isPinned('host-ploy')).toBe(true)
    expect(togglePin('host-ploy', 'Ploy')).toBe(false)
    expect(isPinned('host-ploy')).toBe(false)
  })
})

describe('KRING FIX1 · F3 — data that never contradicts itself (Wei 9, Ploy 10)', () => {
  it('a both-cities experience shows its own city venue (no Pattaya market in Bangkok, no Siam in Pattaya)', () => {
    const night = getExperience('night-market-tasting')!
    expect(venueIn(night, 'bangkok').en).not.toMatch(/Thepprasit/i)
    expect(venueIn(night, 'pattaya').en).toMatch(/Thepprasit/i)
    const shop = getExperience('shopping-buddy')!
    expect(venueIn(shop, 'pattaya').en).not.toMatch(/Siam/i)
    for (const e of EXPERIENCES.filter((x) => x.city.includes('pattaya') && !x.online)) {
      expect(venueIn(e, 'pattaya').en, e.id).not.toMatch(/Siam|Lumphini|Sukhumvit|Silom|Yaowarat|Thonglor|Rama 9/i)
    }
  })

  it('every review names a real experience its local actually hosts, and reviewers are a mix (solo, couple, family, group)', () => {
    const parties = new Set<string>()
    for (const p of Object.values(LOCAL_PROFILES)) {
      for (const q of p.quotes) {
        const e = getExperience(q.exp)
        expect(e, `${p.name}: ${q.exp}`).toBeTruthy()
        expect(p.signature.some((s) => s.id === q.exp), `${p.name} hosts ${q.exp}`).toBe(true)
        if (q.party) parties.add(q.party)
      }
    }
    expect([...parties].sort()).toEqual(['couple', 'family', 'group', 'solo'])
  })

  it('a spa local is not offered for the street-food walk, and no spa review sits under it', () => {
    const walk = getExperience('street-food-walk')!
    const locals = localsFor(walk, 'bangkok')
    expect(locals.map((l) => l.hostId)).not.toContain('host-ploy')
    // a rooftop-café local is not offered (or able to win a multi-request) for the food walk either
    expect(locals.map((l) => l.hostId)).not.toContain('host-bee')
    for (const l of locals) expect(l.signature.some((s) => getExperience(s.id)?.group === walk.group), l.name).toBe(true)
    const quotes = locals.flatMap((l) => l.quotes.filter((q) => q.exp === walk.id))
    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes.every((q) => !/spa/i.test(q.text))).toBe(true)
  })

  it('Thai titles never call a paid local "เพื่อน…" (escort-ad phrasing)', () => {
    for (const e of EXPERIENCES) expect(e.titleTh, e.id).not.toMatch(/เพื่อน(ช้อป|เที่ยว|รับ|แปล|ไป|ดู)/)
    for (const p of Object.values(LOCAL_PROFILES)) for (const s of p.signature) expect(s.titleTh, s.id).not.toMatch(/เพื่อน/)
  })
})

describe('KRING FIX2 · F3', () => {
  it('Wei 56/70 — every venue is a named place, never a category ("Salon in a mall"); Yaowarat is Samphanthawong', () => {
    const generic = /^(salon in a mall|licensed spa lobby|barber shop|sports hall|quiet café|cooking school|local restaurant|community workshop|board-game café|neighbourhood temple|public rooftop terrace|mall service counter|hospital main lobby|public venue)$/i
    for (const e of EXPERIENCES) {
      expect(e.venueEn, e.id).not.toMatch(generic)
      if (e.city.includes('pattaya')) expect(venueIn(e, 'pattaya').en, e.id).not.toMatch(generic)
    }
    expect(venueIn(getExperience('salon-nails')!, 'bangkok').en).toBe('Siam Paragon beauty floor (4F), Siam')
    expect(venueIn(getExperience('salon-nails')!, 'pattaya').en).toMatch(/Central Festival Pattaya/)
    expect(getExperience('street-food-walk')!.title).toMatch(/Samphanthawong/)
    expect(getExperience('street-food-walk')!.title).not.toMatch(/Bang Rak/)
  })

  it('Ploy — no Thonglor rooftop: Bee hosts a riverside café sunset (daytime-café wording, not a bar)', () => {
    const bee = LOCAL_PROFILES['host-bee']
    expect(`${bee.placeEn} ${bee.placeTh} ${bee.signature.map((s) => `${s.titleEn} ${s.titleTh}`).join(' ')}`).not.toMatch(/rooftop|รูฟท็อป|ดาดฟ้า|Thonglor|ทองหล่อ/i)
  })

  it('Ploy 4 — a Local who is Live (ID ✓ + one listing) gets her own card; Paused / unchecked / traveller → none', async () => {
    const { selfLocalCard } = await import('./selfGuard')
    const { registerSelfProfile, localProfile } = await import('./experiences')
    const now = new Date().toISOString()
    window.localStorage.clear()
    setSelfIdentity(null)
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'u-ploy', role: 'host', displayName: 'Demo Traveler' }))
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, name: 'พลอย', city: 'Bangkok', langs: ['th', 'en'] }))
    window.localStorage.setItem('kring_presence_v1', JSON.stringify({ setup: true, live: true, experiences: [{ id: 'street-food-walk', priceThb: 1200 }] }))
    expect(selfLocalCard()).toBeNull() // ID not checked yet
    window.localStorage.setItem('kring_id_check_v1', JSON.stringify({ 'u-ploy': now }))
    const me = selfLocalCard()!
    expect(me).toMatchObject({ id: 'u-ploy', name: 'พลอย', city: 'Bangkok', experiences: [{ id: 'street-food-walk', priceThb: 1200 }] })
    expect(isSelf(me.id)).toBe(true)
    const p = registerSelfProfile(me)
    expect(localProfile({ id: 'u-ploy', name: 'พลอย' })).toBe(p)
    expect(p.signature[0]).toMatchObject({ id: 'street-food-walk', fromThb: 1200 })
    expect(localsFor(getExperience('street-food-walk')!, 'bangkok', [p]).map((x) => x.hostId)).toEqual(['u-ploy'])
    expect(p.reviews).toBe(0)
    window.localStorage.setItem('kring_presence_v1', JSON.stringify({ setup: true, live: false, experiences: [{ id: 'street-food-walk', priceThb: 1200 }] }))
    expect(selfLocalCard()).toBeNull() // Paused
    // T3 · no modes: the stored role no longer matters — someone who shared (setup + listing) keeps her card…
    window.localStorage.setItem('kring_presence_v1', JSON.stringify({ setup: true, live: true, experiences: [{ id: 'street-food-walk', priceThb: 1200 }] }))
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'u-ploy', role: 'guest' }))
    expect(selfLocalCard()?.id).toBe('u-ploy')
    // …and someone who never shared anything has none
    window.localStorage.setItem('kring_presence_v1', JSON.stringify({ live: true }))
    expect(selfLocalCard()).toBeNull() // never shared
    delete (LOCAL_PROFILES as Record<string, unknown>)['u-ploy']
    window.localStorage.clear()
  })

  it('V4.3 · evenings group label is Evening Views & Night Markets and eat group note uses dessert bars', async () => {
    const { isAllowedListingText, isPublicPlace } = await import('./experiences')
    const evenings = GROUPS.find((g) => g.id === 'evenings')!
    expect(evenings.en).toBe('Evening Views & Night Markets')
    expect(evenings.th).toContain('ชมวิวพระอาทิตย์ตก')
    const eat = GROUPS.find((g) => g.id === 'eat')!
    expect(eat.noteEn).toBe('Street food · night markets · cafés · dessert bars')
    expect(eat.noteTh).toBe('สตรีทฟู้ด · ตลาดกลางคืน · คาเฟ่ · ร้านของหวาน')
    expect(getExperience('sunset-viewpoint-snacks')?.title).toContain('Sunset viewpoint café')
    expect(isAllowedListingText('Cha Yen & Thai dessert café walk')).toBe(true)
    expect(isAllowedListingText('Free beer & bar crawl in Sukhumvit')).toBe(false)
    expect(isPublicPlace('Craft beer happy hour pub crawl')).toBe(false)
  })

  it('Option A · every experience maps to a licensed scene-first photo in /photos/experiences/', async () => {
    const { experiencePhoto } = await import('./experiences')
    for (const e of EXPERIENCES) {
      expect(experiencePhoto(e), e.id).toMatch(/^\/photos\/experiences\/[a-z0-9-]+\.jpg$/)
    }
  })
})
