#!/bin/bash
# Loads the NEAR AI env and the wallet key from the read-only secrets mount, as
# scripts/serve-testnet.sh does, and hands over to Next. The daily cap comes from the run command, and
# an env file can't raise it. Nothing, env file or run command, can open the agent, turn on the lab or
# the fakes, or send the model's calls and key to another address here: this is the public image, and
# that's the one thing it's sure of.
cap="${PETAL_LLM_DAILY_USD:-}"
for env_file in /secrets/near-ai.env /secrets/petal-wallet.env; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
done
[ -z "$cap" ] || export PETAL_LLM_DAILY_USD="$cap"
unset PETAL_LAB PETAL_FAKE PETAL_NEAR_AI_BASE_URL
export PETAL_AGENT_ACCESS=gated PETAL_API_MOCK=0
exec node /app/apps/web/node_modules/next/dist/bin/next start -p "${PORT:-3090}"
