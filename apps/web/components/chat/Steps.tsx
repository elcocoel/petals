// Stages, progress and tool calls between the answers: kept quiet, and open for anyone who wants them.
import type { StepRow } from '../../lib/thread-view.ts';

export function Steps({ summary, steps }: { summary: string; steps: StepRow[] }) {
  return (
    <details>
      <summary className="type-caption text-muted">{summary}</summary>
      <ol data-quiet className="events type-mono-small text-muted">
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
