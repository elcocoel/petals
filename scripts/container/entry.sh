#!/bin/bash
# Loads the NEAR AI env and the wallet key from the read-only secrets mount, as
# scripts/serve-testnet.sh does, and hands over to Next. PETAL_AGENT_ACCESS stays unset, so gated.
# The daily cap comes from the run command and an env file can't raise it.
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
exec node /app/apps/web/node_modules/next/dist/bin/next start -p "${PORT:-3090}"
