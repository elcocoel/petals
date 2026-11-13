// The Points widget (wave 8; Elco's points for mapping, specs/004-workspace, 8 Nov): the person's points in
// the heading's size, what a point is, then each layer behind them, what it's about, and how many other
// accounts built on or reused it; under them, once, what the record is for (a future share, no money now),
// and Publish to NEAR Social, which the person's own wallet signs, so the record stands under their account.
// With none yet, what goes there and a quote. Props only: viewmodels/useLobby.ts reads the record (SYSTEMS's
// credit/v1) and publishes it. Words from lib/points-view.ts, drafts.
import { type PointsPublish, type PointsView, pointsWords } from '../../lib/points-view.ts';
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { PowerQuote } from '../PowerQuote.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Points({
  points,
  publishing = { kind: 'ready' },
  onPublish,
  quote,
}: {
  points: PointsView | 'reading' | 'unread';
  publishing?: PointsPublish;
  /** Puts the record on NEAR Social with the person's wallet; absent, there's no button. */
  onPublish?: () => void;
  /** An illustrated power quote for when there's nothing yet (#89). */
  quote?: PowerQuoteItem | null;
}) {
  const view = typeof points === 'string' ? null : points;
  const busy = publishing.kind === 'signing' || publishing.kind === 'checking';
  return (
    <Card
      title={pointsWords.title}
      labelledBy="profile-points"
      action={
        view && view.total > 0 && onPublish ? (
          <Button variant="secondary" disabled={busy} onClick={onPublish}>
            {pointsWords.publish}
          </Button>
        ) : undefined
      }
    >
      {points === 'reading' && (
        <p className="my-0 type-caption text-muted">{pointsWords.reading}</p>
      )}
      {points === 'unread' && <p className="my-0 type-caption text-muted">{pointsWords.unread}</p>}
      {view && (
        <>
          <p className="my-0 flex flex-wrap items-baseline gap-x-space-8">
            <span className="type-heading whitespace-nowrap">{view.total}</span>
            <span className="type-caption text-muted">{pointsWords.rule}</span>
          </p>
          {view.rows.length === 0 ? (
            <>
              <p className="my-0 type-body">{pointsWords.none}</p>
              {quote && (
                <div className="flex justify-center">
                  <PowerQuote quote={quote} />
                </div>
              )}
            </>
          ) : (
            // a set height, scrolling inside, as the other widgets' lists
            <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
              {view.rows.map((r) => (
                <li
                  key={r.key}
                  className="flex flex-col gap-space-4 border-t border-hairline py-text-gap"
                >
                  <div className="flex flex-wrap items-center gap-text-gap">
                    <span className="min-w-0 flex-1 type-body wrap-anywhere">
                      {r.title ?? r.about.shown}
                    </span>
                    <Badge tone="accent">{r.points}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-text-gap">
                    <span title={r.about.full}>
                      <Mono as="span" tone="muted">
                        {r.about.shown}
                      </Mono>
                    </span>
                    {r.about.chain && <Badge>{r.about.chain}</Badge>}
                    <Mono as="span" tone="muted">
                      {r.when ? `${r.how}  ·  ${r.when}` : r.how}
                    </Mono>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {view.total > 0 && (
            <p className="my-0 type-caption text-muted">
              {publishing.kind === 'ready' || publishing.kind === 'failed'
                ? `${pointsWords.future} ${pointsWords.publishNote}`
                : pointsWords.future}
            </p>
          )}
          {publishing.kind === 'signing' && (
            <p className="my-0 type-caption text-muted">{pointsWords.publishing}</p>
          )}
          {publishing.kind === 'checking' && (
            <p className="my-0 type-caption text-muted">{pointsWords.checking}</p>
          )}
          {publishing.kind === 'published' && (
            <p className="my-0 flex flex-wrap items-center gap-space-8">
              <Badge tone="accent">{pointsWords.published}</Badge>
              <span className="type-caption">{pointsWords.publishedLine}</span>
            </p>
          )}
          {publishing.kind === 'failed' && <p className="my-0 type-caption">{publishing.why}</p>}
        </>
      )}
    </Card>
  );
}
