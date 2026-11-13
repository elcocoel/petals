// A logo, round, the size of an icon: an organisation's in its badge, a chain's in the map's chain list. A
// picture, drawn round through an SVG clip, since corners are refused in classes. Props only.
import { useId } from 'react';

export function Logo({ src }: { /** an image of the logo (a URL or a data URL) */ src: string }) {
  // an id an SVG reference can carry: React's has characters url(#…) doesn't take
  const clip = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
