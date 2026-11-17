#!/usr/bin/env bash
# Corre EN EL SERVIDOR (/opt/nebo/actualizar-sword.sh), cada minuto con el timer nebo-sword.timer.
# Si main de jorgedsz/agentia tiene un commit nuevo: construye la imagen con la version vieja
# todavia atendiendo, guarda la actual como nebo-sword:anterior, arranca la nueva (Caddy hace
# esperar las solicitudes durante el reinicio) y, si no queda sana, vuelve a la anterior.
#   --forzar  despliega aunque no haya commit nuevo
# Ojo: volver a la imagen anterior no deshace cambios de esquema (prisma db push al arrancar).
set -euo pipefail
cd /opt/nebo

# Un despliegue tarda minutos y el timer corre cada minuto: uno a la vez.
exec 9>/tmp/actualizar-sword.lock
flock -n 9 || exit 0

REPO=sword-repo
git -C "$REPO" fetch -q origin main
nuevo=$(git -C "$REPO" rev-parse origin/main)
actual=$(cat sword-commit 2>/dev/null || true)
[ "$nuevo" = "$actual" ] && [ "${1:-}" != "--forzar" ] && exit 0

anterior=$(git -C "$REPO" rev-parse HEAD)
echo "Nuevo commit: $(git -C "$REPO" log -1 --format='%h %s' "$nuevo")"
git -C "$REPO" reset -q --hard "$nuevo"
# Se anota antes de construir: si el build falla no se reintenta cada minuto (el siguiente push, o --forzar).
echo "$nuevo" > sword-commit

# La imagen que esta atendiendo ahora; el build le quita la etiqueta :actual.
viejo_id=$(docker inspect -f '{{.Image}}' "$(docker compose ps -q sword)")

if ! nice -n 10 docker compose build -q sword; then
	echo "ERROR: el build fallo; sigue atendiendo la version anterior ($anterior)"
	git -C "$REPO" reset -q --hard "$anterior"
	docker tag "$viejo_id" nebo-sword:actual
	exit 1
fi

docker tag "$viejo_id" nebo-sword:anterior

docker compose up -d sword

sano() {
	for _ in $(seq 1 40); do
		s=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q sword)" 2>/dev/null || echo none)
		[ "$s" = healthy ] && return 0
		[ "$s" = unhealthy ] && return 1
		sleep 5
	done
	return 1
}

if sano; then
	echo "Desplegado $(git -C "$REPO" log -1 --format='%h %s')"
	docker image prune -f >/dev/null
else
	echo "ERROR: la version nueva no quedo sana; vuelvo a la anterior ($anterior)"
	docker compose logs --tail 40 sword || true
	docker tag nebo-sword:anterior nebo-sword:actual
	git -C "$REPO" reset -q --hard "$anterior"
	docker compose up -d sword
	sano && echo "Version anterior restaurada" || echo "ERROR: la anterior tampoco quedo sana"
	exit 1
fi
