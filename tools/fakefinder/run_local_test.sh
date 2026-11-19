#!/usr/bin/env bash
# Runs 0124 on a THROWAWAY local Postgres: stub schema → migration (twice: re-runnable) → test. Never point this at live.
# Usage: PGHOST=/var/tmp/pgfake124 PGPORT=55124 tools/fakefinder/run_local_test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${FAKE_TEST_DB:-kr8_fake_test}
P="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB -f tools/fakefinder/stub_schema.sql
$P -d $DB -f supabase/migrations/0124_fake_finder.sql
$P -d $DB -f supabase/migrations/0124_fake_finder.sql
$P -d $DB -f supabase/tests/0124_test.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
