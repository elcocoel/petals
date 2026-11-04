#!/usr/bin/env bash
# Secret scan (T008): private keys and API keys must never enter the repo.
#   bash scripts/check-secrets.sh            files git would commit (tracked + untracked, not ignored)
#   bash scripts/check-secrets.sh --staged   only staged files (pre-commit hook)
# Gzipped fixtures are scanned decompressed. Exits 1 on any hit and prints file:line (never the match).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

if [[ "${1:-}" == "--staged" ]]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files --cached --others --exclude-standard 2>/dev/null || true)
fi

B58='[1-9A-HJ-NP-Za-km-z]'
patterns=(
  # NEAR key files and code: a private or secret key field holding an ed25519 key
  "(private_?key|secret_?key|privateKey|secretKey)[\"']?[[:space:]]*[:=][[:space:]]*[\"']?ed25519:${B58}{40,}"
  # PEM private keys
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  # seed phrases stored by name
  "(seed_?phrase|seedPhrase|mnemonic)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][a-z]+( [a-z]+){11,}"
  # API keys: OpenAI-style (NEAR AI Cloud), Anthropic, GitHub, AWS, Google, Slack
  'sk-[A-Za-z0-9_-]{20,}'
  'gh[pousr]_[A-Za-z0-9]{36,}'
  'github_pat_[A-Za-z0-9_]{40,}'
  'AKIA[0-9A-Z]{16}'
  'AIza[0-9A-Za-z_-]{35}'
  'xox[abprs]-[A-Za-z0-9-]{10,}'
  # our own variables with a value filled in
  "(NEAR_AI_API_KEY|FASTNEAR_API_KEY)[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9_.-]{16,}"
)
# A bare ed25519 key long enough to be private (64 bytes), outside a signature field.
bare="ed25519:${B58}{80,}"

hits=0
scan() { # $1 = label, stdin = text
  local label="$1" text
  text=$(cat)
  for p in "${patterns[@]}"; do
    if grep -nEI -e "$p" <<<"$text" | cut -d: -f1 | sed "s|^|$label:|" | grep .; then hits=1; fi
  done
  if grep -nEI -e "$bare" <<<"$text" | grep -viE 'signature' | cut -d: -f1 | sed "s|^|$label:|" | grep .; then hits=1; fi
}

while IFS= read -r f; do
  [[ -z "$f" || ! -f "$f" ]] && continue
  [[ "$f" == "scripts/check-secrets.sh" ]] && continue
  if [[ "$f" == *.gz ]]; then
    gzip -dc -- "$f" 2>/dev/null | scan "$f"
  else
    scan "$f" <"$f"
  fi
done <<<"$files"

if [[ $hits -ne 0 ]]; then
  echo "secrets: possible secret found at the lines above. Remove it; keys belong in ../.secrets/." >&2
  exit 1
fi
echo "secrets: no private keys or API keys found"
