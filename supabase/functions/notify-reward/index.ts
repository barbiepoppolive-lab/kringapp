// notify-reward: founder email on every Rings reward claim (DB trigger kr8_claim_notify, migration 0044).
// Same pattern and secrets as notify-new-member: x-hook-secret = NOTIFY_HOOK_SECRET, Brevo = BREVO_API_KEY.
// No stock for that brand/amount → subject "Restock <brand> ฿<amount>" so the founder can buy codes.
// Codes are never in the payload or the email.
const TO = "barbiepoppolive@gmail.com";
const BREVO = Deno.env.get("BREVO_API_KEY")!;
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET")!;

const BRAND: Record<string, string> = { grab: "Grab", shopeepay: "ShopeePay", truemoney: "TrueMoney" };
const ist = (s?: string) =>
  new Date(s ?? Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
const esc = (s: unknown) => String(s ?? "–").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function subjectFor(rec: Record<string, unknown>): string {
  const brand = BRAND[String(rec.brand)] ?? String(rec.brand);
  const test = rec.is_test ? "[TEST] " : "";
  if (rec.status === "pending") return `${test}Restock ${brand} ฿${rec.amount_thb} · ${rec.first_name}'s code is held`;
  return `${test}Kring reward claimed: ${brand} ฿${rec.amount_thb} by ${rec.first_name}`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
  const p = await req.json();
  if (p.table !== "kr8_reward_claims") return new Response("ignored", { status: 200 });
  const rec = p.record ?? {};
  const stock = (p.stock ?? {}) as Record<string, number>;
  const stockLine = ["grab", "shopeepay", "truemoney"].flatMap((b) => [100, 300, 500].map((a) => `${BRAND[b]} ฿${a}: ${stock[`${b}_${a}`] ?? 0}`)).join(" · ");
  const rows: [string, unknown][] = [
    ["Member", `${rec.first_name} (#${String(rec.member_no ?? "").padStart(5, "0")})`],
    ["Reward", `${BRAND[rec.brand] ?? rec.brand} ฿${rec.amount_thb}${rec.brand === "truemoney" ? ` (code worth ฿${Math.floor(Number(rec.amount_thb) * 3 / 4)})` : ""}`],
    ["Rings", rec.rings],
    ["Status", rec.status === "pending" ? "HELD · no code in stock. Rings are reserved; the member sees “Your code is on the way”. The code goes out by itself the moment you add one (admin → More → Reward codes)." : "Code sent to the member"],
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
