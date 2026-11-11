// One badge for an organisation (design/org-badge.md; Elco, 11 Nov: "we need this badge that is opaque that
// can withstand being surrounded by a lot of information"; board #86). Its logo, round as the map draws it,
// or its token symbol in mono where there's no logo, then its name: one row high, on a solid fill of the
// ground it's on with a hairline edge, so nothing behind it shows through. Information only, as Badge is:
// no hover and no press of its own, square corners in v1.
import { useId } from 'react';
import { Mono } from './Mono.tsx';

export function OrgBadge({
  name,
  symbol = null,
  logo = null,
}: {
  name: string;
  /** Its token symbol: shown where there's no logo. */
  symbol?: string | null;
  /** An image of its logo (a URL or a data URL), drawn round. */
  logo?: string | null;
}) {
  // an id an SVG reference can carry: React's has characters url(#…) doesn't take
  const clip = `org-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const sym = symbol?.trim() || null;
  // a name that's only its symbol is said once, by the symbol
  const nameIsSymbol = !logo && sym !== null && sym.toLowerCase() === name.trim().toLowerCase();
  return (
    <span
      title={name}
      className="inline-flex h-row-height max-w-full min-w-0 shrink-0 items-center gap-space-8 border border-hairline bg-surface px-space-8 whitespace-nowrap text-primary"
    >
      {logo ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="block size-icon-size shrink-0">
          <clipPath id={clip}>
            <circle cx="12" cy="12" r="12" />
          </clipPath>
          <image
            href={logo}
            width="24"
            height="24"
            clipPath={`url(#${clip})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </svg>
      ) : sym ? (
        <span className="shrink-0">
          <Mono as="span" tone={nameIsSymbol ? 'primary' : 'muted'}>
            {sym}
          </Mono>
        </span>
      ) : null}
      {!nameIsSymbol && <span className="min-w-0 truncate type-ui">{name}</span>}
    </span>
  );
}
