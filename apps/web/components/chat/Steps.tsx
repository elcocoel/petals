// Stages, progress and tool calls between the answers, collapsed.
import type { StepRow } from '../../lib/thread-view.ts';

export function Steps({ summary, steps }: { summary: string; steps: StepRow[] }) {
  return (
    <details className="steps">
      <summary className="muted">{summary}</summary>
      <ol className="events">
        {steps.map((s, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the list only grows, in event order
          <li key={k}>
            {s.kind === 'stage' && (
              <>
                <em>{s.stage}</em>: {s.message}
              </>
            )}
            {s.kind === 'progress' && <span className="muted">{s.text}</span>}
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
