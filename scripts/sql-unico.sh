#!/bin/bash
# Unisce tutte le migration in un solo file da incollare nell'editor SQL di un progetto Supabase NUOVO
# (vedi docs/GUIDA-TELEFONO.md). Da rigenerare quando si aggiunge una migration.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT="$REPO/supabase/online/schema-completo.sql"
{
  echo "-- FastLab v3: schema completo per un progetto Supabase NUOVO e vuoto."
  echo "-- Generato da scripts/sql-unico.sh unendo supabase/migrations/*.sql: non modificarlo a mano."
  echo "-- Incollalo tutto nell'editor SQL del Dashboard e premi Run. Su un progetto che ha già le tabelle fallisce."
  echo
  echo "begin;"
  for m in "$REPO"/supabase/migrations/*.sql; do
    echo
    echo "-- ===== $(basename "$m") ====="
    cat "$m"
  done
  echo
  echo "commit;"
} > "$OUT"
echo "Scritto $OUT"
