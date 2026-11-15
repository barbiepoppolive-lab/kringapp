// notify-reward: founder email on every prize claim (DB trigger kr8_claim_notify, migrations 0044 + 0047).
// A claim pays a prize the member won: a weekly rank (1–8) or Founding Local. Rings are a score and are never spent.
// Same pattern and secrets as notify-new-member: x-hook-secret = NOTIFY_HOOK_SECRET, Brevo = BREVO_API_KEY.
// No code of that exact brand + amount in stock → subject "Restock <brand> ฿<amount>" so the founder can buy one.
// Codes are never in the payload or the email.
// TEST claims (is_test) send no email at all; they are only logged.
const TO = "barbiepoppolive@gmail.com";
const BREVO = Deno.env.get("BREVO_API_KEY")!;
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET")!;

// 16 Nov: the TrueMoney share comes from kr8_rings_config (truemoney_payout_pct), not from value_thb (a stored column that is
// always 3/4 of the prize) and not from a fixed 75%. Now 100 = the member gets the full prize value.
const SUPA = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export async function payoutPct(): Promise<number> {
  try {
    const r = await fetch(`${SUPA}/rest/v1/kr8_rings_config?key=eq.truemoney_payout_pct&select=value`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
    const v = Number((await r.json())?.[0]?.value);
    return v >= 1 && v <= 100 ? v : 75;
  } catch { return 75; }
}
export function wantsLine(rec: Record<string, unknown>, pct: number): string {
  const amt = Number(rec.amount_thb);
  if (rec.brand !== "truemoney") return `${BRAND[String(rec.brand)] ?? rec.brand} ฿${rec.amount_thb}`;
  const worth = Math.floor((amt * pct) / 100);
  return `TrueMoney ฿${rec.amount_thb} (buy a TrueMoney code worth ฿${worth} for the member; ${pct >= 100 ? "full value" : `TrueMoney keeps ${100 - pct}%`}, set by truemoney_payout_pct = ${pct})`;
}

const BRAND: Record<string, string> = { grab: "Grab", shopeepay: "ShopeePay", truemoney: "TrueMoney" };
const ist = (s?: string) =>
  new Date(s ?? Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
const esc = (s: unknown) => String(s ?? "–").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function subjectFor(rec: Record<string, unknown>): string {
  const brand = BRAND[String(rec.brand)] ?? String(rec.brand);
  const test = rec.is_test ? "[TEST] " : "";
  if (rec.status === "pending") return `${test}Restock ${brand} ฿${rec.amount_thb} · ${rec.first_name}'s code is held`;
  return `${test}Kring prize claimed: ${brand} ฿${rec.amount_thb} by ${rec.first_name}`;
}
export function prizeFor(rec: Record<string, unknown>): string {
  if (rec.prize_kind === "weekly") return `Weekly #${rec.prize_rank} (week of ${rec.prize_week})`;
  if (rec.prize_kind === "founding") return `Founding Local #${rec.founding_no}`;
  return "–";
}

Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
  const p = await req.json();
  if (p.table !== "kr8_reward_claims") return new Response("ignored", { status: 200 });
  const rec = p.record ?? {};
  // TEST claims: log only, never email (QA runs were flooding the founder's inbox).
  if (rec.is_test) {
    console.log(JSON.stringify({ table: p.table, status: rec.status, skipped: "test claim, no email", subject: subjectFor(rec) }));
    return new Response(JSON.stringify({ skipped: "test" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const stock = (p.stock ?? {}) as Record<string, number>;
  const stockLine = Object.keys(stock).sort().map((k) => { const [b, a] = k.split("_"); return `${BRAND[b] ?? b} ฿${a}: ${stock[k]}`; }).join(" · ") || "none";
  const same = stock[`${rec.brand}_${rec.amount_thb}`] ?? 0;
  const rows: [string, unknown][] = [
    ["Member", `${rec.first_name} (#${String(rec.member_no ?? "").padStart(5, "0")})`],
    ["Prize", prizeFor(rec)],
    ["Wants", wantsLine(rec, rec.brand === "truemoney" ? await payoutPct() : 100)],
    ["Status", rec.status === "pending" ? `HELD · no ${BRAND[rec.brand] ?? rec.brand} ฿${rec.amount_thb} code in stock. The member sees “Your code is on the way”. The code goes out by itself the moment you add one (admin → More → Reward codes, same brand and amount).` : "Code sent to the member"],
    ["Same codes left", same],
    ["When", ist(rec.created_at)],
    ["Codes left (real)", stockLine],
    ...(rec.is_test ? [["Flag", "Test member — test codes only"] as [string, unknown]] : []),
  ];
  const footer = rec.status === "pending"
    ? "Add codes: https://kringapp.com/app/admin.html#codes (paste one code per line)"
    : "Stock: https://kringapp.com/app/admin.html#codes";
  const text = rows.map(([k, v]) => `${k}: ${v ?? "–"}`).join("\n") + "\n\n" + footer;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5"><table cellpadding="4">${rows
    .map(([k, v]) => `<tr><td style="color:#777">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table><p>${esc(footer)}</p></div>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Kring alerts", email: "hello@kringapp.com" }, to: [{ email: TO }], subject: subjectFor(rec), textContent: text, htmlContent: html }),
  });
  const out = { status: r.status, body: await r.json().catch(() => null) };
  console.log(JSON.stringify({ table: p.table, status: rec.status, brevo: out.status }));
  return new Response(JSON.stringify(out), { status: out.status < 300 ? 200 : 502, headers: { "Content-Type": "application/json" } });
});
