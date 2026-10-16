#!/usr/bin/env bash
#
# BRINGING PRODUCTION UP TO THE MIGRATIONS FOLDER. STEP ONE OF TWO.
#
# Takes a copy of the database, then prints what is applied and what is not,
# and stops. It changes nothing. The second step is a command you run
# deliberately, printed at the end.
#
# Why a copy first: this project is on the free plan, which takes no backups,
# and the database holds 649 prospects and 61 logged activities that exist
# nowhere else. Forty-four migrations is not a thing to run without a way back.
#
# Why pg_dump and psql rather than the Supabase CLI: `supabase db dump` and
# `db diff` both run Postgres inside Docker, and Docker Desktop is a gigabyte
# of daemon to install for a job the client tools do directly. `brew install
# libpq` is a few megabytes and no daemon.
#
set -euo pipefail
cd "$(dirname "$0")/.."

PG=/opt/homebrew/opt/libpq/bin
[ -x "$PG/pg_dump" ] || { echo "Falta pg_dump. Instálalo con:  brew install libpq"; exit 1; }

POOL=supabase/.temp/pooler-url
[ -f "$POOL" ] || { echo "No hay enlace. Ejecuta primero:  supabase link --project-ref <ref>"; exit 1; }

# The stored pooler URL has no password in it at all — not even a
# placeholder — so substituting into it found nothing and every tool asked
# for the password itself, once each. PGPASSWORD is read by pg_dump and psql
# alike, needs no URL-encoding of awkward characters, and is asked for once.
printf 'Contraseña de la base de datos (Supabase → Settings → Database): '
read -rs PGPASSWORD
echo
export PGPASSWORD
URL=$(tr -d '\n' < "$POOL")

STAMP=$(date +%Y-%m-%d-%H%M)
mkdir -p supabase/backups

echo "1/3  Copia completa del esquema public → supabase/backups/full-$STAMP.sql"
"$PG/pg_dump" "$URL" --schema=public --no-owner --no-acl \
  -f "supabase/backups/full-$STAMP.sql"

echo "2/3  Copia solo de los datos → supabase/backups/data-$STAMP.sql"
"$PG/pg_dump" "$URL" --schema=public --data-only --no-owner --no-acl \
  -f "supabase/backups/data-$STAMP.sql"

for f in full data; do
  P="supabase/backups/$f-$STAMP.sql"
  [ -s "$P" ] || { echo "ERROR: $P está vacío. No continúes."; exit 1; }
  printf '     %s  —  %s bytes\n' "$P" "$(wc -c < "$P" | tr -d ' ')"
done

echo
echo "     filas copiadas, para que se vea que la copia es real:"
"$PG/psql" "$URL" -qAt -c "
  select '       ' || relname || ' ' || n_live_tup
  from pg_stat_user_tables
  where schemaname='public' and n_live_tup > 0
  order by n_live_tup desc limit 8;"

echo
echo "3/3  Migraciones que Supabase da por aplicadas:"
"$PG/psql" "$URL" -qAt -c "
  select '       ' || version || '  ' || coalesce(name,'')
  from supabase_migrations.schema_migrations order by version;" 2>/dev/null \
  || echo "       (no hay tabla de seguimiento: nunca se aplicó nada con el CLI)"

echo
echo "     en esta carpeta hay $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') ficheros."

cat <<'NOTE'

────────────────────────────────────────────────────────────────────────
Nada se ha cambiado. La copia está en supabase/backups/ y está ignorada
por git, porque contiene cada fila de pacientes y prospectos.

Enséñame las dos listas de arriba antes del segundo paso.
────────────────────────────────────────────────────────────────────────
NOTE
