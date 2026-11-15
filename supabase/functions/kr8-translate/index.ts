// Supabase Edge Function: kr8-translate
// Translates ONE chat message into the reader's language, for a member who is in that chat. Used only on phones that cannot use
// the free on-device language pack. The provider key stays here (never in the browser). Message text is never logged.
//   POST { message_id: number, target: "en" | "th" | … }   Authorization: Bearer <the member's sign-in token>
//   → { status: "ok", text, source, via } | { status: "same" | "unavailable" | "off" | "too_long" | "limit_minute" | "limit_member" | "limit_day" | "forbidden" | "sign_in" }
// Secrets: IAPP_API_KEY (iApp Technology). TRANSLATE_PROVIDER = "iapp" (default) | "off". Caps live in the table kr8_translate_config.
import { handle, iappProvider, type Claim, type Provider } from "./core.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE;
const ALLOWED = [/^https:\/\/(www\.)?kringapp\.com$/, /^https:\/\/[a-z0-9-]+\.kringapp\.pages\.dev$/, /^http:\/\/localhost(:\d+)?$/];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED.some((r) => r.test(origin)) ? origin : "https://kringapp.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  return (await r.json()) as T;
}
async function whoIs(auth: string | null): Promise<string | null> {
  if (!auth || !/^Bearer\s+\S+/i.test(auth)) return null;
  try {
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
    if (!r.ok) return null;
    const u = (await r.json()) as { id?: string };
    return typeof u?.id === "string" ? u.id : null;
  } catch { return null; }
}
function provider(): Provider | null {
  const which = (Deno.env.get("TRANSLATE_PROVIDER") ?? "iapp").toLowerCase();
  const key = Deno.env.get("IAPP_API_KEY");
  return which === "iapp" && key ? iappProvider(key) : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ status: "method" }, 405, origin);
  const input = await req.json().catch(() => ({}));
  const userId = await whoIs(req.headers.get("authorization"));
  const res = await handle(input, {
    userId,
    claim: (user, message, target) => rpc<Claim>("kr8_translate_claim", { p_user: user, p_message: message, p_target: target }),
    store: async (message, target, source, prov, text) => { await rpc("kr8_translate_store", { p_message: message, p_target: target, p_source: source, p_provider: prov, p_text: text }); },
    provider: provider(),
  });
  // numbers only: never the message, never the translation
  console.log(JSON.stringify({ fn: "kr8-translate", status: res.body.status, via: res.body.via ?? null, message: Number(input?.message_id) || null }));
  return json(res.body, res.http, origin);
});
