// kr8-digest-mail (m213): sends the evening come-back summary emails that kr8_digest_run() queued in kr8_digest_log.
// Brevo, From "กริ๊ง! Kring" <hello@kringapp.com> (same Brevo account + verified domain as notify-new-member / notify-reward).
//   POST /send         x-hook-secret = NOTIFY_HOOK_SECRET (pg_net from kr8_digest_mail_kick). Claims ≤25 at a time, ≤6 rounds.
//   GET  /unsub?t=…    one-click unsubscribe link in the email (64-hex token in kr8_digest_prefs)
//   POST /unsub?t=…    RFC 8058 List-Unsubscribe-Post (Gmail / Apple Mail "Unsubscribe" button)
//   POST /line-check   x-hook-secret (cron 18:45 Bangkok, kr8_line_check_kick): free LINE profile lookups with the @194hsqbc token
//                      (secret LINE_194_TOKEN) → kr8_push_line.friend; also stores the OA's monthly quota use. Sends nothing.
// Hard switch: kr8_rings_config line_digest_on. While it is 0, kr8_digest_mail_claim returns nothing, so nothing is ever sent.
const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO = Deno.env.get("BREVO_API_KEY")!;
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET")!;
const LINE = Deno.env.get("LINE_194_TOKEN") ?? "";
const SELF = `${SB}/functions/v1/kr8-digest-mail`;
const SITE = "https://kringapp.com";

type Job = { id: number; to: string; subject: string; body: string; url: string; token: string | null };

async function rpc<T>(fn: string, args: unknown): Promise<T | null> {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  return r.ok ? (await r.json()) as T : null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** The app link: always kringapp.com/app/…, never anything else (the row is built in SQL, this is a second guard). */
function appLink(u: string): string {
  return /^\/app\/(\?[A-Za-z0-9=&_-]{0,80})?$/.test(u || "") ? SITE + u : SITE + "/app/";
}

export function buildMail(j: Job) {
  const lines = String(j.body || "").split("\n").filter(Boolean);
  const cta = lines.pop() || "แตะเพื่อเปิดดูในกริ๊ง!";
  const link = appLink(j.url);
  const unsub = j.token ? `${SELF}/unsub?t=${j.token}` : "";
  const html = `<!doctype html><html lang="th"><body style="margin:0;background:#f6f4f1;font-family:-apple-system,'Segoe UI',Tahoma,sans-serif;color:#1d1b19">
<div style="max-width:440px;margin:0 auto;padding:28px 20px">
<div style="font-size:22px;font-weight:800;color:#e0457b;margin-bottom:18px">กริ๊ง!</div>
${lines.map((l) => `<p style="font-size:17px;line-height:1.5;margin:0 0 10px">${esc(l)}</p>`).join("")}
<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#e0457b;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:999px">เปิดกริ๊ง!</a></p>
<p style="font-size:12px;color:#8a837c;line-height:1.5;margin-top:30px">ส่งถึงคุณเพราะคุณเป็นสมาชิกกริ๊ง! สรุปแบบนี้ส่งไม่เกินวันละครั้ง และเฉพาะวันที่มีเรื่องใหม่${unsub ? `<br><a href="${esc(unsub)}" style="color:#8a837c">ไม่ต้องส่งอีเมลสรุปแบบนี้อีก</a>` : ""}</p>
</div></body></html>`;
  const text = `${lines.join("\n")}\n\n${cta}\n${link}\n\n${unsub ? `ไม่ต้องส่งอีเมลสรุปแบบนี้อีก: ${unsub}\n` : ""}`;
  const headers: Record<string, string> = unsub ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
  return { subject: j.subject, html, text, headers };
}

async function sendOne(j: Job): Promise<{ id: number; http: number; error?: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(j.to || "") || /@users\.kringapp\.com$/i.test(j.to)) return { id: j.id, http: 400, error: "bad address" };
  const m = buildMail(j);
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": BREVO, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "กริ๊ง! Kring", email: "hello@kringapp.com" }, to: [{ email: j.to }], subject: m.subject,
        htmlContent: m.html, textContent: m.text, headers: m.headers, tags: ["digest"] }),
    });
    const b = r.ok ? "" : (await r.text()).slice(0, 200);
    return { id: j.id, http: r.status, error: b || undefined };
  } catch (e) {
    return { id: j.id, http: 0, error: String(e).slice(0, 200) };
  }
}

const txt = (s: string, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const path = u.pathname.replace(/^.*\/kr8-digest-mail/, "") || "/";
  if (path === "/unsub") {
    const t = u.searchParams.get("t") || "";
    if (!/^[0-9a-f]{64}$/.test(t)) return txt("ลิงก์นี้ใช้ไม่ได้แล้ว", 400);
    const ok = await rpc<boolean>("kr8_digest_unsub", { p_token: t, p_via: req.method === "POST" ? "one-click" : "link" });
    if (req.method === "POST") return new Response(null, { status: ok === null ? 500 : 200 });
    return ok ? txt("เรียบร้อย กริ๊ง! จะไม่ส่งอีเมลสรุปแบบนี้ให้คุณอีก\n\nกลับไปที่กริ๊ง!: " + SITE + "/app/") : txt("ลิงก์นี้ใช้ไม่ได้แล้ว", 404);
  }
  if (path === "/line-check" && req.method === "POST") {
    if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
    if (!LINE) return new Response(JSON.stringify({ error: "no LINE token" }), { status: 500 });
    const H = { Authorization: `Bearer ${LINE}` };
    const subs = ((await rpc<string[]>("kr8_line_check_claim", { p_limit: 300 })) || []).filter((x) => /^U[0-9a-f]{32}$/.test(x));
    const results: { sub: string; http: number }[] = [];
    for (let i = 0; i < subs.length; i += 10) {
      await Promise.all(subs.slice(i, i + 10).map(async (sub) => {
        try { const r = await fetch(`https://api.line.me/v2/bot/profile/${sub}`, { headers: H }); await r.body?.cancel(); results.push({ sub, http: r.status }); }
        catch { /* next run */ }
      }));
    }
    let quota: { limit: number; used: number } | null = null;
    try {
      const [a, b] = await Promise.all([fetch("https://api.line.me/v2/bot/message/quota", { headers: H }), fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: H })]);
      const qa = await a.json(), qb = await b.json();
      if (a.ok && b.ok && typeof qb.totalUsage === "number") quota = { limit: qa.type === "limited" ? Number(qa.value) : 100000, used: qb.totalUsage };
    } catch { /* quota unknown: the database assumes 500 */ }
    const n = await rpc<number>("kr8_line_check_done", { p_results: results, p_quota: quota });
    const out = { checked: subs.length, recorded: n, friends: results.filter((x) => x.http === 200).length, quota };
    console.log(JSON.stringify({ line_check: true, ...out }));
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  }
  if (path === "/send" && req.method === "POST") {
    if (req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
    let sent = 0, failed = 0;
    for (let round = 0; round < 6; round++) {
      const jobs = (await rpc<Job[]>("kr8_digest_mail_claim", { p_limit: 25 })) || [];
      if (!jobs.length) break;
      const res: { id: number; http: number; error?: string }[] = [];
      for (const j of jobs) { const x = await sendOne(j); res.push(x); if (x.http >= 200 && x.http < 300) sent++; else failed++; }
      const d = await rpc<{ more: boolean }>("kr8_digest_mail_done", { p_results: res });
      if (!d?.more) break;
    }
    console.log(JSON.stringify({ digest: true, sent, failed }));
    return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
  }
  return new Response("not found", { status: 404 });
});
