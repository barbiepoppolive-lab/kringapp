// T-402 · kr8-help-ai: Translates member Help/Team messages to English + drafts a warm, safe Kring Team reply
// using Claude Sonnet (newest "sonnet" via GET /v1/models, fallback claude-sonnet-4-5).
// Rules:
//   - Triggered by kr8_help_ai_on_message (pg_net + x-hook-secret) on every new member message in a Kring Team thread.
//   - 19 Nov: safe answers (rules/how-to/status from kr8_help_facts) are sent automatically when help_ai_autosend=1; everything else stays a draft. Stores { message_id, translation_en, suggested_reply, model } in public.kr8_help_ai.
//   - Cost guard: max 300 calls / 24h (configurable via kr8_rings_config.help_ai_daily_cap), max_tokens: 600.
//   - Silent fallback on missing key or API error (HTTP 200 { ok: false, fallback: true } so Help card always works).

const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET")!;
const SRH = { apikey: SR, Authorization: `Bearer ${SR}` };

const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 600;
const HARD_DAILY_CAP = 300;

let cachedModel: { id: string; exp: number } | null = null;

const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const withCors = (r: Response) => { const h = new Headers(r.headers); for (const [k, v] of Object.entries(CORS)) h.set(k, v); return new Response(r.body, { status: r.status, headers: h }); };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

const stripHelpPrefix = (s: string) => String(s ?? "").replace(/^\s*\[help\]\s*/i, "").trim();

async function sbGet<T = any>(pathAndQuery: string): Promise<T | null> {
  const r = await fetch(`${SB}/rest/v1/${pathAndQuery}`, { headers: SRH });
  if (!r.ok) return null;
  return r.json();
}

async function getDailyCap(): Promise<number> {
  const rows = await sbGet<{ value: number }[]>("kr8_rings_config?key=eq.help_ai_daily_cap&select=value&limit=1");
  const v = Number(rows?.[0]?.value ?? HARD_DAILY_CAP);
  return Number.isFinite(v) && v > 0 ? Math.min(v, HARD_DAILY_CAP) : HARD_DAILY_CAP;
}

async function getTodayCallCount(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const r = await fetch(`${SB}/rest/v1/kr8_help_ai?created_at=gte.${encodeURIComponent(since)}&select=message_id`, {
    method: "HEAD",
    headers: { ...SRH, Prefer: "count=exact" },
  });
  const cr = r.headers.get("content-range") || "";
  const m = cr.match(/\/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

async function pickNewestSonnet(apiKey: string): Promise<string> {
  if (cachedModel && cachedModel.exp > Date.now()) return cachedModel.id;
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (r.ok) {
      const body = await r.json();
      const data: Array<{ id?: string; created_at?: string }> = Array.isArray(body?.data) ? body.data : [];
      const sonnets = data
        .filter((m) => typeof m?.id === "string" && m.id.toLowerCase().includes("sonnet"))
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const chosen = sonnets[0]?.id || DEFAULT_MODEL;
      cachedModel = { id: chosen, exp: Date.now() + 3600_000 };
      return chosen;
    }
  } catch {
    // fall back to DEFAULT_MODEL
  }
  return DEFAULT_MODEL;
}

function parseOutput(raw: string): { translation_en?: string; suggested_reply?: string; suggested_reply_en?: string } | null {
  const trTag = raw.match(/<translation_en>([\s\S]*?)<\/translation_en>/i);
  const srTag = raw.match(/<suggested_reply>([\s\S]*?)<\/suggested_reply>/i);
  if (trTag && srTag) {
    const enTag = raw.match(/<suggested_reply_en>([\s\S]*?)<\/suggested_reply_en>/i);
    const sendTag = raw.match(/<send>\s*(auto|founder)\s*<\/send>/i);
    return { translation_en: trTag[1].trim(), suggested_reply: srTag[1].trim(), suggested_reply_en: enTag ? enTag[1].trim() : undefined, send: sendTag ? sendTag[1].toLowerCase() : "founder" } as any;
  }
  const trimmed = raw.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  for (const candidate of [unfenced, trimmed]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      const i = candidate.indexOf("{");
      const j = candidate.lastIndexOf("}");
      if (i >= 0 && j > i) {
        try {
          const parsed = JSON.parse(candidate.slice(i, j + 1));
          if (parsed && typeof parsed === "object") return parsed;
        } catch {
          // ignore
        }
      }
    }
  }
  return null;
}

