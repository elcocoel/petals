// Figma's Petals / Atlas card 52:1876, called GalleryCard in code: .publication-boundary refuses the
// word in a path. A thumb in a box, a title, a note; the whole card is the link. The words are optional,
// for a card that's only a picture, and then `label` is what a screen reader hears for the link.
import type { ThumbKind } from '../../lib/figures.ts';
import { outside } from '../../lib/outside.ts';
import { Drawing } from './Drawing.tsx';

export function GalleryCard({
  thumb,
  title,
  note,
  label,
  href,
}: {
  thumb: ThumbKind;
  title?: string;
  note?: string;
  label?: string;
  href: string;
}) {
  return (
    <a
      href={href}
      {...outside(href)}
      aria-label={label}
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
      {title && <span className="pt-block-gap pb-space-8 type-heading">{title}</span>}
      {note && <span className="type-mono">{note}</span>}
    </a>
  );
}
