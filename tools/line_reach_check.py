#!/usr/bin/env python3
"""m213c: which LINE-linked members can OA @194hsqbc (same LINE provider as Kring's LINE Login) actually reach?
For every kr8_line_links.line_sub, asks LINE for the profile with the OA's token (free; sends nothing to anyone).
200 = friend of the OA → reachable. 404 = not a friend, blocked, or a user id from another LINE provider.
Writes kr8_push_line.friend + the OA quota via kr8_line_check_done (same as the edge function kr8-digest-mail /line-check,
which the 18:45 Bangkok cron runs). The flagship @266jjwqh reaches 0 members: LINE_TOKEN_KEY=LINE_OA_FLAGSHIP_CHANNEL_ACCESS_TOKEN
checks it, but then the result must not be written (pass --dry).
Usage (laptop VM):  KRING_SECRETS=$HOME/mnt/Kring-secrets python3 tools/line_reach_check.py
Prints counts only, never the token."""
import json, os, re, sys, urllib.request, urllib.error

SEC = os.path.expanduser(os.environ.get("KRING_SECRETS", "~/mnt/Kring-secrets"))
TOK_KEY = os.environ.get("LINE_TOKEN_KEY", "LINE_OA_194HSQBC_CHANNEL_ACCESS_TOKEN")


def env_value(path, key):
    for line in open(path, encoding="utf-8"):
        if line.strip().startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def sql(q):
    tok = re.search(r"sbp_[A-Za-z0-9]+", open(os.path.join(SEC, "supabase_mgmt.env")).read()).group(0)
    req = urllib.request.Request("https://api.supabase.com/v1/projects/pedxoxpammnyfnizljyj/database/query",
                                 data=json.dumps({"query": q}).encode(),
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "User-Agent": "curl/8"})
    return json.load(urllib.request.urlopen(req, timeout=120))


def main():
    line_tok = env_value(os.path.join(SEC, "line_oas.env"), TOK_KEY)
    if not line_tok:
        sys.exit(f"{TOK_KEY} not found in line_oas.env")
    subs = [r["line_sub"] for r in sql("select distinct line_sub from kr8_line_links where line_sub ~ '^U[0-9a-f]{32}$'")]
    rows = []
    for s in subs:
        try:
            r = urllib.request.urlopen(urllib.request.Request(f"https://api.line.me/v2/bot/profile/{s}",
                                                              headers={"Authorization": "Bearer " + line_tok}), timeout=20)
            code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception:
            code = 0
        if code in (200, 404):
            rows.append((s, code == 200, code))
    quota = None
    try:
        h = {"Authorization": "Bearer " + line_tok}
        qa = json.load(urllib.request.urlopen(urllib.request.Request("https://api.line.me/v2/bot/message/quota", headers=h), timeout=20))
        qb = json.load(urllib.request.urlopen(urllib.request.Request("https://api.line.me/v2/bot/message/quota/consumption", headers=h), timeout=20))
        quota = {"limit": int(qa.get("value") or 100000) if qa.get("type") == "limited" else 100000, "used": int(qb["totalUsage"])}
    except Exception:
        pass
    if "--dry" not in sys.argv:
        res = json.dumps([{"sub": s, "http": c} for s, ok, c in rows]).replace("'", "''")
        q = "null" if quota is None else "'" + json.dumps(quota) + "'::jsonb"
        sql(f"select public.kr8_line_check_done('{res}'::jsonb, {q}) n")
    print(json.dumps({"checked": len(subs), "recorded": len(rows), "reachable": sum(1 for r in rows if r[1]),
                      "not_reachable": sum(1 for r in rows if not r[1]), "errors": len(subs) - len(rows), "quota": quota}))


if __name__ == "__main__":
    main()
