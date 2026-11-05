// T168: which model answered, in the words thread-view.ts chose, kept quiet in mono.
import type { Segment } from '../../lib/thread-view.ts';

export function AnsweredBy({ line }: { line: Segment[] }) {
  return (
    <p data-quiet className="type-mono wrap-anywhere text-muted">
      {line.map((s, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: a line is whole, it never reorders
        if (s.t === 'code') return <code key={i}>{s.v}</code>;
        if (s.t === 'a') {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line is whole, it never reorders
            <a key={i} href={s.href}>
              {s.v}
            </a>
          );
        }
        return s.v;
      })}
    </p>
  );
}
