// A stored flower you can open: its drawing, its title and where it's from. A link on the gallery, an
// action in the workspace, so it's the one tile on both.
import type { ReactNode } from 'react';
import { Badge } from './ui/Badge.tsx';
import { Button } from './ui/Button.tsx';

export function FlowerTile({
  title,
  where,
  badge,
  image,
  href,
  onOpen,
  children,
}: {
  title: string;
  where: string;
  badge: string;
  image: string;
  href?: string;
  onOpen?: () => void;
  /** Whatever else belongs under this flower. */
  children?: ReactNode;
}) {
  const content = (
    <>
      {/* biome-ignore lint/performance/noImgElement: an SVG from our own API */}
      <img
        className="block w-full border border-hairline"
        loading="lazy"
        decoding="async"
        src={image}
        alt={`The flower: ${title}`}
      />
      <span className="type-label">{title}</span>
      <span className="type-caption whitespace-pre-wrap">{where}</span>
      <Badge>{badge}</Badge>
    </>
  );
  return (
    <div className="flex flex-col gap-text-gap">
      {href !== undefined ? (
        <Button variant="tile" href={href}>
          {content}
        </Button>
      ) : (
        <Button variant="tile" onClick={onOpen}>
          {content}
        </Button>
      )}
      {children}
    </div>
  );
}
