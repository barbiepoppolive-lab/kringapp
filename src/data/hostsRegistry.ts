export interface UnifiedHostRecord {
  id: string
  name: string
  age: number
  nationality: string
  flag: string
  city: 'Bangkok' | 'Pattaya'
  district: string
  defaultVenue: string
  shortVenue: string
  defaultTime: string
  insiderSpotPickEn: string
  insiderSpotPickTh: string
  insiderSpotPickZh: string
  inShopPinLabel?: string
  hasBestieSquad?: boolean
  bestieName?: string
  baseOfferThb: number
  treatGoalCoins: number
  heightCm: number
  weightKg: number
  lastActive: 'online' | 'today' | 'week'
  avatarUrl: string
  galleryUrls: string[]
  interestedCount: number
}

export const UNIFIED_HOSTS_REGISTRY: Record<string, UnifiedHostRecord> = {
  mint: {
    id: 'host-mint',
    name: 'Mint',
    age: 24,
    nationality: '🇹🇭 Thai',
    flag: '🇹🇭',
    city: 'Bangkok',
    district: 'Thonglor / Ekkamai',
    defaultVenue: 'Tichuca Rooftop · 8 PM',
    shortVenue: 'Tichuca',
    defaultTime: '8:00 PM',
    insiderSpotPickEn: "🍸 Mint's Pick: Sunset Cocktails @ Tichuca 8 PM",
    insiderSpotPickTh: '🍸 ร้านโปรดมิ้นท์: จิบค็อกเทลวิวมุมสูง @ Tichuca 20:00',
    insiderSpotPickZh: '🍸 Mint精选：Tichuca高空日落鸡尾酒 20:00',
    inShopPinLabel: '📍 At Shop Now · BKK Nails & Café Thonglor',
    hasBestieSquad: true,
    bestieName: 'Ploy',
    baseOfferThb: 300,
    treatGoalCoins: 30_000,
    heightCm: 164,
    weightKg: 46,
    lastActive: 'online',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
    ],
    interestedCount: 7,
  },
  ploy: {
    id: 'host-ploy',
    name: 'Ploy',
    age: 22,
    nationality: '🇹🇭 Thai',
    flag: '🇹🇭',
    city: 'Bangkok',
    district: 'Thonglor / Ekkamai',
    defaultVenue: 'Wine Republic Thonglor · 9 PM',
    shortVenue: 'Wine Republic',
    defaultTime: '9:00 PM',
    insiderSpotPickEn: "🍷 Ploy's Pick: Wine & Vinyl @ Wine Republic 9 PM",
    insiderSpotPickTh: '🍷 ร้านโปรดพลอย: ไวน์ & แผ่นเสียง @ Wine Republic 21:00',
    insiderSpotPickZh: '🍷 Ploy精选：Wine Republic红酒黑胶之夜 21:00',
    hasBestieSquad: true,
    bestieName: 'Mint',
    baseOfferThb: 1200,
    treatGoalCoins: 120_000,
    heightCm: 166,
    weightKg: 48,
    lastActive: 'online',
    avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&auto=format&fit=crop&q=80',
    ],
    interestedCount: 12,
  },
  kwan: {
    id: 'host-kwan',
    name: 'Kwan',
    age: 25,
    nationality: '🇻🇳 Vietnamese',
    flag: '🇻🇳',
    city: 'Bangkok',
    district: 'Asok / Phrom Phong',
    defaultVenue: 'EmQuartier Courtyard · 7:30 PM',
    shortVenue: 'EmQuartier',
    defaultTime: '7:30 PM',
    insiderSpotPickEn: "☕ Kwan's Pick: Craft Matcha & Tapas @ EmQuartier 7:30 PM",
    insiderSpotPickTh: '☕ ร้านโปรดขวัญ: มัทฉะ & ทาปาส @ EmQuartier 19:30',
    insiderSpotPickZh: '☕ Kwan精选：EmQuartier庭院微醺 19:30',
    inShopPinLabel: '📍 At Spa Now · Serenity Head-Spa Phrom Phong',
    hasBestieSquad: false,
    baseOfferThb: 800,
    treatGoalCoins: 80_000,
    heightCm: 162,
    weightKg: 45,
    lastActive: 'online',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80',
    ],
    interestedCount: 9,
  },
  bee: {
    id: 'host-bee',
    name: 'Bee',
    age: 23,
    nationality: '🇹🇭 Thai',
    flag: '🇹🇭',
    city: 'Bangkok',
    district: 'Asok / Phrom Phong',
    defaultVenue: 'Octave Rooftop Bar · 10 PM',
    shortVenue: 'Octave',
    defaultTime: '10:00 PM',
    insiderSpotPickEn: "🥂 Bee's Pick: 360° Skyline Drinks @ Octave 10 PM",
    insiderSpotPickTh: '🥂 ร้านโปรดบี: รูฟท็อปวิว 360° @ Octave 22:00',
    insiderSpotPickZh: '🥂 Bee精选：Octave 360°天际线酒吧 22:00',
    inShopPinLabel: '📍 At Lounge Now · Octave Sukhumvit 57',
    hasBestieSquad: true,
    bestieName: 'Kwan',
    baseOfferThb: 500,
    treatGoalCoins: 50_000,
    heightCm: 168,
    weightKg: 49,
    lastActive: 'today',
    avatarUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&auto=format&fit=crop&q=80',
    ],
    interestedCount: 5,
  },
  fah: {
    id: 'host-fah',
    name: 'Fah',
    age: 23,
    nationality: '🇷🇺 Russian',
    flag: '🇷🇺',
    city: 'Pattaya',
    district: 'Pattaya Beach / Walking St',
    defaultVenue: 'Pattaya Beach Club · 8 PM',
    shortVenue: 'Pattaya Beach',
    defaultTime: '8:00 PM',
    insiderSpotPickEn: "🏖️ Fah's Pick: Sunset Cabana @ Pattaya Beach Club 8 PM",
    insiderSpotPickTh: '🏖️ ร้านโปรดฟ้า: บีชคลับริมทะเล @ พัทยา 20:00',
    insiderSpotPickZh: '🏖️ Fah精选：芭堤雅海滩俱乐部日落卡座 20:00',
    inShopPinLabel: '📍 At Bar Now · Horizon Rooftop Pattaya',
    hasBestieSquad: true,
    bestieName: 'Mint',
    baseOfferThb: 300,
    treatGoalCoins: 30_000,
    heightCm: 171,
    weightKg: 52,
    lastActive: 'online',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
    ],
    interestedCount: 6,
  },
}

export function resolveUnifiedHost(idOrName?: string | null): UnifiedHostRecord {
  if (!idOrName) return UNIFIED_HOSTS_REGISTRY.ploy
  const clean = idOrName.toLowerCase().replace(/^host-/, '').trim()
  if (clean.includes('mint')) return UNIFIED_HOSTS_REGISTRY.mint
  if (clean.includes('kwan')) return UNIFIED_HOSTS_REGISTRY.kwan
  if (clean.includes('bee')) return UNIFIED_HOSTS_REGISTRY.bee
  if (clean.includes('fah')) return UNIFIED_HOSTS_REGISTRY.fah
  if (clean.includes('ploy')) return UNIFIED_HOSTS_REGISTRY.ploy
  return UNIFIED_HOSTS_REGISTRY[clean] ?? UNIFIED_HOSTS_REGISTRY.ploy
}
