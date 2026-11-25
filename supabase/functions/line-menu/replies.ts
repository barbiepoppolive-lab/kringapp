// Kring LINE rich menu (@194hsqbc): Thai reply texts for the four answer buttons.
// Pure functions (no I/O) so they can be unit-tested in Node. Thai only, short, polite, no emoji ring icons.
// Data comes from public.kr8_line_menu_data (m240).

export const APP = 'https://kringapp.com/app/'
export const LINK_REWARDS = 'https://kringapp.com/app/?tab=me&open=rewards'
export const LINK_FEED = 'https://kringapp.com/app/?tab=feed'
export const LINK_JOIN = 'https://kringapp.com/app/?join=1'
export const LINK_HELP = 'https://kringapp.com/app/?tab=me&open=help'
export const askLink = (id: string) => `https://kringapp.com/app/?ask=${encodeURIComponent(id)}`

export type Kind = 'rings' | 'board' | 'ask' | 'vote'
export const KINDS: Kind[] = ['rings', 'board', 'ask', 'vote']

const CLOSE = 'บอร์ดปิดคืนวันอาทิตย์ 23:59 น.'
const MAX = 4800 // LINE text limit is 5000

const clipName = (s: unknown) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim() || 'Kring Local'
  const a = Array.from(t)
  return a.length > 20 ? a.slice(0, 19).join('') + '…' : t
}
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const clip = (s: string) => (s.length > MAX ? s.slice(0, MAX - 1) + '…' : s)

export function unlinkedText(): string {
  return [
    'ยังไม่พบบัญชีกริ๊ง! ที่เชื่อมกับ LINE นี้ครับ',
    'เข้าสู่ระบบด้วย LINE ในแอปครั้งเดียว แล้วกดปุ่มนี้อีกครั้งได้เลยครับ',
    LINK_JOIN,
  ].join('\n')
}

export function errorText(): string {
  return 'ขอโทษครับ ตอนนี้ระบบตอบช้า ลองกดอีกครั้งในอีกสักครู่นะครับ'
}

export function ringsText(d: any): string {
  const rings = n(d.rings)
  const rank = d.rank == null ? null : n(d.rank)
  const need = n(d.target_need)
  const tgt = d.target_rank == null ? null : n(d.target_rank)
  const lines: string[] = []
  if (rings === 0 && rank == null) lines.push('สัปดาห์นี้คุณยังไม่มีริงครับ')
  else lines.push(rank ? `สัปดาห์นี้คุณมี ${rings} ริง · อันดับที่ ${rank}` : `สัปดาห์นี้คุณมี ${rings} ริง`)
  switch (d.state) {
    case 'top':
      lines.push('ตอนนี้คุณอยู่ที่ 1 ครับ รักษาไว้ให้ถึงคืนวันอาทิตย์นะครับ')
      break
    case 'floor':
      lines.push(`อีก ${need} ริง ถึง ${n(d.floor)} ริง ได้ที่นั่งรับรางวัลครับ`)
      break
    case 'paid':
      if (tgt) lines.push(`อีก ${need} ริง ขึ้นที่ ${tgt} ครับ`)
      break
    default:
      if (need > 0 && tgt) lines.push(d.target_open ? `อีก ${need} ริง ได้ที่นั่งรับรางวัลครับ` : `อีก ${need} ริง ขึ้นที่ ${tgt} ได้ที่นั่งรับรางวัลครับ`)
  }
  lines.push(CLOSE, `ดูริงของคุณ: ${LINK_REWARDS}`)
  return clip(lines.join('\n'))
}

export function boardText(d: any): string {
  const top: any[] = Array.isArray(d.top) ? d.top : []
  if (!top.length) {
    return clip(['อันดับสัปดาห์นี้', 'ยังไม่มีใครได้ริงเลยครับ เริ่มก่อนได้เปรียบ', CLOSE, LINK_REWARDS].join('\n'))
  }
  const lines = ['อันดับสัปดาห์นี้']
  for (const r of top.slice(0, 5)) lines.push(`${n(r.rank)}. ${clipName(r.name)} · ${n(r.rings)} ริง${r.is_me ? ' (คุณ)' : ''}`)
  const me = d.me
  if (!me) lines.push('', 'คุณยังไม่มีริงสัปดาห์นี้ครับ')
  else if (!top.some((r) => r.is_me)) lines.push('', `คุณอยู่ที่ ${n(me.rank)} · ${n(me.rings)} ริง`)
  lines.push(CLOSE, `ดูบอร์ดเต็ม: ${LINK_REWARDS}`)
  return clip(lines.join('\n'))
}

export function askText(d: any): string {
  if (d.none || !d.id) return 'ยังไม่มีคำถามตอนนี้ครับ แวะมาใหม่พรุ่งนี้นะครับ'
  const body = String(d.body ?? '').trim()
  const head = d.is_today ? 'คำถามวันนี้' : 'วันนี้ยังไม่มีคำถามใหม่ครับ คำถามล่าสุด'
  return clip([head, `“${body}”`, `ตอบในแอปได้เลย: ${askLink(String(d.id))}`].join('\n'))
}

export function voteText(d: any): string {
  if (d.none || !d.q) return 'วันนี้ยังไม่มีโหวตครับ แวะมาใหม่พรุ่งนี้นะครับ'
  const opts = [['A', d.a], ['B', d.b], ['C', d.c]].filter(([, v]) => v && String(v).trim())
  const lines = ['โหวตวันนี้', String(d.q).trim(), ...opts.map(([k, v]) => `${k}) ${String(v).trim()}`)]
  const mine = opts.find(([k]) => String(k).toLowerCase() === String(d.my_pick ?? '').toLowerCase())
  if (mine) lines.push(`คุณโหวตแล้ว: ${String(mine[1]).trim()}`, `ดูว่าเพื่อนๆ เลือกอะไร: ${LINK_FEED}`)
  else lines.push(`โหวตในแอปได้เลย: ${LINK_FEED}`)
  return clip(lines.join('\n'))
}

export function buildReply(kind: Kind, d: any): string {
  if (!d || d.linked === false) return unlinkedText()
  switch (kind) {
    case 'rings': return ringsText(d)
    case 'board': return boardText(d)
    case 'ask': return askText(d)
    case 'vote': return voteText(d)
  }
}

/** Postback data from the menu: "km=rings" etc. Anything else is not ours. */
export function menuKind(data: unknown): Kind | null {
  const m = /^km=([a-z]+)$/.exec(String(data ?? ''))
  return m && (KINDS as string[]).includes(m[1]) ? (m[1] as Kind) : null
}
