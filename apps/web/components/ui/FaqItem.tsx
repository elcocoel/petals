// Petals / FAQ item 67:2538: native <details>, open by default as in Figma's frame (its Open property),
// so it needs no JavaScript. The answer lines up under the question on one twelve-column grid. In version
// 2 it starts folded and answers a pointer at rest: apps/web/app/versions/peek.ts, `row.peek`.
import type { GlyphKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { Drawing } from './Drawing.tsx';

/** An answer runs on as paragraphs, and a paragraph can be a list. */
export type AnswerBlock = string | { readonly list: readonly string[] };

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
  answer: readonly AnswerBlock[];
  open?: boolean;
}) {
  return (
    <details open={open} data-b="row" className="border-b border-hairline py-block-gap">
      <summary className="flex list-none items-center gap-block-gap md:grid md:grid-cols-12 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-text-gap md:col-span-2">
          <Drawing kind={glyph} size={48} />
          <span className="type-mono">{index}</span>
        </span>
        <span className="min-w-0 flex-1 type-lead md:col-span-9">{question}</span>
        <span data-sign={landingCopy.questions.sign} className="type-mono-code md:justify-self-end">
          {landingCopy.questions.sign}
        </span>
      </summary>
      <div className="mt-text-gap md:grid md:grid-cols-12 md:gap-x-block-gap">
        <div className="flex flex-col gap-text-gap type-body md:col-span-9 md:col-start-3">
          {answer.map((block) =>
            typeof block === 'string' ? (
              <p key={block} className="my-0">
                {block}
              </p>
            ) : (
              <ul key={block.list[0]} className="my-0 list-disc pl-block-gap">
                {block.list.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ),
          )}
        </div>
      </div>
    </details>
  );
}
