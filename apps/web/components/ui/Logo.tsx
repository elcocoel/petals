// A logo, round, the size of an icon: an organisation's in its badge, a chain's in the map's chain list, a
// token's where one is paid with. A picture, drawn round through an SVG clip, since corners are refused in
// classes; with no picture, the name's first letter in a hairline ring. Props only.
import { useId } from 'react';

export function Logo({
  src,
  letter,
}: {
  /** an image of the logo (a URL or a data URL) */
  src?: string;
  /** where there's no image: the name, whose first letter stands in */
  letter?: string;
}) {
  // an id an SVG reference can carry: React's has characters url(#…) doesn't take
  const clip = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!src)
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="block size-icon-size shrink-0">
        <circle cx="12" cy="12" r="11.5" className="fill-none stroke-hairline" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          className="fill-current type-mono text-muted"
          fontSize="11"
        >
          {(letter ?? '')
            .replace(/^[^A-Za-z0-9]+/, '')
            .charAt(0)
            .toUpperCase()}
        </text>
      </svg>
    );
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="block size-icon-size shrink-0">
      <clipPath id={clip}>
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <image
        href={src}
        width="24"
        height="24"
        clipPath={`url(#${clip})`}
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  );
}
