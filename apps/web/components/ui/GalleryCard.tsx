// Figma's Petals / Atlas card 52:1876, called GalleryCard in code: .publication-boundary refuses the
// word in a path. A thumb in a box, a title, a note; the whole card is the link.
import type { ThumbKind } from '../../lib/figures.ts';
import { Thumb } from './Thumb.tsx';

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
    <a href={href} className="flex flex-col no-underline hover:underline">
      <span className="flex h-figure-height items-center justify-center overflow-hidden border border-hairline">
        <Thumb kind={thumb} size="card" />
      </span>
      <span className="pt-block-gap pb-space-8 type-heading">{title}</span>
      <span className="type-mono-note">{note}</span>
    </a>
  );
}
