// The one press that publishes what a person kept about a map (lib/publish-press.ts): how many can go, that
// the wallet signs once and nothing is spent, why the rest stay private, folded. Props only.
import type { PublishPressView } from '../lib/publish-press.ts';
import { Button } from './ui/Button.tsx';

export function PublishPress({
  view,
  onPublish,
}: {
  view: PublishPressView;
  onPublish: () => void;
}) {
  return (
    <section className="flex flex-col items-start gap-space-4">
      {view.counts && <p className="my-0 type-ui">{view.counts}</p>}
      {view.press && (
        <Button variant="compact" disabled={view.busy} onClick={onPublish}>
          {view.press}
        </Button>
      )}
      {view.press && <p className="my-0 type-caption text-muted">{view.sign}</p>}
      {view.said && <p className="my-0 type-ui">{view.said}</p>}
      {view.why && (
        <details>
          <summary className="type-caption text-muted">{view.why.label}</summary>
          <ul className="my-0">
            {view.why.lines.map((line) => (
              <li key={line} className="type-caption">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
