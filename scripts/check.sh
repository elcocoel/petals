#!/usr/bin/env bash
# The one local check (T006). No CI: run this before every commit you care about.
# typecheck, lint, unit tests, secret scan, dated personal attributions, fixture size, publication boundary,
# design tokens and the literal scan.
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

# Every temp folder the tests and the build make goes in one folder of this run's, removed when the check
# ends, failed or not, so tests that don't clean up after themselves can't fill the disk.
check_tmp="$(mktemp -d "${TMPDIR:-/tmp}/petal-check.XXXXXX")"
trap 'rm -rf "$check_tmp"' EXIT
export TMPDIR="$check_tmp"

step() { printf '\n== %s\n' "$1"; }

step "node $(node -v), pnpm $(pnpm -v)"
step typecheck;     pnpm -s typecheck
step lint;          pnpm -s lint
step test;          pnpm -s test
step secrets;       bash scripts/check-secrets.sh
step public-tree;   bash scripts/check-public-tree.sh
step fixture-size;  node scripts/check-fixture-size.ts
step boundary;      bash scripts/check-boundary.sh
step protocols;     node scripts/check-protocols.ts
step connect;       node scripts/brain-connect.ts --check
step tokens;        node packages/tokens/emit.ts --check
step literals;      node scripts/check-literals.ts
# The site's production build: Next refuses things the typecheck and tests don't see, such as a hook
# reached from a server component (8 Nov, Vercel refused 8872b7d). About ten seconds.
step web-build
build_log="$(mktemp -t petal-web-build)"
pnpm -s --filter @petal/web build >"$build_log" 2>&1 || { tail -40 "$build_log"; rm -f "$build_log"; exit 1; }
rm -f "$build_log"

printf '\ncheck: all green\n'
