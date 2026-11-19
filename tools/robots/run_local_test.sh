#!/usr/bin/env bash
# Runs 0136 + 0137 on a THROWAWAY local Postgres: stub schema → migrations (twice: re-runnable) → tests. Never point this at live.
# Usage: PGHOST=/path/to/socket PGPORT=5432 tools/robots/run_local_test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${ROBOT_TEST_DB:-kr8_robot_test}
P="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB -f tools/robots/stub_schema.sql
for m in 0136_kr8_open_robot_filter 0137_kr8_reel_file_watch; do
  $P -d $DB -f supabase/migrations/$m.sql >/dev/null
  $P -d $DB -f supabase/migrations/$m.sql >/dev/null
done
for t in 0136 0137; do $P -d $DB -f supabase/tests/${t}_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'; done
