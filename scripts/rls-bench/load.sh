#!/usr/bin/env bash
# Build a throwaway local copy of the MasjidConnect schema (no data) in Postgres.
#   PSQL="psql -h localhost -U postgres"  bash scripts/rls-bench/load.sh
# PSQL defaults to `psql` with the usual PG* env vars (that is what CI uses).
#
# Order: Supabase shim → schema.sql snapshot → every numbered migration from
# 14 on, in order (the snapshot is incomplete for several of them).
# Every file must load with zero errors, or the script exits 1.
set -uo pipefail
cd "$(dirname "$0")/../.."
PSQL=${PSQL:-psql}
fail=0

run() {  # run <label> <file...>
  local label=$1; shift
  local out
  out=$( { echo "SET check_function_bodies = off;"; cat "$@"; } | $PSQL -q -v ON_ERROR_STOP=0 2>&1 | grep -E "^(psql:.*)?ERROR" )
  if [ -n "$out" ]; then echo "FAIL  $label"; echo "$out" | sed 's/^/      /'; fail=1
  else echo "ok    $label"; fi
}

run shim       scripts/rls-bench/00_supabase_shim.sql
# The snapshot has two known ordering faults that the next files repair:
#   - the rapport_cards_insert policy precedes migration 19's tables
#   - the assignments read policy precedes assignment_is_targeted()
# so its own errors are expected and filtered; everything after must be clean.
snap=$( { echo "SET check_function_bodies = off;"; cat supabase/schema.sql; } \
  | $PSQL -q -v ON_ERROR_STOP=0 2>&1 | grep -E "ERROR" \
  | grep -v -E 'relation "public.rapport_cards" does not exist|function public.assignment_is_targeted\(uuid\) does not exist' || true )
if [ -n "$snap" ]; then echo "FAIL  schema.sql"; echo "$snap" | sed 's/^/      /'; fail=1
else echo "ok    schema.sql (2 known ordering faults, repaired below)"; fi

# The snapshot documents the tables of 14-18 and 30-31 but not all of their
# RLS, and later migrations (26 sweep, 32, 39 ...) rewrote those policies -- so
# replay every migration from 14 on, in number order. They are idempotent.
for n in $(seq 14 99); do
  for f in supabase/${n}_*.sql; do
    [ -e "$f" ] || continue
    case "$f" in *rollback*|*dryrun*) continue;; esac
    # Reference for run.sh: every policy exactly as it was before 48, so it can
    # prove 48_rollback.sql restores them (kept outside the public schema).
    if [ "$n" = 48 ]; then
      $PSQL -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || fail=1
CREATE SCHEMA IF NOT EXISTS bench_meta;
CREATE TABLE IF NOT EXISTS bench_meta.policy_snapshot (label text PRIMARY KEY, md5 text);
INSERT INTO bench_meta.policy_snapshot
SELECT 'pre48', md5(string_agg(tablename||policyname||permissive||cmd||roles::text||coalesce(qual,'')||coalesce(with_check,''), '|' ORDER BY tablename, policyname))
  FROM pg_policies WHERE schemaname = 'public'
ON CONFLICT (label) DO UPDATE SET md5 = EXCLUDED.md5;
SQL
    fi
    run "$(basename "$f" .sql)" "$f"
  done
done
exit $fail
