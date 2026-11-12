// The one press that publishes what a person kept about a map (lib/publish-press.ts): how many can go, that
// the wallet signs once and nothing is spent, why the rest stay private, folded. Props only.
import type { PublishPressView, PublishRow } from '../lib/publish-press.ts';
import { Button } from './ui/Button.tsx';
import { TextLink } from './ui/TextLink.tsx';

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
      {/* every item, read before the press (Elco: "Let me look first") */}
      {view.rows && (
        <>
          <Rows heading={view.rows.goes} rows={view.rows.going} />
          {view.rows.staying.length > 0 && (
            <Rows heading={view.rows.stays} rows={view.rows.staying} />
          )}
        </>
      )}
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
