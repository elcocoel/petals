// Petals / FAQ item 67:2538: native <details>, open by default as in Figma's frame (its Open property),
// so it needs no JavaScript. The answer lines up under the question on one twelve-column grid.
import type { GlyphKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { Glyph } from './Glyph.tsx';

export function FaqItem({
  glyph,
  index,
  question,
  answer,
  open = true,
}: {
  glyph: GlyphKind;
  index: string;
  question: string;
  answer: string;
  open?: boolean;
}) {
  return (
    <details open={open} className="border-b border-hairline py-block-gap">
      <summary className="flex list-none items-center gap-block-gap md:grid md:grid-cols-12 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-text-gap md:col-span-2">
          <Glyph kind={glyph} />
          <span className="type-mono">{index}</span>
        </span>
        <span className="min-w-0 flex-1 type-lead md:col-span-9">{question}</span>
        <span className="type-mono-code md:justify-self-end">{landingCopy.questions.sign}</span>
      </summary>
      <div className="mt-text-gap md:grid md:grid-cols-12 md:gap-x-block-gap">
        <p className="mb-0 type-body md:col-span-9 md:col-start-3">{answer}</p>
      </div>
    </details>
  );
}
