#!/bin/bash
# trial-run.sh <name> <data folder> <secrets folder>: the Petals image, as petals_run.sh runs it, but
# throwaway: its own name, a host-only network, port 127.0.0.1:3188, a throwaway folder, a test key.
set -euo pipefail
C=/opt/homebrew/bin/container
"$C" run -d --name "$1" --progress none --network petals-trial \
  --read-only --cap-drop ALL --tmpfs /tmp --cpus 2 --memory 1G \
  --publish 127.0.0.1:3188:3090 \
  --mount "type=bind,source=$2,target=/data" \
  --mount "type=bind,source=$3,target=/secrets,readonly" \
  --env PETAL_API_MOCK=0 --env PETAL_MAP_NETWORK=testnet --env PETAL_MAP_RECEIVER=petals.testnet \
  --env PETAL_WRITER_ACCOUNT=petals-writer.testnet --env PETAL_AGENT_ACCESS=gated \
  --env PETAL_API=http://127.0.0.1:3188 --env PETAL_PUBLIC=1 \
  petals:b589610aecbc >/dev/null
for _ in $(seq 1 60); do
  curl -fsS -m 2 http://127.0.0.1:3188/api/v1/health >/dev/null 2>&1 && { echo "$1 up on 127.0.0.1:3188"; exit 0; }
  sleep 1
done
echo "$1 did not answer"; exit 1
