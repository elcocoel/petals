// A person's picture, round, everywhere it shows: the lobby's head and the public page large, the editor's
// picture, and the account menu at an icon's size. The picture fills the circle, cropped to its centre, inside a
// hairline ring; with none yet, the empty place for one, a dashed ring. Drawn round through an SVG clip, as Logo
// is, since corners are refused in classes. Props only.
import { useId } from 'react';

const SIZES = {
  icon: 'size-icon-size',
  small: 'size-drawing-48',
  medium: 'size-drawing-72',
  large: 'size-drawing-144',
} as const;

export function Avatar({
  src,
  size,
}: {
  /** The picture (a URL or a data URL), or null for the empty place. */
  src: string | null;
  size: keyof typeof SIZES;
}) {
  // an id an SVG reference can carry: React's has characters url(#…) doesn't take
  const clip = `avatar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={`block shrink-0 ${SIZES[size]}`}>
      <clipPath id={clip}>
        <circle cx="50" cy="50" r="50" />
      </clipPath>
      {src && (
        <image
          href={src}
          width="100"
          height="100"
          clipPath={`url(#${clip})`}
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      <circle
        cx="50"
        cy="50"
        r="49.5"
        fill="none"
        stroke="var(--color-hairline)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        {...(src ? {} : { strokeDasharray: '3 3' })}
      />
    </svg>
  );
}
