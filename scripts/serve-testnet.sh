#!/bin/bash
# The app on the real testnet map (petals.testnet) with Petal's writer key. Without
# NEAR_AI_API_KEY the agent replays its recorded run; set the key in ../.secrets/near-ai.env for
# the real one. Port 3080. Stop with Ctrl-C.
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh && nvm use >/dev/null || exit 1
secrets="$(cd .. && pwd)/.secrets"
if [ -f "$secrets/near-ai.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$secrets/near-ai.env"
  set +a
fi
export PETAL_API_MOCK=0
export PETAL_MAP_NETWORK=testnet
export PETAL_MAP_RECEIVER=petals.testnet
export PETAL_WRITER_ACCOUNT=petals-writer.testnet
export PETAL_WRITER_KEY_FILE="$secrets/petal-writer.testnet.json"
[ -f apps/web/.next/BUILD_ID ] || pnpm --filter @petal/web build
PORT="${PORT:-3080}" exec pnpm --filter @petal/web start
