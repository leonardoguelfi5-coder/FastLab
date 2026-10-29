#!/bin/bash
# Test del database senza Docker (ambienti cloud): PostgreSQL 16 + pgTAP installati con apt
# (postgresql-16-pgtap, libtap-parser-sourcehandler-pgtap-perl) e accesso `trust` per l'utente
# postgres sul socket locale. Ricrea il DB fastlab_test, applica lo strato che imita Supabase
# (stub-supabase.sql), tutte le migration in ordine e l'eventuale seed, poi esegue i pgTAP.
# Non sostituisce `npx supabase db reset` + `npm run test:db`: GoTrue, PostgREST e i privilegi
# reali di Supabase non sono emulati.
# Uso: scripts/db-senza-docker/test-db.sh [cartella del repository]
set -e
REPO=${1:-$(cd "$(dirname "$0")/../.." && pwd)}
DIR=$(cd "$(dirname "$0")" && pwd)
export PGUSER=postgres PGHOST=/var/run/postgresql
psql -X -q -d postgres -c "drop database if exists fastlab_test" -c "create database fastlab_test"
P="psql -X -q -v ON_ERROR_STOP=1 -d fastlab_test"
$P -c 'alter database fastlab_test set search_path = "$user", public, extensions'
$P -f "$DIR/stub-supabase.sql" >/dev/null
for m in "$REPO"/supabase/migrations/*.sql; do
  echo "== $(basename "$m")"
  $P -f "$m" >/dev/null
done
if [ -f "$REPO/supabase/seed.sql" ]; then $P -f "$REPO/supabase/seed.sql" >/dev/null; fi
cd "$REPO"
pg_prove -d fastlab_test supabase/tests/*.sql
