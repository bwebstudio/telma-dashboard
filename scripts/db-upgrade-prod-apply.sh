#!/usr/bin/env bash
#
# BRINGING PRODUCTION UP TO DATE. STEP TWO. THIS ONE CHANGES THINGS.
#
# What the tracking table says and what the database actually contains are two
# different stories. Supabase records crm_geo (0008) as the last migration
# applied; the live schema has clinics.after_hours_transfer, which 0031 adds,
# and does not have appointments.note, which 0033 adds. So 0009 through 0031
# were applied by hand at some point and never recorded.
#
# That gap is not cosmetic. `db push` trusts the tracking table, so left alone
# it would replay twenty-odd migrations that have already run. Most carry
# `if not exists` and would be harmless, but 0018 does not: it adds tables to
# the realtime publication, and adding one that is already a member is an
# error. The push would stop there, halfway, having applied part of the set.
#
# So the tracking table is corrected first to say what is actually true, and
# only then is the real gap — 0032 to 0052 — pushed.
#
set -euo pipefail
cd "$(dirname "$0")/.."

LATEST=$(ls -t supabase/backups/full-*.sql 2>/dev/null | head -1)
[ -n "$LATEST" ] || { echo "No hay copia en supabase/backups/. Ejecuta antes ./scripts/db-upgrade-prod.sh"; exit 1; }
AGE=$(( ( $(date +%s) - $(stat -f %m "$LATEST") ) / 60 ))
echo "Copia más reciente: $LATEST  ($AGE minutos, $(wc -c < "$LATEST" | tr -d ' ') bytes)"
[ "$AGE" -lt 180 ] || { echo "Esa copia tiene más de tres horas. Vuelve a ejecutar el paso uno."; exit 1; }

echo
echo "1/2  Corrigiendo el registro: 0009 a 0031 como aplicadas."
echo "     No ejecuta SQL contra el esquema; solo escribe lo que ya es cierto."
read -rp "     ¿Seguimos? (escribe si) " ok
[ "$ok" = "si" ] || { echo "Parado."; exit 0; }

for f in supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  if [ "$v" -ge 9 ] && [ "$v" -le 31 ] 2>/dev/null; then
    supabase migration repair --status applied "$v"
  fi
done

echo
echo "2/2  Aplicando lo que falta de verdad: 0032 a 0052."
supabase migration list --linked
read -rp "     ¿La lista cuadra? Escribe 'aplicar' para empujar: " go
[ "$go" = "aplicar" ] || { echo "Parado. Nada se ha aplicado al esquema."; exit 0; }

supabase db push

cat <<'NOTE'

────────────────────────────────────────────────────────────────────────
Si se ha detenido en una migración, PARA y enséñame el error. Las que
pueden fallar son 0035 y 0038: reescriben las franjas horarias que ya
existen, y son las dos únicas del tramo sin guardas.

Si ha llegado al final, el esquema coincide con la carpeta y el alta
puede crear una clínica de verdad.
────────────────────────────────────────────────────────────────────────
NOTE
