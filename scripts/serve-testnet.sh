#!/bin/bash
# The app on the real testnet map (petals.testnet) with Petal's writer key. Without
# NEAR_AI_API_KEY the agent replays its recorded run; set the key in near-ai.env (keys folder beside the
# repo) for the real one. The site on 3080 and its server on 3081, apart as on a host (specs/002-system/research.md),
# on this machine only. Stop both with Ctrl-C.
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
# The live store lives outside any worktree, so a rebuild or a branch change can't split or lose it.
export PETAL_STATE_DIR="${PETAL_STATE_DIR:-$HOME/Library/Application Support/Petals/elco}"
mkdir -p "$PETAL_STATE_DIR" && chmod 700 "$PETAL_STATE_DIR"
# Never on a folder the container holds: its SQLite locks live in its own kernel, so two writers could
# corrupt the live store. Rebuild the container instead.
if [ "$(cat "$HOME/Library/Application Support/Petals/data-folder" 2>/dev/null)" = "$PETAL_STATE_DIR" ]; then
  echo "refused: the container holds $PETAL_STATE_DIR, so this app can't run on it"; exit 1
fi
export PETAL_MAP_NETWORK=testnet
export PETAL_MAP_RECEIVER=petals.testnet
export PETAL_WRITER_ACCOUNT=petals-writer.testnet
export PETAL_WRITER_KEY_FILE="$secrets/petal-writer.testnet.json"
export PETAL_LAB=1
# The operator's own tool: no sponsored invite. Without petal-wallet.env, sign-ins last until a restart.
export PETAL_AGENT_ACCESS=open
SITE_PORT="${PORT:-3080}"
SERVER_PORT="${PETAL_SERVER_PORT:-3081}"
[ -f apps/web/.next/BUILD_ID ] || pnpm --filter @petal/web build
# The server holds the data and the keys; the site shows pages and forwards the rest to it. Links and
# sign-in name the site. Both bind to localhost: this copy spends on an open agent, and the container
# can reach any host port bound to all interfaces through its gateway.
PETAL_API="http://127.0.0.1:$SITE_PORT" PORT="$SERVER_PORT" node packages/agent/src/serve.ts &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
PETAL_SERVER="http://127.0.0.1:$SERVER_PORT" PORT="$SITE_PORT" pnpm --filter @petal/web start
