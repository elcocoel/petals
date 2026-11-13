// A figure with notes (66:2206): the flower, its leader lines, four notes and the agent's remark, placed
// where Figma has them, all in one coordinate system. HTML inside the SVG keeps the words wrapping and
// the note box a real component. On a phone they'd shrink past reading, so they stack under the flower.
// The drawings themselves say nothing to a screen reader; the notes do. It's off the landing, whose hero
// figure is a different one, so its words come from whoever draws it, which today is the lab.
import type { ReactNode } from 'react';
import { Drawing } from '../ui/Drawing.tsx';
import { Mono } from '../ui/Mono.tsx';

const AT = {
  one: { x: 460, y: 44, width: 260, height: 16 },
  three: { x: 0, y: 116, width: 180, height: 32 },
  two: { x: 0, y: 620, width: 180, height: 32 },
  four: { x: 552, y: 684, width: 168, height: 48 },
};
const REMARK = { x: 460, y: 78, width: 244, height: 122 };

export function AnnotatedFlower({
  notes,
  remark,
}: {
  notes: Record<keyof typeof AT, string>;
  /** The agent's remark, by the flower. */
  remark: ReactNode;
}) {
  const placed = (['one', 'three', 'two', 'four'] as const).map((note) => ({
    note,
    text: notes[note],
    ...AT[note],
  }));
  return (
    <div className="flex w-full flex-col gap-block-gap">
      <svg
        data-b="figure"
        data-kind="annotated"
        role="presentation"
        viewBox="0 0 720 740"
        className="h-auto w-full"
      >
        <Drawing kind="hero-flower" x={20} y={20} width={680} height={680} />
        <g className="max-md:hidden">
          <Drawing kind="hero-leaders" width={720} height={720} />
          {placed.map(({ note, text, ...at }) => (
            <foreignObject key={text} data-note={note} {...at}>
              <Mono>{text}</Mono>
            </foreignObject>
          ))}
          <foreignObject {...REMARK}>{remark}</foreignObject>
        </g>
      </svg>
      <div className="flex flex-col gap-text-gap md:hidden">
        {[notes.one, notes.two, notes.three, notes.four].map((text) => (
          <Mono key={text}>{text}</Mono>
        ))}
        {remark}
      </div>
    </div>
  );
}
