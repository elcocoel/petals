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
    <details open={open} className="border-b border-hairline pt-space-22 pb-space-26">
      <summary className="flex list-none items-center gap-block-gap [&::-webkit-details-marker]:hidden">
        <Glyph kind={glyph} />
        <span className="type-mono-label">{index}</span>
        <span className="min-w-0 flex-1 type-lead">{question}</span>
        <span className="type-mono-sign">{landingCopy.questions.sign}</span>
      </summary>
      <p className="mt-space-10 mb-0 type-body md:pr-space-40 md:pl-faq-answer-inset">{answer}</p>
    </details>
  );
}