async function processSingleMessage(
  msgId: number,
  apiKey: string,
  model: string,
  force = false,
): Promise<Record<string, unknown>> {
  if (!force) {
    const existing = await sbGet<any[]>(`kr8_help_ai?message_id=eq.${msgId}&select=*&limit=1`);
    if (existing?.[0]) return { ok: true, cached: true, row: existing[0] };
  }

  const cap = await getDailyCap();
  const used = await getTodayCallCount();
  if (used >= cap) return { ok: false, fallback: true, reason: `daily_cap_${cap}` };

  const msgs = await sbGet<any[]>(`kr8_messages?id=eq.${msgId}&select=id,thread_id,sender,body,created_at&limit=1`);
  const msg = msgs?.[0];
  if (!msg) return { ok: false, fallback: true, reason: "message_not_found" };

  const uid = String(msg.sender);
  const tid = String(msg.thread_id);
  const cleanText = stripHelpPrefix(msg.body);

  // Gather member context in parallel
  const [mems, histRows, posts, events, claims] = await Promise.all([
    sbGet<any[]>(`kr8_members?user_id=eq.${uid}&select=member_no,first_name,verified,who,area,created_at&limit=1`),
    sbGet<any[]>(`kr8_messages?thread_id=eq.${tid}&id=lte.${msgId}&order=id.desc&limit=8&select=id,sender,body,created_at`),
    sbGet<any[]>(`kr8_posts?author=eq.${uid}&order=created_at.desc&limit=6&select=id,kind,status,hidden,board_off,board_off_reason,review_note,body,created_at,reviewed_at`),
    sbGet<any[]>(`kr8_client_events?user_id=eq.${uid}&order=created_at.desc&limit=12&select=kind,code,detail,created_at`),
    sbGet<any[]>(`kr8_reward_claims?member_id=eq.${uid}&order=created_at.desc&limit=5&select=brand,amount_thb,status,held,created_at,assigned_at,used_at`),
  ]);

  // 19 Nov (founder): the member's real state, so the reply is right (face check, prize/claim, Reels, rank)
  const factsR = await fetch(`${SB}/rest/v1/rpc/kr8_help_facts`, { method: "POST", headers: { ...SRH, "Content-Type": "application/json" }, body: JSON.stringify({ p_user: uid }) });
  const facts: any = factsR.ok ? await factsR.json().catch(() => null) : null;
  const mem = mems?.[0] ?? {};
  const history = (histRows ?? [])
    .slice()
    .reverse()
    .map((h) => ({
      id: h.id,
      from: h.sender === uid ? "member" : "kring_team",
      text: stripHelpPrefix(h.body),
      at: h.created_at,
    }));

  const failEvents = (events ?? []).filter(
    (e) => String(e.kind || "").endsWith("_fail") || String(e.code || "").startsWith("fail:"),
  );

  const contextObj = {
    member: {
      member_no: mem.member_no ?? null,
      name: mem.first_name ?? null,
      verified: Boolean(mem.verified),
      who: mem.who ?? null,
      area: mem.area ?? null,
    },
    posts: (posts ?? []).map((p) => ({
      kind: p.kind,
      status: p.status,
      hidden: Boolean(p.hidden),
      caption: String(p.body || "").slice(0, 120),
      review_note: p.review_note ?? null,
      board_off: Boolean(p.board_off),
      created_at: p.created_at,
      reviewed_at: p.reviewed_at,
    })),
    recent_client_failures: failEvents.slice(0, 6),
    claims: (claims ?? []).map((c) => ({
      amount_thb: c.amount_thb,
      status: c.status,
      held: Boolean(c.held),
      created_at: c.created_at,
      assigned_at: c.assigned_at,
      used_at: c.used_at != null,
    })),
    facts: facts ? { ...facts, do_not_autosend: undefined } : null,
    conversation_up_to_message: history,
    target_message: { id: msg.id, raw_body: msg.body, clean_text: cleanText || "Talk to the team" },
  };

  const systemPrompt = [
    "You draft Help translations and reply suggestions for the founder of Kring (a social short-video & local Bangkok community app).",
    "Return ONLY these three XML tags and nothing else:",
    "<translation_en>concise plain-English translation (1 short sentence, no parenthetical linguistics notes)</translation_en>",
    "<suggested_reply>warm, short reply in the member's language</suggested_reply>",
    "<suggested_reply_en>the exact same reply in plain English, for the founder who cannot read Thai</suggested_reply_en>",
    "<send>auto or founder</send>",
    "Rules for translation_en:",
    "- Translate target_message.clean_text faithfully into 1 short, natural plain-English sentence (note: Thai ใก้ is a common phone typo for ให้ meaning 'for me'; if clean_text is 'Talk to the team', write 'Opened Help chat with Kring Team').",
    "Rules for suggested_reply:",
    "- Write in the SAME language the member used in target_message (if Thai, write natural, warm, short Thai and end politely with ครับ).",
    "- Keep it short (1 to 2 sentences, <= 280 characters), warm, human, and reassuring, speaking as Kring Team.",
    "- Use the member's context accurately (e.g. if they ask to check their clip and their newest post is already status='approved' and hidden=false, let them know warmly that their latest Reel is approved and live on the feed; if a clip is still pending, say the team is checking it shortly; if an earlier clip was hidden with a review_note, acknowledge gently without harshness; if recent_client_failures show video pick/size errors, offer a brief friendly tip).",
    "- ALWAYS answer from `facts` (the member's real state) — never guess. Kring rules (true, you may state them):",
    "  · Founding Local: the first 50 members who post an approved Reel get ฿100 TrueMoney (facts.founding_seats_left seats left). To claim: an approved Reel AND a passed face check (5 seconds, in the app).",
    "  · Weekly prizes every week: the top 8 on the Weekly Ranking with at least 25 Rings win TrueMoney (฿1,500 / 900 / 600 / 500 / 400 / 250 / 150 / 100). The week ends Sunday 23:59 Bangkok time; prizes open after a results check of up to 24 hours.",
    "  · Rings: like +1, save +3, someone opening your shared Reel link +5 (max 30/day), invite a friend who posts an approved Reel or passes the face check +10 for both. Only your best Reel counts. Comments give no Rings.",
    "  · Prizes are paid as TrueMoney codes in the app (Me → Rewards). One person, one account.",
    "  · If facts.face_check is 'not_done', the next step is the face check in the app. If 'waiting_for_team', the team checks it, usually within a day.",
    "  · If a prize claim is held (facts.prizes[].claim.held), say warmly the team is checking it and will confirm soon — never say why it is held.",
    "- <send>: write 'auto' ONLY for safe answers: a greeting, how the app/rules work, how to do something, or the member's own status read from facts. Write 'founder' for anything about paying/refusing a prize, account problems, bans, duplicate accounts, complaints, anything you are not sure about, or anything that needs a human decision.",
    "- STRICT SAFETY RULES: NEVER promise money, vouchers, prizes, rankings, or exact payout/approval dates. NEVER reveal internal system details (internal error codes, flags, ghost status, IP/device checks, or raw admin database fields). NEVER mention AI, bots, Claude, or automated drafting.",
  ].join("\n");

  const isV5 = /-5(?:-|$)/.test(model);
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      ...(isV5 ? { thinking: { type: "between_tools" }, output_config: { effort: "low" } } : {}),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: JSON.stringify(contextObj),
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => "");
    return { ok: false, fallback: true, reason: `anthropic_http_${resp.status}`, detail: errTxt.slice(0, 200) };
  }

  const data = await resp.json();
  const textOut = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n")
    : "";
  const parsed = parseOutput(textOut);
  if (!parsed) {
    return { ok: false, fallback: true, reason: "bad_json_output" };
  }

  const translationEn = String(parsed.translation_en || "").trim().slice(0, 1000) || null;
  let suggestedReply = String(parsed.suggested_reply || "").trim().slice(0, 480) || null;
  // Enforce polite ครับ ending when reply is in Thai and doesn't already end with ครับ / นะครับ
  if (suggestedReply && /[\u0E01-\u0E3E\u0E40-\u0E7F]/.test(suggestedReply) && !/ครับ[.!~\s🙏😊✨]*$/.test(suggestedReply)) {
    suggestedReply = suggestedReply.replace(/ค่ะ([.!~\s🙏😊✨]*)$/, "ครับ$1");
    if (!/ครับ[.!~\s🙏😊✨]*$/.test(suggestedReply)) suggestedReply = `${suggestedReply} ครับ`;
  }

  const suggestedReplyEn = String(parsed.suggested_reply_en || "").trim().slice(0, 600) || null;
  const rowPayload = {
    message_id: msgId,
    translation_en: translationEn,
    suggested_reply: suggestedReply,
    suggested_reply_en: suggestedReplyEn,
    model: String(data?.model || model),
    created_at: new Date().toISOString(),
  };

  const up = await fetch(`${SB}/rest/v1/kr8_help_ai?on_conflict=message_id`, {
    method: "POST",
    headers: { ...SRH, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rowPayload),
  });
  const saved = up.ok ? await up.json().catch(() => [rowPayload]) : [rowPayload];

  // 19 Nov (founder): safe answers go out by themselves, so the 1-hour Help promise holds day and night.
  let autoSent: number | null = null;
  try {
    const cfg = await sbGet<{ value: number }[]>("kr8_rings_config?key=eq.help_ai_autosend&select=value&limit=1");
    const on = Number(cfg?.[0]?.value ?? 0) === 1;
    const newer = await sbGet<any[]>(`kr8_messages?thread_id=eq.${tid}&id=gt.${msgId}&select=id&limit=1`);   // someone already replied / wrote again
    if (on && (parsed as any).send === "auto" && facts && !facts.do_not_autosend && suggestedReply && !(newer && newer.length)) {
      const r = await fetch(`${SB}/rest/v1/rpc/kr8_system_notice`, { method: "POST", headers: { ...SRH, "Content-Type": "application/json" },
        body: JSON.stringify({ p_member: uid, p_body: suggestedReply, p_body_en: suggestedReplyEn || suggestedReply }) });
      if (r.ok) autoSent = Number(await r.json().catch(() => 0)) || null;
    }
  } catch { /* never break the draft */ }
  if (autoSent) {
    await fetch(`${SB}/rest/v1/kr8_help_ai?message_id=eq.${msgId}`, { method: "PATCH", headers: { ...SRH, "Content-Type": "application/json" },
      body: JSON.stringify({ model: `auto-sent:${String(data?.model || model)}` }) }).catch(() => undefined);
  }
  return { ok: true, row: saved?.[0] ?? rowPayload, auto_sent: autoSent };
}

