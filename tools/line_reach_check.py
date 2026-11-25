#!/usr/bin/env python3
"""m213: which LINE-linked members can the Kring OA (@266jjwqh) actually reach?
For every kr8_line_links.line_sub, asks LINE for the profile with the OA's token (free; sends nothing to anyone).
200 = friend of the OA → reachable. 404 = not a friend, blocked, or a user id from another LINE provider.
Writes the result to kr8_line_oa_reach; the evening summary uses LINE only for ok rows checked in the last 30 days.
Usage (laptop VM):  KRING_SECRETS=$HOME/mnt/Kring-secrets python3 tools/line_reach_check.py
Prints counts only, never the token."""
import json, os, re, sys, urllib.request, urllib.error

SEC = os.path.expanduser(os.environ.get("KRING_SECRETS", "~/mnt/Kring-secrets"))
TOK_KEY = os.environ.get("LINE_TOKEN_KEY", "LINE_OA_FLAGSHIP_CHANNEL_ACCESS_TOKEN")


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
    if rows:
        vals = ",".join(f"('{s}', {'true' if ok else 'false'}, {c}, now())" for s, ok, c in rows)
        sql("insert into kr8_line_oa_reach (line_sub, ok, http, checked_at) values " + vals +
            " on conflict (line_sub) do update set ok = excluded.ok, http = excluded.http, checked_at = excluded.checked_at")
    print(json.dumps({"checked": len(subs), "recorded": len(rows), "reachable": sum(1 for r in rows if r[1]),
                      "not_reachable": sum(1 for r in rows if not r[1]), "errors": len(subs) - len(rows)}))


if __name__ == "__main__":
    main()
