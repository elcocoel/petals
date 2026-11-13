// Petals / FAQ item 67:2538: native <details>, open by default as in Figma's frame (its Open property),
// so it needs no JavaScript. A numbered item lines its answer up under the question on one twelve-column grid.
// The landing's, unnumbered, reads calmer (Elco, 13 Nov: "more spacious more calmness more joy ... it shouldn't
// feel like a page of a book"): the question a lead's size, room under it, the answer in two short columns
// with roomier lines and room from its edges (row.answer), its key concepts in a lighter bold, written between
// ** in the copy. In version 2
// it starts folded and opens by a click, one at a time: apps/web/app/versions/peek.ts, `row.peek`.
import type { ReactNode } from 'react';
import type { GlyphKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { Drawing } from './Drawing.tsx';

/** An answer runs on as paragraphs, and a paragraph can be a list. */
export type AnswerBlock = string | { readonly list: readonly string[] };

/** A line's words, with what's between ** in bold. */
function words(line: string): ReactNode[] {
  return line
    .split(/\*\*(.+?)\*\*/)
    .map((part, i) => (i % 2 === 1 ? <strong key={part}>{part}</strong> : part));
}

export function FaqItem({
  glyph,
  index,
  question,
  answer,
  open = true,
}: {
  /** A small drawing beside the number, if the item has one. */
  glyph?: GlyphKind;
  /** Its number; without one it's the landing's calmer item (12 and 13 Nov). */
  index?: string;
  question: string;
  answer: readonly AnswerBlock[];
  open?: boolean;
}) {
  const sign = (
    <span data-sign={landingCopy.questions.sign} className="type-mono-code md:justify-self-end">
      {landingCopy.questions.sign}
    </span>
  );
  const blocks = answer.map((block) =>
    typeof block === 'string' ? (
      <p key={block} data-answer="" className="my-0 break-inside-avoid">
        {words(block)}
      </p>
    ) : (
      <ul key={block.list[0]} data-answer="" className="my-0 list-disc pl-block-gap">
        {block.list.map((line) => (
          <li key={line} className="break-inside-avoid">
            {words(line)}
          </li>
        ))}
      </ul>
    ),
  );
  if (!index)
    return (
      // room from its edges as between its columns (Elco, 13 Nov: open, the words were "cramped")
      <details
        open={open}
        data-b="row"
        className="border-b border-hairline px-block-gap py-block-gap open:pb-column-gap md:px-column-gap"
      >
        <summary className="flex list-none items-center gap-block-gap [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 type-lead">{question}</span>
          {sign}
        </summary>
        <div className="mt-space-32 mb-text-gap gap-x-column-gap type-body md:columns-2 [&>*+*]:mt-block-gap">
          {blocks}
        </div>
      </details>
    );
  return (
    <details open={open} data-b="row" className="border-b border-hairline py-block-gap">
      <summary className="flex list-none items-center gap-block-gap md:grid md:grid-cols-12 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-text-gap md:col-span-2">
          {glyph && <Drawing kind={glyph} size={48} />}
          <span className="type-mono">{index}</span>
        </span>
        <span className="min-w-0 flex-1 type-lead md:col-span-9">{question}</span>
        {sign}
      </summary>
      <div className="mt-text-gap md:grid md:grid-cols-12 md:gap-x-block-gap">
        <div className="flex flex-col gap-text-gap type-body md:col-span-9 md:col-start-3">
          {blocks}
        </div>
      </div>
    </details>
  );
}
