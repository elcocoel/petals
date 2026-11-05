// Figma's Petals / Atlas card 52:1876, called GalleryCard in code: .publication-boundary refuses the
// word in a path. A thumb in a box, a title, a note; the whole card is the link.
import type { ThumbKind } from '../../lib/figures.ts';
import { Drawing } from './Drawing.tsx';

export function GalleryCard({
  thumb,
  title,
  note,
  href,
}: {
  thumb: ThumbKind;
  title: string;
  note: string;
  href: string;
}) {
  return (
    <a
      href={href}
      data-b="link"
      data-kind="card"
      className="flex flex-col no-underline hover:underline"
    >
      <span
        data-b="box"
        data-kind="plate"
        className="flex h-figure-height items-center justify-center overflow-hidden border border-hairline"
      >
        <Drawing kind={thumb} size={240} />
      </span>
      <span className="pt-block-gap pb-space-8 type-heading">{title}</span>
      <span className="type-mono">{note}</span>
    </a>
  );
}
