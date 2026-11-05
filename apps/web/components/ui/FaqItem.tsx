// Petals / FAQ item 67:2538: native <details>, open by default as in Figma's frame (its Open property),
// so it needs no JavaScript.
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
      <summary className="flex list-none items-center gap-block-gap [&::-webkit-details-marker]:hidden">
        <Glyph kind={glyph} />
        <span className="type-mono-label">{index}</span>
        <span className="min-w-0 flex-1 type-lead">{question}</span>
        <span className="type-mono-sign">{landingCopy.questions.sign}</span>
      </summary>
      <p className="mt-text-gap mb-0 type-body md:pr-column-gap md:pl-faq-answer-inset">{answer}</p>
    </details>
  );
}
