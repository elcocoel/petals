// One of Figma's three steps (66:2274): a picture in a box, a pixel numeral, a heading, a sentence. With no
// picture there's no box: an empty box is never shown (design/minimally-good.md, rules 2 and 10).
import type { ReactNode } from 'react';

export function Step({
  numeral,
  title,
  body,
  children,
}: {
  numeral: string;
  title: string;
  body: string;
  /** The picture, if the step has one. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col border-t border-primary pt-block-gap">
      {children && (
        <div
          data-b="box"
          data-kind="plate"
          className="mb-column-gap flex h-figure-height items-center justify-center gap-space-16 overflow-hidden border border-hairline px-text-gap"
        >
          {children}
        </div>
      )}
      <div>
        <p data-b="mark" data-kind="numeral" className="my-0 type-pixel-numeral text-accent">
          {numeral}
        </p>
      </div>
      <h3 className="mt-space-32 mb-0 type-heading">{title}</h3>
      <p className="mt-space-16 mb-0 type-body">{body}</p>
    </div>
  );
}
