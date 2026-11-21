// kr8-cleanup (0075 + T-398/T-401 multi-bucket, 18 Nov 2026): removal of due files across kr8-verify, kr8-reels, and kr8-ask
// queued in kr8_storage_trash (claim/verification photos > 30 days, orphan uploads, and files of deleted accounts).
// Same secret as notify-*: x-hook-secret = NOTIFY_HOOK_SECRET. Deploy with --no-verify-jwt.
const HOOK = Deno.env.get("NOTIFY_HOOK_SECRET") ?? "";
const SUPA = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const BUCKETS = ["kr8-verify", "kr8-reels", "kr8-ask"] as const;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

Deno.serve(async (req) => {
  if (!HOOK || req.headers.get("x-hook-secret") !== HOOK) return new Response("forbidden", { status: 403 });
  if (!SUPA || !SR) return new Response("not configured", { status: 500 });
  let removed = 0, failed = 0;
  const by_bucket: Record<string, number> = { "kr8-verify": 0, "kr8-reels": 0, "kr8-ask": 0 };
  try {
    for (const bucket of BUCKETS) {
      for (let round = 0; round < 5; round++) {
        const due = await rpc<{ id: string; bucket: string; name: string }[]>("kr8_service_storage_trash", { p_bucket: bucket });
        if (!due.length) break;
        const r = await fetch(`${SUPA}/storage/v1/object/${bucket}`, {
          method: "DELETE",
          headers: H,
          body: JSON.stringify({ prefixes: due.map((d) => d.name) }),
        });
        if (!r.ok) {
          failed += due.length;
          console.log(JSON.stringify({ bucket, storage_error: r.status, body: (await r.text()).slice(0, 300) }));
          break;
        }
        // a file that was already gone counts as removed too (Storage answers 200 with the files it found)
        const doneN = await rpc<number>("kr8_service_storage_trash_done", { p_ids: due.map((d) => d.id) });
        removed += doneN;
        by_bucket[bucket] += doneN;
        if (due.length < 200) break;
      }
    }
    // 0187 (21 Nov): traveller passport photos (private kr8-passport), queued at the team's decision / replaced / 30 days undecided /
    // account deleted (0138). This version had dropped them, so they waited for the admin page's "remove old files" step.
    for (let round = 0; round < 5; round++) {
      const due = await rpc<{ id: string; name: string }[]>("kr8_service_passport_trash");
      if (!due.length) break;
      const r = await fetch(`${SUPA}/storage/v1/object/kr8-passport`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: due.map((d) => d.name) }) });
      if (!r.ok) { failed += due.length; console.log(JSON.stringify({ bucket: "kr8-passport", storage_error: r.status })); break; }
      const doneN = await rpc<number>("kr8_service_passport_trash_done", { p_ids: due.map((d) => d.id) });
      removed += doneN;
      by_bucket["kr8-passport"] = (by_bucket["kr8-passport"] || 0) + doneN;
      if (due.length < 200) break;
    }
  } catch (e) {
    console.log(JSON.stringify({ error: String(e).slice(0, 300) }));
    return new Response(JSON.stringify({ removed, failed, by_bucket, error: true }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  console.log(JSON.stringify({ removed, failed, by_bucket }));
  return new Response(JSON.stringify({ removed, failed, by_bucket }), { status: 200, headers: { "Content-Type": "application/json" } });
});
