#!/usr/bin/env bash
# The one local check (T006). No CI: run this before every commit you care about.
# typecheck, lint, unit tests, secret scan, fixture size, publication boundary.
# Never uses `timeout` (macOS has none).

cd "$(dirname "$0")/.." || exit 1

# A login shell finds ~/.local/bin/node (v22) first, so load nvm and use .nvmrc.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm use >/dev/null || exit 1

set -euo pipefail

case "$(node -v)" in
  v24.*) ;;
  *) echo "check: Node 24 is required, found $(node -v)" >&2; exit 1 ;;
esac

step() { printf '\n== %s\n' "$1"; }

step "node $(node -v), pnpm $(pnpm -v)"
step typecheck;     pnpm -s typecheck
step lint;          pnpm -s lint
step test;          pnpm -s test
step secrets;       bash scripts/check-secrets.sh
step fixture-size;  node scripts/check-fixture-size.ts
step boundary;      bash scripts/check-boundary.sh

printf '\ncheck: all green\n'
