// node --experimental-strip-types --test replies.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReply, menuKind, ringsText, boardText, askText, voteText, unlinkedText, LINK_JOIN, LINK_REWARDS, LINK_FEED } from './replies.ts'

const thaiOnly = (s: string) => {
  // no English words except the links and the "Kring Local" fallback name; no ring emoji
  const noLinks = s.replace(/https:\/\/\S+/g, '').replace(/Kring Local/g, '').replace(/\bLINE\b/g, '')
  assert.ok(!/[A-Za-z]{3,}/.test(noLinks), `English leaked: ${s}`)
  assert.ok(!/💍|⭕|🔵|🩷/.test(s), 'ring emoji')
  assert.ok(s.length <= 5000)
}

test('menuKind accepts only our four postbacks', () => {
  assert.equal(menuKind('km=rings'), 'rings')
  assert.equal(menuKind('km=board'), 'board')
  assert.equal(menuKind('km=ask'), 'ask')
  assert.equal(menuKind('km=vote'), 'vote')
  for (const bad of ['send:abc', 'km=drop', 'km=rings&x=1', '', null, undefined, 'KM=rings']) assert.equal(menuKind(bad), null)
})

test('unlinked LINE user gets the sign-in link for every button', () => {
  for (const k of ['rings', 'board', 'ask', 'vote'] as const) {
    const t = buildReply(k, { linked: false, kind: k })
    assert.equal(t, unlinkedText())
    assert.ok(t.includes(LINK_JOIN))
    thaiOnly(t)
  }
})

test('rings: off the paid seats, zero Rings (live dry-run shape)', () => {
  const t = ringsText({ linked: true, rings: 0, rank: 22, floor: 25, state: 'far', target_rank: 8, target_need: 25, target_open: false })
  assert.match(t, /สัปดาห์นี้คุณมี 0 ริง · อันดับที่ 22/)
  assert.match(t, /อีก 25 ริง ขึ้นที่ 8 ได้ที่นั่งรับรางวัลครับ/)
  assert.ok(t.includes(LINK_REWARDS))
  thaiOnly(t)
})

test('rings: not on the board at all', () => {
  const t = ringsText({ rings: 0, rank: null, state: 'off', target_rank: 3, target_need: 25, target_open: true, floor: 25 })
  assert.match(t, /ยังไม่มีริง/)
  assert.match(t, /อีก 25 ริง ได้ที่นั่งรับรางวัลครับ/)
  thaiOnly(t)
})

test('rings: number one, in paid seat, under the floor', () => {
  assert.match(ringsText({ rings: 73, rank: 1, state: 'top' }), /อยู่ที่ 1/)
  assert.match(ringsText({ rings: 46, rank: 2, state: 'paid', target_rank: 1, target_need: 28 }), /อีก 28 ริง ขึ้นที่ 1 ครับ/)
  assert.match(ringsText({ rings: 10, rank: 4, state: 'floor', floor: 25, target_rank: 4, target_need: 15 }), /อีก 15 ริง ถึง 25 ริง/)
})

test('board: top 5 + my own place below', () => {
  const top = [['Pichy Review💗', 73], ['พลอยนภัส', 46], ['โอท็อปไงจะใครหล่ะ', 42], ['Jaaaa', 41], ['Nes', 39]].map(([name, rings], i) => ({ rank: i + 1, name, rings, is_me: false }))
  const t = boardText({ top, me: { rank: 22, rings: 0 }, total: 22 })
  assert.equal(t.split('\n').filter((l) => /^\d\. /.test(l)).length, 5)
  assert.match(t, /คุณอยู่ที่ 22 · 0 ริง/)
  assert.ok(t.includes(LINK_REWARDS))
})

test('board: I am in the top 5 (no duplicate line), long names clipped, empty week', () => {
  const t = boardText({ top: [{ rank: 1, name: 'A'.repeat(40), rings: 9, is_me: true }], me: { rank: 1, rings: 9 } })
  assert.match(t, /\(คุณ\)/)
  assert.ok(!/คุณอยู่ที่/.test(t))
  assert.ok(t.includes('A'.repeat(19) + '…'))
  const e = boardText({ top: [], me: null })
  assert.match(e, /ยังไม่มีใครได้ริง/)
  thaiOnly(e)
  assert.match(boardText({ top: [{ rank: 1, name: 'x', rings: 5, is_me: false }], me: null }), /คุณยังไม่มีริงสัปดาห์นี้/)
})

test('ask: today, not today, none', () => {
  const t = askText({ id: 'b269784d-87ce-4fef-b4ca-0a1c4bb9351d', body: 'นัดเจอกันครั้งแรกในกรุงเทพฯ จะพาไปที่ไหนดี?', is_today: true })
  assert.match(t, /^คำถามวันนี้/)
  assert.ok(t.includes('https://kringapp.com/app/?ask=b269784d-87ce-4fef-b4ca-0a1c4bb9351d'))
  assert.match(askText({ id: 'x', body: 'q', is_today: false }), /ยังไม่มีคำถามใหม่/)
  thaiOnly(askText({ none: true }))
})

test('vote: not voted, voted, none, three options', () => {
  const base = { q: 'นัดเจอครั้งแรก: คาเฟ่ชิลๆ หรือ ตลาดนัดกลางคืน?', a: 'คาเฟ่ชิลๆ', b: 'ตลาดนัดกลางคืน', c: null }
  const t = voteText({ ...base, my_pick: null, votes: 3 })
  assert.match(t, /A\) คาเฟ่ชิลๆ\nB\) ตลาดนัดกลางคืน/)
  assert.ok(!/C\)/.test(t))
  assert.ok(t.includes(LINK_FEED))
  assert.ok(!/%|\b3\b/.test(t.replace(/https:\/\/\S+/g, '')), 'no vote counts or percentages')
  assert.match(voteText({ ...base, my_pick: 'b' }), /คุณโหวตแล้ว: ตลาดนัดกลางคืน/)
  assert.match(voteText({ ...base, c: 'อยู่บ้าน', my_pick: null }), /C\) อยู่บ้าน/)
  thaiOnly(voteText({ none: true }))
})
