// The one press that publishes what a person mapped (lib/publish-press.ts), as an action of its own: a card with
// one line of what goes and the press beside it, then a line that always says the true step (preparing, waiting
// for the wallet, sending, then what happened), running on a cursor while it runs. What goes and what stays,
// each saying why, are folded under it, for who wants them. Props only.
import { useId } from 'react';
import type { PublishPressView, PublishRow } from '../lib/publish-press.ts';
import { publishWords } from '../lib/publish-press.ts';
import { Button } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';
import { TextLink } from './ui/TextLink.tsx';

export function PublishPress({
  view,
  onPublish,
}: {
  view: PublishPressView;
  onPublish: () => void;
}) {
  const id = useId();
  const step = view.step && <Step text={view.step} running={view.running} />;
  // nothing to press: only where it stands (reading, nothing to publish, published)
  if (!view.title || !view.press) return step || null;
  return (
    <Card
      title={view.title}
      labelledBy={id}
      action={
        <Button variant="compact" disabled={view.busy} onClick={onPublish}>
          {view.press}
        </Button>
      }
    >
      {step || <p className="my-0 type-caption text-muted">{view.sign}</p>}
      {(view.rows || view.why) && (
        <details>
          <summary className="type-ui text-muted">{publishWords.seeWhatGoes}</summary>
          <div className="flex flex-col gap-space-8 pt-space-8">
            {view.rows && view.rows.going.length > 0 && (
              <Rows heading={view.rows.goes} rows={view.rows.going} />
            )}
            {view.rows && view.rows.staying.length > 0 && (
              <Rows heading={view.rows.stays} rows={view.rows.staying} />
            )}
            {view.why && (
              <div className="flex flex-col gap-space-4">
                <h4 className="m-0 type-caption text-muted">{view.why.label}</h4>
                <ul className="my-0">
                  {view.why.lines.map((line) => (
                    <li key={line} className="type-caption">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </Card>
  );
}

/** Where the press stands: running on a cursor (row.cursor) while it runs. */
function Step({ text, running }: { text: string; running: boolean }) {
  return (
    <div data-b="row" role="status" className="flex items-center gap-space-8">
      <p className="my-0 type-ui">{text}</p>
      {running && <span aria-hidden className="h-lh w-text-gap shrink-0 bg-accent" />}
    </div>
  );
}

function Rows({ heading, rows }: { heading: string; rows: readonly PublishRow[] }) {
  return (
    <div className="flex w-full flex-col gap-space-4">
      <h4 className="m-0 type-caption text-muted">{heading}</h4>
      <ul className="m-0 flex list-none flex-col gap-space-8 p-0">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col border-t border-hairline pt-space-4">
            <span className="type-ui">
              {r.name} <span className="type-mono text-muted">{r.address}</span>
            </span>
            {r.source &&
              (r.sourceUrl ? (
                <span className="type-caption">
                  <TextLink variant="quiet" href={r.sourceUrl} target="_blank" rel="noreferrer">
                    {r.source}
                  </TextLink>
                </span>
              ) : (
                <span className="type-caption text-muted">{r.source}</span>
              ))}
            {r.confidence && <span className="type-caption text-muted">{r.confidence}</span>}
            {r.why && <span className="type-caption">{r.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
