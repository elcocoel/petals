#!/usr/bin/env bash
# The public tree explains product behaviour and technical reasons; personal quotes and approvals stay out of
# it. This refuses a line that attributes something to the owner by date ("Elco, 12 Nov"), in any file git
# would commit. Exits 1 and prints file:line on any hit.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

pattern='Elco[,:]? +(on +)?[0-9]{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
hits=$(git ls-files --cached --others --exclude-standard -z 2>/dev/null |
  xargs -0 grep -InE "$pattern" -- 2>/dev/null | cut -d: -f1,2)
if [[ -n "$hits" ]]; then
  echo "$hits"
  echo "public tree: a dated personal attribution at the lines above. Say the behaviour or the technical reason instead." >&2
  exit 1
fi
echo "public tree: no dated personal attributions"
