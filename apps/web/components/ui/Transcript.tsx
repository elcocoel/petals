// A reading written out line by line (Figma's Transcript, 66:2248): numbered lines between two rules,
// ending on the next number and a cursor.
import type { ReactNode } from 'react';
import { MetaRow } from './MetaRow.tsx';

const number = (i: number) => String(i + 1).padStart(2, '0');

function Line({ i, children }: { i: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-block-gap border-t border-hairline py-space-16">
      <p className="my-0 type-mono-small">{number(i)}</p>
      {children}
    </div>
  );
}

export function Transcript({
  start,
  end,
  lines,
}: {
  start: string;
  end: string;
  lines: readonly string[];
}) {
  return (
    <div className="border-y border-primary">
      <div className="py-space-16">
        <MetaRow start={start} end={end} />
      </div>
      {lines.map((line, i) => (
        <Line key={line} i={i}>
          <p className="my-0 min-w-0 flex-1 type-lead">{line}</p>
        </Line>
      ))}
      <Line i={lines.length}>
        <span className="h-lh w-text-gap bg-accent type-lead" />
      </Line>
    </div>
  );
}
