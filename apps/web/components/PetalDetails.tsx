// One petal's details (T064, Figma's "Selected petal detail" 39:924): the account, its size, what's
// known of who it is, and, one step further in, why it looks this way. Words from lib/flower-view.ts.
import type { PetalDetail } from '@petal/core/types';
import { petalView } from '../lib/flower-view.ts';
import { Button } from './ui/Button.tsx';

export function PetalDetails({
  petal,
  unit,
  onClose,
}: {
  petal: PetalDetail | null;
  /** What the amount is counted in. */
  unit?: string | undefined;
  /** Given where a detail can be closed. */
  onClose?: (() => void) | undefined;
}) {
  if (!petal)
    return <p className="text-muted">Click a petal to see who it is and why it looks this way.</p>;
  const view = petalView(petal, unit);
  return (
    <section
      aria-live="polite"
      className="flex min-h-detail-height flex-col items-start gap-space-4 border-l-2 border-accent pl-space-16"
    >
      <h3 className="m-0 type-heading wrap-anywhere">{view.heading}</h3>
      {view.full && <p className="type-mono-small wrap-anywhere text-muted">{view.full}</p>}
      <p className="type-label whitespace-pre-wrap">{view.stats}</p>
      <p className="type-body">
        {view.says}
        {view.source && <span className="type-mono-small text-muted"> {view.source}</span>}
      </p>
      {(view.values.length > 0 || view.segments.length > 0) && (
        <details>
          <summary className="type-caption text-muted">Why it looks this way</summary>
          {view.values.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>primitive</th>
                  <th>value</th>
                  <th>why it looks this way</th>
                </tr>
              </thead>
              <tbody>
                {view.values.map((v) => (
                  <tr key={v.primitive}>
                    <td>{v.primitive}</td>
                    <td>{String(v.value)}</td>
                    <td>{v.explains}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view.segments.length > 0 && (
            <>
              <h4>Segments</h4>
              <ul>
                {view.segments.map((s) => (
                  <li key={s.key}>
                    {s.label}: {s.amount} ({s.share})
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {onClose && (
        <Button variant="link" onClick={onClose}>
          Close detail
        </Button>
      )}
    </section>
  );
}
