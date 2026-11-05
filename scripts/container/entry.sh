#!/bin/bash
# Loads the NEAR AI env from the read-only secrets mount, as scripts/serve-testnet.sh does, and
# hands over to Next. The daily cap comes from the run command and an env file can't raise it.
cap="${PETAL_LLM_DAILY_USD:-}"
if [ -f /secrets/near-ai.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /secrets/near-ai.env
  set +a
fi
[ -z "$cap" ] || export PETAL_LLM_DAILY_USD="$cap"
exec node /app/apps/web/node_modules/next/dist/bin/next start -p "${PORT:-3090}"
