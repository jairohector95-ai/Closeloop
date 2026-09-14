#!/usr/bin/env bash
# Applies the migrations to a throwaway database on a local Postgres and runs
# the RLS / scheduler-safety tests in supabase/test/rls.test.sql.
#
# Usage: PGHOST=/tmp/pg PGPORT=5432 PGUSER=postgres npm run test:db
# Standard libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD) select the
# server; it must be a scratch server where PGUSER is a superuser. The script
# creates and drops a database named closeloop_test.
set -euo pipefail
cd "$(dirname "$0")/.."
psql -d postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists closeloop_test" -c "create database closeloop_test"
psql -d closeloop_test -v ON_ERROR_STOP=1 -q -f supabase/test/00_auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql -d closeloop_test -v ON_ERROR_STOP=1 -q -f "$f"
done
psql -d closeloop_test -v ON_ERROR_STOP=1 -f supabase/test/rls.test.sql
psql -d postgres -v ON_ERROR_STOP=1 -q -c "drop database closeloop_test"
