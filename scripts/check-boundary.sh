#!/usr/bin/env bash
# Publication boundary (T010): enforce .publication-boundary.
#   bash scripts/check-boundary.sh            files git would commit (tracked + untracked, not ignored)
#   bash scripts/check-boundary.sh --staged   only staged files (pre-commit hook)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
shopt -s nocasematch

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "boundary: not a git repository (run git init first)" >&2
  exit 1
fi
if [[ "${1:-}" == "--staged" ]]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files --cached --others --exclude-standard)
fi

allow=() deny=() deny_content=() exempt=() section=""
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"; line="${line#"${line%%[![:space:]]*}"}"; line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  case "$line" in
    "[allow]") section=allow ;;
    "[deny]") section=deny ;;
    "[deny-content]") section=deny_content ;;
    "[deny-content-exempt]") section=exempt ;;
    *) case "$section" in
         allow) allow+=("$line") ;;
         deny) deny+=("$line") ;;
         deny_content) deny_content+=("$line") ;;
         exempt) exempt+=("$line") ;;
       esac ;;
  esac
done <.publication-boundary

matches() { # $1 = path, rest = patterns
  local path="$1" p; shift
  for p in "$@"; do
    if [[ "$p" == */ ]]; then [[ "$path" == "$p"* ]] && return 0
    else [[ "$path" == $p ]] && return 0
    fi
  done
  return 1
}

# Hashes of files outside the repo that must never be copied in (skipped when absent).
outside_hashes=""
for d in ../research ../design ../submission; do
  [[ -d "$d" ]] || continue
  outside_hashes+=$(find "$d" -type f -size +0 -size -20M -print0 | xargs -0 shasum -a 256 2>/dev/null | cut -d' ' -f1)
  outside_hashes+=$'\n'
done

bad=0
while IFS= read -r f; do
  [[ -z "$f" || ! -f "$f" ]] && continue
  if ! matches "$f" "${allow[@]}"; then echo "boundary: not on the allowlist: $f"; bad=1; continue; fi
  if matches "$f" "${deny[@]}"; then echo "boundary: denied by name: $f"; bad=1; continue; fi
  if ! matches "$f" "${exempt[@]}"; then
    for c in "${deny_content[@]}"; do
      if [[ "$f" == *.gz ]]; then gzip -dc -- "$f" 2>/dev/null | grep -qiF -e "$c" && { echo "boundary: denied content \"$c\": $f"; bad=1; }
      else grep -qiIF -e "$c" -- "$f" && { echo "boundary: denied content \"$c\": $f"; bad=1; }
      fi
    done
  fi
  if [[ -n "$outside_hashes" && -s "$f" ]]; then
    h=$(shasum -a 256 -- "$f" | cut -d' ' -f1)
    if grep -qxF "$h" <<<"$outside_hashes"; then echo "boundary: copy of a file from research/, design/ or submission/: $f"; bad=1; fi
  fi
done <<<"$files"

if [[ $bad -ne 0 ]]; then
  echo "boundary: refused. Fix the files above, or have an allowlist change approved." >&2
  exit 1
fi
echo "boundary: $(grep -c . <<<"$files") files inside the publication boundary"
