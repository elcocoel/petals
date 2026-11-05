// Petals / FAQ item 67:2538: native <details>, open by default as in Figma's frame (its Open
// property), so it needs no JavaScript. The sign is drawn so it can turn from + to − with the state.
import type { GlyphKind } from '../../lib/figures.ts';
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
    <details open={open} className="group border-b border-hairline pt-space-22 pb-space-26">
      <summary className="flex list-none items-center gap-block-gap [&::-webkit-details-marker]:hidden">
        <Glyph kind={glyph} />
        <span className="type-mono-label">{index}</span>
        <span className="min-w-0 flex-1 type-lead">{question}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          className="size-space-8 shrink-0"
        >
          <path d="M0 3.5h8" />
          <path d="M3.5 0v8" className="group-open:hidden" />
        </svg>
      </summary>
      <p className="mt-space-10 mb-none type-body md:pr-space-40 md:pl-faq-answer-inset">
        {answer}
      </p>
    </details>
  );
}