async function translateForMember(req: Request, body: any, apiKey: string, model: string): Promise<Response> {
  // Admin-only: founder writes in English, member receives natural Thai ending with ครับ (or English if the member writes English).
  const auth = req.headers.get("authorization") || "";
  const tok = auth.replace(/^Bearer\s+/i, "").trim();
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
  // must be a real signed-in user's token (never the anon/service key), and that user must be an admin
  if (!tok || !ANON || tok === ANON || tok === SR) return json({ ok: false, reason: "admin_only" }, 403);
  let claims: any = null;
  try { claims = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { claims = null; }
  if (claims?.role !== "authenticated" || !claims?.sub) return json({ ok: false, reason: "admin_only" }, 403);
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } });
  const u = who.ok ? await who.json().catch(() => null) : null;
  if (!u?.id || u.id !== claims.sub) return json({ ok: false, reason: "admin_only" }, 403);
  const chk = await fetch(`${SB}/rest/v1/rpc/kr8_is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: "{}" });
  if (!chk.ok || (await chk.json().catch(() => false)) !== true) return json({ ok: false, reason: "admin_only" }, 403);
  const text = String(body?.text_en || "").trim().slice(0, 600);
  if (!text) return json({ ok: false, reason: "empty" }, 400);
  const target = String(body?.lang || "th") === "en" ? "en" : "th";
  if (target === "en") return json({ ok: true, text });
  const isV5 = /-5(?:-|$)/.test(model);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 400,
      ...(isV5 ? { thinking: { type: "between_tools" }, output_config: { effort: "low" } } : {}),
      system: "Translate the Kring Team's reply to a Thai app member into natural, warm, casual-polite Thai, as a Thai person would text it. Male speaker: end politely with ครับ, never ค่ะ. Keep emojis and meaning; no extra content. Return ONLY the Thai text inside <thai></thai>.",
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!r.ok) return json({ ok: false, reason: `anthropic_http_${r.status}` }, 502);
  const data = await r.json();
  const out = (Array.isArray(data?.content) ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : "");
  let th = (out.match(/<thai>([\s\S]*?)<\/thai>/i)?.[1] || out).trim().slice(0, 500);
  if (th && !/ครับ[.!~\s🙏😊✨]*$/.test(th)) {
    th = th.replace(/ค่ะ([.!~\s🙏😊✨]*)$/, "ครับ$1");
    if (!/ครับ[.!~\s🙏😊✨]*$/.test(th)) th = `${th} ครับ`;
  }
  return th ? json({ ok: true, text: th }) : json({ ok: false, reason: "empty_output" }, 502);
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.headers.get("x-hook-secret") !== HOOK) {
      const b = await req.clone().json().catch(() => ({}));
      if (b?.mode === "translate_reply") {
        const k = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
        if (!k) return withCors(json({ ok: false, reason: "missing_key" }, 503));
        return withCors(await translateForMember(req, b, k, await pickNewestSonnet(k)));
      }
      return new Response("forbidden", { status: 403 });
    }
    const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!apiKey) return json({ ok: false, fallback: true, reason: "missing_anthropic_api_key" });

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const model = await pickNewestSonnet(apiKey);

    if (body?.backfill_thread_id) {
      const tid = String(body.backfill_thread_id);
      const tRows = await sbGet<any[]>(`kr8_threads?id=eq.${tid}&select=id,user_a,user_b&limit=1`);
      const t = tRows?.[0];
      if (!t) return json({ ok: false, fallback: true, reason: "thread_not_found" });
      const teams = await sbGet<{ user_id: string }[]>("kr8_team_accounts?select=user_id");
      const teamSet = new Set((teams ?? []).map((x) => x.user_id));
      const memberUid = teamSet.has(t.user_a) ? t.user_b : t.user_a;
      const allMsgs = await sbGet<any[]>(`kr8_messages?thread_id=eq.${tid}&order=id.asc&select=id,sender,body,created_at`) ?? [];
      let lastTeamId = 0;
      for (const m of allMsgs) {
        if (m.sender !== memberUid && m.id > lastTeamId) lastTeamId = m.id;
      }
      const waiting = allMsgs.filter((m) => m.sender === memberUid && m.id > lastTeamId);
      const results = [];
      for (const w of waiting) {
        results.push(await processSingleMessage(Number(w.id), apiKey, model, force));
      }
      return json({ ok: true, model, count: results.length, results });
    }

    const msgId = Number(body?.message_id ?? body?.record?.id ?? 0);
    if (!msgId) return json({ ok: false, fallback: true, reason: "missing_message_id" });
    const res = await processSingleMessage(msgId, apiKey, model, force);
    return json(res);
  } catch (e) {
    return json({ ok: false, fallback: true, reason: String((e as Error)?.message || e).slice(0, 200) });
  }
});
