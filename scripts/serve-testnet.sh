#!/bin/bash
# The app on the real testnet map (petals.testnet) with Petal's writer key. Without
# NEAR_AI_API_KEY the agent replays its recorded run; set the key in ../.secrets/near-ai.env for
# the real one. Port 3080, on this machine only. Stop with Ctrl-C.
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh && nvm use >/dev/null || exit 1
secrets="$(cd .. && pwd)/.secrets"
for env_file in near-ai.env petal-wallet.env; do
  if [ -f "$secrets/$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$secrets/$env_file"
    set +a
  fi
done
# Elco's real work lives outside any worktree, so a rebuild or a lane change can't split or lose it.
export PETAL_STATE_DIR="${PETAL_STATE_DIR:-$HOME/Library/Application Support/Petals/elco}"
mkdir -p "$PETAL_STATE_DIR" && chmod 700 "$PETAL_STATE_DIR"
export PETAL_API_MOCK=0
export PETAL_MAP_NETWORK=testnet
export PETAL_MAP_RECEIVER=petals.testnet
export PETAL_WRITER_ACCOUNT=petals-writer.testnet
export PETAL_WRITER_KEY_FILE="$secrets/petal-writer.testnet.json"
export PETAL_LAB=1
# Elco's own tool: no sponsored invite. Without petal-wallet.env, sign-ins last until a restart.
export PETAL_AGENT_ACCESS=open
[ -f apps/web/.next/BUILD_ID ] || pnpm --filter @petal/web build
# Localhost only, from the package's start script: this copy spends on an open agent, and the container
# can reach any host port bound to all interfaces through its gateway.
PORT="${PORT:-3080}" exec pnpm --filter @petal/web start
