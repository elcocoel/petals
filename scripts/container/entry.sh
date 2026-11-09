#!/bin/bash
# Loads the NEAR AI env and the wallet key from the read-only secrets mount, as
# scripts/serve-testnet.sh does, and hands over to the server alone (packages/agent/src/serve.ts): since
# 8 Nov the website is apart, on Vercel, and forwards the server's paths here. The daily cap comes from the run command, and
# an env file can't raise it. Nothing, env file or run command, can open the agent, turn on the lab or
# the fakes, or send the model's calls and key to another address here: this is the public image, and
# that's the one thing it's sure of.
cap="${PETAL_LLM_DAILY_USD:-}"
# PETAL_PUBLIC=1 comes from the run command (petals_run.sh, when Petals/public-url exists), never a file.
public="${PETAL_PUBLIC:-}"
# Since 9 Nov a public site runs Petals' own agent for people who pay for it in NEAR (TGT-030, amended), so
# it loads the model key too.
for env_file in /secrets/near-ai.env /secrets/petal-wallet.env; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
done
[ -z "$cap" ] || export PETAL_LLM_DAILY_USD="$cap"
if [ "$public" = 1 ]; then
  export PETAL_PUBLIC=1
  unset PETAL_WRITER_KEY_FILE
  # The site key: the server answers nothing but health without it, and won't start public without it.
  export PETAL_SITE_KEY_FILE=/secrets/petal-site-key
  unset PETAL_SITE_KEY
else
  unset PETAL_PUBLIC
fi
unset PETAL_LAB PETAL_FAKE PETAL_NEAR_AI_BASE_URL PETAL_API_MOCK
export PETAL_AGENT_ACCESS=gated
# Inside the container it listens on every interface; the run command publishes it on 127.0.0.1 only.
export PETAL_HOST=0.0.0.0 PORT="${PORT:-3090}"
exec node /app/packages/agent/src/serve.ts
