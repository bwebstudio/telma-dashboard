#!/usr/bin/env bash
#
# WHAT CHANGED IN THE DATABASE THAT NOBODY WROTE DOWN.
#
# supabase/migrations/ is the schema. It is the only copy that survives a
# project being paused, deleted or recreated, and at launch the production
# database is built by replaying it. Anything done through the Supabase table
# editor instead — a column added, a constraint relaxed, a default changed —
# exists in one project and nowhere else, and it disappears the moment that
# project is replaced.
#
# This asks the live project what it actually looks like and prints the SQL
# that would be needed to make the migrations match. Empty output is the
# answer you want: it means the files are the truth.
#
# Anything it prints is a change that has to become a numbered migration
# before launch. It is not a tool to run once; it is the check before any
# release that touches the database.
#
#     ./scripts/db-drift.sh            # the demo project, from .env.demo.local
#     ./scripts/db-drift.sh .env.local # whichever environment file you name
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${1:-.env.demo.local}"
[ -f "$ENV_FILE" ] || { echo "No existe $ENV_FILE"; exit 1; }

REF=$(grep -oE 'https://[a-z0-9]+\.supabase\.co' "$ENV_FILE" | head -1 | sed 's|https://||; s|\.supabase\.co||')
[ -n "$REF" ] || { echo "No encuentro una URL de Supabase en $ENV_FILE"; exit 1; }

echo "Proyecto: ${REF:0:8}…  (desde $ENV_FILE)"
echo "Migraciones en el repo: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
echo

# `link` asks for the database password the first time. It is stored in
# supabase/.temp, which is gitignored.
supabase link --project-ref "$REF"

OUT="supabase/drift-$(date +%Y-%m-%d).sql"
echo
echo "Comparando el proyecto con supabase/migrations/ …"
supabase db diff --linked --schema public > "$OUT"

if [ -s "$OUT" ]; then
  echo
  echo "⚠  HAY DESVIACIÓN. El proyecto no coincide con las migraciones."
  echo "   Escrito en $OUT — conviértelo en una migración numerada antes del lanzamiento:"
  echo
  sed -n '1,40p' "$OUT"
  echo
  echo "   (mostradas las primeras 40 líneas)"
else
  rm -f "$OUT"
  echo
  echo "✓  Sin desviación. Las migraciones son la verdad y producción se puede"
  echo "   construir replicándolas."
fi
