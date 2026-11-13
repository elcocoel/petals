#!/usr/bin/env bash
# The public tree explains product behaviour and technical reasons; personal quotes and approvals stay out of
# it. This refuses a line that attributes something to the owner by name and date (the pattern below), in
# any file git would commit. Exits 1 and prints file:line on any hit.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# Frozen byte for byte by the system-v1.5 tag (packages/tokens/test/versions.test.ts), so its text can't change.
frozen=(packages/tokens/source.ts)
# Still being reworded on open branches; each leaves this list once it's clean.
pending=(
  apps/web/components/landing
  apps/web/app/lab/landing-hero
  apps/web/components/ui/Button.tsx
  apps/web/components/ui/Footer.tsx
  apps/web/components/ui/SectionName.tsx
  apps/web/components/workspace/NotSignedIn.tsx
  apps/web/lib/hero-map.ts
  apps/web/lib/hero-shots.ts
  apps/web/lib/hero-story.ts
  apps/web/lib/landing-copy.ts
  apps/web/lib/site-links.ts
  apps/web/test/hero-story.test.ts
  apps/web/test/icons.test.ts
  apps/web/test/site-links.test.ts
)
skip=()
for p in "${frozen[@]}" "${pending[@]}"; do skip+=(":(exclude)$p"); done

pattern='Elco[,:]? +(on +)?[0-9]{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
hits=$(git ls-files --cached --others --exclude-standard -z -- . "${skip[@]}" 2>/dev/null |
  xargs -0 grep -InE "$pattern" -- 2>/dev/null | cut -d: -f1,2)
if [[ -n "$hits" ]]; then
  echo "$hits"
  echo "public tree: a dated personal attribution at the lines above. Say the behaviour or the technical reason instead." >&2
  exit 1
fi
echo "public tree: no dated personal attributions"
