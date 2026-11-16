// notify-new-member: instant founder alert on new kr8_members / kr6_venue_applications rows.
// Ref: the app writes kr8_members.ref_code via kr8_set_ref() a moment AFTER the insert, so the trigger
// payload usually has ref_code = null. We re-read the saved row (waiting briefly for the ref) and use
// kr8_members.ref_code first, then src_code (visit attribution), then "direct".
// Test/demo members (kr8_is_test_member) send NO email; they are only logged.
// Payload { dry_run: true, member_no: N } (with the hook secret) renders the email without sending.
const TO = "barbiepoppolive@gmail.com";
const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO = Deno.env.get("BREVO_API_KEY")!;
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET")!;
const SRH = { apikey: SR, Authorization: `Bearer ${SR}` };

const ist = (s?: string) =>
  new Date(s ?? Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
const esc = (s: unknown) => String(s ?? "–").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const refs = (o: Record<string, number>) => Object.entries(o || {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "–";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { ...SRH, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  return r.ok ? r.json() : null;
}

async function member(filter: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${SB}/rest/v1/kr8_members?${filter}&select=user_id,first_name,who,area,ig_handle,created_at,ref_code,src_code,member_no`, { headers: SRH });
  const rows = r.ok ? await r.json() : [];
  return rows?.[0] ?? null;
}

// The saved row, waiting up to ~4s for kr8_set_ref() to write ref_code (it lands ~0.3s after the insert).
async function freshMember(rec: Record<string, unknown>) {
  let row: Record<string, unknown> | null = null;
  for (let i = 0; i < 8; i++) {
    row = await member(`user_id=eq.${rec.user_id}`);
    if (row?.ref_code) break;
    await sleep(500);
  }
  return { ...rec, ...(row ?? {}) };
}

function memberEmail(m: Record<string, unknown>, s: Record<string, any>) {
  const via = (m.ref_code as string) || (m.src_code as string) || "direct";
  const subject = `🔔 REAL new member #${m.member_no ?? "?"}: ${m.first_name} via ${via}`;
  const rows: [string, unknown][] = [
    ["Member", `#${m.member_no ?? "?"}`], ["Name", m.first_name], ["Type", m.who], ["Area", m.area], ["Ref", via],
    ["Instagram", m.ig_handle ? "@" + m.ig_handle : null], ["Joined", ist(m.created_at as string)],
    ["Real members today (IST)", s.real_today], ["Real members total", s.real_members],
    ["All rows (incl. test/demo)", `${s.all_members} (${s.test_members} test/demo)`],
    ["By ref, today", refs(s.by_ref_today)], ["By ref, all time", refs(s.by_ref)],
  ];
  return { subject, rows, footer: "Members tab:\nhttps://kringapp.com/app/admin.html", via };
}

function render(rows: [string, unknown][], footer: string) {
  const text = rows.map(([k, v]) => `${k}: ${v ?? "–"}`).join("\n") + "\n\n" + footer;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5"><table cellpadding="4">${
    rows.map(([k, v]) => `<tr><td style="color:#777">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")
  }</table><p>${footer.split("\n").map((l) => l.startsWith("http") ? `<a href="${l}">${l}</a>` : esc(l)).join("<br>")}</p></div>`;
  return { text, html };
}

async function send(subject: string, rows: [string, unknown][], footer: string, high = false) {
  const { text, html } = render(rows, footer);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": BREVO, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Kring alerts", email: "hello@kringapp.com" }, to: [{ email: TO }], subject, textContent: text, htmlContent: html,
      ...(high ? { headers: { "X-Priority": "1 (Highest)", "X-MSMail-Priority": "High", Importance: "High" } } : {}),
    }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
  const p = await req.json();

  if (p.dry_run) {
    const m = await member(`member_no=eq.${Number(p.member_no)}`);
    if (!m) return json({ error: "no such member" }, 404);
    const s = (await rpc("kr8_member_alert_stats", { p_user: m.user_id })) ?? {};
    const e = memberEmail(m, s);
    return json({ dry_run: true, is_test: !!s.is_test, would_send: !s.is_test, subject: e.subject, text: render(e.rows, e.footer).text });
  }

  const rec = p.record ?? {};
  let out;
  if (p.table === "kr8_members") {
    const m = await freshMember(rec);
    const s = (await rpc("kr8_member_alert_stats", { p_user: m.user_id })) ?? {};
    const e = memberEmail(m, s);
    if (s.is_test) {
      console.log(JSON.stringify({ table: p.table, skipped: "test/demo member, no email", member_no: m.member_no, name: m.first_name, via: e.via }));
      return json({ skipped: "test" });
    }
    out = await send(e.subject, e.rows, e.footer, true);
  } else if (p.table === "kr6_venue_applications") {
    const test = /test/i.test(rec.venue_name ?? "") || ["test1", "perf", "demo"].includes(rec.referral_host_code ?? "");
    out = await send(`${test ? "[TEST] " : "🏪 "}New Kring partner application: ${rec.venue_name} (via ${rec.referral_host_code || "direct"})`, [
      ["Place", rec.venue_name], ["Type", rec.kind ?? rec.category], ["Area", rec.district ?? rec.city],
      ["Contact", rec.owner_name], ["LINE", rec.line_id], ["Phone", rec.phone],
      ["Treat (their words)", rec.treat_text], ["Maps", rec.maps_url], ["Ref", rec.referral_host_code || "direct"], ["Applied", ist(rec.created_at)],
    ], "Approve or reject (Pending tab):\nhttps://kringapp.com/app/admin.html");
  } else if (p.table === "kr8_face_lookalike") {
    // 0076 kr8_face_alert: a new face check / card photo looks like another member (one person, one account)
    const same = rec.strength === "same";
    out = await send(`${same ? "🚨 Same person?" : "👀 Looks alike?"} ${rec.first_name} #${rec.member_no} looks like ${rec.other_name} #${rec.other_no} · ${Number(rec.dist).toFixed(2)}`, [
      ["New", `${rec.first_name} #${rec.member_no}`], ["Looks like", `${rec.other_name} #${rec.other_no}${rec.other_verified ? " (verified)" : ""}`],
      ["Face distance", `${Number(rec.dist).toFixed(2)} (lower = more alike; same person is usually under 0.50)`],
      ["From", `${rec.what} · ${rec.sources}`],
      ["What happens", same ? "Linked: no Rings between them, prize claims wait for you" : "Flag only: nothing is held"],
    ], "Check the face check before approving (Face checks), or More → Same person?:\nhttps://kringapp.com/app/admin.html#q/faces", same);
  } else return new Response("ignored", { status: 200 });
  console.log(JSON.stringify({ table: p.table, brevo: out }));
  return json(out, out.status < 300 ? 200 : 502);
});
