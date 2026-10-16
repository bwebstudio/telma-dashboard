#!/usr/bin/env bash
#
# BRINGING PRODUCTION UP TO THE MIGRATIONS FOLDER. STEP ONE OF TWO.
#
# This script does not change anything. It takes a copy of the database and
# then prints what would be applied, and stops. The second step is a separate
# command that you run deliberately, printed at the end.
#
# Why the copy first: this project is on the free plan, which takes no
# backups, and the database holds 649 prospects and 61 logged activities that
# exist nowhere else. Forty-four migrations is not a thing to run without a
# way back.
#
# Why list-before-push: the dashboard says the last migration applied was
# crm_geo (0008), but the live `plans` table already has the shape that 0014
# creates — so somebody applied part of this by hand and the tracking table
# does not describe the database. `migration list` is what shows the gap
# between what Supabase thinks is applied and what is in this folder.
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${1:-.env.local}"
REF=$(grep -oE 'https://[a-z0-9]+\.supabase\.co' "$ENV_FILE" | head -1 | sed 's|https://||; s|\.supabase\.co||')
[ -n "$REF" ] || { echo "No encuentro una URL de Supabase en $ENV_FILE"; exit 1; }

echo "Proyecto: ${REF:0:8}…   (desde $ENV_FILE)"
supabase link --project-ref "$REF"

STAMP=$(date +%Y-%m-%d-%H%M)
mkdir -p supabase/backups

echo
echo "1/3  Copia del esquema → supabase/backups/schema-$STAMP.sql"
supabase db dump --linked -f "supabase/backups/schema-$STAMP.sql"

echo
echo "2/3  Copia de los datos → supabase/backups/data-$STAMP.sql"
supabase db dump --linked --data-only -f "supabase/backups/data-$STAMP.sql"

for f in schema data; do
  P="supabase/backups/$f-$STAMP.sql"
  [ -s "$P" ] || { echo "ERROR: $P está vacío. No continúes."; exit 1; }
  echo "     $P  —  $(wc -c < "$P" | tr -d ' ') bytes"
done

echo
echo "3/3  Lo que Supabase cree aplicado, frente a esta carpeta:"
echo
supabase migration list --linked

cat <<'NOTE'

────────────────────────────────────────────────────────────────────────
Nada se ha cambiado todavía.

Si la lista de arriba tiene sentido, el segundo paso es:

    supabase db push

Tres de las migraciones pendientes no llevan guardas y son las que
pueden fallar: 0018_billing_realtime, 0035_merge_slots_into_windows y
0038_merge_overlapping_windows. Si `db push` se detiene en una de ellas,
para y enséñame el error: el resto habrá quedado aplicado y continuar a
ciegas es como se rompe una base de datos de verdad.
────────────────────────────────────────────────────────────────────────
NOTE
