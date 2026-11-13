// One petal's details (T064, Figma's "Selected petal detail" 39:924): the account, its size, what's
// known of who it is, and, one step further in, why it looks this way. Words from lib/flower-view.ts. In
// the app's sizes, as the box it sits in.
import type { PetalDetail } from '@petal/core/types';
import { petalView } from '../lib/flower-view.ts';
import type { WorthLine } from '../lib/value-view.ts';
import { Button } from './ui/Button.tsx';
import { SourceLink } from './ui/SourceLink.tsx';

/** The way back from a petal to its flower, which said "Close detail" as the box did. */
export const petalWords = { back: 'Back to the flower' } as const;

export function PetalDetails({
  petal,
  unit,
  worth,
  onClose,
}: {
  petal: PetalDetail | null;
  /** What the amount is counted in. */
  unit?: string | undefined;
  /** Its dollars at its map's price, with where and when; 'no price' when the map has none. */
  worth?: WorthLine | 'no price' | null | undefined;
  /** Given where a detail can be closed. */
  onClose?: (() => void) | undefined;
}) {
  if (!petal)
    return <p className="text-muted">Click a petal to see who it is and why it looks this way.</p>;
  const view = petalView(petal, unit);
  return (
    <section
      aria-live="polite"
      className="flex min-h-detail-height flex-col items-start gap-space-4 border-l-heavy border-accent pl-space-16"
    >
      <h3 className="m-0 type-ui font-semibold wrap-anywhere">{view.heading}</h3>
      {view.full && <p className="type-mono wrap-anywhere text-muted">{view.full}</p>}
      <p className="type-ui whitespace-pre-wrap">{view.stats}</p>
      {worth === 'no price' ? (
        <p className="type-ui text-muted">No price</p>
      ) : (
        worth && (
          <p className="type-ui">
            {worth.text}
            <span className="type-mono text-muted"> {worth.source}</span>
            {worth.link && <SourceLink href={worth.link} name={worth.source} />}
          </p>
        )
      )}
      <p className="type-ui">
        {view.says}
        {view.source && <span className="type-mono text-muted"> {view.source}</span>}
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
        <Button variant="quiet" onClick={onClose}>
          {petalWords.back}
        </Button>
      )}
    </section>
  );
}
