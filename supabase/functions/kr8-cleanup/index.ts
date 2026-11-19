// kr8-cleanup (0075, 17 Nov 2026; 0138 adds kr8-passport): nightly removal of private kr8-verify files that are due, by the pg_cron job
// kr8_claim_photo_cleanup → kr8_cleanup_kick(). Founder decision: a prize-claim photo is "kept for 30 days for the Kring
// team's check, then deleted". The database cannot delete Storage files itself (Supabase blocks it), so the database queues
// them in kr8_storage_trash (claim photos > 30 days, and files of deleted accounts) and this function removes them with the
// Storage API, then marks them done. Same secret as notify-*: x-hook-secret = NOTIFY_HOOK_SECRET. Deploy with --no-verify-jwt.
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET") ?? "";
const SUPA = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

Deno.serve(async (req) => {
  if (!HOOK || req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
  if (!SUPA || !SR) return new Response("not configured", { status: 500 });
  let removed = 0, failed = 0;
  try {
    for (let round = 0; round < 5; round++) {
      const due = await rpc<{ id: string; name: string }[]>("kr8_service_verify_trash");
      if (!due.length) break;
      const r = await fetch(`${SUPA}/storage/v1/object/kr8-verify`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: due.map((d) => d.name) }) });
      if (!r.ok) { failed += due.length; console.log(JSON.stringify({ storage_error: r.status, body: (await r.text()).slice(0, 300) })); break; }
      // a file that was already gone counts as removed too (Storage answers 200 with the files it found)
      removed += await rpc<number>("kr8_service_verify_trash_done", { p_ids: due.map((d) => d.id) });
      if (due.length < 200) break;
    }
    // 0138: traveller passport photos (private kr8-passport), queued at the team's decision, when replaced, after 30 days undecided /
    // the account is deleted. Before 0138 the list call fails: skipped, the selfie part above still counts.
    try {
      for (let round = 0; round < 5; round++) {
        const due = await rpc<{ id: string; name: string }[]>("kr8_service_passport_trash");
        if (!due.length) break;
        const r = await fetch(`${SUPA}/storage/v1/object/kr8-passport`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: due.map((d) => d.name) }) });
        if (!r.ok) { failed += due.length; console.log(JSON.stringify({ storage_error: r.status, bucket: "kr8-passport" })); break; }
        removed += await rpc<number>("kr8_service_passport_trash_done", { p_ids: due.map((d) => d.id) });
        if (due.length < 200) break;
      }
    } catch (e) { console.log(JSON.stringify({ passport_skip: String(e).slice(0, 120) })); }
  } catch (e) {
    console.log(JSON.stringify({ error: String(e).slice(0, 300) }));
    return new Response(JSON.stringify({ removed, failed, error: true }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  console.log(JSON.stringify({ removed, failed }));
  return new Response(JSON.stringify({ removed, failed }), { status: 200, headers: { "Content-Type": "application/json" } });
});
