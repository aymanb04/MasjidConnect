#!/usr/bin/env bash
# Tenant-wall test bench: build the schema in an EMPTY local Postgres, seed two
# fake schools, then prove the wall (migration 46) holds and breaks nothing.
#
#   Local (podman/docker):
#     podman run -d --name mc-rls-bench -e POSTGRES_PASSWORD=bench postgres:15
#     PSQL="podman exec -i mc-rls-bench psql -U postgres" bash scripts/rls-bench/run.sh
#   CI: see .github/workflows/ci.yml (job rls-bench).
#
# NEVER point PSQL at the real Supabase project: this creates and drops
# tables' policies freely. It refuses to run if any tenant already exists.
set -uo pipefail
cd "$(dirname "$0")/../.."
PSQL=${PSQL:-psql}
q()  { { echo "SET client_min_messages = warning;"; cat; } | $PSQL -q -tA -v ON_ERROR_STOP=1 "$@"; }

case "${PSQL} ${PGHOST:-}" in *supabase*|*pooler*) echo "REFUSING: that looks like a Supabase host. The bench only runs on a throwaway local Postgres."; exit 2;; esac
existing=$(echo "SELECT to_regclass('public.tenants') IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants)" | q 2>/dev/null || echo f)
if [ "$existing" = "t" ]; then echo "REFUSING: this database already has tenants. The bench only runs on an empty database."; exit 2; fi

echo "── build schema"; bash scripts/rls-bench/load.sh || exit 1
echo "── seed";   q < scripts/rls-bench/10_seed.sql >/dev/null || exit 1
q < scripts/rls-bench/20_tests.sql >/dev/null || exit 1

echo "── with the wall (and the 47 audit triggers)";    echo "SELECT bench.census('wall');   SELECT bench.attack('wall');"   | q >/dev/null || exit 1
if q < supabase/46_rollback.sql >/dev/null 2>&1; then echo "FAIL  46_rollback.sql ran while 47 is installed (its guard should refuse)"; exit 1; fi
echo "── 46_rollback refuses while 47 is installed: ok"
q < supabase/47_rollback.sql >/dev/null || { echo "FAIL  47_rollback.sql"; exit 1; }
q < supabase/46_rollback.sql >/dev/null || { echo "FAIL  46_rollback.sql"; exit 1; }
left=$(echo "SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_wall'" | q)
echo "── rollback left $left walls (expect 0)"
echo "── without the wall (46 and 47 rolled back)"; echo "SELECT bench.census('nowall'); SELECT bench.attack('nowall');" | q >/dev/null || exit 1
( echo "SET check_function_bodies = off;"; cat supabase/46_tenant_wall.sql ) | q >/dev/null || { echo "FAIL  re-applying 46"; exit 1; }
( echo "SET check_function_bodies = off;"; cat supabase/47_grade_audit_log.sql ) | q >/dev/null || { echo "FAIL  re-applying 47"; exit 1; }
echo "── audit log"
audit=$(q < scripts/rls-bench/40_audit.sql) || { echo "FAIL  40_audit.sql"; exit 1; }
echo "$audit"
walls=$(echo "SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_wall' AND permissive = 'RESTRICTIVE'" | q)
tables=$(echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" | q)
echo "── re-applied: $walls walls on $tables tables"

q <<'SQL'
\pset format aligned
\pset tuples_only off
\echo
\echo '1. Wall breaks nothing: own-school census, with vs without wall (expect 0 rows)'
SELECT w.who, w.tbl, w.metric, n.value AS without_wall, w.value AS with_wall
  FROM bench.results w JOIN bench.results n
    ON n.label = 'nowall' AND w.label = 'wall' AND (n.who, n.tbl, n.metric) = (w.who, w.tbl, w.metric)
 WHERE w.metric NOT LIKE 'atk_%' AND w.value IS DISTINCT FROM n.value
   AND NOT (w.metric = 'insert_own' AND w.value = 'E23505' AND n.value = 'E23505')
   AND NOT (w.tbl = 'audit_logs' AND w.metric IN ('update_own', 'delete_own', 'insert_own') AND w.value = 'E42501')  -- 47: append-only, intended
 ORDER BY 2, 1, 3;

\echo '2. Wall holds under a USING(true) policy on every table (expect 0 rows)'
SELECT who, tbl, metric, value FROM bench.results
 WHERE label = 'wall' AND (
      (metric IN ('atk_read', 'atk_update', 'atk_delete') AND value NOT IN ('0') AND value NOT LIKE 'E%')
   OR (metric IN ('atk_insert') AND value NOT LIKE 'E%')
   OR (metric = 'atk_repoint' AND value NOT IN ('0') AND value NOT LIKE 'E%'))
 ORDER BY 2, 1, 3;

\echo '3. The test can see a leak: same attack without the wall (expect many rows)'
SELECT metric, count(*) AS succeeded, count(DISTINCT tbl) AS tables
  FROM bench.results
 WHERE label = 'nowall' AND metric LIKE 'atk_%'
   AND value NOT LIKE 'E%' AND value <> '0'
 GROUP BY 1 ORDER BY 1;
SQL

fail=0
broken=$(echo "SELECT count(*) FROM bench.results w JOIN bench.results n ON n.label='nowall' AND w.label='wall' AND (n.who,n.tbl,n.metric)=(w.who,w.tbl,w.metric) WHERE w.metric NOT LIKE 'atk_%' AND w.value IS DISTINCT FROM n.value AND NOT (w.metric='insert_own' AND w.value='E23505' AND n.value='E23505') AND NOT (w.tbl='audit_logs' AND w.metric IN ('update_own','delete_own','insert_own') AND w.value='E42501')" | q)
leaks=$(echo "SELECT count(*) FROM bench.results WHERE label='wall' AND metric LIKE 'atk_%' AND value NOT LIKE 'E%' AND value <> '0'" | q)
seen=$(echo "SELECT count(DISTINCT tbl) FROM bench.results WHERE label='nowall' AND metric LIKE 'atk_%' AND value NOT LIKE 'E%' AND value <> '0'" | q)
echo "$audit" | grep -q "^FAIL" && { echo "FAIL  audit log checks (above)"; fail=1; }
[ "$left" = "0" ]          || { echo "FAIL  rollback left $left walls"; fail=1; }
[ "$walls" = "$tables" ]   || { echo "FAIL  $walls walls for $tables tables"; fail=1; }
[ "$broken" = "0" ]        || { echo "FAIL  the wall changes $broken own-school outcomes (list 1)"; fail=1; }
[ "$leaks" = "0" ]         || { echo "FAIL  $leaks cross-school attacks got through the wall (list 2)"; fail=1; }
[ "$seen" = "$tables" ]    || { echo "FAIL  without the wall the attack only reached $seen of $tables tables -- the test is blind to the rest"; fail=1; }
[ $fail = 0 ] && echo "PASS  $walls/$tables tables walled · 0 own-school changes · 0 leaks with the wall · attack reaches all $seen tables without it"
exit $fail
