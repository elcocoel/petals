#!/bin/bash
# pg-run.sh <container name> <volume name> <password file>: the official Postgres 17 image, throwaway, on
# the host-only trial network, its data on a named volume (outside the container), no published port.
set -euo pipefail
C=/opt/homebrew/bin/container
"$C" volume inspect "$2" >/dev/null 2>&1 || "$C" volume create -s 2G "$2" >/dev/null
"$C" run -d --name "$1" --progress none --network petals-trial --cpus 2 --memory 1G \
  --env POSTGRES_PASSWORD="$(cat "$3")" --env PGDATA=/var/lib/postgresql/data/pgdata \
  --volume "$2:/var/lib/postgresql/data" \
  docker.io/library/postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  "$C" exec "$1" pg_isready -U postgres -q 2>/dev/null && { echo "$1 ready (volume $2)"; exit 0; }
  sleep 1
done
echo "$1 not ready"; exit 1
