#!/usr/bin/env bash
# T074: the clean-checkout check (SC-005). Clones HEAD to a temp folder, installs from the lockfile
# and, with no keys in the environment, checks:
#   - the golden tests pass twice in a row;
#   - check-secrets and check-boundary find nothing;
#   - the fixtures are within budget;
#   - the recorded end-to-end test passes (it depends on nothing outside the clone).
# The boundary check also runs here in the source folder: only there are ../research, ../design
# and ../submission next to the repo, for its check against byte-identical copies.
# Uses HEAD, so commit first. Never uses `timeout` (macOS has none).
#   bash tests/e2e/clean-checkout.sh

SOURCE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$SOURCE" || exit 1

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm use >/dev/null || exit 1

set -euo pipefail

step() { printf '\n== %s\n' "$1"; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "clean-checkout: the working tree has changes; this checks HEAD ($(git rev-parse --short HEAD)) only" >&2
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/petal-clean-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# No keys and no Petal settings reach the clone's tests.
scrub=()
while IFS='=' read -r name _; do
  case "$name" in
    PETAL_* | NEAR_AI_* | FASTNEAR_*) scrub+=("-u" "$name") ;;
  esac
done < <(env)
clean() { env ${scrub[@]+"${scrub[@]}"} "$@"; }

step "clone $(git rev-parse --short HEAD) into $TMP"
git clone -q --no-hardlinks "$SOURCE" "$TMP/petal"
git -C "$TMP/petal" checkout -q --detach "$(git rev-parse HEAD)"
step "pnpm install --frozen-lockfile"
(cd "$TMP/petal" && pnpm install --frozen-lockfile --silent)

cd "$TMP/petal"
step "golden tests, first run"
clean pnpm vitest run --project core test/golden.test.ts
step "golden tests, second run"
clean pnpm vitest run --project core test/golden.test.ts
step "the golden files did not change"
git diff --exit-code --stat -- fixtures/golden
step secrets
bash scripts/check-secrets.sh
step "boundary (clone)"
bash scripts/check-boundary.sh
step fixture-size
node scripts/check-fixture-size.ts
step "recorded end-to-end"
clean pnpm test:e2e

cd "$SOURCE"
step "boundary (source folder, with ../research, ../design and ../submission beside it)"
bash scripts/check-boundary.sh

printf '\nclean-checkout: all green\n'
