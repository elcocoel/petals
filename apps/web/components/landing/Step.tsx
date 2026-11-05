// One of Figma's three steps (66:2274): a picture in a box, a pixel numeral, a heading, a sentence.
import type { ReactNode } from 'react';
import { Numeral } from '../ui/Numeral.tsx';

export function Step({
  numeral,
  title,
  body,
  children,
}: {
  numeral: string;
  title: string;
  body: string;
  /** The picture. */
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-t border-primary pt-block-gap">
      <div className="flex h-visual-height items-center justify-center gap-space-16 overflow-hidden border border-hairline px-text-gap">
        {children}
      </div>
      <div className="mt-column-gap">
        <Numeral>{numeral}</Numeral>
      </div>
      <h3 className="mt-space-36 mb-0 type-heading">{title}</h3>
      <p className="mt-space-14 mb-0 type-body">{body}</p>
    </div>
  );
}
