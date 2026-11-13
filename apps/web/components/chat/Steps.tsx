// Stages, progress and tool calls between the answers: kept quiet, and open for anyone who wants them,
// under one line with the side panel's chevron.
import type { StepRow } from '../../lib/thread-view.ts';
import { Icon } from '../ui/Icon.tsx';

export function Steps({ summary, steps }: { summary: string; steps: StepRow[] }) {
  return (
    <details className="group/steps">
      <summary className="flex list-none items-center gap-space-4 type-ui text-muted hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="inline-flex group-open/steps:rotate-90">
          <Icon name="chevron" small />
        </span>
        {summary}
      </summary>
      <ol data-quiet className="events type-mono text-muted">
        {steps.map((s, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the list only grows, in event order
          <li key={k}>
            {s.kind === 'stage' && (
              <>
                {s.stage}: {s.message}
              </>
            )}
            {s.kind === 'progress' && s.text}
            {s.kind === 'tool' && (
              <details>
                <summary>
                  <code>{s.name}</code> {s.status}
                </summary>
                <pre>{s.args}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
