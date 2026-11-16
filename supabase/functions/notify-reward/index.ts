// notify-reward: founder email on every prize claim (DB trigger kr8_claim_notify, migrations 0044 + 0047 + 0066).
// A claim pays a prize the member won: a weekly rank (1–8) or Founding Local. Rings are a score and are never spent.
// Same pattern and secrets as notify-new-member: x-hook-secret = NOTIFY_HOOK_SECRET, Brevo = BREVO_API_KEY.
// No code of that exact brand + amount in stock → subject "Restock <brand> ฿<amount>" so the founder can buy one.
// 0066: a claim HELD by the one-person-one-account rules → subject "Held · same person?", the reason + the other member,
//       both selfies (signed links, 1 hour) and Pay / Refuse links to the admin page. Wording is built in mail.ts.
// Codes are never in the payload or the email. TEST claims (is_test) send no email at all; they are only logged.
import { buildMail, subjectFor, type Rec } from "./mail.ts";

const TO = "barbiepoppolive@gmail.com";
const BREVO = Deno.env.get("BREVO_API_KEY")!;
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET")!;
const SUPA = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** short-lived links to the private kr8-verify selfies (service key; 1 hour) */
async function signSelfies(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = [...new Set(paths.filter((p) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(p)))];
  if (!list.length || !SUPA || !SR) return out;
  try {
    const r = await fetch(`${SUPA}/storage/v1/object/sign/kr8-verify`, {
      method: "POST", headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600, paths: list }),
    });
    const j = (await r.json()) as { path?: string; signedURL?: string }[];
    for (const x of Array.isArray(j) ? j : []) if (x.path && x.signedURL) out[x.path] = `${SUPA}/storage/v1${x.signedURL}`;
  } catch { /* the email still goes, with "open the admin page" */ }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
  const p = await req.json();
  if (p.table !== "kr8_reward_claims") return new Response("ignored", { status: 200 });
  const rec = (p.record ?? {}) as Rec;
  if (rec.is_test) {
    console.log(JSON.stringify({ table: p.table, status: rec.status, skipped: "test claim, no email", subject: subjectFor(rec) }));
    return new Response(JSON.stringify({ skipped: "test" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const signed = rec.held ? await signSelfies([String(rec.selfie_path ?? ""), ...(rec.others || []).map((o) => String(o.selfie_path ?? ""))]) : {};
  const m = buildMail(rec, (p.stock ?? {}) as Record<string, number>, signed);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Kring alerts", email: "hello@kringapp.com" }, to: [{ email: TO }], subject: m.subject, textContent: m.text, htmlContent: m.html }),
  });
  const out = { status: r.status, body: await r.json().catch(() => null) };
  console.log(JSON.stringify({ table: p.table, status: rec.status, held: !!rec.held, brevo: out.status }));
  return new Response(JSON.stringify(out), { status: out.status < 300 ? 200 : 502, headers: { "Content-Type": "application/json" } });
});
