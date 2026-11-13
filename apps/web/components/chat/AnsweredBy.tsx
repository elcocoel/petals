// T168: which model answered, in the words thread-view.ts chose, kept quiet in mono. With a summary, the
// note folds under it, with the side panel's chevron, as the steps do.
import type { Segment } from '../../lib/thread-view.ts';
import { Icon } from '../ui/Icon.tsx';

export function AnsweredBy({ line, summary }: { line: Segment[]; summary?: string | null }) {
  if (!summary) return <Note line={line} />;
  return (
    <details className="group/answered">
      <summary className="flex list-none items-center gap-space-4 type-mono text-muted hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="inline-flex group-open/answered:rotate-90">
          <Icon name="chevron" small />
        </span>
        {summary}
      </summary>
      <Note line={line} />
    </details>
  );
}

function Note({ line }: { line: Segment[] }) {
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
