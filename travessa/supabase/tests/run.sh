#!/usr/bin/env bash
# Applies all migrations to a scratch database on a local Postgres and runs the RLS checks.
# Usage: supabase/tests/run.sh   (requires psql and a local postgres superuser)
set -euo pipefail
cd "$(dirname "$0")"
DB=travessa_test
PSQL="${PSQL:-sudo -u postgres psql}"
$PSQL -q -c "drop database if exists $DB" -c "create database $DB" postgres
files=(-f supabase_stub.sql)
for m in ../migrations/*.sql; do files+=(-f "$m"); done
# wal_level warnings from the publication stub are expected on a plain Postgres.
$PSQL -q -v ON_ERROR_STOP=1 -d $DB "${files[@]}" 2> >(grep -v -e wal_level -e HINT >&2)
$PSQL -q -v ON_ERROR_STOP=1 -d $DB -f rls_test.sql
