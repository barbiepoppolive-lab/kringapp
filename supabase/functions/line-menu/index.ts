// line-menu: answers the Kring LINE rich menu buttons on @194hsqbc (Kring! Café) with LINE REPLY messages
// (free; reply messages do not count toward the monthly push quota). Never pushes.
//
// Called by the kring-inbox Cloudflare Worker (the channel's webhook, /line/cafe), which forwards the raw
// LINE webhook body + x-line-signature unchanged when it contains a rich-menu postback (data "km=…").
// This function checks the LINE signature itself with the channel secret, so it is safe to point
// LINE straight at it too.
//
// Secrets: LINE_CAFE_CHANNEL_SECRET, LINE_CAFE_CHANNEL_ACCESS_TOKEN (set via the Management API),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in).
// Data: public.kr8_line_menu_data(p_line_sub, p_kind) (m240, service role only).
import { buildReply, errorText, menuKind } from './replies.ts'

const env = (k: string) => Deno.env.get(k) ?? ''

async function lineSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function menuData(lineUserId: string, kind: string): Promise<any> {
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/kr8_line_menu_data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ p_line_sub: lineUserId, p_kind: kind }),
  })
  if (!res.ok) throw new Error(`rpc ${res.status}`)
  return await res.json()
}

async function reply(replyToken: string, text: string): Promise<number> {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('LINE_CAFE_CHANNEL_ACCESS_TOKEN')}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) console.log('reply failed', res.status, (await res.text()).slice(0, 200))
  return res.status
}

async function handle(ev: any): Promise<string> {
  if (ev?.type !== 'postback' || ev?.source?.type !== 'user') return 'skip'
  const kind = menuKind(ev.postback?.data)
  const uid = String(ev.source?.userId ?? '')
  if (!kind || !ev.replyToken || !/^U[0-9a-f]{32}$/.test(uid)) return 'skip'
  let text: string
  try {
    text = buildReply(kind, await menuData(uid, kind))
  } catch (e) {
    console.log('menu data failed', kind, String(e).slice(0, 200))
    text = errorText()
  }
  const st = await reply(ev.replyToken, text)
  return `${kind}:${st}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const body = await req.text()
  const secret = env('LINE_CAFE_CHANNEL_SECRET')
  const sig = req.headers.get('x-line-signature') ?? ''
  if (!secret || !sig || !safeEqual(await lineSignature(secret, body), sig)) return new Response('bad signature', { status: 401 })
  let payload: any
  try { payload = JSON.parse(body) } catch { return new Response('bad json', { status: 400 }) }
  const events: any[] = Array.isArray(payload?.events) ? payload.events.slice(0, 20) : []
  const out = await Promise.all(events.map((e) => handle(e).catch((err) => { console.log('event failed', String(err).slice(0, 200)); return 'err' })))
  return Response.json({ ok: true, handled: out.filter((s) => s !== 'skip') })
})
