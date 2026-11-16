// notify-reward email text (pure, so vitest and the preview harness can render it). index.ts sends it.
// 0066: a claim HELD by the one-person-one-account rules says why and who, with both selfies; it no longer reads as a
// stock problem, and the TrueMoney share comes from the DB (payout_pct in the payload), not a guessed 75%.

export const BRAND: Record<string, string> = { grab: "Grab", shopeepay: "ShopeePay", truemoney: "TrueMoney" };
export type Other = { user_id?: string; first_name?: string; member_no?: number | null; reasons?: string[]; selfie_path?: string | null; face_dist?: number | null };
export type Rec = Record<string, unknown> & { others?: Other[] | null; flags?: Other[] | null };

const ist = (s?: unknown) =>
  new Date(typeof s === "string" ? s : Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
export const esc = (s: unknown) => String(s ?? "–").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const no = (n: unknown) => (n === null || n === undefined || n === "" ? "" : ` #${n}`);

export function payoutOf(rec: Rec, fallback = 100): number {
  const v = Number(rec.payout_pct);
  return v >= 1 && v <= 100 ? v : fallback;
}
export function wantsLine(rec: Rec, pct: number): string {
  const amt = Number(rec.amount_thb);
  if (rec.brand !== "truemoney") return `${BRAND[String(rec.brand)] ?? rec.brand} ฿${rec.amount_thb}`;
  const worth = Math.floor((amt * pct) / 100);
  return pct >= 100 ? `TrueMoney ฿${amt} (full value)` : `TrueMoney ฿${amt} (a ฿${worth} code; TrueMoney keeps ${100 - pct}%, truemoney_payout_pct = ${pct})`;
}
export function prizeFor(rec: Rec): string {
  if (rec.prize_kind === "weekly") return `Weekly #${rec.prize_rank} (week of ${rec.prize_week})`;
  if (rec.prize_kind === "founding") return `Founding Local #${rec.founding_no}`;
  return "–";
}
const REASON: Record<string, string> = { face: "same face", device: "same phone", network: "same network", line: "same LINE" };
/** "Held: same network as another member's claim (Joob #1). Check before paying." */
export function holdLine(rec: Rec): string {
  const o = (rec.others || [])[0];
  const why = String(rec.hold_reason || "linked");
  if (why === "linked" && o) {
    const rs = (o.reasons || ["network"]).map((r) => REASON[r] || r);
    const what = rs.length === 1 && rs[0] === "same network" ? "same network as another member's claim" : `${rs.join(" + ")} as another member`;
    const more = (rec.others || []).length > 1 ? ` and ${(rec.others || []).length - 1} more` : "";
    return `Held: ${what} (${o.first_name ?? "member"}${no(o.member_no)}${more}). Check before paying.`;
  }
  return "Held: same person as another account? Check before paying.";
}
/** founder 16 Nov: same network / same LINE and a face check that doesn't match the account's earlier face are FLAGS only
 *  (the claim is paid normally). "" when there is nothing to flag. */
export function flagLine(rec: Rec): string {
  const parts = (rec.flags || []).map((o) => `${(o.reasons || []).map((r) => REASON[r] || r).join(" + ")} as ${o.first_name ?? "member"}${no(o.member_no)}`);
  if (rec.face_mismatch) parts.push(`face check didn't match this account's earlier face${rec.face_dist != null ? ` (${rec.face_dist})` : ""}`);
  return parts.length ? `Flag only, paid normally: ${parts.join(" · ")}. Look in admin → Same person? if it seems off.` : "";
}
export function subjectFor(rec: Rec): string {
  const brand = BRAND[String(rec.brand)] ?? String(rec.brand);
  const test = rec.is_test ? "[TEST] " : "";
  if (rec.held) return `${test}Held · same person? ${rec.first_name}${no(rec.member_no)} claimed ${brand} ฿${rec.amount_thb}`;
  if (rec.status === "pending") return `${test}Restock ${brand} ฿${rec.amount_thb} · ${rec.first_name}'s code is waiting`;
  return `${test}Kring prize claimed: ${brand} ฿${rec.amount_thb} by ${rec.first_name}`;
}

/** signed: selfie path → short-lived link (made by index.ts with the service key) */
export function buildMail(rec: Rec, stock: Record<string, number>, signed: Record<string, string> = {}) {
  const pct = payoutOf(rec);
  const stockLine = Object.keys(stock).sort().map((k) => { const [b, a] = k.split("_"); return `${BRAND[b] ?? b} ฿${a}: ${stock[k]}`; }).join(" · ") || "none";
  const same = stock[`${rec.brand}_${rec.amount_thb}`] ?? 0;
  const status = rec.held ? holdLine(rec)
    : rec.status === "pending" ? `Waiting · no ${BRAND[String(rec.brand)] ?? rec.brand} ฿${rec.amount_thb} code in stock. The member sees “Your code is on the way”. The code goes out by itself the moment you add one (admin → More → Reward codes, same brand and amount).`
    : "Code sent to the member";
  const rows: [string, unknown][] = [
    ["Member", `${rec.first_name}${no(rec.member_no)}`],
    ["Prize", prizeFor(rec)],
    ["Wants", wantsLine(rec, pct)],
    ["Status", status],
    ...(!rec.held && flagLine(rec) ? [["Flag", flagLine(rec)] as [string, unknown]] : []),
    ...(rec.held ? [] : [["Same codes left", same] as [string, unknown]]),
    ["When", ist(rec.created_at)],
    ["Codes left (real)", stockLine],
    ...(rec.is_test ? [["Flag", "Test member — test codes only"] as [string, unknown]] : []),
  ];
  const footer = rec.held ? "Pay or refuse: https://kringapp.com/app/admin.html#dups"
    : rec.status === "pending" ? "Add codes: https://kringapp.com/app/admin.html#codes (paste one code per line)"
    : "Stock: https://kringapp.com/app/admin.html#codes";
  const faces: { cap: string; url: string | null }[] = rec.held ? [
    { cap: `${rec.first_name}${no(rec.member_no)} (this claim)`, url: rec.selfie_path ? signed[String(rec.selfie_path)] ?? null : null },
    ...(rec.others || []).slice(0, 3).map((o) => ({ cap: `${o.first_name ?? "member"}${no(o.member_no)}`, url: o.selfie_path ? signed[o.selfie_path] ?? null : null })),
  ] : [];
  const text = rows.map(([k, v]) => `${k}: ${v ?? "–"}`).join("\n")
    + (faces.length ? "\n\nSelfies (links work for 1 hour):\n" + faces.map((f) => `${f.cap}: ${f.url ?? "no selfie on file"}`).join("\n") : "")
    + "\n\n" + footer;
  const faceHtml = faces.length ? `<table cellpadding="0" cellspacing="0" style="margin:14px 0"><tr>${faces.map((f) =>
    `<td style="padding-right:10px;vertical-align:top;text-align:center;font-size:13px;color:#555">${f.url
      ? `<img src="${esc(f.url)}" width="150" height="190" alt="" style="width:150px;height:190px;object-fit:cover;border-radius:12px;display:block;background:#eee">`
      : `<div style="width:150px;height:190px;border-radius:12px;background:#eee;line-height:190px">no selfie</div>`}<div style="margin-top:6px"><b>${esc(f.cap)}</b></div></td>`).join("")}</tr></table>
    <p style="font-size:12px;color:#888;margin:0 0 10px">Selfie links work for 1 hour. After that, open the admin page.</p>` : "";
  const banner = rec.held ? `<p style="background:#fff4d6;border:1px solid #f0c24b;border-radius:10px;padding:10px 12px;margin:0 0 12px"><b>${esc(holdLine(rec))}</b></p>` : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:560px">${banner}<table cellpadding="4">${rows
    .map(([k, v]) => `<tr><td style="color:#777;vertical-align:top">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>${faceHtml}${rec.held
    ? `<p><a href="https://kringapp.com/app/admin.html#dups" style="display:inline-block;background:#1f8a4c;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Pay</a> &nbsp; <a href="https://kringapp.com/app/admin.html#dups" style="display:inline-block;background:#b3261e;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Refuse</a></p>` : ""}<p>${esc(footer)}</p></div>`;
  return { subject: subjectFor(rec), text, html, selfies: faces };
}
